export interface Env {
  CODES: KVNamespace;
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  OWNER_ID: string;
  SITE_ORIGIN?: string;
  SITE_URL?: string;
  FRONTEND_URL?: string;
  PRICE_PRO?: string;
  PRO_STARS_PRICE?: string;
  PRICE?: string;
  HOST_PRICE?: string;
  HOST_STARS_PRICE?: string;
  ALLOWED_ORIGIN?: string;
  GEMINI_API_KEY?: string;
}

interface CodeRecord {
  pro: boolean;
  host: number;
  createdAt: number;
  userId?: number;
  chargeId?: string;
  refunded?: boolean;
  devices?: string[];
  sites?: string[];
}

interface ChargeRecord {
  code: string;
  userId?: number;
  kind: "pro" | "host";
  amount: number;
  createdAt: number;
  refunded?: boolean;
}

interface TelegramUpdate {
  update_id: number;
  callback_query?: {
    id: string;
    from: { id: number };
    message?: { message_id: number; chat: { id: number } };
    data?: string;
  };
  message?: {
    from?: { id: number };
    chat: { id: number };
    text?: string;
    successful_payment?: {
      currency: string;
      total_amount: number;
      invoice_payload: string;
      telegram_payment_charge_id: string;
    };
  };
  pre_checkout_query?: {
    id: string;
    from: { id: number };
    currency: string;
    total_amount: number;
    invoice_payload: string;
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders = buildCorsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return jsonResponse(
        { ok: true, service: "ifield-api", status: "iField is running" },
        200,
        corsHeaders
      );
    }

    if (request.method === "GET" && url.pathname === "/prices") {
      return jsonResponse(
        {
          pro: Number(env.PRICE_PRO ?? env.PRO_STARS_PRICE ?? env.PRICE) || 500,
          host: Number(env.HOST_PRICE ?? env.HOST_STARS_PRICE) || 600,
          ai: Boolean(env.GEMINI_API_KEY),
          trial: true,
        },
        200,
        corsHeaders
      );
    }

    if ((request.method === "GET" || request.method === "POST") && url.pathname === "/verify") {
      const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
      if (!checkBurstLimit(`verify:${ip}`, 30, 60_000)) {
        return jsonResponse({ ok: false, error: "Too many requests" }, 429, corsHeaders);
      }
      let rawCode: string | null = url.searchParams.get("code");
      let initData = url.searchParams.get("initData") ?? "";
      let did = url.searchParams.get("did") ?? "";
      if (request.method === "POST") {
        if (!isAllowedOrigin(request, env)) {
          return jsonResponse({ ok: false, error: "Forbidden origin" }, 403, corsHeaders);
        }
        const body = await safeJson<{ code?: string; initData?: string; did?: string }>(request, 8192);
        if (!body) return jsonResponse({ ok: false }, 400, corsHeaders);
        rawCode = body.code ?? null;
        initData = typeof body.initData === "string" ? body.initData : "";
        did = typeof body.did === "string" ? body.did : "";
      }
      const code = normalizeCode(rawCode);
      if (!code) {
        return jsonResponse({ ok: false }, 400, corsHeaders);
      }
      const record = await getCodeRecord(code, env);
      if (!record || record.refunded) {
        return jsonResponse({ ok: false }, 404, corsHeaders);
      }
      const access = await verifyCodeAccess(code, record, initData, did, env, true);
      if (!access.ok) {
        return jsonResponse({ ok: false, error: access.error ?? "Code locked" }, access.status ?? 403, corsHeaders);
      }
      return jsonResponse(
        { ok: true, pro: record.pro, host: record.host },
        200,
        corsHeaders
      );
    }

    if (request.method === "POST" && url.pathname === "/publish") {
      return handlePublish(request, url.origin, env, corsHeaders);
    }

    if (request.method === "POST" && url.pathname === "/publish-trial") {
      return handlePublishTrial(request, url.origin, env, corsHeaders);
    }

    if (request.method === "POST" && url.pathname === "/ai") {
      return handleAiCopy(request, env, corsHeaders);
    }

