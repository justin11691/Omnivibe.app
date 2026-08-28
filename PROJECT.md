# Project: Omnivibe

## Architecture
Omnivibe is a Cloudflare Pages application. It has a static frontend and a serverless API backend running on Cloudflare Pages Functions with a D1 database.

### Frontend
- `index.html`: Landing page with course generation search input.
- `error-decoder.html`: Diagnostic decoder tool for OBD2 / appliance codes.
- `app.js`: Client-side logic for authentication, course generation, rendering results, and checkout modal.
- `index.css`: Tailwind-inspired styling for the application.

### Backend (Functions)
- `/api/v1/auth/me`: Verifies active session token.
- `/api/v1/auth/register`: Hashes password, inserts user into database with 1 credit, creates session.
- `/api/v1/auth/login`: Verifies credentials, starts session.
- `/api/v1/auth/logout`: Clears session.
- `/api/v1/decode-error`: Takes errorCode and deviceContext, calls Gemini to get explanation and suggested search prompt.
- `/api/v1/generate-guide`: Validates credits/session, calls Gemini to generate guide JSON, constructs store links, saves to D1, deducts credit, returns final guide.
- `/api/v1/stripe-webhook`: Receives checkout events from Stripe, provisions credits, emails customer via MailChannels.

### Database (D1)
- `users`: ID, email, password_hash, credits.
- `sessions`: ID, user_id, token, expires_at.
- `saved_guides`: ID, user_id, prompt, content.

## Code Layout
- `/index.html` - Landing page UI
- `/error-decoder.html` - Free diagnostic decoder page UI
- `/app.js` - Client-side state and API client
- `/index.css` - Stylesheet
- `/schema.sql` - Database schema structure
- `/wrangler.toml` - Pages deployment configuration
- `/functions/api/v1/` - API route definitions
- `/functions/api/v1/auth/` - Authentication APIs

## Milestones
| # | Name | Scope | Dependencies | Status | Conversation ID |
|---|------|-------|-------------|--------|-----------------|
| 1 | E2E Test Suite | Build automated E2E tests and mock serverless env | None | IN_PROGRESS | b636f62d-5fa0-48f6-b928-ec2909ba2056 |
| 2 | Modern UI/UX Conversion | Redesign landing page with pricing, testimonials, FAQ, feature cards | M1 | IN_PROGRESS | 5ed9d46a-58fa-4a30-9b3d-4275b1ebc8fb |
| 3 | Advanced Parts Logic | Upgrade parts / tools suggestion with year/make/model and cheap/recommended labels | M1 | IN_PROGRESS | 483c7c39-7b50-404d-a4c4-5fc40f470f50 |
| 4 | Checkout & Paywall | Ensure Stripe webhook and paywall logic work, update credits and block runs | M1 | IN_PROGRESS | 0d1d335a-6b94-48da-9412-9a25dec6323f |
| 5 | Integration & Verification | Pass 100% of E2E tests (Tiers 1-4) | M2, M3, M4 | PLANNED | |
| 6 | Adversarial Hardening | Generate adversarial tests (Tier 5) and pass Forensic Audit | M5 | PLANNED | |

## Interface Contracts
### Client ↔ `/api/v1/generate-guide`
- **Request**: POST `application/json` with `{ prompt: string }`
- **Response (200)**: `application/json` with:
  ```json
  {
    "guide": {
      "title": "string",
      "difficulty": "Easy | Medium | Hard",
      "estimatedTime": "string",
      "tools": [{ "name": "string", "search_term": "string", "category": "string", "storeLinks": [...] }],
      "parts": [{ "name": "string", "search_term": "string", "category": "string", "storeLinks": [...] }],
      "steps": ["string"],
      "videos": [{ "title": "string", "channelName": "string", "videoId": "string", "thumbnail": "string" }],
      "youtubeSearchLinks": [{ "query": "string", "searchUrl": "string" }],
      "diagramBase64": "string | null",
      "diagramMime": "string",
      "betaMode": "boolean"
    },
    "creditsRemaining": 0
  }
  ```
- **Response (403)**: Out of credits
- **Response (401)**: Session expired

### Client ↔ `/api/v1/decode-error`
- **Request**: POST `application/json` with `{ errorCode: string, deviceContext?: string }`
- **Response (200)**: `application/json` with:
  ```json
  {
    "explanation": "string",
    "suggestedPrompt": "string"
  }
  ```
