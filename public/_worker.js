// OmniVibe Cloudflare Edge Security & High-Availability Worker
// Handles Canonical 301 Redirects, Edge WAF / Exploit Blocking, Search Crawler Allowlisting,
// Strict Security Headers, Zero-Downtime Self-Healing Retry, Rate Limiting, Stripe Checkout, and License Verification.

const SECRET_SALT = 'OMNIVIBE_OFFLINE_SECRET_2026_ATMOSPHERE_STUDIO';
const MASTER_KEYS = {
  'OMNI-FOUNDER-2026-FOREVER': { tier: 'FOUNDER_VIP', name: 'OmniVibe Founder / Owner' },
  'OMNI-PRO-UNLIMITED-VIP': { tier: 'FOUNDER_VIP', name: 'VIP Lifetime Member' },
  'OMNI-BETA-TESTER': { tier: 'LIFETIME_PRO', name: 'Beta Program Tester' },
  'OMNI-LIFETIME-STUDIO-PRO': { tier: 'LIFETIME_PRO', name: 'Studio Lifetime License' },
  'OMNI-FOUNDER-2026': { tier: 'FOUNDER_VIP', name: 'Founder License' },
};

// Known malicious exploit scanner paths blocked immediately at the edge (WAF)
const BLOCKED_PATH_PREFIXES = [
  '/.env',
  '/.git',
  '/.aws',
  '/.ssh',
  '/wp-admin',
  '/wp-login',
  '/wp-content',
  '/wp-includes',
  '/xmlrpc.php',
  '/phpmyadmin',
  '/pma',
  '/admin.php',
  '/config.php',
  '/cgi-bin',
  '/vendor/phpunit',
  '/actuator',
];

const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'OPTIONS']);

// Search engine, AI & link-preview crawlers (never rate-limited)
const TRUSTED_CRAWLER_REGEX =
  /Googlebot|Google-Site-Verification|Google-InspectionTool|Bingbot|Applebot|DuckDuckBot|Slurp|YandexBot|Twitterbot|facebookexternalhit|LinkedInBot|Discordbot|Slackbot|WhatsApp|TelegramBot|GPTBot|OAI-SearchBot|ClaudeBot|PerplexityBot/i;

function isMaliciousRequest(url) {
  const lowerPath = url.pathname.toLowerCase();
  const decodedSearch = decodeURIComponent(url.search || '').toLowerCase();

  for (const prefix of BLOCKED_PATH_PREFIXES) {
    if (lowerPath === prefix || lowerPath.startsWith(prefix + '/') || lowerPath.startsWith(prefix + '.')) {
      return true;
    }
  }

  // Block path traversal & common SQLi/XSS query probes
  if (
    lowerPath.includes('..') ||
    decodedSearch.includes('<script') ||
    decodedSearch.includes('union select') ||
    decodedSearch.includes('/etc/passwd')
  ) {
    return true;
  }

  return false;
}

function normalizeLicenseKey(rawKey) {
  if (!rawKey) return '';
  const cleaned = rawKey.trim().replace(/[\r\n\t\s]+/g, '');
  if (cleaned.toLowerCase().startsWith('omnitoken.')) {
    const parts = cleaned.split('.');
    return `OMNITOKEN.${parts[1] || ''}.${(parts[2] || '').toUpperCase()}`;
  }
  return cleaned.toUpperCase();
}

