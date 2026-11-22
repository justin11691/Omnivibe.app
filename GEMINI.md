# OmniVibe Studio (`omnivibe.app`) — Workspace Reference

## 1. Canonical Project Metadata
- **Canonical Workspace Path:** `D:\Projects\omnivibe`
- **Production URL:** [https://omnivibe.app](https://omnivibe.app) (also [https://www.omnivibe.app](https://www.omnivibe.app) via canonical 301)
- **Staging / Preview Pages:** [https://omnivibe.pages.dev](https://omnivibe.pages.dev)
- **Repository:** `D:\Projects\omnivibe` (Git origin tracking `main`)

## 2. Infrastructure & Hosting
- **Cloudflare Account ID:** `4de7e041697644b76bf8673b8e0c55c0` (`Justin121887@gmail.com's Account`)
- **Cloudflare Pages Project:** `omnivibe`
  - Edge Worker entrypoint: `public/_worker.js` (synced with `src/worker.js`)
  - Build command: `npm run build`
  - Output directory: `dist`
- **Cloudflare D1 SQLite Database:**
  - Database Name: `omnivibe-db`
  - Database ID: `c31a85f2-cba2-4e30-9c39-67cfeca29e36`
  - Active tables: `licenses`, `checkout_events` (defined in `schema.sql`)
- **Cloudflare Uptime Guardian Worker:**
  - Worker Name: `omnivibe-uptime-guardian` (`workers/uptime-guardian.js`)
  - Cron trigger: `*/5 * * * *` (Keeps site warm at edge, checks telemetry & security headers)
- **Database / Backend Notice:**
  - OmniVibe Studio uses Cloudflare D1 edge SQLite for license verification and Stripe checkout fulfillment. (Note: Supabase Postgres schemas like `profiles`, `properties`, `guidebook_sections`, `tv_screens` belong to companion projects, e.g. vacation rental guide systems).

## 3. Architecture & Tech Stack
- **Frontend Studio:** React 19 + TypeScript + Vite + Tailwind CSS
- **Visualizer Engine:** 60fps 3D WebGL Shaders (MilkDrop, Retro Winamp, Cyber Tunnel, 3D Lava Blobs, Liquid Waveforms, Monolith Matrix, etc.)
- **Soundscape Audio Engine:** Synthesized Generative Web Audio API (9 channels: binaural rain, rolling thunderstorms, sleeper train, hearth embers, brown noise, etc.)
- **Hardware Sync Architecture:**
  - **Local Companion Bridge:** Node.js WebSocket bridge (`bridge/server.mjs`) communicating with browser UI over `ws://127.0.0.1:4002`
  - **Philips Hue:** Entertainment API v2 over DTLS 1.2 / UDP port 2100
  - **Govee:** LAN UDP 4001–4003 with Razer 0xB1 frames & static IP fallback
  - **WiZ:** UDP port 38899 `setPilot` with exponential smoothing
- **Licensing & Monetization:**
  - Stripe Checkout ($19 Lifetime Pro) with automated frictionless post-checkout fulfillment
  - Replay-resistant constant-time HMAC webhook verification (`/api/stripe-webhook`)
  - Signed HTTP-Only cookie entitlement (`omnivibe_license`)
  - 100% offline deterministic license verification algorithm (`validateLicenseKey`)

## 4. Key Developer Commands
```bash
# Start local development server (Vite)
npm run dev

# Start local companion bridge service
npm run bridge

# Run Vitest test suite (59 unit & edge tests)
npm test

# Typecheck TypeScript codebase
npm run typecheck

# Build production bundle
npm run build

# Deploy to Cloudflare Pages
npm run deploy

# Deploy Uptime Guardian cron worker
npm run deploy:guardian
```
