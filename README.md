# ⚡ iField Studio — Landing Page Builder

**From idea to a client-ready one-page website in a minute.**

[Live App](https://i-field.github.io/ifield-ai-landing-builder-/) • [Telegram Bot](https://t.me/ifield_studio_bot) • [Support](https://t.me/ifield_lab) • [Portfolio](https://i-field.github.io/ifield-studio)

---

## ✨ Key Features

- **14 Built-in Designs** — Nexus, Forge, Pulse, Slate, Aurora, Noir, Sunset, Mint, Turquoise, Nature, Holographic, Cyberpunk, Luxury, Cosmos (mobile & desktop preview).
- **6 Languages** — English, Russian, Ukrainian, Polish, German, French (separate UI language & generated site language).
- **Zero-Dependency Output** — exports a clean, standalone, responsive single-file HTML page with OpenGraph & SEO meta tags.
- **Photo Compression** — client-side Canvas resize (up to 900px JPEG) + safe external image URLs.
- **AI Copywriter (Optional)** — server-side `/ai` endpoint powered by Cloudflare Worker + Gemini API.
- **30-Day Live Hosting** — one-tap publish to Cloudflare KV (`https://ifield-api.your-subdomain.workers.dev/s/<slug>`) with strict `Content-Security-Policy`.

---

## 💰 Tiers & Telegram Stars

- **FREE** — 3 free downloads/copies/shares with a footer attribution link.
- **PRO (500 ⭐)** — unlimited downloads, no watermark, AI copy assistant.
- **HOSTING (300 ⭐ / 30 days)** — live short link on Cloudflare Workers + all PRO features.

Payments run natively through [@ifield_studio_bot](https://t.me/ifield_studio_bot) using **Telegram Stars (`XTR`)**, automatically issuing an `IF-XXXXXXXXXXXX` activation code.

---

## 🛠️ Architecture (100% Free-Tier Friendly)

- **Frontend (`index.html`)** — Pure HTML/CSS/JS hosted on **GitHub Pages**.
- **Backend (`src/worker.ts`)** — **Cloudflare Workers + KV** (`/verify`, `/prices`, `/publish`, `/s/:slug`, `/ai`, `/webhook/telegram`, `/terms`, `/privacy`).
- **CI/CD (`.github/workflows/deploy.yml`)** — Automatic TypeScript check, secret scan, and deploy via **GitHub Actions**.

---

## ⚙️ Quick Setup

1. Create a Cloudflare KV namespace (`IFIELD_KV`) and put its ID in `wrangler.toml`.
2. Add encrypted secrets in **Cloudflare Dashboard → Workers & Pages → Settings → Variables and Secrets**:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_WEBHOOK_SECRET`
   - `ALLOWED_TELEGRAM_IDS`
   - `GEMINI_API_KEY` *(optional, for `/ai`)*
3. Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` to **GitHub → Settings → Secrets and variables → Actions**.
4. Set your Worker URL in `const API = "https://ifield-api.your-subdomain.workers.dev";` inside `index.html`.
5. Register your Telegram webhook via `setWebhook` with `secret_token`.

---

## 📄 License

MIT — free for personal and commercial use.