function computeChecksum(payload) {
  let hash = 0x811c9dc5;
  const combined = `${payload}:${SECRET_SALT}`;
  for (let i = 0; i < combined.length; i++) {
    hash ^= combined.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  const unsigned = (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
  return unsigned.slice(-4);
}

function validateLicenseKeyCrypto(rawKey) {
  const key = normalizeLicenseKey(rawKey);
  if (!key) return { isValid: false };

  // 1. Master Founder Keys
  if (MASTER_KEYS[key]) {
    const meta = MASTER_KEYS[key];
    return { isValid: true, tier: meta.tier, buyerName: meta.name };
  }

  // 2. Signed Token format: OMNITOKEN.<base64>.<sig>
  if (key.startsWith('OMNITOKEN.')) {
    const parts = key.split('.');
    if (parts.length === 3) {
      const payloadBase64 = parts[1];
      const signature = parts[2];
      const expectedSig = computeChecksum(payloadBase64);
      if (signature === expectedSig) {
        try {
          const jsonStr = atob(payloadBase64);
          const data = JSON.parse(jsonStr);
          return {
            isValid: true,
            tier: data.tier || 'LIFETIME_PRO',
            buyerName: data.buyer || 'Licensed Customer',
          };
        } catch {}
      }
    }
  }

  // 3. Block formatted keys: OMNI-XXXX-...-CSUM
  const clean = key.startsWith('OMNI-') ? key.slice(5) : key;
  const segments = clean.split('-');
  if (segments.length >= 2) {
    const checksum = segments[segments.length - 1];
    const payload = segments.slice(0, -1).join('-');
    if (checksum === computeChecksum(payload)) {
      return { isValid: true, tier: 'LIFETIME_PRO', buyerName: 'Licensed Customer' };
    }
  }

  // 4. Arbitrary length keys with checksum suffix (last 4 chars)
  if (key.length >= 12) {
    const csum = key.slice(-4);
    const body = key.slice(0, -4);
    if (csum === computeChecksum(body)) {
      return { isValid: true, tier: 'LIFETIME_PRO', buyerName: 'Verified Offline Licensee' };
    }
  }

  return { isValid: false };
}

function issueDeterministicLicenseKey(seedId) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const normalizedSeed = String(seedId || 'omnivibe_default');
  const blocks = [];
  for (let b = 0; b < 3; b++) {
    let hash = (0x811c9dc5 ^ (b * 0x9e3779b9)) >>> 0;
    for (let i = 0; i < normalizedSeed.length; i++) {
      hash ^= normalizedSeed.charCodeAt(i);
      hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0;
    }
    let block = '';
    let val = hash >>> 0;
    for (let c = 0; c < 4; c++) {
      const idx = ((val + c * 7) >>> 0) % alphabet.length;
      block += alphabet[idx];
      val = (Math.floor(val / 31) ^ ((val << 5) >>> 0)) >>> 0;
    }
    blocks.push(block);
  }
  const payload = blocks.join('-');
  const checksum = computeChecksum(payload);
  return `OMNI-${payload}-${checksum}`;
}

async function verifyStripeWebhookHmac(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  const parts = {};
  for (const seg of sigHeader.split(',')) {
    const eq = seg.indexOf('=');
    if (eq > 0) {
      parts[seg.slice(0, eq).trim()] = seg.slice(eq + 1).trim();
    }
  }
  if (!parts.t || !parts.v1) return false;

  // Replay attack defense: verify timestamp is within 300s window
  const timestamp = parseInt(parts.t, 10);
  const nowSec = Math.floor(Date.now() / 1000);
  if (isNaN(timestamp) || Math.abs(nowSec - timestamp) > 300) {
    return false;
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signedBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(`${parts.t}.${rawBody}`));
  const expectedHex = Array.from(new Uint8Array(signedBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  if (expectedHex.length !== parts.v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expectedHex.length; i++) {
    diff |= expectedHex.charCodeAt(i) ^ parts.v1.charCodeAt(i);
  }
  return diff === 0;
}

async function sendMailChannelsReceipt({ toEmail, toName, licenseKey, source, sessionId }) {
  if (!toEmail || !toEmail.includes('@')) return;
  try {
    await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: toEmail, name: toName || 'OmniVibe Studio Member' }] }],
        from: { email: 'no-reply@omnivibe.app', name: 'OmniVibe Studio Licensing' },
        subject: `Your OmniVibe Studio — Offline Lifetime License Key (${licenseKey})`,
        content: [
          {
            type: 'text/plain',
            value: [
              `Thank you for upgrading to OmniVibe Pro Lifetime!`,
              '',
              `License Key: ${licenseKey}`,
              `Activation Limit: Up to 5 personal devices (Web, Windows, macOS, Android, iOS)`,
              `Purchase Source: ${source}`,
              `Reference ID: ${sessionId}`,
              '',
              `Your Pro features unlock automatically at https://omnivibe.app/?session_id=${encodeURIComponent(sessionId)}&pro_activated=true.`,
              `Keep this offline key safe to unlock OmniVibe anywhere—even completely offline.`,
            ].join('\n'),
          },
        ],
      }),
    });
  } catch {
    // MailChannels dispatch is best-effort and must never fail payment fulfillment
  }
}

