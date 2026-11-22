# OmniVibe — Atmosphere & Visual Mood Studio

A bespoke, production-grade Progressive Web App (PWA) built with **React 19, Vite, TypeScript, and Tailwind CSS** running at the edge on **Cloudflare Pages** (`omnivibe.app`).

OmniVibe is an interactive Smart Atmosphere & Visual Mood Studio designed to control the look, sound, and energy of a physical space from one tactile control deck—turning any screen, sound system, and smart lighting setup into a cohesive, synchronized ambient engine.

---

## Architecture Highlights

- **100% Client-Side Engine:** Runs entirely within the browser at 60 FPS using HTML5 Canvas, WebGL shaders, and the Web Audio API. Zero external runtime server dependencies.
- **Progressive Web App (PWA):** Installs natively on Android, Windows, macOS, iPadOS, and iOS with 1 tap via the browser's `beforeinstallprompt` and Add to Home Screen flow.
- **Edge Layer & Security:** Cloudflare Pages Functions edge worker (`public/_worker.js`) enforcing canonical 301 redirects (`www.omnivibe.app` → `https://omnivibe.app`), strict HSTS/CSP security headers, and an edge health endpoint (`/api/health`).
- **24/7 Edge Uptime Guardian:** Standalone Cloudflare Cron Worker (`workers/uptime-guardian.js`) monitoring availability and headers every 5 minutes (`*/5 * * * *`).
- **Smart-Home Light Sync:** Direct, zero-latency local Wi-Fi control for **Philips Hue**, **Govee LAN**, and **WiZ Smart Bulbs** alongside an interactive 2.5D virtual room simulator.

---

## Monetization Architecture (Freemium + Lifetime Pro)

OmniVibe features a frictionless **Freemium + One-Time Lifetime Pro ($19)** licensing model:

| Capability | Free Starter Deck ($0) | OmniVibe Pro (Lifetime — $19 Launch) |
|---|---|---|
| **Core Vibe Presets** | 4 Presets (*Focus*, *Lounge*, *Solar*, *Bass*) | All 15+ Curated Packs (*Cyberpunk*, *Cabin*, *Aurora*, etc.) + Unlimited Custom |
| **Generative Soundscapes** | Synthesized Rain, Fire, Brown Noise, Train | Full procedural soundscape engine with live multi-channel mixing |
| **Audio Input Sync** | Room Mic & System / Spotify Audio | Room Mic, Local Audio Drag-and-Drop, System / Tab Audio |
| **3D Visualizer Modes** | 2 Modes (*Liquid Waveforms*, *3D Spectrum Bars*) | All 9 Shaders (+ *Particle Constellation*, *Harmonic Nebula*, *Lava Blobs*, *Winamp*) |
| **Studio Drawer & Palettes** | Preview Mode | Full Multi-Stop Palette Editor, Frequency Weights & Song Rules |
| **Second-Screen / TV Stage** | — | `BroadcastChannel` Zero-Chrome TV Stage Sync (`/?stage=true`) |
| **Smart-Home Light Sync** | Interactive 2.5D Virtual Room Preview | Physical LAN Sync (Philips Hue, Govee LAN, WiZ Smart Bulbs) |
| **Circadian & Safety** | Photosensitivity Limiter & Bedtime Damping | Full Circadian Solar Morpher, Quiet Hours, & Safety Guardrails |
| **App Skins** | Default `Obsidian Studio` | All Skins (`Warm Amber Analog`, `Cool Slate`, `Clean Daylight`) |

### Stripe Checkout & Offline Auto-Activation
- **Stripe Payment Link:** Configurable `STRIPE_PAYMENT_LINK_URL` opens Stripe Checkout for the $19 lifetime license.
- **Frictionless Post-Checkout Auto-Unlock:** Returning from Stripe with `?pro_activated=true` or `?session_id=...` automatically activates Pro status in `localStorage`, cleans the URL, and displays a celebratory toast.
- **Offline Cryptographic Validation:** Validates standard formatted keys (`OMNI-XXXX-XXXX-XXXX-CSUM`) and built-in evaluation key **`OMNI-FOUNDER-2026`** offline with zero third-party licensing server calls.
- **Owner Key Generator:** Accessible via <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd> (PIN `2026`) or `/?admin=keygen` to generate batch keys.

---

## Core Technical Engine

### 1. Central Control Deck ("Vibe Canvas")
- **Tactile Analog Audio Aesthetic:** Milled aluminum rotary knobs, fader tracks, 3-band segmented LED VU meters, and responsive micro-interactions.
- **Quick Room Zone Selector:** Instant multi-select and individual room switching (*Living Room*, *Studio Desk*, *Bedroom*, *Whole Home*).
- **Live Frequency Telemetry & Light Flux Meter:** Sub-bass (20–250Hz), Mids (250Hz–4kHz), and Treble (4kHz–16kHz) telemetry alongside simulated room lumen flux.

### 2. Multi-Source Audio Engine & Real-Time FFT Analyzer
- **Real-Time FFT Frequency Analysis:** AnalyserNode (1024 FFT size, 60 FPS) separating sub-bass, mids, and treble with user-adjustable frequency weight sliders.
- **Synthesized Generative Soundscapes (Zero Audio Files Needed!):**
  - **Rain:** Bandpass-filtered white noise with random modulation.
  - **Hearth Fire:** Filtered brown noise bed + stochastic wood snap & crackle impulse bursts.
  - **Brown Noise:** 1/f Brownian noise generator.
  - **Passenger Train:** Rhythmically modulated low-frequency track clatter.
  - **Deep Analog Drone:** Dual detuned oscillators through a resonant low-pass filter modulated by an LFO.
- **Universal Room & System Audio Capture:**
  - *"Room Mic":* Syncs lighting and visualizers to room audio / vinyl / instruments via `getUserMedia`.
  - *"System/Tab Audio":* Captures Spotify, Apple Music, YouTube, or game audio directly via `getDisplayMedia`.

### 3. Big-Screen Visualizer & Second-Screen Stage
- **Dedicated 60 FPS Canvas / WebGL Visualizers:**
  1. *Liquid Waveforms:* Flowing additive sine ribbons modulated by frequency FFT amplitude.
  2. *3D Equalizer Spectrum:* Isometric perspective bars with peak drop physics and dark floor grid reflection.
  3. *Geometric Particle Field:* Central pulsing harmonic core with orbiting constellation particles.
  4. *Harmonic Nebula:* Volumetric billowing space clouds and orbital chromatic blooms.
  5. *Additional Shaders:* Retro Winamp MilkDrop, Cyberpunk Tunnel, Lava Blobs, Monolith Matrix.
- **Second-Screen Stage Sync:**
  - *"Launch Stage":* Opens a standalone zero-chrome stage window (`/?stage=true`) on a TV or second monitor.
  - Synchronizes preset colors, visualizer mode, shader settings, and audio telemetry in real time via `BroadcastChannel('omnivibe-stage-channel')`.
- **OLED Burn-In Protection:** Periodic pixel shifting + automatic dim/screensaver standby after 5 minutes of audio silence.

---

## Development, Testing & Deployment

```bash
# Install dependencies
npm install

# Run TypeScript static analysis (0 errors)
npm run typecheck

# Run Vitest test suite (48 tests across 6 test suites)
npm test

# Build production bundle
npm run build

# Deploy to Cloudflare Pages (Production)
npx wrangler pages deploy dist --project-name omnivibe --branch main

# Deploy Cloudflare Uptime Guardian Worker
npx wrangler deploy --config wrangler.worker.toml
```
