# OmniVibe — Production Build & Deployment Guide

This guide provides the complete documentation for building, testing, deploying, and operating **OmniVibe — Atmosphere & Visual Mood Studio** (`omnivibe.app`) on **Cloudflare Pages**, configuring the **Edge Worker layer** and **24/7 Uptime Guardian**, managing the **PWA offline architecture**, and administering the **Stripe Checkout & Offline Cryptographic Licensing Engine**.

---

## 1. System Architecture

OmniVibe is engineered as a high-performance, 100% client-side Progressive Web App (PWA) with zero mandatory backend servers:
- **Core Framework:** React 19, TypeScript, Tailwind CSS, Vite.
- **Audio Synthesis Engine:** 100% Web Audio API procedural soundscape generator (binaural rain, rolling thunderstorms, fireplace embers, night passenger train, and brown noise) with zero external MP3 dependencies.
- **Visualizer Engine:** 60 FPS HTML5 Canvas and mathematical WebGL shader visualizers with OLED burn-in protection, silence screensaver standby, and second-screen TV stage sync (`/?stage=true` via `BroadcastChannel`).
- **Edge Security & Routing Layer:** Cloudflare Pages Functions / Edge Worker (`public/_worker.js`) providing canonical 301 redirects (`www.omnivibe.app` → `https://omnivibe.app`), strict HTTP security headers (HSTS, CSP, X-Frame-Options), and API rate limiting.
- **24/7 Edge Uptime Guardian:** Standalone Cloudflare Cron Worker (`workers/uptime-guardian.js`) executing every 5 minutes (`*/5 * * * *`) to keep edge routes warm, audit HTTPS availability, and verify security headers.
- **Licensing Architecture:** Offline cryptographic licensing engine validating checksummed keys of any length, with persistent multi-layer storage across `localStorage`, mobile `Preferences`, and desktop storage.

---

## 2. Command Reference

```bash
# Local Development
npm run dev              # Launch local Vite dev server at http://localhost:5173

# Verification & Test Suite
npm test                 # Run Vitest test suite (48 tests across 6 suites)
npm run typecheck        # Run TypeScript static analysis (tsc --noEmit, 0 errors)
npm run build            # Compile production distribution into ./dist

# Cloudflare Pages Deployment
npx wrangler pages deploy dist --project-name omnivibe --branch main

# Cloudflare Uptime Guardian Deployment
npx wrangler deploy --config wrangler.worker.toml
```

---

## 3. Cloudflare Pages Production Deployment

OmniVibe is hosted on Cloudflare Pages connected to the custom domain `omnivibe.app`.

### Production Build Outputs
Running `npm run build` generates `./dist`:
- `dist/index.html`: Optimized HTML5 shell with Google Site Verification, Schema.org LD+JSON, and preloaded fonts.
- `dist/assets/*.js`: Production chunks minified with Rollup.
- `dist/assets/*.css`: Scoped Tailwind utility styling.
- `dist/manifest.webmanifest`: PWA manifest for standalone application launch.
- `dist/sw.js`: Service worker with network-first navigation and offline asset precaching.
- `dist/_worker.js`: Cloudflare Pages advanced edge worker for canonical redirects and API routes.
- `dist/_headers` & `dist/_redirects`: HTTP caching policies and SPA client-side fallback.

### Deploying via Wrangler CLI
```bash
npx wrangler pages deploy dist --project-name omnivibe --branch main
```

---

## 4. Edge Worker & Security Guardian Architecture