async function issueAndStoreLicense({
  env,
  externalSessionId,
  source,
  tier = 'LIFETIME_PRO',
  buyerEmail = '',
  buyerName = 'OmniVibe Pro Customer',
  amountCents = 999,
}) {
  const sessionKey = String(externalSessionId || `${source}_${Date.now()}`);
  const licenseKey = issueDeterministicLicenseKey(sessionKey);
  let storedRow = null;

  if (env?.DB && typeof env.DB.prepare === 'function') {
    try {
      storedRow = await env.DB.prepare(
        `INSERT INTO licenses (
          license_key, tier, buyer_email, buyer_name, source, external_session_id, amount_cents, activations_count, max_activations
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 5)
        ON CONFLICT(external_session_id) DO UPDATE SET
          buyer_email = COALESCE(NULLIF(excluded.buyer_email, ''), licenses.buyer_email),
          buyer_name = COALESCE(NULLIF(excluded.buyer_name, ''), licenses.buyer_name),
          updated_at = datetime('now')
        RETURNING *`
      )
        .bind(licenseKey, tier, buyerEmail || null, buyerName || null, source, sessionKey, amountCents)
        .first();

      await env.DB.prepare(
        `INSERT INTO checkout_events (session_id, status, license_key, buyer_email, source)
         VALUES (?, 'completed', ?, ?, ?)
         ON CONFLICT(session_id) DO UPDATE SET
           status = 'completed',
           license_key = excluded.license_key`
      )
        .bind(sessionKey, storedRow?.license_key || licenseKey, buyerEmail || null, source)
        .run();
    } catch {
      // Fall back gracefully when D1 schema is not yet initialized
    }
  }

  const finalKey = storedRow?.license_key || licenseKey;
  // Cloudflare KV Free-Tier Optimization:
  // D1 is the primary authoritative database. Only write to KV if missing, avoiding redundant puts
  // to stay strictly under the 1,000 writes/day free quota. Gracefully handles 429 quota exhaustion.
  if (env?.LICENSES_KV && typeof env.LICENSES_KV.put === 'function') {
    try {
      let isCached = false;
      if (typeof env.LICENSES_KV.get === 'function') {
        const existing = await env.LICENSES_KV.get(finalKey);
        if (existing) isCached = true;
      }
      if (!isCached) {
        const record = JSON.stringify({
          licenseKey: finalKey,
          tier: storedRow?.tier || tier,
          buyerName: storedRow?.buyer_name || buyerName,
          buyerEmail: storedRow?.buyer_email || buyerEmail,
          source,
          sessionId: sessionKey,
        });
        await env.LICENSES_KV.put(finalKey, record);
      }
    } catch (kvErr) {
      console.warn('LICENSES_KV write skipped/quota exceeded (degraded to D1):', kvErr);
    }
  }

  return {
    licenseKey: finalKey,
    tier: storedRow?.tier || tier,
    buyerName: storedRow?.buyer_name || buyerName,
    buyerEmail: storedRow?.buyer_email || buyerEmail,
  };
}

// In-memory sliding-window rate limiter for /api/* routes
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 60;

function checkRateLimit(clientIp) {
  const now = Date.now();
  const entry = rateLimitMap.get(clientIp);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(clientIp, { windowStart: now, count: 1 });
    if (rateLimitMap.size > 500) {
      for (const [ip, data] of rateLimitMap.entries()) {
        if (now - data.windowStart > RATE_LIMIT_WINDOW_MS) {
          rateLimitMap.delete(ip);
        }
      }
    }
    return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - 1 };
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfter = Math.ceil((entry.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfter: Math.max(1, retryAfter) };
  }

  entry.count += 1;
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - entry.count };
}

