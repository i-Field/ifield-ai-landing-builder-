export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const corsHeaders = buildCorsHeaders(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return jsonResponse({ ok: true, service: "ifield-api" }, 200, corsHeaders);
    }

    if (request.method === "GET" && url.pathname === "/prices") {
      return jsonResponse(
        {
          pro: Number(env.PRICE_PRO ?? env.PRICE) || 500,
          host: Number(env.HOST_PRICE) || 300,
          ai: Boolean(env.GEMINI_API_KEY),
        },
        200,
        corsHeaders
      );
    }

    if (request.method === "GET" && url.pathname === "/verify") {
      const code = normalizeCode(url.searchParams.get("code"));
      if (!code) return jsonResponse({ ok: false }, 400, corsHeaders);
      const record = await getCodeRecord(code, env);
      if (!record) return jsonResponse({ ok: false }, 404, corsHeaders);
      return jsonResponse({ ok: true, pro: record.pro, host: record.host }, 200, corsHeaders);
    }

    if (request.method === "POST" && url.pathname === "/publish") {
      return handlePublish(request, url.origin, env, corsHeaders);
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
          "Referrer-Policy": "no-referrer",
          "Content-Security-Policy":
            "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; font-src 'none'; script-src 'none'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        },
      });
    }

    if (request.method === "GET" && url.pathname === "/terms") {
      return new Response(
        "<!doctype html><meta charset='utf-8'><title>Terms — iField Studio</title><body style='font-family:system-ui;max-width:680px;margin:40px auto;padding:0 16px'><h1>Terms of Service</h1><p>Sites published via iField Studio are hosted for 30 days. Illegal or phishing content is removed on report.</p></body>",
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    if (request.method === "GET" && url.pathname === "/privacy") {
      return new Response(
        "<!doctype html><meta charset='utf-8'><title>Privacy — iField Studio</title><body style='font-family:system-ui;max-width:680px;margin:40px auto;padding:0 16px'><h1>Privacy Policy</h1><p>Draft form data stays in your browser localStorage. Published pages and activation codes are stored in Cloudflare KV.</p></body>",
        { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    if (request.method === "POST" && (url.pathname === "/webhook/telegram" || url.pathname === "/webhook")) {
      if (!env.WEBHOOK_SECRET || !env.BOT_TOKEN) {
        return new Response("Misconfigured", { status: 500 });
      }
      const incoming = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
      if (!(await timingSafeEqual(incoming, env.WEBHOOK_SECRET))) {
        return new Response("Unauthorized", { status: 401 });
      }

      const raw = await request.text();
      if (raw.length > 256_000) return new Response("Payload too large", { status: 413 });
      let update;
      try {
        update = JSON.parse(raw);
      } catch {
        return new Response("Bad JSON", { status: 400 });
      }

      ctx.waitUntil(handleTelegramUpdate(update, env));
      return new Response("OK", { status: 200 });
    }

    return new Response("Not Found", { status: 404 });
  },
};

function buildCorsHeaders(request, env) {
  const origin = (request.headers.get("Origin") ?? "").replace(/\/+$/, "");
  const rawAllowed = env.SITE_ORIGIN || env.ALLOWED_ORIGIN || "https://i-field.github.io";
  const allowed = rawAllowed.split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);
  const matched = allowed.includes(origin) ? origin : allowed[0] ?? "https://i-field.github.io";
  return {
    "Access-Control-Allow-Origin": matched,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function jsonResponse(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

async function safeJson(request, maxBytes) {
  const raw = await request.text();
  if (raw.length > maxBytes) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(ha, hb);
}

function normalizeCode(raw) {
  const c = (raw ?? "").trim().toUpperCase();
  return /^IF-[A-Z0-9]{8,24}$/.test(c) ? c : "";
}

async function getCodeRecord(code, env) {
  const raw = await env.CODES.get(`code:${code}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function handlePublish(request, origin, env, corsHeaders) {
  const body = await safeJson(request, 180_000);
  if (!body || typeof body.html !== "string") {
    return jsonResponse({ ok: false, error: "Invalid request" }, 400, corsHeaders);
  }

  const code = normalizeCode(body.code);
  const record = code ? await getCodeRecord(code, env) : null;
  if (!record || record.host <= Date.now()) {
    return jsonResponse({ ok: false, error: "Hosting inactive" }, 403, corsHeaders);
  }

  if (/<script\b|<iframe\b|<object\b|<embed\b|javascript:|\bon[a-z]+\s*=/i.test(body.html)) {
    return jsonResponse({ ok: false, error: "Unsafe HTML rejected" }, 400, corsHeaders);
  }

  let slug = (body.slug || body.brand || "site")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);

  if (!slug) slug = "site";
  if (!body.slug) {
    slug = `${slug}-${generateRandomAlnum(4).toLowerCase()}`;
  }

  const cleanHtml = body.html.replace(/__SLUG__/g, encodeURIComponent(slug));
  await env.CODES.put(`site:${slug}`, cleanHtml, { expirationTtl: 30 * 24 * 60 * 60 });

  return jsonResponse({ ok: true, slug, url: `${origin}/s/${slug}` }, 200, corsHeaders);
}

async function handleTelegramUpdate(update, env) {
  const dedupKey = `tg-upd:${update.update_id}`;
  if (await env.CODES.get(dedupKey)) return;
  await env.CODES.put(dedupKey, "1", { expirationTtl: 300 });

  if (update.pre_checkout_query) {
    const q = update.pre_checkout_query;
    const validPayload = q.invoice_payload === "pro" || q.invoice_payload === "host";
    await tgCall(
      "answerPreCheckoutQuery",
      {
        pre_checkout_query_id: q.id,
        ok: validPayload && q.currency === "XTR",
        error_message: validPayload ? undefined : "Unknown product",
      },
      env
    );
    return;
  }

  const msg = update.message;
  if (!msg) return;
  const chatId = msg.chat.id;
  const userId = msg.from?.id;

  if (msg.successful_payment) {
    const kind = msg.successful_payment.invoice_payload === "host" ? "host" : "pro";
    const code = `IF-${generateRandomAlnum(12)}`;
    const hostExpiry = kind === "host" ? Date.now() + 30 * 24 * 60 * 60 * 1000 : 0;
    const rec = {
      pro: true,
      host: hostExpiry,
      createdAt: Date.now(),
      userId,
      chargeId: msg.successful_payment.telegram_payment_charge_id,
    };
    await env.CODES.put(`code:${code}`, JSON.stringify(rec));
    const baseSite = (env.SITE_URL || "https://i-field.github.io/ifield-ai-landing-builder-").replace(/\/+$/, "");
    const link = `${baseSite}/?code=${code}`;
    await tgSendHtml(
      chatId,
      `<b>Оплата получена!</b>\nВаш код активации: <code>${code}</code>\n\nНажмите ссылку для автоматической активации:\n${escapeHtml(link)}`,
      env
    );
    return;
  }

  const text = (msg.text ?? "").trim();

  if (text === "/start" || text === "/start pro") {
    const price = Number(env.PRICE_PRO ?? env.PRICE) || 500;
    await sendStarsInvoice(chatId, "iField Studio Pro", "Безлимитные скачивания без водяного знака", "pro", price, env);
    return;
  }

  if (text === "/start host") {
    const price = Number(env.HOST_PRICE) || 300;
    await sendStarsInvoice(chatId, "iField Studio Hosting (30 дней)", "Публикация сайта по короткой ссылке + все функции Pro", "host", price, env);
    return;
  }

  if (!isOwner(userId, env)) return;

  if (text === "/issue pro" || text === "/issue host") {
    const isHost = text.endsWith("host");
    const code = `IF-${generateRandomAlnum(12)}`;
    const rec = {
      pro: true,
      host: isHost ? Date.now() + 30 * 24 * 60 * 60 * 1000 : 0,
      createdAt: Date.now(),
      userId,
    };
    await env.CODES.put(`code:${code}`, JSON.stringify(rec));
    await tgSendHtml(chatId, `Выдан код (${isHost ? "Host+Pro" : "Pro"}): <code>${code}</code>`, env);
  }
}

function isOwner(userId, env) {
  if (!userId) return false;
  const list = new Set((env.OWNER_ID ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  return list.size > 0 && list.has(String(userId));
}

function generateRandomAlnum(length) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length];
  return out;
}

function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function sendStarsInvoice(chatId, title, description, payload, stars, env) {
  await tgCall("sendInvoice", {
    chat_id: chatId,
    title,
    description,
    payload,
    currency: "XTR",
    prices: [{ label: title, amount: stars }],
  }, env);
}

async function tgSendHtml(chatId, html, env) {
  await tgCall("sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  }, env);
}

async function tgCall(method, body, env) {
  const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error("Telegram API error", method, res.status);
}

async function handleAiCopy(request, env, corsHeaders) {
  if (!env.GEMINI_API_KEY) {
    return jsonResponse({ ok: false, error: "AI not configured" }, 503, corsHeaders);
  }
  const body = await safeJson(request, 8192);
  if (!body || typeof body.q !== "string" || !body.q.trim()) {
    return jsonResponse({ ok: false, error: "Missing prompt" }, 400, corsHeaders);
  }

  const code = normalizeCode(body.code);
  const record = code ? await getCodeRecord(code, env) : null;
  if (!record || (!record.pro && record.host <= Date.now())) {
    return jsonResponse({ ok: false, error: "Pro code required" }, 403, corsHeaders);
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
  if (!res.ok) return jsonResponse({ ok: false, error: "AI upstream error" }, 502, corsHeaders);
  const payload = await res.json();
  const rawText = payload.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  try {
    const data = JSON.parse(rawText);
    return jsonResponse({ ok: true, data }, 200, corsHeaders);
  } catch {
    return jsonResponse({ ok: false, error: "Invalid AI JSON" }, 502, corsHeaders);
  }
}