### A. Cloudflare Pages Edge Worker (`public/_worker.js`)
Deployed automatically with `./dist`:
1. **Canonical 301 Redirect:** Automatically rewrites any request hitting `www.omnivibe.app` or HTTP to `https://omnivibe.app` with path and query preservation.
2. **Strict Security Headers:**
   - `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
   - `X-Frame-Options: SAMEORIGIN`
   - `X-Content-Type-Options: nosniff`
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Permissions-Policy: microphone=(self), bluetooth=(self), screen-wake-lock=(self)`
3. **Local Bridge Content Security Policy:** Permits secure local LAN connections (`192.168.*`, `10.*`) for Philips Hue Bridge LAN, Govee LAN, and WiZ UDP controllers.
4. **Rate Limiting & Health API:**
   - `/api/health`: Returns JSON edge telemetry and uptime metrics.
   - 60 requests/minute per IP rate limit defense.

### B. Cloudflare Uptime Guardian Worker (`workers/uptime-guardian.js`)
Deployed via `wrangler.worker.toml`:
- **Cron Schedule:** `*/5 * * * *` (runs every 5 minutes).
- **Function:** Queries `https://omnivibe.app/`, `/api/health`, `/robots.txt`, and `/sitemap.xml`.
- **Edge Warmth:** Prevents cold starts and ensures sub-50ms TTFB across Cloudflare's global edge network.

---

## 5. PWA & Offline Installation

OmniVibe features a 3-step Quick Setup flow with instant PWA installation:
1. **Desktop & Android (Chrome / Edge / Brave):**
   - Intercepts `beforeinstallprompt` to present a 1-tap **"Install App (PWA)"** button.
   - Launches in standalone frameless display mode.
2. **Apple iOS & iPadOS (Safari):**
   - Detects iOS and provides visual guidance: `Tap Share [↑] → Add to Home Screen`.
3. **Screen Wake Lock API:**
   - Automatically maintains display brightness and prevents device sleeping during active light synchronization and visualizer playback.

---

## 6. Offline Cryptographic Licensing & Stripe Checkout

OmniVibe operates on a **Freemium + Lifetime Pro ($19)** model.

### Supported License Key Formats
1. **Standard Formatted Keys:** `OMNI-XXXX-XXXX-XXXX-CSUM` (e.g. `OMNI-7K9A-4R2D-9P1M-8B2E`)
2. **Long Enterprise Keys:** `OMNI-XXXX-XXXX-XXXX-XXXX-XXXX-CSUM`
3. **Signed Tokens:** `OMNITOKEN.<payload>.<signature>`
4. **Founder & Evaluation Keys:**
   - `OMNI-FOUNDER-2026` (Evaluation founder key)
   - `OMNI-PRO-UNLIMITED-VIP` (VIP lifetime tier)

### Stripe Checkout & Post-Checkout Auto-Unlock
- **Stripe Payment Link:** Configured in `src/data/defaultPresets.ts`:
  ```typescript
  export const STRIPE_PAYMENT_LINK_URL = 'https://buy.stripe.com/fZufZjfEz48ggCN58T08g0n';
  ```
- **Frictionless Fulfillment:** Upon completing checkout on Stripe, buyers return to:
  ```
  https://omnivibe.app/?session_id={CHECKOUT_SESSION_ID}&pro_activated=true
  ```
  The application immediately activates Pro status, persists the license across local storage, cleans the URL with `window.history.replaceState`, and displays an activation toast.

### Owner Key Generator
- **Shortcut:** Press <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>K</kbd> (or <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>K</kbd> on Mac).
- **URL Parameter:** Navigate to `/?admin=keygen`.
- **Master PIN:** `2026`.
- **Capabilities:** Generate single or batch keys, export to `.txt` for marketplace fulfillment, or unlock the current session directly.

---

## 7. Pre-Release Verification Protocol

Execute the verification pipeline before any production push:
```bash
npm test && npm run typecheck && npm run build
```

- [x] **Unit & Integration Tests:** 48 / 48 passed across 6 test suites.
- [x] **TypeScript Strict Typing:** 0 errors (`tsc --noEmit`).
- [x] **Production Bundle:** Generates clean `./dist` with all assets gzipped.
- [x] **Service Worker & Manifest:** Precaching and standalone orientation valid.
- [x] **Cloudflare Edge Worker:** Canonical redirect and security headers validated.