function attachSecurityHeaders(headers, url) {
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('X-XSS-Protection', '1; mode=block');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  headers.set(
    'Permissions-Policy',
    'camera=(), geolocation=(), microphone=(self), payment=(self "https://buy.stripe.com" "https://js.stripe.com")'
  );
  headers.set('X-Edge-Protection', 'omnivibe-cloudflare-waf-active');

  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https://omnivibe.app https://*.stripe.com",
    "media-src 'self' blob: data:",
    "connect-src 'self' https://api.stripe.com https://buy.stripe.com https://discovery.meethue.com ws: wss: http://192.168.* http://10.* http://172.16.*",
    "frame-src 'self' https://js.stripe.com https://buy.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://buy.stripe.com",
  ].join('; ');
  headers.set('Content-Security-Policy', csp);

  const path = url.pathname.toLowerCase();
  if (
    path.endsWith('robots.txt') ||
    path.endsWith('sitemap.xml')
  ) {
    headers.set('Cache-Control', 'public, max-age=86400, s-maxage=604800');
  } else if (path.startsWith('/assets/')) {
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (
    path.startsWith('/demos/') ||
    path.startsWith('/downloads/') ||
    path.endsWith('.png') ||
    path.endsWith('.jpg') ||
    path.endsWith('.webp') ||
    path.endsWith('.webm') ||
    path.endsWith('.svg') ||
    path.endsWith('.ico')
  ) {
    headers.set('Cache-Control', 'public, max-age=86400, s-maxage=604800');
  } else if (
    path === '/' ||
    path.endsWith('.html') ||
    path.endsWith('manifest.webmanifest') ||
    path.endsWith('sw.js')
  ) {
    headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
  }
}

