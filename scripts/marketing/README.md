# OmniGuide Marketing Automation & Programmatic SEO Tools

This directory contains autonomous marketing scripts, content repurposers, and scaled programmatic SEO tools. These scripts integrate with the Gemini API to automate outreach, create viral social assets, and build scalable organic landing pages.

## Directory Structure

```
scripts/marketing/
├── fixtures/
│   ├── mock-reddit-quora.json          # Mock data for Reddit/Quora posts
│   └── mock-youtube.json               # Mock data for YouTube videos & comments
├── README.md                           # Documentation (This file)
├── content-repurposer.js               # D1 database extractor to Twitter threads & Pinterest HTML pins
├── generate-seo-pages-scaled.js        # Scaled Programmatic SEO generator (100 landing pages)
├── reddit-quora-monitor.js             # Autonomous Reddit/Quora forum outreach bot
├── seo-topics.json                     # Curated list of top 100 high-volume repair queries
└── youtube-piggyback.js                # YouTube comment piggyback outreach bot
```

---

## Configuration & Credentials

All scripts load credentials dynamically from `.dev.vars` in the repository root or from system environment variables.

| Variable Name | Purpose | Required For | Storage Location | Notes / Format |
|---|---|---|---|---|
| `GEMINI_API_KEY` | Authenticates Gemini 3.5 Flash API calls | All scripts | `.dev.vars` / Env | Already set in local workspace |
| `YOUTUBE_API_KEY` | Reads public YouTube search/comments data | YouTube bot | `.dev.vars` / Env | Already set in local workspace |
| `REDDIT_CLIENT_ID` | OAuth Client ID for Reddit application | Reddit bot | `.dev.vars` / Env | Personal-use script type |
| `REDDIT_CLIENT_SECRET` | OAuth Client Secret for Reddit application | Reddit bot | `.dev.vars` / Env | |
| `REDDIT_USERNAME` | Reddit bot account username | Reddit bot | `.dev.vars` / Env | |
| `REDDIT_PASSWORD` | Reddit bot account password | Reddit bot | `.dev.vars` / Env | |
| `REDDIT_USER_AGENT` | Custom User-Agent header for Reddit API | Reddit bot | `.dev.vars` / Env | e.g. `Node:OmniGuideBot:v1.0.0` |
| `YOUTUBE_CLIENT_ID` | Google OAuth2 client ID for comment replies | YouTube bot | `.dev.vars` / Env | |
| `YOUTUBE_CLIENT_SECRET` | Google OAuth2 client secret for comment replies | YouTube bot | `.dev.vars` / Env | |
| `YOUTUBE_REFRESH_TOKEN`| Persistent OAuth refresh token | YouTube bot | `.dev.vars` / Env | |

---

## 1. Programmatic SEO Engine

Generates 100 static, high-performance landing pages for long-tail search queries under `seo-pages/`, registers them in the root `sitemap.xml`, and sets up Cloudflare rewrite rules in `_redirects`.

### How to Run

To generate all 100 SEO pages, run:
```bash
node scripts/marketing/generate-seo-pages-scaled.js
```

### Features
- **Progress Cache**: Writes completed page slugs to `seo-pages/progress.json`. Subsequent runs skip already-generated pages, enabling failure-recovery and cost-savings.
- **Throttling**: Delays requests by 4.5 seconds to stay strictly under the 15 RPM limit of the Gemini free tier.
- **Resilient Fallback**: If the Gemini API key is rate-limited or disabled, it falls back to a local high-quality template generator to ensure the 100 pages are generated successfully.

---

## 2. Reddit & Quora Monitor Bot

Monitors DIY repair subreddits and Quora questions, generates helpful troubleshooting answers using Gemini, and appends a natural Call-To-Action (CTA) link to OmniGuide.

### Commands

**Mock Mode (Dry-Run)**:
Logs generated answers to the console without writing to external APIs.
```bash
node scripts/marketing/reddit-quora-monitor.js --dry-run --json
```

**Mock Mode (Interactive Approval)**:
Displays a CLI menu allowing you to approve, skip, or regenerate responses before posting.
```bash
node scripts/marketing/reddit-quora-monitor.js
```

**Live Mode (Outreach)**:
Authenticates via Reddit OAuth and actively posts to target forums.
```bash
node scripts/marketing/reddit-quora-monitor.js --mode live
```

*Note: Live mode requires configured `REDDIT_*` credentials.*

---

## 3. YouTube Piggyback Bot

Scans popular DIY repair videos, filters for videos with high engagement (views > 5000) that do not include a parts list in their description, and posts helpful comments recommending OmniGuide.

### Commands

**Mock Mode (Dry-Run)**:
Analyzes the mock video database and prints the comments it would post.
```bash
node scripts/marketing/youtube-piggyback.js --dry-run --json
```

**Mock Mode (Auto-post mock)**:
Runs through the mock database simulating successful posts.
```bash
node scripts/marketing/youtube-piggyback.js
```

**Live Mode (Outreach)**:
Searches live YouTube and posts comments under your channel.
```bash
node scripts/marketing/youtube-piggyback.js --mode live
```

---

## 4. Content Repurposer

Reads a generated guide from the local D1 SQLite database, formats it into a Twitter thread (under the 280-character limit), and outputs a Pinterest-ready infographic HTML pin layout.

### Commands

Generate thread and pin for guide ID 1:
```bash
node scripts/marketing/content-repurposer.js --id 1
```

### Outputs
- **Twitter Thread**: Printed to stdout as structured, copy-pasteable tweets.
- **Pinterest Pin**: Generated as a beautifully formatted Tailwind HTML page at `scratch/pinterest_pin_<id>.html`.
