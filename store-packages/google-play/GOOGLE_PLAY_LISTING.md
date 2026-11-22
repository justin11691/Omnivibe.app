# Google Play Store Submission Package — OmniVibe Studio (TWA + Play Billing)

This folder configures **OmniVibe Studio** (`app.omnivibe.studio`) as a **Google Play Trusted Web Activity (TWA)** with **Digital Goods API / Google Play Billing** integration, backed by `https://omnivibe.app/.well-known/assetlinks.json`.

---

## 1. Google Play Console Store Listing Fields

- **App Name (max 30 chars):** `OmniVibe Studio: Light Sync`
- **Package Name:** `app.omnivibe.studio`
- **Category:** `Music & Audio` (or `Lifestyle`)
- **Free or Paid:** **Free** with **In-App Product (`omnivibe_pro_lifetime` at `$19.00 USD` one-time)**
  - *Why Free + In-App Product?* On Google Play, Trusted Web Activity apps that offer Google Play Billing via the Digital Goods API (`omnivibe_pro_lifetime` -> `POST /api/store-verify`) give users an instant free trial of core soundscapes before upgrading to Lifetime Pro, maximizing install conversion. (Or list as Paid `$19.00` directly.)
- **Privacy Policy URL:** `https://omnivibe.app/privacy.html`
- **App Access:** Full functionality available without login or account creation.

### Short Description (Max 80 chars — exact count: 78)
Offline rain/train sounds & local Hue/Govee/WiZ sync. Own what you pay for.

### Full Description
**Dial down sensory overload when everything around you feels turned up to ten.**

Built out of Show Low, Arizona with zero corporate fluff, OmniVibe Studio turns your phone, tablet, TV, and room lights into an offline atmosphere deck that you actually control and own. No accounts required, no cloud servers sitting in the middle, and no monthly rental fees for your own light bulbs.

**WHAT YOU GET:**
• **100% Offline Soundscape Engine:** Layer procedurally generated rain, rolling thunder, cozy hearth embers, brown noise, and night passenger train ambience straight from your device—zero buffering or MP3 loops.
• **Local Wi-Fi Light Bridge:** Sync Philips Hue Bridges, Govee LAN, and WiZ bulbs directly over local Wi-Fi with zero cloud lag.
• **60fps Audio-Reactive Visualizers:** Nine real-time WebGL visualizers with built-in photosensitivity flash caps, max brightness limits, and Screen Wake Lock.
• **Pay Once, Own Forever:** Try the core deck free; unlock all 9 visualizers, multi-zone home sync, and TV Stage casting once for $19—complete with an offline key you keep.

### Data Safety Questionnaire Answers
- **Does your app collect or share any required user data types?** **No** *(All microphone FFT processing, soundscapes, and LAN bulb control remain strictly on-device. Checkout keys stored server-side are optional purchase entitlements under app functionality/fraud prevention.)*
- **Is all data encrypted in transit?** **Yes** (`HTTPS / TLS 1.3` enforced on `omnivibe.app`).

---

## 2. Generated Graphic Assets Included
- Phone Screenshot (`720x1280`): `public/screenshots/studio-mobile-720x1280.png`
- Tablet / Chromebook Screenshot (`1280x720`): `public/screenshots/studio-wide-1280x720.png`
- Feature Graphic (`1024x500`): `store-packages/assets/google-play-feature-graphic-1024x500.png`
- High-Res App Icon (`512x512`): `store-packages/assets/store-icon-512x512.png`

---

## 3. Build the Signed Android App Bundle (`.aab`)

### Step 1: Generate `.aab` using Bubblewrap TWA CLI (Recommended)
```bash
cd C:\Users\justi\omnivibe\store-packages\google-play
npx @bubblewrap/cli init --manifest https://omnivibe.app/manifest.webmanifest
npx @bubblewrap/cli build
```
*(Or use PWABuilder → Package for Stores → Android / Google Play with Digital Goods API enabled.)*

### Step 2: Update `.well-known/assetlinks.json` Fingerprint
1. Upload your `.aab` to a **Closed Testing** track in Google Play Console so Play App Signing generates your **SHA-256 certificate fingerprint**.
2. Copy the SHA-256 fingerprint into Cloudflare Pages environment variable `ANDROID_CERT_SHA256` (served dynamically by `public/_worker.js` at `https://omnivibe.app/.well-known/assetlinks.json`) AND update `public/.well-known/assetlinks.json`.
3. Verify `https://omnivibe.app/.well-known/assetlinks.json` returns HTTP `200 OK` with `application/json` and your fingerprint so the Chrome address bar hides cleanly inside your Android app!

### Step 3: Configure Play Console In-App Product
1. In Google Play Console → **Monetize → Products → In-app products → Create product**:
   - **Product ID:** `omnivibe_pro_lifetime`
   - **Price:** `$19.00 USD`
   - **Status:** `Active`
