export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  ALLOWED_TELEGRAM_IDS: string;
  ADMIN_CHAT_ID: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_WEBHOOK_SECRET: string;
  GITHUB_PAT?: string;
  STATE_KV?: KVNamespace;
}

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; username?: string; first_name?: string };
    chat: { id: number };
    text?: string;
  };
  callback_query?: {
    id: string;
    from: { id: number };
    message?: { chat: { id: number } };
    data?: string;
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (request.method === "POST" && url.pathname === "/webhook/telegram") {
      if (!env.TELEGRAM_WEBHOOK_SECRET || !env.TELEGRAM_BOT_TOKEN) {
        return new Response("Misconfigured", { status: 500 });
      }
      const incomingSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
      const authorized = await timingSafeEqual(incomingSecret, env.TELEGRAM_WEBHOOK_SECRET);
      if (!authorized) {
        return new Response("Unauthorized", { status: 401 });
      }

      const rawBody = await request.text();
      if (rawBody.length > 256_000) {
        return new Response("Payload too large", { status: 413 });
      }

      let update: TelegramUpdate;
      try {
        update = JSON.parse(rawBody) as TelegramUpdate;
      } catch {
        return new Response("Bad JSON", { status: 400 });
      }

      ctx.waitUntil(handleTelegramUpdate(update, env));
      return new Response("OK", { status: 200 });
    }

    if (request.method === "POST" && url.pathname === "/webhook/github") {
      if (!env.GITHUB_WEBHOOK_SECRET || !env.ADMIN_CHAT_ID) {
        return new Response("Misconfigured", { status: 500 });
      }
      const rawBody = await request.text();
      if (rawBody.length > 512_000) {
        return new Response("Payload too large", { status: 413 });
      }
      const sigHeader = request.headers.get("X-Hub-Signature-256") ?? "";
      const isValid = await verifyGithubSignature(
        rawBody,
        sigHeader,
        env.GITHUB_WEBHOOK_SECRET
      );
      if (!isValid) {
        return new Response("Invalid signature", { status: 401 });
      }

      const eventName = request.headers.get("X-GitHub-Event") ?? "unknown";
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(rawBody) as Record<string, unknown>;
      } catch {
        return new Response("Bad JSON", { status: 400 });
      }

      ctx.waitUntil(handleGithubEvent(eventName, payload, env));
      return new Response("OK", { status: 200 });
    }

    return new Response("Not Found", { status: 404 });
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (!env.ADMIN_CHAT_ID || !env.TELEGRAM_BOT_TOKEN) return;
    ctx.waitUntil(
      sendTelegramMessage(
        env.ADMIN_CHAT_ID,
        `<b>Ежедневная сводка</b> · <code>${escapeHtml(env.GITHUB_OWNER)}/${escapeHtml(env.GITHUB_REPO)}</code>\nWorker работает штатно.`,
        env
      )
    );
  },

};

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(hashA, hashB);
}

