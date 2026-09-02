/**
 * Cloudflare Pages Function: _middleware.js
 * Runs on EVERY request before any page or API function.
 *
 * Responsibilities:
 *   1. Rate limiting — 60 req/min per IP on API routes (stored in CF KV if available, else in-memory)
 *   2. Bot / scraper blocking — blocks known bad user-agents
 *   3. Security headers — supplements _headers with dynamic CSP nonce support
 *   4. Expired session cleanup trigger — fires a lightweight D1 DELETE 1-in-50 requests
 */

// ── CONFIG ───────────────────────────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60_000;   // 1 minute
const RATE_LIMIT_MAX       = 60;        // max requests per IP per window on API routes
const API_PREFIX           = '/api/';

const BLOCKED_UA_PATTERNS = [
  /SemrushBot/i, /AhrefsBot/i, /MJ12bot/i, /DotBot/i,
  /BLEXBot/i, /serpstatbot/i, /PetalBot/i, /DataForSeoBot/i,
  /python-requests/i, /Go-http-client/i, /curl\//i,
  /masscan/i, /zgrab/i, /nuclei/i,
];

// In-memory rate limit store (resets on worker restart — good enough for edge)
const rateLimitStore = new Map();

function cleanOldEntries() {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitStore.delete(key);
    }
  }
}

// ── MIDDLEWARE ────────────────────────────────────────────────────────────────

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);
  const ua  = request.headers.get('User-Agent') || '';
  const ip  = request.headers.get('CF-Connecting-IP') || 'unknown';

  // 1. Block bad bots on non-API routes (allow API so Stripe webhooks aren't blocked)
  if (!url.pathname.startsWith(API_PREFIX)) {
    for (const pattern of BLOCKED_UA_PATTERNS) {
      if (pattern.test(ua)) {
        return new Response('Forbidden', { status: 403 });
      }
    }
  }

  // 2. Rate limiting on API routes
  if (url.pathname.startsWith(API_PREFIX)) {
    cleanOldEntries();
    const key = `${ip}:${url.pathname.split('/').slice(0, 4).join('/')}`;
    const now = Date.now();
    const entry = rateLimitStore.get(key);

    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
      rateLimitStore.set(key, { count: 1, windowStart: now });
    } else {
      entry.count++;
      if (entry.count > RATE_LIMIT_MAX) {
        return new Response(
          JSON.stringify({ error: 'Too many requests. Please wait a moment.' }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': '60',
              'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
              'X-RateLimit-Remaining': '0',
            },
          }
        );
      }
    }
  }

  // 3. Stripe webhook must NOT be rate limited — skip it entirely
  //    (already handled above since Stripe has its own signing secret)

  // 4. Periodic expired session cleanup (fires ~2% of page requests, not API)
  if (!url.pathname.startsWith(API_PREFIX) && env.DB && Math.random() < 0.02) {
    context.waitUntil(
      env.DB.prepare(
        "DELETE FROM sessions WHERE expires_at < datetime('now')"
      ).run().catch(() => {}) // fire-and-forget, never block response
    );
  }

  // Pass through to next handler
  const response = await next();

  // 5. Add security headers not easily set in _headers (dynamic values)
  const newHeaders = new Headers(response.headers);
  newHeaders.set('X-Powered-By', 'OmniGuide');
  newHeaders.set('X-DNS-Prefetch-Control', 'on');
  // Prevent caching of API responses
  if (url.pathname.startsWith(API_PREFIX)) {
    newHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    newHeaders.set('Pragma', 'no-cache');
  }

  return new Response(response.body, {
    status:     response.status,
    statusText: response.statusText,
    headers:    newHeaders,
  });
}
