# ⚡ iField Studio — Landing Page Builder

**From idea to a client-ready one-page website in a minute.**

[Live App](https://i-field.github.io/ifield-ai-landing-builder-/) • [Telegram Bot](https://t.me/ifield_studio_bot) • [Support](https://t.me/ifield_lab) • [Portfolio](https://i-field.github.io/ifield-studio)

---

## ✨ Key Features

- **Apple Sci-Fi Visuals (Editor & Exported Sites)** — GPU-composited (`translate3d` + `opacity`) running edge glows, card top-rim sweeps, button glass sheen, and staggered entrance animations — built cleanly for iPhone with zero mobile `backdrop-filter` lag and an optional **✨ Glow FX** toggle for generated sites (100% pure CSS, zero JS).
- **20 Studio Designs & Dual Opposing Ribbons** — Nexus, Rose, Espresso, Bento, Swiss, Ocean, Sand, Forge, Pulse, Slate, Aurora, Noir, Sunset, Mint, Turquoise, Nature, Holographic, Cyberpunk, Luxury, Cosmos gliding in one ribbon while Niche Presets glide in the opposite direction (full touch-swipe & motion-safe support).
- **12 One-Tap Presets + Offline Smart Niche Autofill** — Coffee Shop, Nail & Beauty, Designer, Barbershop, Auto Studio, Coaching, Fitness Coach, Photographer, Dental Clinic, Real Estate, Wellness, Brand Shop — plus instant offline autofill for dozens of micro-niches and any custom topic with **↩ Undo**.
- **Layout, Color & Glow Customizer** — Override layout (`Auto` / `Card` / `Split` / `Stack`), pick a custom accent color on any of the 20 themes (automatically re-tinting Sci-Fi edge glows), toggle **✨ Glow FX**, and inspect live Mobile / Desktop / Fullscreen previews.
- **Built-in Interactive Guide & 6 Languages** — Step-by-step **❓ Guide** modal and full localization in **EN, RU, UK, PL, DE, FR** (with separate UI language and generated site language).
- **Zero-Dependency Output & Instant Live Hosting** — Export a clean single-file HTML page or publish to Cloudflare KV (`https://ifield.qx420.workers.dev/s/<slug>`) with strict `Content-Security-Policy`.
- **Optional AI Copywriter** — Server-side `/ai` endpoint powered by Cloudflare Worker + Gemini API (automatically enabled when `GEMINI_API_KEY` is set).

---

## 🚀 How to Use (1-Minute Guide)

1. **Pick a design & niche** — swipe the top **Designs (20)** or **Niche templates (12)** ribbon, or type any business field and tap **✨ Autofill** (**↩ Undo** anytime).
2. **Customize your page** — choose layout (`Auto` / `Card` / `Split` / `Stack`), accent color, **✨ Glow FX**, edit contacts/price/reviews/FAQ and upload a photo.
3. **Export or publish** — download HTML free up to 3 times, test a 1-time 24h live link inside [@ifield_studio_bot](https://t.me/ifield_studio_bot), or tap **🔗 Publish** for 30-day hosting (up to 5 active sites per code).
4. **Activate Pro / Hosting** — pay with **Telegram Stars (`XTR`)** inside [@ifield_studio_bot](https://t.me/ifield_studio_bot); the bot immediately sends a one-tap auto-activation link (`/?code=IF-...`).

---

## 💰 Tiers, Fair Use & Telegram Stars

- **FREE** — 3 free HTML downloads/copies/shares (with footer attribution) + 1 free 24-hour test link inside [@ifield_studio_bot](https://t.me/ifield_studio_bot).
- **PRO (500 ⭐)** — one-time unlock: unlimited exports without watermark + AI copywriter (when enabled).
- **HOSTING (600 ⭐ / 30 days)** — live short links on `workers.dev` (up to 5 active pages per code) + all PRO features.
- **Account & Device Binding** — codes are bound to the buyer's Telegram account inside the Mini App and allow up to **2 external browser devices** outside Telegram.

---

## 🤖 Owner Commands (inside [@ifield_studio_bot](https://t.me/ifield_studio_bot))

Available only to Telegram IDs listed in `OWNER_ID`:

- `/issue pro` — generate a free Pro activation code (no 2-device limit).
- `/issue host` — generate a free 30-day Hosting + Pro code (no 2-device / 5-site cap).
- `/reset_trial` — reset your own 24-hour trial limit for testing.
- `/refund <IF-CODE | charge_id>` — issue a `refundStarPayment` refund and revoke the code.

---

## 🔐 Security & Anti-Abuse Safeguards

- **Telegram HMAC Verification & Account Binding** — `Telegram.WebApp.initData` is verified via HMAC-SHA256 against `BOT_TOKEN`; codes cannot be activated on another user's Telegram account and external browsers are capped at **2 devices** (`did`).
- **Telegram-Only 24h Trial** — `/publish-trial` requires verified Telegram `initData` (`trial-user:<tgUserId>`), preventing VPN/IP farming while avoiding shared carrier CGNAT collisions.
- **Strict HTML Sanitizer & Hardened Hosting Headers** — `isSafePublishedHtml` strips active HTML/SVG/JS vectors before storing in KV, while `GET /s/:slug` enforces `script-src 'none'`, `X-Frame-Options: DENY`, `X-Robots-Tag: noindex, nofollow, noarchive`, `Cross-Origin-Resource-Policy: same-origin`, and `Permissions-Policy`.
- **Abuse & Quota Protection** — IP burst rate limits on `/verify`, `/publish`, `/publish-trial`, and `/ai`, `Origin` enforcement, timing-safe webhook secret validation, and in-memory update deduplication to preserve Cloudflare KV Free-tier daily write quota.

---

## 🌐 Custom Domains

1. **Custom domain for the Studio (`index.html`)**: set your domain in **GitHub → Settings → Pages → Custom domain**, update `SITE_URL` in Cloudflare Variables, and add the domain to `ALLOWED_ORIGIN` (comma-separated if keeping `https://i-field.github.io`).
2. **Custom domain for hosted pages (`/s/:slug`)**: in **Cloudflare Dashboard → Worker → Settings → Domains & Routes → Add → Custom Domain**, attach your subdomain (e.g. `go.yourdomain.com`).
3. **Custom domain for a client**: export the standalone `index.html` via **Download** and upload it to any static host.

---

## ⚙️ Quick Setup

1. Bind your Cloudflare KV namespace (`ifield_codes`) as `CODES` in `wrangler.toml`.
2. In **Cloudflare Dashboard → Workers & Pages → Settings → Variables and Secrets**:
   - **Secret (Encrypt)**: `BOT_TOKEN`, `WEBHOOK_SECRET`, `GEMINI_API_KEY` *(optional)*
   - **Variable** (or Secret): `OWNER_ID`, `SITE_URL`, `PRICE_PRO`, `HOST_PRICE`, `ALLOWED_ORIGIN`
3. Connect the repository via **Cloudflare Workers Builds** (`npx wrangler deploy`) or use GitHub Actions (`.github/workflows/deploy.yml`).
4. Set `const API = "https://ifield.qx420.workers.dev";` inside `index.html`.
5. Register your Telegram webhook via `setWebhook` with `secret_token`.

---

## 📄 Terms, Privacy & License

- Terms of Service: `https://ifield.qx420.workers.dev/terms` (or `/terms` inside the bot)
- Privacy Policy: `https://ifield.qx420.workers.dev/privacy`
- Payment Support: `/paysupport` inside [@ifield_studio_bot](https://t.me/ifield_studio_bot)
- License: MIT