function isAuthorizedUser(userId: number | undefined, env: Env): boolean {
  if (!userId) return false;
  const allowed = new Set(
    (env.ALLOWED_TELEGRAM_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  // Fail-closed: если список не задан, блокируем выполнение команд
  return allowed.size > 0 && allowed.has(String(userId));
}

async function isDuplicateOrRateLimited(
  updateId: number,
  userId: number,
  env: Env
): Promise<boolean> {
  if (env.STATE_KV) {
    const dedupKey = `upd:${updateId}`;
    const seen = await env.STATE_KV.get(dedupKey);
    if (seen) return true;
    await env.STATE_KV.put(dedupKey, "1", { expirationTtl: 300 });

    const minuteBucket = Math.floor(Date.now() / 60000);
    const rateKey = `rl:${userId}:${minuteBucket}`;
    const current = Number((await env.STATE_KV.get(rateKey)) ?? "0");
    if (current >= 20) return true;
    await env.STATE_KV.put(rateKey, String(current + 1), { expirationTtl: 120 });
    return false;
  }

  // Fallback без KV через Cloudflare Cache API
  const cache = caches.default;
  const cacheUrl = new URL(`https://dedup.local/update/${updateId}`);
  const hit = await cache.match(cacheUrl);
  if (hit) return true;
  await cache.put(
    cacheUrl,
    new Response("1", { headers: { "Cache-Control": "max-age=300" } })
  );
  return false;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function handleTelegramUpdate(update: TelegramUpdate, env: Env): Promise<void> {
  const userId = update.message?.from?.id ?? update.callback_query?.from?.id;
  const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id;
  if (!userId || !chatId) return;

  if (!isAuthorizedUser(userId, env)) {
    return;
  }

  const blocked = await isDuplicateOrRateLimited(update.update_id, userId, env);
  if (blocked) return;

  const text = (update.message?.text ?? "").trim();

  if (text === "/start" || text === "/help") {
    const lines = [
      `<b>Панель управления</b> · <code>${escapeHtml(env.GITHUB_OWNER)}/${escapeHtml(env.GITHUB_REPO)}</code>`,
      "/status — проверка состояния Worker",
      "/deploy — запуск деплоя на GitHub Actions",
      "/myid — показать ваш Telegram ID",
    ].filter(Boolean);
    await sendTelegramMessage(chatId, lines.join("\n"), env);
    return;
  }

  if (text === "/myid") {
    await sendTelegramMessage(chatId, `Ваш Telegram ID: <code>${userId}</code>`, env);
    return;
  }

  if (text === "/status") {
    await sendTelegramMessage(
      chatId,
      `Worker активен. Репозиторий: <code>${escapeHtml(env.GITHUB_OWNER)}/${escapeHtml(env.GITHUB_REPO)}</code>`,
      env
    );
    return;
  }

  if (text === "/deploy") {
    if (!env.GITHUB_PAT) {
      await sendTelegramMessage(
        chatId,
        "Секрет <code>GITHUB_PAT</code> не настроен в Cloudflare Variables.",
        env
      );
      return;
    }
    const ok = await triggerGithubDeploy(env);
    await sendTelegramMessage(
      chatId,
      ok
        ? `Деплой запущен для <b>${escapeHtml(env.GITHUB_REPO)}</b>.`
        : "Не удалось запустить workflow_dispatch на GitHub.",
      env
    );
    return;
  }

  await sendTelegramMessage(chatId, "Команда не распознана. Отправьте /help.", env);
}

async function sendTelegramMessage(
  chatId: number | string,
  htmlText: string,
  env: Env
): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: htmlText.slice(0, 4000),
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    console.error("Telegram API error", res.status);
  }
}

async function verifyGithubSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string
): Promise<boolean> {
  if (!signatureHeader.startsWith("sha256=")) return false;
  const hex = signatureHeader.slice(7);
  if (!/^[0-9a-f]{64}$/i.test(hex)) return false;

  const sigBytes = new Uint8Array(
    hex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16))
  );
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes,
    new TextEncoder().encode(rawBody)
  );
}

async function handleGithubEvent(
  eventName: string,
  payload: Record<string, any>,
  env: Env
): Promise<void> {
  const repoName = escapeHtml(String(payload.repository?.full_name ?? env.GITHUB_REPO));

  if (eventName === "push") {
    const branch = escapeHtml(String(payload.ref ?? "").replace("refs/heads/", ""));
    const pusher = escapeHtml(String(payload.pusher?.name ?? "unknown"));
    const commitMsg = escapeHtml(String(payload.head_commit?.message ?? "").split("\n")[0]);
    const text = [
      `<b>GitHub Push</b> · ${repoName}`,
      `Ветка: <code>${branch}</code>`,
      `Автор: ${pusher}`,
      commitMsg ? `Коммит: ${commitMsg}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    await sendTelegramMessage(env.ADMIN_CHAT_ID, text, env);
    return;
  }

  if (eventName === "workflow_run" && payload.action === "completed") {
    const wfName = escapeHtml(String(payload.workflow_run?.name ?? "CI"));
    const conclusion = escapeHtml(String(payload.workflow_run?.conclusion ?? "unknown"));
    const text = `<b>GitHub Actions</b> · ${repoName}\nWorkflow: <code>${wfName}</code>\nИтог: <b>${conclusion}</b>`;
    await sendTelegramMessage(env.ADMIN_CHAT_ID, text, env);
  }
}

async function triggerGithubDeploy(env: Env): Promise<boolean> {
  const res = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/actions/workflows/deploy.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_PAT}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "EdgeKit-Cloudflare-Worker",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main" }),
    }
  );
  return res.status === 204;
}
