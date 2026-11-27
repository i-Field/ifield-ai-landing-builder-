# ⚡ iField Studio — Landing Page Builder

**From idea to a client-ready one-page website in a minute.**

[Live App](https://i-field.github.io/ifield-ai-landing-builder-/) • [Telegram Bot](https://t.me/ifield_studio_bot) • [Support](https://t.me/ifield_lab) • [Portfolio](https://i-field.github.io/ifield-studio)

---

## ✨ Key Features

- **20 Studio Designs & Dual Opposing Ribbons** — Nexus, Rose, Espresso, Bento, Swiss, Ocean, Sand, Forge, Pulse, Slate, Aurora, Noir, Sunset, Mint, Turquoise, Nature, Holographic, Cyberpunk, Luxury, Cosmos gliding in one ribbon while enlarged Niche Presets glide in the opposite direction (full touch-swipe & motion-safe support).
- **12 One-Tap Presets + Offline Smart Niche Autofill** — Coffee Shop, Nail & Beauty, Designer, Barbershop, Auto Studio, Coaching, Fitness Coach, Photographer, Dental Clinic, Real Estate, Wellness, Brand Shop — plus instant offline autofill for dozens of micro-niches (sugaring, brow lamination, phone repair, bakery, florists, massage, legal, tutoring, cleaning, grooming, tattoo) and a universal custom-niche synthesizer with **Undo**.
- **Layout & Accent Customizer** — Override layout (`Auto` / `Card` / `Split` / `Stack`) and pick a custom accent color on any of the 20 themes with automatic contrast calculation, live block readiness counter, and mobile/desktop/fullscreen preview.
- **High-Converting Sections** — Clean top navigation, Hero with architectural fallback card, Trust metrics strip, Benefits grid, Client Reviews, Pricing & Schedule card, and pure-HTML FAQ accordion (CSP-safe, zero JS).
- **6 Languages** — English, Russian, Ukrainian, Polish, German, French (separate UI language & generated site language).
- **Zero-Dependency Output** — exports a clean, standalone, responsive single-file HTML page with OpenGraph & SEO meta tags.
- **Photo Compression** — client-side Canvas resize (up to 900px JPEG) + safe external image URLs.
- **AI Copywriter (Optional)** — server-side `/ai` endpoint powered by Cloudflare Worker + Gemini API.
- **Instant Live Hosting** — one-tap publish to Cloudflare KV (`https://ifield.qx420.workers.dev/s/<slug>`) with strict `Content-Security-Policy` (plus optional 24h free test link).

---

## 💰 Tiers & Telegram Stars

- **FREE** — 3 free downloads/copies/shares with a footer attribution link.
- **PRO (500 ⭐)** — unlimited downloads, no watermark, AI copy assistant.
- **HOSTING (300 ⭐ / 30 days)** — live short link on Cloudflare Workers + all PRO features.

Payments run natively through [@ifield_studio_bot](https://t.me/ifield_studio_bot) using **Telegram Stars (`XTR`)**, automatically issuing an `IF-XXXXXXXXXXXX` activation code.

---

## 🛠️ Architecture (100% Free-Tier Friendly)

- **Frontend (`index.html`)** — Pure HTML/CSS/JS hosted on **GitHub Pages**.
- **Backend (`src/worker.ts`)** — **Cloudflare Workers + KV (`CODES`)** (`/verify`, `/prices`, `/publish`, `/s/:slug`, `/ai`, `/webhook/telegram`, `/terms`, `/privacy`).
- **CI/CD (`.github/workflows/deploy.yml`)** — Automatic TypeScript check, secret scan, and deploy via **GitHub Actions**.

---

## 🔐 Security Safeguards

- **Server-side activation codes** — no promo codes or secrets stored in public HTML; codes are generated via `crypto.getRandomValues` and verified in Cloudflare KV (`CODES`).
- **Strict CSP on hosted pages** — `/s/:slug` enforces `script-src 'none'` and `X-Content-Type-Options: nosniff`, blocking Stored XSS.
- **Timing-safe webhook auth** — `X-Telegram-Bot-Api-Secret-Token` verified in constant time via Web Crypto `SHA-256` + `timingSafeEqual`.
- **Origin-restricted CORS** — API endpoints allow requests only from configured `ALLOWED_ORIGIN`.

---

## ⚙️ Quick Setup

1. Bind your Cloudflare KV namespace as `CODES` in `wrangler.toml`.
2. In **Cloudflare Dashboard → Workers & Pages → Settings → Variables and Secrets**:
   - Store as **Secret (Encrypt)**: `BOT_TOKEN`, `WEBHOOK_SECRET`, `GEMINI_API_KEY` *(optional)*
   - Store as **Variable** (or Secret): `OWNER_ID`, `SITE_URL`, `PRICE_PRO`, `HOST_PRICE`, `ALLOWED_ORIGIN`
3. Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` to **GitHub → Settings → Secrets and variables → Actions**.
4. Set `const API = "https://ifield.qx420.workers.dev";` inside `index.html`.
5. Register your Telegram webhook via `setWebhook` with `secret_token`.

---

## 📄 License

MIT — free for personal and commercial use.
