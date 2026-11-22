# Microsoft Store Submission Package — OmniVibe Studio

This folder contains the ready-to-submit listing copy, graphics, and PWA/Electron configuration for publishing **OmniVibe Studio** on the **Microsoft Store** via **Microsoft Partner Center**.

---

## 1. Partner Center Store Listing Fields

- **Product Name:** `OmniVibe — Atmosphere & Visual Mood Studio`
- **Package Identity Name:** `RuralAndRecklessMediaLLC.OmniVibeStudio`
- **Publisher Display Name:** `Rural & Reckless Media LLC`
- **Entity Type & D-U-N-S:** `Corporation (US)` • **D-U-N-S #: `14-501-9603`**
- **Registered Address:** `4301 W Mogollon Dr, Show Low, AZ, US`
- **Business Phone:** `(928) 368-3484`
- **Primary Category:** `Music` (Secondary: `Utilities & tools` / `Personalization`)
- **Age Rating (IARC):** `3+ / Everyone` (Photosensitivity advisory included in Terms & in-app Guardrails)
- **Privacy Policy URL:** `https://omnivibe.app/privacy.html`
- **Terms of Use URL:** `https://omnivibe.app/terms.html`
- **Support Contact Email:** `support@omnivibe.app`
- **Website:** `https://omnivibe.app`

> **Why Start with Microsoft Partner Center ($0 Cost):** Microsoft Store company developer registration for individual/business apps is **$0 (FREE)** and uses your verified **D-U-N-S `#14-501-9603`** (`Rural & Reckless Media LLC`) for fast business verification — so you can list, sell, and earn revenue on Windows right away without waiting for Google Play's $25 one-time registration fee!

### Pricing Recommendation
- **Recommended Model (Higher Conversion):** List **Free** base app on Microsoft Store with **$19.00 Lifetime Pro Upgrade** (via Stripe Checkout or offline key entry `OMNI-XXXX-...`), **OR** set a direct one-time Store price of **$19.00 USD**.
  - *Note:* If using Microsoft Store IAP add-on (`omnivibe_pro_lifetime`), verify via `POST https://omnivibe.app/api/store-verify` (`platform: "microsoft_store"`).

### Short Description (Max 250 characters)
Built in Show Low, AZ for folks whose room feels turned up to ten. Syncs 60fps visualizers and Philips Hue, Govee, or WiZ lights over local Wi-Fi with offline rain, thunder, and night train soundscapes. Pay once, own it. Zero cloud lag.

### Full Store Description
**When the lights, noise, and pace of the day feel turned up to ten, your room should work for you—not overstimulate you.**

I built OmniVibe Studio in Show Low, Arizona because I needed a straightforward atmosphere deck that actually runs offline without monthly subscriptions, mandatory accounts, or cloud lag. Too many smart lighting and ambient sound tools lock basic controls behind accounts and recurring fees. OmniVibe gives you control of what you pay for.

#### What It Does
- **Zero-Lag Local Light Sync:** Connects straight to Philips Hue Bridges, Govee LAN, and WiZ smart bulbs over your own home Wi-Fi (`192.168.*` / `10.*`)—no bouncing packets through distant servers.
- **100% Offline Soundscape Engine:** Procedurally synthesizes binaural rain, rolling thunder, fireplace crackle, brown noise, and night passenger train ambience right on your CPU via Web Audio API.
- **9 Real-Time Visualizers + Safety Guardrails:** 60fps WebGL shaders with built-in flash-rate caps, brightness limits, silence standby, and OLED burn-in protection.
- **Dual-Screen TV & Projector Stage:** Pop open a clean, zero-chrome Stage window (`/?stage=true`) on any second monitor or living-room TV.

No corporate fluff. Free core studio, optional $19 one-time lifetime Pro key that stays yours offline forever.

### Search Keywords (Max 7)
1. `music visualizer`
2. `philips hue sync`
3. `ambient soundscape`
4. `govee light sync`
5. `audio reactive`
6. `focus rain sounds`
7. `smart room lighting`

---

## 2. Generated Graphic Assets Included
- Desktop Screenshot (`1280x720`): `public/screenshots/studio-wide-1280x720.png`
- Store Tile (`300x300`): `store-packages/assets/microsoft-store-tile-300x300.png`
- Store App Icon (`512x512`): `store-packages/assets/store-icon-512x512.png`

---

## 3. Generate the `.msixbundle` Installer Package

### Option A: PWABuilder Hosted App Package (Recommended — 2 Minutes)
1. Deploy your latest `./dist` build to `https://omnivibe.app` so `manifest.webmanifest`, `/privacy.html`, `/terms.html`, and `/screenshots/*` are live.
2. Open [https://www.pwabuilder.com](https://www.pwabuilder.com) and enter `https://omnivibe.app`.
3. Choose **Package for Stores → Windows → Generate Package**.
4. Enter your Microsoft Partner Center **Package ID**, **Publisher ID**, and **Publisher Display Name** (matching `pwabuilder-windows.json`).
5. Download the generated `.msixbundle` + sideload test package, test locally, and upload `.msixbundle` in Microsoft Partner Center.

### Option B: Standalone Electron Windows Installer (`nsis` / `appx`)
```bash
cd C:\Users\justi\omnivibe
npm run build:win
```
Outputs the signed-ready Windows desktop installer inside `C:\Users\justi\omnivibe\release\`.
