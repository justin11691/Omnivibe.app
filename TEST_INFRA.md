# E2E Test Infra: Omnivibe

## Test Philosophy
- Opaque-box, requirement-driven. Tests verify application behavior through the browser (Playwright) and API endpoints.
- In-memory/local SQLite database is set up and wiped before test suites.
- External API integrations (Gemini API, YouTube API, MailChannels, Stripe billing verification) are mockable/stubbed to avoid flaky tests or network dependencies.

## Feature Inventory
| # | Feature | Source (Requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|----------------------|:------:|:------:|:------:|
| 1 | Landing Page UI & Nav | ORIGINAL_REQUEST §R1 | 5      | 5      | ✓      |
| 2 | User Authentication   | ORIGINAL_REQUEST §R3 | 5      | 5      | ✓      |
| 3 | Error Code Decoder    | ORIGINAL_REQUEST §R1, R2 | 5  | 5      | ✓      |
| 4 | Guide Generation      | ORIGINAL_REQUEST §R2 | 5      | 5      | ✓      |
| 5 | Checkout & Credits    | ORIGINAL_REQUEST §R3 | 5      | 5      | ✓      |

## Test Architecture
- **Runner**: Playwright (Node.js framework)
- **Local Dev Server**: Wrangler Pages Dev server executing on port `8788`.
- **Database**: Local SQLite/D1 database loaded from `schema.sql` at start of tests.
- **Mocks**: 
  - Mock Gemini API endpoints using mock fetch/undici hooks or wrangler environment configuration.
  - Stripe webhook simulation using POST requests to `/api/v1/stripe-webhook`.

## Coverage Thresholds
- Tier 1 (Feature Coverage): ≥25 tests (5 per feature)
- Tier 2 (Boundary & Corner Cases): ≥25 tests (5 per feature)
- Tier 3 (Cross-Feature Combinations): ≥5 tests (covering major feature pairs)
- Tier 4 (Real-World Application Scenarios): ≥5 tests (complete end-to-end user workflows)

## Real-World Application Scenarios (Tier 4)
1. **Complete Auto Repair Workflow**: User decodes code OBD2 `P0171` on `2015 Honda Civic`, gets prompt, registers a new account, generates the guide, checks parts/tools, verifies cheapest/recommended labels, and links to RockAuto.
2. **First Run Free to Paid Paywall Transition**: User registers, gets 1 free generation, runs a query successfully, tries a second query and is blocked by paywall (buy credits modal is shown). User simulates Stripe purchase webhook for their email, credit count updates to 25, and user successfully runs the second query.
3. **Appliance Diagnostic & DIY Workflow**: User decodes washer error code `uL` on `Whirlpool Cabrio`, gets suggested prompt, logs in, generates guide, checks tools (Harbor Freight budget recommendation), and checks step-by-step instructions.
4. **Invalid Inputs & Recovery**: User registers, tries empty prompts, short prompts (<5 chars), gets clear user-facing error messages, successfully submits a valid prompt, but database fails or API service fails. Page shows clean retry state without crashing.
5. **Session Expiry & Re-Auth Flow**: User is generating a guide, session expires mid-process (token deleted/invalidated), page prompts user with Sign In modal, user signs in, prompt is preserved and user can immediately generate without losing work.