    if (request.method === "GET" && url.pathname.startsWith("/s/")) {
      const slug = url.pathname.slice(3).toLowerCase().replace(/[^a-z0-9-]/g, "");
      if (!slug) return new Response("Not Found", { status: 404 });
      const html = await env.CODES.get(`site:${slug}`);
      if (!html) return new Response("Not Found", { status: 404 });

      return new Response(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
          "X-Frame-Options": "DENY",
          "Referrer-Policy": "no-referrer",
          "X-Robots-Tag": "noindex, nofollow, noarchive",
          "Cross-Origin-Resource-Policy": "same-origin",
          "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
          "Content-Security-Policy":
            "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; font-src 'none'; script-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        },
      });
    }

    if (request.method === "GET" && url.pathname === "/terms") {
      return new Response(
        "<!doctype html><meta charset='utf-8'><title>Terms — iField Studio</title><body style='font-family:system-ui;max-width:680px;margin:40px auto;padding:0 16px;line-height:1.6'><h1>Terms of Service</h1><p><strong>Digital Goods:</strong> Telegram Stars (XTR) purchases unlock iField Studio Pro exports and 30-day static hosting on workers.dev (up to 5 active hosted pages per code).</p><p><strong>Fair Use:</strong> Activation codes are bound to the buyer's Telegram account inside the Mini App and support up to 2 external browser devices. Free 24-hour test links are limited to 1 per Telegram account.</p><p><strong>Acceptable Use:</strong> Scam, phishing, piracy, malware, and 18+/adult content are strictly prohibited and removed immediately without refund.</p><p><strong>Refunds &amp; Support:</strong> Use <code>/paysupport</code> inside @ifield_studio_bot if an activation code was not delivered or hosting failed.</p></body>",
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    if (request.method === "GET" && url.pathname === "/privacy") {
      return new Response(
        "<!doctype html><meta charset='utf-8'><title>Privacy — iField Studio</title><body style='font-family:system-ui;max-width:680px;margin:40px auto;padding:0 16px;line-height:1.6'><h1>Privacy Policy</h1><p>Draft form data and uploaded photos stay in your browser localStorage until you publish a page.</p><p>When activating a code or publishing, Cloudflare KV stores your activation code, linked Telegram user ID, anonymized browser device token (<code>if_did</code>, max 2), and sanitized static HTML without tracking scripts.</p></body>",
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    if (request.method === "POST" && (url.pathname === "/webhook/telegram" || url.pathname === "/webhook")) {
      if (!env.WEBHOOK_SECRET || !env.BOT_TOKEN) {
        return new Response("Misconfigured", { status: 500 });
      }
      const incoming = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
      const valid = await timingSafeEqual(incoming, env.WEBHOOK_SECRET);
      if (!valid) {
        return new Response("Unauthorized", { status: 401 });
      }

      const raw = await request.text();
      if (raw.length > 256_000) {
        return new Response("Payload too large", { status: 413 });
      }
      let update: TelegramUpdate;
      try {
        update = JSON.parse(raw) as TelegramUpdate;
      } catch {
        return new Response("Bad JSON", { status: 400 });
      }

      if (update.pre_checkout_query) {
        await answerPreCheckout(update.pre_checkout_query, env);
        return new Response("OK", { status: 200 });
      }

      ctx.waitUntil(handleTelegramUpdate(update, env));
      return new Response("OK", { status: 200 });
    }

    return new Response("Not Found", { status: 404 });
  },
};

const rlMap = new Map<string, { count: number; resetAt: number }>();
const seenUpdates = new Set<number>();

function checkBurstLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const cur = rlMap.get(key);
  if (!cur || cur.resetAt <= now) {
    if (rlMap.size > 2000) rlMap.clear();
    rlMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (cur.count >= max) return false;
  cur.count += 1;
  return true;
}

function getAllowedOrigins(env: Env): string[] {
  const rawAllowed = env.SITE_ORIGIN || env.ALLOWED_ORIGIN || "https://i-field.github.io";
  return rawAllowed
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

function isAllowedOrigin(request: Request, env: Env): boolean {
  const origin = (request.headers.get("Origin") ?? "").replace(/\/+$/, "");
  if (!origin) return true;
  return getAllowedOrigins(env).includes(origin);
}

function buildCorsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = (request.headers.get("Origin") ?? "").replace(/\/+$/, "");
  const allowed = getAllowedOrigins(env);
  const matched = allowed.includes(origin) ? origin : allowed[0] ?? "https://i-field.github.io";
  return {
    "Access-Control-Allow-Origin": matched,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function jsonResponse(
  data: unknown,
  status: number,
  headers: Record<string, string>
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

async function safeJson<T>(request: Request, maxBytes: number): Promise<T | null> {
  const raw = await request.text();
  if (raw.length > maxBytes) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function verifyTelegramInitData(
  initData: string,
  botToken: string
): Promise<{ userId: number } | null> {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hashHex = (params.get("hash") ?? "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hashHex)) return null;

  const authDate = Number(params.get("auth_date") ?? "0");
  const nowSec = Math.floor(Date.now() / 1000);
  if (!authDate || nowSec - authDate > 7 * 86_400 || authDate - nowSec > 300) {
    return null;
  }

  const pairs: string[] = [];
  params.forEach((value, key) => {
    if (key !== "hash") pairs.push(`${key}=${value}`);
  });
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  const enc = new TextEncoder();
  const secretKey = await crypto.subtle.importKey(
    "raw",
    enc.encode("WebAppData"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const secretBytes = await crypto.subtle.sign("HMAC", secretKey, enc.encode(botToken));
  const checkKey = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const computed = new Uint8Array(
    await crypto.subtle.sign("HMAC", checkKey, enc.encode(dataCheckString))
  );

  const provided = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    provided[i] = parseInt(hashHex.slice(i * 2, i * 2 + 2), 16);
  }
  let diff = 0;
  for (let i = 0; i < 32; i++) {
    diff |= computed[i] ^ provided[i];
  }
  if (diff !== 0) return null;

  try {
    const user = JSON.parse(params.get("user") ?? "{}") as { id?: number };
    return typeof user.id === "number" && user.id > 0 ? { userId: user.id } : null;
  } catch {
    return null;
  }
}

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(ha, hb);
}

function normalizeCode(raw: string | null | undefined): string {
  const c = (raw ?? "").trim().toUpperCase();
  return /^IF-[A-Z0-9]{8,24}$/.test(c) ? c : "";
}

async function getCodeRecord(code: string, env: Env): Promise<CodeRecord | null> {
  const raw = await env.CODES.get(`code:${code}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CodeRecord;
  } catch {
    return null;
  }
}

function isSafePublishedHtml(html: string): boolean {
  if (!html || html.length > 200_000) return false;
  if (!/^<!doctype html><html\b/i.test(html.trimStart())) return false;
  const normalized = html
    .replace(/<meta\s+(?:charset=|name=['"](?:viewport|description|theme-color|twitter:card)['"]|property=['"]og:)/gi, "<safe-meta ")
    .replace(/<link\s+rel=['"]canonical['"]\s+href=['"]https?:\/\/[^'">\s]+['"]\s*>/gi, "<safe-link>");
  return !/<(?:script|iframe|object|embed|base|form|portal|frame|frameset|svg|math|link|applet|meta)\b|http-equiv\s*=|javascript:|vbscript:|data:\s*(?:text\/html|image\/svg\+xml|application\/)|\bon[a-z]+\s*=|srcdoc\s*=|formaction\s*=|xlink:href|@import\b|expression\s*\(/i.test(
    normalized
  );
}

async function verifyCodeAccess(
  code: string,
  record: CodeRecord,
  initData: string,
  did: string,
  env: Env,
  requireClient: boolean
): Promise<{ ok: boolean; status?: number; error?: string }> {
  if (record.refunded) {
    return { ok: false, status: 403, error: "Code refunded" };
  }
  const cleanInit = (initData ?? "").trim();
  if (cleanInit) {
    const verified = await verifyTelegramInitData(cleanInit, env.BOT_TOKEN);
    if (!verified) {
      return { ok: false, status: 403, error: "Invalid Telegram signature" };
    }
    if (record.userId && verified.userId !== record.userId && !isOwner(verified.userId, env)) {
      return { ok: false, status: 403, error: "Code bound to another Telegram account" };
    }
    return { ok: true };
  }
  const cleanDid = (did ?? "").trim();
  const validDid = /^[a-zA-Z0-9_-]{8,40}$/.test(cleanDid);
  if (requireClient && !validDid) {
    return { ok: false, status: 403, error: "Client verification required" };
  }
  if (validDid && !(record.userId && isOwner(record.userId, env))) {
    const devices = Array.isArray(record.devices) ? [...record.devices] : [];
    if (!devices.includes(cleanDid)) {
      if (devices.length >= 2) {
        return { ok: false, status: 403, error: "Device limit reached (max 2)" };
      }
      devices.push(cleanDid);
      record.devices = devices;
      await env.CODES.put(`code:${code}`, JSON.stringify(record));
    }
  }
  return { ok: true };
}

async function handlePublish(
  request: Request,
  origin: string,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  if (!isAllowedOrigin(request, env)) {
    return jsonResponse({ ok: false, error: "Forbidden origin" }, 403, corsHeaders);
  }
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (!checkBurstLimit(`pub:${ip}`, 12, 60_000)) {
    return jsonResponse({ ok: false, error: "Too many requests" }, 429, corsHeaders);
  }
  const body = await safeJson<{
    code?: string;
    slug?: string;
    brand?: string;
    html?: string;
    initData?: string;
    did?: string;
  }>(request, 220_000);
  if (!body || typeof body.html !== "string") {
    return jsonResponse({ ok: false, error: "Invalid request" }, 400, corsHeaders);
  }

  const code = normalizeCode(body.code);
  const record = code ? await getCodeRecord(code, env) : null;
  if (!record || record.refunded || record.host <= Date.now()) {
    return jsonResponse({ ok: false, error: "Hosting inactive" }, 403, corsHeaders);
  }
  const access = await verifyCodeAccess(code, record, body.initData ?? "", body.did ?? "", env, true);
  if (!access.ok) {
    return jsonResponse({ ok: false, error: access.error ?? "Access denied" }, access.status ?? 403, corsHeaders);
  }

  if (!isSafePublishedHtml(body.html)) {
    return jsonResponse({ ok: false, error: "Unsafe HTML rejected" }, 400, corsHeaders);
  }

  let slug = (body.slug || body.brand || "site")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);

  if (!slug) slug = "site";
  if (body.slug) {
    const owner = await env.CODES.get(`site-owner:${slug}`);
    if (owner && owner !== code) {
      slug = `${slug.slice(0, 27)}-${generateRandomAlnum(4).toLowerCase()}`;
    }
  } else {
    slug = `${slug}-${generateRandomAlnum(4).toLowerCase()}`;
  }

  const sites = Array.isArray(record.sites) ? [...record.sites] : [];
  const isOwnerCode = Boolean(record.userId && isOwner(record.userId, env));
  if (!sites.includes(slug)) {
    if (!isOwnerCode && sites.length >= 5) {
      return jsonResponse({ ok: false, error: "Site limit reached (max 5 per code)" }, 403, corsHeaders);
    }
    sites.push(slug);
    record.sites = sites;
    await env.CODES.put(`code:${code}`, JSON.stringify(record));
  }

  const cleanHtml = body.html.replace(/__SLUG__/g, encodeURIComponent(slug));
  const ttl = Math.min(30 * 24 * 60 * 60, Math.max(60, Math.floor((record.host - Date.now()) / 1000)));
  await Promise.all([
    env.CODES.put(`site:${slug}`, cleanHtml, { expirationTtl: ttl }),
    env.CODES.put(`site-owner:${slug}`, code, { expirationTtl: ttl }),
  ]);

  return jsonResponse(
    { ok: true, slug, url: `${origin}/s/${slug}` },
    200,
    corsHeaders
  );
}

async function handlePublishTrial(
  request: Request,
  origin: string,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  if (!isAllowedOrigin(request, env)) {
    return jsonResponse({ ok: false, error: "Forbidden origin" }, 403, corsHeaders);
  }
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (!checkBurstLimit(`trial:${ip}`, 6, 60_000)) {
    return jsonResponse({ ok: false, error: "Too many requests" }, 429, corsHeaders);
  }

  const body = await safeJson<{ brand?: string; html?: string; initData?: string }>(request, 220_000);
  if (!body || typeof body.html !== "string") {
    return jsonResponse({ ok: false, error: "Invalid request" }, 400, corsHeaders);
  }

  const rawInit = typeof body.initData === "string" ? body.initData.trim() : "";
  if (!rawInit) {
    return jsonResponse({ ok: false, error: "Trial available only inside Telegram bot" }, 403, corsHeaders);
  }
  const verified = await verifyTelegramInitData(rawInit, env.BOT_TOKEN);
  if (!verified) {
    return jsonResponse({ ok: false, error: "Invalid Telegram signature" }, 403, corsHeaders);
  }
  const tgUserId = verified.userId;
  if (await env.CODES.get(`trial-user:${tgUserId}`)) {
    return jsonResponse({ ok: false, error: "Trial already used" }, 429, corsHeaders);
  }

  if (!isSafePublishedHtml(body.html)) {
    return jsonResponse({ ok: false, error: "Unsafe HTML rejected" }, 400, corsHeaders);
  }

  let base = (body.brand || "demo")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  if (!base) base = "demo";
  const slug = `${base}-${generateRandomAlnum(5).toLowerCase()}`;

  const cleanHtml = body.html.replace(/__SLUG__/g, encodeURIComponent(slug));
  await Promise.all([
    env.CODES.put(`site:${slug}`, cleanHtml, { expirationTtl: 86_400 }),
    env.CODES.put(`trial-user:${tgUserId}`, slug, { expirationTtl: 180 * 86_400 }),
  ]);

  return jsonResponse(
    { ok: true, slug, url: `${origin}/s/${slug}`, ttl: 86400 },
    200,
    corsHeaders
  );
}

async function answerPreCheckout(
  q: NonNullable<TelegramUpdate["pre_checkout_query"]>,
  env: Env
): Promise<void> {
  const proPrice = Number(env.PRICE_PRO ?? env.PRO_STARS_PRICE ?? env.PRICE) || 500;
  const hostPrice = Number(env.HOST_PRICE ?? env.HOST_STARS_PRICE) || 600;
  const validPayload = q.invoice_payload === "pro" || q.invoice_payload === "host";
  const expectedAmount = q.invoice_payload === "host" ? hostPrice : proPrice;
  const validAmount = q.currency === "XTR" && q.total_amount === expectedAmount;
  await tgCall(
    "answerPreCheckoutQuery",
    {
      pre_checkout_query_id: q.id,
      ok: validPayload && validAmount,
      error_message: validPayload
        ? validAmount
          ? undefined
          : "Price mismatch. Please request a new invoice."
        : "Unknown product",
    },
    env
  );
}

async function handleTelegramUpdate(update: TelegramUpdate, env: Env): Promise<void> {
  if (seenUpdates.has(update.update_id)) return;
  if (seenUpdates.size > 500) seenUpdates.clear();
  seenUpdates.add(update.update_id);

  const proPrice = Number(env.PRICE_PRO ?? env.PRO_STARS_PRICE ?? env.PRICE) || 500;
  const hostPrice = Number(env.HOST_PRICE ?? env.HOST_STARS_PRICE) || 600;
  const baseSite = (env.SITE_URL || env.FRONTEND_URL || "https://i-field.github.io/ifield-ai-landing-builder-").replace(/\/+$/, "");

  const cq = update.callback_query;
  if (cq) {
    await tgCall("answerCallbackQuery", { callback_query_id: cq.id }, env);
    const cqChatId = cq.message?.chat.id ?? cq.from.id;
    const cqMsgId = cq.message?.message_id;
    const cqUserId = cq.from.id;
    const data = cq.data ?? "";
    if (data === "menu") {
      await sendStartMenu(cqChatId, baseSite, env, cqMsgId);
    } else if (data === "tariffs") {
      await sendTariffsMenu(cqChatId, proPrice, hostPrice, baseSite, env, cqMsgId);
    } else if (data === "buy:pro") {
      await sendStarsInvoice(cqChatId, "iField Studio Pro", "Цифровая лицензия: безлимитные скачивания без водяного знака (/terms)", "pro", proPrice, baseSite, env);
    } else if (data === "buy:host") {
      await sendStarsInvoice(cqChatId, "iField Studio Hosting (30 дней)", "Цифровая услуга: публикация сайта по короткой ссылке на 30 дней + Pro (/terms)", "host", hostPrice, baseSite, env);
    } else if (data === "terms") {
      await sendTermsMessage(cqChatId, baseSite, env, cqMsgId);
    } else if (data === "paysupport") {
      await sendPaySupportMessage(cqChatId, cqUserId, env, cqMsgId);
    }
    return;
  }

  const msg = update.message;
  if (!msg) return;
  const chatId = msg.chat.id;
  const userId = msg.from?.id;

  if (msg.successful_payment) {
    const sp = msg.successful_payment;
    if (sp.currency !== "XTR" || sp.total_amount <= 0) return;

    const chargeId = sp.telegram_payment_charge_id;
    const chargeKey = `charge:${chargeId}`;
    const existingRaw = chargeId ? await env.CODES.get(chargeKey) : null;
    if (existingRaw) {
      try {
        const existing = JSON.parse(existingRaw) as ChargeRecord;
        if (existing.refunded) return;
        const link = `${baseSite}/?code=${existing.code}`;
        await tgSendHtml(
          chatId,
          `<b>Платёж уже обработан!</b>\nВаш код активации: <code>${existing.code}</code>\n\nСсылка автоактивации:\n${escapeHtml(link)}`,
          env,
          { inline_keyboard: [[{ text: "🚀 Открыть в конструкторе", web_app: { url: link } }]] }
        );
      } catch {}
      return;
    }

    const kind: "pro" | "host" = sp.invoice_payload === "host" ? "host" : "pro";
    const code = chargeId
      ? `IF-${await deriveChargeAlnum(chargeId, env.WEBHOOK_SECRET || env.BOT_TOKEN, 12)}`
      : `IF-${generateRandomAlnum(12)}`;
    const hostExpiry = kind === "host" ? Date.now() + 30 * 24 * 60 * 60 * 1000 : 0;
    const rec: CodeRecord = {
      pro: true,
      host: hostExpiry,
      createdAt: Date.now(),
      userId,
      chargeId,
    };
    const chargeRec: ChargeRecord = {
      code,
      userId,
      kind,
      amount: sp.total_amount,
      createdAt: Date.now(),
      refunded: false,
    };
    await Promise.all([
      env.CODES.put(`code:${code}`, JSON.stringify(rec)),
      chargeId ? env.CODES.put(chargeKey, JSON.stringify(chargeRec)) : Promise.resolve(),
    ]);

    const link = `${baseSite}/?code=${code}`;
    await tgSendHtml(
      chatId,
      `<b>Оплата получена!</b>\nВаш код активации: <code>${code}</code>\n\nНажмите кнопку ниже для автоматической активации:\n${escapeHtml(link)}\n\nПо вопросам оплаты и возврата: /paysupport`,
      env,
      { inline_keyboard: [[{ text: "⚡ Активировать в конструкторе", web_app: { url: link } }]] }
    );
    return;
  }

  const text = (msg.text ?? "").trim();

  if (text === "/terms" || text.startsWith("/terms@")) {
    await sendTermsMessage(chatId, baseSite, env);
    return;
  }

  if (text === "/paysupport" || text.startsWith("/paysupport@")) {
    await sendPaySupportMessage(chatId, userId, env);
    return;
  }

  if (text === "/start" || text.startsWith("/start@")) {
    await sendStartMenu(chatId, baseSite, env);
    return;
  }

  if (text === "/tariffs" || text === "/prices" || text.startsWith("/tariffs@")) {
    await sendTariffsMenu(chatId, proPrice, hostPrice, baseSite, env);
    return;
  }

  if (text === "/start pro" || text === "/pro" || text.startsWith("/pro@")) {
    await sendStarsInvoice(chatId, "iField Studio Pro", "Цифровая лицензия: безлимитные скачивания без водяного знака (/terms)", "pro", proPrice, baseSite, env);
    return;
  }

  if (text === "/start host" || text === "/host" || text.startsWith("/host@")) {
    await sendStarsInvoice(chatId, "iField Studio Hosting (30 дней)", "Цифровая услуга: публикация сайта по короткой ссылке на 30 дней + Pro (/terms)", "host", hostPrice, baseSite, env);
    return;
  }

  if (!isOwner(userId, env)) return;

  if (text === "/reset_trial" && userId) {
    await env.CODES.delete(`trial-user:${userId}`);
    await tgSendHtml(chatId, "✅ Ваш лимит пробной ссылки 24ч сброшен для теста.", env);
    return;
  }

  if (text === "/issue pro" || text === "/issue host") {
    const isHost = text.endsWith("host");
    const code = `IF-${generateRandomAlnum(12)}`;
    const rec: CodeRecord = {
      pro: true,
      host: isHost ? Date.now() + 30 * 24 * 60 * 60 * 1000 : 0,
      createdAt: Date.now(),
      userId,
    };
    await env.CODES.put(`code:${code}`, JSON.stringify(rec));
    await tgSendHtml(chatId, `Выдан код (${isHost ? "Host+Pro" : "Pro"}): <code>${code}</code>`, env);
    return;
  }

  if (text.startsWith("/refund ")) {
    const arg = text.slice(8).trim();
    if (!arg) {
      await tgSendHtml(chatId, "Укажите код (<code>IF-...</code>) или <code>telegram_payment_charge_id</code>.", env);
      return;
    }
    let chargeId = arg;
    let code = "";
    let targetUserId: number | undefined;
    let kind: "pro" | "host" = "pro";
    let amount = 0;

    const norm = normalizeCode(arg);
    if (norm) {
      const rec = await getCodeRecord(norm, env);
      if (!rec || !rec.chargeId) {
        await tgSendHtml(chatId, "Код не найден или не связан с оплатой Stars.", env);
        return;
      }
      if (rec.refunded) {
        await tgSendHtml(chatId, `По коду <code>${norm}</code> возврат уже выполнен ранее.`, env);
        return;
      }
      code = norm;
      chargeId = rec.chargeId;
      targetUserId = rec.userId;
      kind = rec.host > 0 ? "host" : "pro";
      const rawCharge = await env.CODES.get(`charge:${chargeId}`);
      if (rawCharge) {
        try {
          const parsed = JSON.parse(rawCharge) as ChargeRecord;
          amount = parsed.amount;
          kind = parsed.kind;
        } catch {}
      }
    } else {
      const rawCharge = await env.CODES.get(`charge:${chargeId}`);
      if (rawCharge) {
        try {
          const parsed = JSON.parse(rawCharge) as ChargeRecord;
          if (parsed.refunded) {
            await tgSendHtml(chatId, "Возврат по этому платежу уже выполнен ранее.", env);
            return;
          }
          code = parsed.code;
          targetUserId = parsed.userId;
          kind = parsed.kind;
          amount = parsed.amount;
        } catch {}
      }
    }

    if (!targetUserId) {
      await tgSendHtml(chatId, "Не найден user_id для этого платежа.", env);
      return;
    }

    const res = await tgCallResult(
      "refundStarPayment",
      { user_id: targetUserId, telegram_payment_charge_id: chargeId },
      env
    );
    if (!res.ok) {
      await tgSendHtml(chatId, `Ошибка возврата: ${escapeHtml(res.description || "unknown")}`, env);
      return;
    }

    if (code) {
      await env.CODES.put(
        `code:${code}`,
        JSON.stringify({ pro: false, host: 0, createdAt: Date.now(), userId: targetUserId, chargeId, refunded: true })
      );
    }
    await env.CODES.put(
      `charge:${chargeId}`,
      JSON.stringify({ code, userId: targetUserId, kind, amount, createdAt: Date.now(), refunded: true })
    );
    await tgSendHtml(chatId, `✅ Возврат Stars выполнен, код <code>${escapeHtml(code || chargeId)}</code> деактивирован.`, env);
  }
}

function isOwner(userId: number | undefined, env: Env): boolean {
  if (!userId) return false;
  const list = new Set(
    (env.OWNER_ID ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  return list.size > 0 && list.has(String(userId));
}

function generateRandomAlnum(length: number): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

async function deriveChargeAlnum(chargeId: string, secret: string, length: number): Promise<string> {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`ifield:${chargeId}`)));
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[sig[i % sig.length] % chars.length];
  }
  return out;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function sendStartMenu(
  chatId: number,
  baseSite: string,
  env: Env,
  editMessageId?: number
): Promise<void> {
  await tgSendOrEditHtml(
    chatId,
    `<b>⚡ Привет! Это iField Studio: сайт-визитка для бизнеса за минуту.</b>\n\n1️⃣ Нажмите «Создать сайт»\n2️⃣ Заполните форму и выберите дизайн\n3️⃣ Скачайте файл или получите живую ссылку\n\nПервые 3 скачивания бесплатно.`,
    env,
    {
      inline_keyboard: [
        [{ text: "🚀 Создать сайт", web_app: { url: baseSite } }],
        [
          { text: "💳 Тарифы", callback_data: "tariffs" },
          { text: "🛠 Поддержка", callback_data: "paysupport" },
        ],
        [
          { text: "📜 Условия", callback_data: "terms" },
          { text: "📁 GitHub", url: "https://github.com/i-field/ifield-ai-landing-builder-" },
        ],
      ],
    },
    editMessageId
  );
}

async function sendTariffsMenu(
  chatId: number,
  proPrice: number,
  hostPrice: number,
  baseSite: string,
  env: Env,
  editMessageId?: number
): Promise<void> {
  await tgSendOrEditHtml(
    chatId,
    `<b>💳 Тарифы</b>\n\n🆓 Бесплатно: 3 скачивания, внизу сайта подпись iField\n⭐ <b>Pro: ${proPrice} ⭐</b> — один раз, безлимит и без подписи\n🔗 <b>Хостинг: ${hostPrice} ⭐</b> — за 30 дней, живая ссылка на ваш сайт и все функции Pro\n\nОплата Telegram Stars: прямо в Telegram. Перед покупкой ознакомьтесь с /terms.`,
    env,
    {
      inline_keyboard: [
        [{ text: `⭐ Pro, ${proPrice} ⭐`, callback_data: "buy:pro" }],
        [{ text: `🔗 Хостинг, ${hostPrice} ⭐`, callback_data: "buy:host" }],
        [{ text: "🚀 Создать сайт", web_app: { url: baseSite } }],
        [{ text: "⬅️ Назад", callback_data: "menu" }],
      ],
    },
    editMessageId
  );
}

async function sendTermsMessage(
  chatId: number,
  baseSite: string,
  env: Env,
  editMessageId?: number
): Promise<void> {
  await tgSendOrEditHtml(
    chatId,
    `<b>📜 Условия использования (Terms of Service)</b>\n\n• За Telegram Stars (XTR) приобретаются цифровые функции конструктора: безлимитный экспорт без водяного знака (Pro) и 30-дневный хостинг (Hosting, до 5 активных сайтов на 1 код).\n• Код привязывается к вашему Telegram-аккаунту и работает до 2 внешних браузеров. Пробная ссылка 24ч выдаётся 1 раз в боте.\n• Запрещено размещать скам, фишинг, нелегальный контент, пиратство и материалы 18+ — такие страницы удаляются без возврата средств.\n• Если код не выдался или возник сбой оплаты, обратитесь в /paysupport.\n\nКонструктор и правила:\n${escapeHtml(baseSite)}`,
    env,
    { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "menu" }]] },
    editMessageId
  );
}

async function sendPaySupportMessage(
  chatId: number,
  userId: number | undefined,
  env: Env,
  editMessageId?: number
): Promise<void> {
  await tgSendOrEditHtml(
    chatId,
    `<b>🛠 Поддержка по оплатам и возвратам</b>\n\nЕсли после оплаты Stars вы не получили код активации или хотите запросить возврат по технической причине:\n1. Перешлите сообщение о списании Stars или укажите ваш Telegram ID: <code>${userId ?? chatId}</code>\n2. Напишите в поддержку: @ifield_lab\n\nУсловия сервиса: /terms`,
    env,
    { inline_keyboard: [[{ text: "⬅️ Назад", callback_data: "menu" }]] },
    editMessageId
  );
}

async function sendStarsInvoice(
  chatId: number,
  title: string,
  description: string,
  payload: "pro" | "host",
  stars: number,
  baseSite: string,
  env: Env
): Promise<void> {
  await tgCall(
    "sendInvoice",
    {
      chat_id: chatId,
      title,
      description,
      payload,
      provider_token: "",
      currency: "XTR",
      prices: [{ label: title, amount: stars }],
      reply_markup: {
        inline_keyboard: [
          [{ text: `⭐ Оплатить ${stars} ⭐`, pay: true }],
          [
            { text: "⬅️ Назад к тарифам", callback_data: "tariffs" },
            { text: "🏠 В меню", callback_data: "menu" },
          ],
          [{ text: "🚀 Открыть конструктор", web_app: { url: baseSite } }],
        ],
      },
    },
    env
  );
}

async function tgSendOrEditHtml(
  chatId: number,
  html: string,
  env: Env,
  replyMarkup?: Record<string, unknown>,
  editMessageId?: number
): Promise<void> {
  if (editMessageId) {
    const edited = await tgCallResult(
      "editMessageText",
      {
        chat_id: chatId,
        message_id: editMessageId,
        text: html,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      },
      env
    );
    if (edited.ok) return;
  }
  await tgSendHtml(chatId, html, env, replyMarkup);
}

async function tgSendHtml(
  chatId: number,
  html: string,
  env: Env,
  replyMarkup?: Record<string, unknown>
): Promise<void> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }
  await tgCall("sendMessage", body, env);
}

async function tgCall(
  method: string,
  body: Record<string, unknown>,
  env: Env
): Promise<void> {
  const res = await fetch(
    `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    console.error("Telegram API error", method, res.status);
  }
}

async function tgCallResult(
  method: string,
  body: Record<string, unknown>,
  env: Env
): Promise<{ ok: boolean; description?: string }> {
  const res = await fetch(
    `https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  try {
    return (await res.json()) as { ok: boolean; description?: string };
  } catch {
    return { ok: false, description: `HTTP ${res.status}` };
  }
}

async function handleAiCopy(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  if (!isAllowedOrigin(request, env)) {
    return jsonResponse({ ok: false, error: "Forbidden origin" }, 403, corsHeaders);
  }
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (!checkBurstLimit(`ai:${ip}`, 15, 60_000)) {
    return jsonResponse({ ok: false, error: "Too many requests" }, 429, corsHeaders);
  }
  if (!env.GEMINI_API_KEY) {
    return jsonResponse({ ok: false, error: "AI not configured" }, 503, corsHeaders);
  }
  const body = await safeJson<{ q?: string; lang?: string; code?: string; initData?: string; did?: string }>(request, 8192);
  if (!body || typeof body.q !== "string" || !body.q.trim()) {
    return jsonResponse({ ok: false, error: "Missing prompt" }, 400, corsHeaders);
  }

  const code = normalizeCode(body.code);
  const record = code ? await getCodeRecord(code, env) : null;
  if (!record || record.refunded || (!record.pro && record.host <= Date.now())) {
    return jsonResponse({ ok: false, error: "Pro code required" }, 403, corsHeaders);
  }
  const access = await verifyCodeAccess(code, record, body.initData ?? "", body.did ?? "", env, true);
  if (!access.ok) {
    return jsonResponse({ ok: false, error: access.error ?? "Access denied" }, access.status ?? 403, corsHeaders);
  }

  const hourBucket = Math.floor(Date.now() / 3600000);
  const rlKey = `ai-rl:${code}:${hourBucket}`;
  const usedCount = Number((await env.CODES.get(rlKey)) ?? "0");
  if (usedCount >= 20) {
    return jsonResponse({ ok: false, error: "Rate limit exceeded" }, 429, corsHeaders);
  }
  await env.CODES.put(rlKey, String(usedCount + 1), { expirationTtl: 3600 });

  const lang = typeof body.lang === "string" ? body.lang.slice(0, 5) : "en";
  const prompt = `Generate landing page copy in language "${lang}" for business: "${body.q.slice(0, 400)}". Return strictly JSON with keys: brand, tag, niche, product, desc, feats (array of 3 short strings).`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );
  if (!res.ok) {
    return jsonResponse({ ok: false, error: "AI upstream error" }, 502, corsHeaders);
  }
  const payload = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const rawText = payload.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  try {
    const data = JSON.parse(rawText);
    return jsonResponse({ ok: true, data }, 200, corsHeaders);
  } catch {
    return jsonResponse({ ok: false, error: "Invalid AI JSON" }, 502, corsHeaders);
  }
}
