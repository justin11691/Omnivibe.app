# Original User Request

## Initial Request — 2026-07-01T10:30:32-07:00

Build out the Omnivibe platform (www.omnivibe.app) into a fully polished, consumer-ready product that aligns with current DIY repair and auto parts shopping trends, optimizing the design, features, and flow to maximize customer conversion.

Working directory: c:/Users/justi/omnivibe
Integrity mode: development

## Requirements

### R1. Modern UI/UX Conversion Layout
Redesign and polish the landing page layout using current DIY e-commerce best practices (e.g. high-converting landing pages, clear pricing section, feature cards, FAQ, testimonials/trust signals, and interactive preview). Typography, spacing, micro-animations, and styling must feel extremely premium.

### R2. Advanced E-commerce Parts & Tools Logic
Improve parts and tools suggestions so they pull from highly-rated, budget-friendly sources (RockAuto, AutoZone, Amazon, NAPA, Harbor Freight, etc.). Ensure search parameters match parts accurately by year/make/model and label cheapest/recommended parts.

### R3. Checkout and Session Integrity
Ensure the payment and billing flow is seamless, the Stripe checkout modal/link is functional, credits are managed properly, and the paywall successfully guards premium guides.

## Acceptance Criteria

### E-commerce Conversion Flow
- [ ] Landing page contains distinct pricing section, trust signals (e.g. reviews or stats), and FAQ.
- [ ] The core generation tool has clear placeholders and examples.
- [ ] Users can browse the Free Error Decoder page seamlessly from the nav.

### Guide Quality & Store Links
- [ ] Generated guides contain detailed instructions (difficulty, est. time, video embeds, tools, parts).
- [ ] Parts and tools include clickable store buttons that point to cheap, highly-rated listings (RockAuto, AutoZone, Amazon, etc.).
- [ ] The paywall is active (credits are required for generation, except the first free run).

### Programmatic Verification
- [ ] The team must provide an automated E2E test script (e.g., in Node/Playwright) that verifies the key routes (`/`, `/error-decoder`, `/api/v1/generate-guide`, `/api/v1/decode-error`) load successfully without runtime exceptions.

## Follow-up — 2026-07-12T16:07:34Z

Omnivibe is a DIY repair guide web app. This phase focuses on finalizing any remaining product features and executing aggressive, autonomous marketing/growth strategies to drive traffic and reach a goal of $4k/month in revenue.

Working directory: c:/Users/justi/omnivibe

## Requirements

### R1. Autonomous Marketing Bots
Develop a suite of automated scripts (Python or Node) to execute the top strategies from `marketing_strategies.md`. This includes:
- A Reddit/Quora monitor that finds DIY repair questions and generates helpful answers linking back to Omnivibe.
- A "Piggyback" bot that finds DIY YouTube videos lacking parts lists and generates comments pointing to Omnivibe guides.
- All bots must include a "dry-run" or "safe mode" flag so they can be tested without actually posting live to prevent accidental spam during development.

### R2. Programmatic SEO Engine Expansion
Enhance the existing programmatic SEO system. The script should pull a list of the top 100 most searched appliance/auto repair queries, generate high-quality SEO landing pages for each using the Gemini API, and output them as static HTML files ready for deployment.

### R3. Automated Content Repurposing
Create a script that takes a completed repair guide from the Omnivibe database and automatically formats it into a Twitter thread and a Pinterest infographic layout (using HTML/CSS or an image generation library).

## Acceptance Criteria

### Automated Marketing Execution
- [ ] The repository contains a `scripts/marketing` folder with the bot scripts (Reddit, YouTube, SEO, etc.).
- [ ] A `README.md` is provided explaining how to run each bot and set up necessary API keys.
- [ ] Running the bots in `--dry-run` mode successfully logs the generated comments, emails, or posts to the console without runtime errors.
- [ ] The SEO script successfully generates 100 valid HTML files in an `seo-pages` output directory.