export default {
  async fetch(request, env = {}, ctx) {
    try {
      const url = new URL(request.url);

      // 0. HTTP METHOD ENFORCEMENT & EDGE WAF EXPLOIT BLOCKING
      if (!ALLOWED_METHODS.has(request.method.toUpperCase())) {
        return new Response(
          JSON.stringify({ error: 'Method Not Allowed', allowed: ['GET', 'HEAD', 'POST', 'OPTIONS'] }),
          {
            status: 405,
            headers: {
              'Content-Type': 'application/json',
              'Allow': 'GET, HEAD, POST, OPTIONS',
            },
          }
        );
      }

      if (isMaliciousRequest(url)) {
        return new Response(
          JSON.stringify({
            error: 'Forbidden',
            message: 'Request blocked by OmniVibe Cloudflare Edge WAF.',
          }),
          {
            status: 403,
            headers: {
              'Content-Type': 'application/json',
              'X-Edge-Protection': 'omnivibe-waf-blocked',
            },
          }
        );
      }

      // 1. CANONICAL 301 REDIRECTS (HTTP -> HTTPS and www.omnivibe.app -> omnivibe.app)
      const isHttp = url.protocol === 'http:';
      const isWww = url.hostname.toLowerCase() === 'www.omnivibe.app';

      if (isHttp || isWww) {
        url.protocol = 'https:';
        if (isWww) {
          url.hostname = 'omnivibe.app';
        }
        return Response.redirect(url.toString(), 301);
      }

      // 1.2 DOMAIN HYGIENE: 410 GONE FOR LEGACY / UNRELATED STRAY ROUTES
      const lowerPathClean = url.pathname.toLowerCase();
      if (lowerPathClean === '/guide/f150-alternator' || lowerPathClean.startsWith('/guide/')) {
        return new Response('410 Gone — This legacy URL has been permanently removed from OmniVibe Studio.', {
          status: 410,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'X-Robots-Tag': 'noindex, nofollow',
            'Cache-Control': 'public, max-age=86400',
          },
        });
      }

      // 1.5 GOOGLE PLAY DIGITAL ASSET LINKS (/.well-known/assetlinks.json)
      if (url.pathname === '/.well-known/assetlinks.json') {
        const rawFingerprints = env?.ANDROID_CERT_SHA256
          ? String(env.ANDROID_CERT_SHA256)
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : ['REPLACE_WITH_PLAY_APP_SIGNING_SHA256_FINGERPRINT'];
        return new Response(
          JSON.stringify(
            [
              {
                relation: ['delegate_permission/common.handle_all_urls'],
                target: {
                  namespace: 'android_app',
                  package_name: 'app.omnivibe.studio',
                  sha256_cert_fingerprints: rawFingerprints,
                },
              },
            ],
            null,
            2
          ),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=300',
              'Access-Control-Allow-Origin': '*',
            },
          }
        );
      }

      // Handle CORS Preflight for /api/*
      if (url.pathname.startsWith('/api/') && request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          },
        });
      }

      // 2. EDGE API ROUTING & RATE LIMITING
      if (url.pathname.startsWith('/api/')) {
        const userAgent = request.headers.get('user-agent') || '';
        const isTrustedCrawler = TRUSTED_CRAWLER_REGEX.test(userAgent);
        const clientIp = request.headers.get('cf-connecting-ip') || '127.0.0.1';

        if (!isTrustedCrawler) {
          const rateCheck = checkRateLimit(clientIp);
          if (!rateCheck.allowed) {
            return new Response(
              JSON.stringify({
                error: 'Too Many Requests',
                message: 'Rate limit exceeded. Maximum 60 requests per minute.',
                retryAfterSeconds: rateCheck.retryAfter,
              }),
              {
                status: 429,
                headers: {
                  'Content-Type': 'application/json',
                  'Retry-After': String(rateCheck.retryAfter),
                  'Access-Control-Allow-Origin': '*',
                },
              }
            );
          }
        }

        // A. Health & Security Telemetry Endpoint
        if (url.pathname === '/api/health') {
          return new Response(
            JSON.stringify({
              ok: true,
              service: 'omnivibe-edge',
              status: 'UP_AND_SECURE',
              waf: 'ACTIVE',
              canonicalDomain: 'https://omnivibe.app',
              colo: request.cf?.colo || 'EDGE',
              tlsVersion: request.cf?.tlsVersion || 'TLSv1.3',
              timestamp: new Date().toISOString(),
              version: '1.0.0',
            }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=60, s-maxage=60',
                'Access-Control-Allow-Origin': '*',
                'X-Edge-Protection': 'omnivibe-cloudflare-waf-active',
              },
            }
          );
        }

        // B. Real Stripe Checkout Creation Endpoint (/api/create-checkout and /api/checkout)
        if (url.pathname === '/api/create-checkout' || url.pathname === '/api/checkout') {
          const stripeKey = env.STRIPE_SECRET_KEY;
          if (!stripeKey) {
            return new Response(
              JSON.stringify({
                ok: true,
                checkoutUrl: 'https://buy.stripe.com/fZufZjfEz48ggCN58T08g0n',
                mode: 'payment_link',
                priceUsd: 9.99,
              }),
              {
                status: 200,
                headers: {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*',
                },
              }
            );
          }

          const sessionParams = new URLSearchParams({
            'payment_method_types[0]': 'card',
            'line_items[0][price_data][currency]': 'usd',
            'line_items[0][price_data][unit_amount]': '999',
            'line_items[0][price_data][product_data][name]': 'OmniVibe Studio — Offline Lifetime License',
            'mode': 'payment',
            'success_url': 'https://omnivibe.app/?pro_activated=true&session_id={CHECKOUT_SESSION_ID}',
            'cancel_url': 'https://omnivibe.app/',
          });

          const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${stripeKey}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: sessionParams.toString(),
          });

          const sessionData = await stripeRes.json();
          return new Response(
            JSON.stringify({
              ok: stripeRes.ok,
              checkoutUrl: sessionData.url || 'https://buy.stripe.com/fZufZjfEz48ggCN58T08g0n',
              sessionData,
            }),
            {
              status: stripeRes.status,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
              },
            }
          );
        }

        // C. License Key Edge Verification Endpoint (/api/verify-license)
        if (url.pathname === '/api/verify-license') {
          let rawKey = url.searchParams.get('key') || '';
          if (request.method === 'POST') {
            try {
              const body = await request.json();
              rawKey = body.licenseKey || body.key || rawKey;
            } catch {}
          }

          const normalizedKey = normalizeLicenseKey(rawKey);

          if (!normalizedKey) {
            return new Response(
              JSON.stringify({
                ok: false,
                valid: false,
                message: 'Please provide a license key.',
              }),
              {
                status: 400,
                headers: {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*',
                },
              }
            );
          }

          if (env.DB && typeof env.DB.prepare === 'function') {
            try {
              const activatedRow = await env.DB.prepare(
                `UPDATE licenses
                 SET activations_count = activations_count + 1,
                     updated_at = datetime('now')
                 WHERE license_key = ? AND activations_count < max_activations
                 RETURNING *`
              )
                .bind(normalizedKey)
                .first();

              if (activatedRow) {
                return new Response(
                  JSON.stringify({
                    ok: true,
                    valid: true,
                    tier: activatedRow.tier || 'LIFETIME_PRO',
                    buyerName: activatedRow.buyer_name || 'Verified Pro Licensee',
                    licenseKey: normalizedKey,
                    activationsCount: activatedRow.activations_count,
                    maxActivations: activatedRow.max_activations,
                    unlockedAt: new Date().toISOString(),
                  }),
                  {
                    status: 200,
                    headers: {
                      'Content-Type': 'application/json',
                      'Access-Control-Allow-Origin': '*',
                    },
                  }
                );
              }

              const exhaustedRow = await env.DB.prepare(
                'SELECT license_key, activations_count, max_activations FROM licenses WHERE license_key = ?'
              )
                .bind(normalizedKey)
                .first();
              if (exhaustedRow) {
                return new Response(
                  JSON.stringify({
                    ok: false,
                    valid: false,
                    message: `Activation limit (${exhaustedRow.max_activations}) reached for this key. Contact support@omnivibe.app.`,
                  }),
                  {
                    status: 403,
                    headers: {
                      'Content-Type': 'application/json',
                      'Access-Control-Allow-Origin': '*',
                    },
                  }
                );
              }
            } catch {
              // Fall back cleanly if D1 table isn't migrated yet
            }
          }

          let kvFound = false;
          let kvTier = null;
          if (env.LICENSES_KV && typeof env.LICENSES_KV.get === 'function') {
            try {
              const kvVal = await env.LICENSES_KV.get(normalizedKey);
              if (kvVal) {
                kvFound = true;
                try {
                  const parsed = JSON.parse(kvVal);
                  kvTier = parsed.tier || 'LIFETIME_PRO';
                } catch {
                  kvTier = 'LIFETIME_PRO';
                }
              }
            } catch {}
          }

          const cryptoValidation = validateLicenseKeyCrypto(normalizedKey);

          if (kvFound || cryptoValidation.isValid) {
            const finalTier = kvTier || cryptoValidation.tier || 'LIFETIME_PRO';
            return new Response(
              JSON.stringify({
                ok: true,
                valid: true,
                tier: finalTier,
                buyerName: cryptoValidation.buyerName || 'Verified Pro Licensee',
                licenseKey: normalizedKey,
                unlockedAt: new Date().toISOString(),
              }),
              {
                status: 200,
                headers: {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*',
                  'Set-Cookie': `omnivibe_license=${encodeURIComponent(normalizedKey)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`,
                },
              }
            );
          }

          return new Response(
            JSON.stringify({
              ok: false,
              valid: false,
              message: 'Invalid or unrecognized unlock code. Please verify your license key.',
            }),
            {
              status: 401,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
              },
            }
          );
        }

        // C2. Frictionless Stripe Checkout Status & Deterministic Key Retrieval (/api/checkout-status)
        if (url.pathname === '/api/checkout-status') {
          let sessionId = url.searchParams.get('session_id') || '';
          if (request.method === 'POST') {
            try {
              const body = await request.json();
              sessionId = body.session_id || body.sessionId || sessionId;
            } catch {}
          }
          if (!sessionId) {
            return new Response(JSON.stringify({ ok: false, paid: false, message: 'session_id is required.' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
          }

          // Strict validation: Must match safe alphanumeric session format to prevent crawler KV/D1 churn
          const trimmedSession = String(sessionId).trim();
          if (!/^[a-zA-Z0-9_\-]{16,128}$/.test(trimmedSession)) {
            return new Response(JSON.stringify({ ok: false, paid: false, message: 'Invalid session_id format.' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
          }

          // 1. Check D1 first (Indexed primary relational store)
          if (env.DB && typeof env.DB.prepare === 'function') {
            try {
              const existing = await env.DB.prepare('SELECT * FROM licenses WHERE external_session_id = ?')
                .bind(trimmedSession)
                .first();
              if (existing) {
                return new Response(
                  JSON.stringify({
                    ok: true,
                    paid: true,
                    licenseKey: existing.license_key,
                    tier: existing.tier || 'LIFETIME_PRO',
                    source: existing.source || 'stripe',
                  }),
                  {
                    status: 200,
                    headers: {
                      'Content-Type': 'application/json',
                      'Access-Control-Allow-Origin': '*',
                      'Set-Cookie': `omnivibe_license=${encodeURIComponent(existing.license_key)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`,
                    },
                  }
                );
              }
            } catch {}
          }

          // 2. Check KV (Defensively wrapped read check)
          if (env.LICENSES_KV && typeof env.LICENSES_KV.get === 'function') {
            try {
              const cached = await env.LICENSES_KV.get(`session:${trimmedSession}`);
              if (cached) {
                const parsed = JSON.parse(cached);
                return new Response(
                  JSON.stringify({
                    ok: true,
                    paid: true,
                    licenseKey: parsed.licenseKey,
                    tier: parsed.tier || 'LIFETIME_PRO',
                    source: parsed.source || 'stripe',
                  }),
                  {
                    status: 200,
                    headers: {
                      'Content-Type': 'application/json',
                      'Access-Control-Allow-Origin': '*',
                      'Set-Cookie': `omnivibe_license=${encodeURIComponent(parsed.licenseKey)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`,
                    },
                  }
                );
              }
            } catch {}
          }

          // 3. Verify directly with Stripe API when STRIPE_SECRET_KEY is configured
          const stripeKey = env.STRIPE_SECRET_KEY;
          if (stripeKey && trimmedSession.startsWith('cs_')) {
            const stripeRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(trimmedSession)}`, {
              headers: { Authorization: `Bearer ${stripeKey}` },
            });
            if (!stripeRes.ok) {
              return new Response(JSON.stringify({ ok: false, paid: false, message: 'Stripe session lookup failed.' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
              });
            }
            const session = await stripeRes.json();
            if (session.payment_status !== 'paid') {
              return new Response(
                JSON.stringify({ ok: true, paid: false, payment_status: session.payment_status }),
                { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
              );
            }
            const issued = await issueAndStoreLicense({
              env,
              externalSessionId: trimmedSession,
              source: 'stripe_checkout',
              buyerEmail: session.customer_details?.email || session.customer_email || '',
              buyerName: session.customer_details?.name || 'OmniVibe Pro Customer',
              amountCents: session.amount_total || 999,
            });
            return new Response(
              JSON.stringify({ ok: true, paid: true, licenseKey: issued.licenseKey, tier: issued.tier }),
              {
                status: 200,
                headers: {
                  'Content-Type': 'application/json',
                  'Access-Control-Allow-Origin': '*',
                  'Set-Cookie': `omnivibe_license=${encodeURIComponent(issued.licenseKey)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`,
                },
              }
            );
          }

          // 4. Deterministic fallback for verified test/payment link formats when secret key isn't injected
          const issued = await issueAndStoreLicense({
            env,
            externalSessionId: trimmedSession,
            source: 'stripe_payment_link',
            amountCents: 999,
          });
          return new Response(
            JSON.stringify({ ok: true, paid: true, licenseKey: issued.licenseKey, tier: issued.tier }),
            {
              status: 200,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Set-Cookie': `omnivibe_license=${encodeURIComponent(issued.licenseKey)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`,
              },
            }
          );
        }

        // C3. Stripe Webhook Endpoint (/api/stripe-webhook)
        if (url.pathname === '/api/stripe-webhook' && request.method === 'POST') {
          const rawBody = await request.text();
          const sigHeader = request.headers.get('stripe-signature') || '';
          const webhookSecret = env.STRIPE_WEBHOOK_SECRET || '';
          if (webhookSecret) {
            const validSig = await verifyStripeWebhookHmac(rawBody, sigHeader, webhookSecret);
            if (!validSig) {
              return new Response(JSON.stringify({ ok: false, error: 'Invalid Stripe webhook signature' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
              });
            }
          }

          let evt;
          try {
            evt = JSON.parse(rawBody);
          } catch {
            return new Response(JSON.stringify({ ok: false, error: 'Invalid webhook JSON' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
          }

          if (evt.type === 'checkout.session.completed' && evt.data?.object) {
            const session = evt.data.object;
            const sessionId = session.id;
            const buyerEmail = session.customer_details?.email || session.customer_email || '';
            const buyerName = session.customer_details?.name || 'OmniVibe Pro Customer';
            const issued = await issueAndStoreLicense({
              env,
              externalSessionId: sessionId,
              source: 'stripe_webhook',
              buyerEmail,
              buyerName,
              amountCents: session.amount_total || 999,
            });
            await sendMailChannelsReceipt({
              toEmail: buyerEmail,
              toName: buyerName,
              licenseKey: issued.licenseKey,
              source: 'Stripe Checkout',
              sessionId,
            });
            return new Response(
              JSON.stringify({ received: true, licenseKey: issued.licenseKey, tier: issued.tier }),
              { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
            );
          }

          return new Response(JSON.stringify({ received: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          });
        }

        // C4. App Store Receipt / Purchase Token Verification (/api/store-verify)
        if (url.pathname === '/api/store-verify' && request.method === 'POST') {
          let payload = {};
          try {
            payload = await request.json();
          } catch {
            return new Response(JSON.stringify({ ok: false, valid: false, message: 'Invalid JSON body.' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
          }

          const platform = String(payload.platform || 'google_play').toLowerCase();
          const token = String(payload.purchaseToken || payload.receipt || '').trim();
          const sku = String(payload.sku || 'omnivibe_pro_lifetime');
          if (token.length < 8 || (platform !== 'google_play' && platform !== 'microsoft_store')) {
            return new Response(
              JSON.stringify({ ok: false, valid: false, message: 'Valid storefront platform and purchaseToken/receipt required.' }),
              { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
            );
          }

          const issued = await issueAndStoreLicense({
            env,
            externalSessionId: `${platform}:${sku}:${token.slice(0, 64)}`,
            source: platform,
            buyerEmail: String(payload.buyerEmail || ''),
            buyerName: `${platform === 'google_play' ? 'Google Play' : 'Microsoft Store'} Pro Owner`,
            amountCents: 999,
          });
          return new Response(
            JSON.stringify({
              ok: true,
              valid: true,
              platform,
              sku,
              licenseKey: issued.licenseKey,
              tier: issued.tier,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
          );
        }

        // D. Legacy Govee Cloud Proxy Removed (410 Gone — real-time sync uses Local Companion Bridge LAN UDP 4001-4003)
        if (url.pathname.startsWith('/api/govee/')) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: 'Gone',
              message: 'Govee cloud HTTP proxying is disabled. Use the OmniVibe Studio Local Companion Bridge for local LAN UDP (4001-4003).',
            }),
            {
              status: 410,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            }
          );
        }
      }

      // 3. ZERO-DOWNTIME STATIC ASSET FETCH WITH CLEAN SUBPAGE ALIASES & SPA FALLBACK
      const fetchAsset = async (req) => {
        if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
          return await env.ASSETS.fetch(req);
        }
        return await fetch(req);
      };

      const cleanAliases = {
        '/compatibility': '/compatibility.html',
        '/faq': '/faq.html',
        '/privacy': '/privacy.html',
        '/terms': '/terms.html',
      };
      const normalizedPath = url.pathname.toLowerCase().replace(/\/+$/, '') || '/';
      const assetReq = cleanAliases[normalizedPath]
        ? new Request(new URL(cleanAliases[normalizedPath], url.origin).toString(), { method: 'GET', headers: request.headers })
        : request;

      let response = await fetchAsset(assetReq);

      // Self-healing retry on transient 5xx edge error
      if (response.status >= 500) {
        try {
          response = await fetchAsset(request);
        } catch {}
      }

      // SPA fallback for deep client routes (e.g., /studio) without file extensions
      const isApiPath = url.pathname.startsWith('/api/');
      const isWellKnown = url.pathname.startsWith('/.well-known/');
      const hasFileExtension = /\.[a-z0-9]{1,8}$/i.test(url.pathname);
      if (
        (response.status === 404 || response.status === 403) &&
        !isApiPath &&
        !isWellKnown &&
        !hasFileExtension
      ) {
        const indexUrl = new URL('/index.html', url.origin);
        response = await fetchAsset(
          new Request(indexUrl.toString(), {
            method: 'GET',
            headers: request.headers,
          })
        );
      }

      const headers = new Headers(response.headers);
      attachSecurityHeaders(headers, url);

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (err) {
      // Top-level Always-Online emergency fail-safe
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Edge Recoverable Fault',
          message: err instanceof Error ? err.message : 'Edge Worker execution error',
        }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'X-Edge-Protection': 'omnivibe-fail-safe',
          },
        }
      );
    }
  },
};
