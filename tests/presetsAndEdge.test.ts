import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import { DEFAULT_PRESETS } from '../src/data/defaultPresets';
import { validateLicenseKey, generateCustomerLicenseKey } from '../src/utils/licenseEngine';
import worker from '../src/worker';

function signStripeTestWebhook(payload: string, secret: string, tsSec = Math.floor(Date.now() / 1000)) {
  const sig = crypto.createHmac('sha256', secret).update(`${tsSec}.${payload}`).digest('hex');
  return `t=${tsSec},v1=0000000000000000000000000000000000000000000000000000000000000000,v1=${sig}`;
}

describe('OmniVibe Presets Mobile Optimization & Category Taxonomy', () => {
  it('ensures every preset tagline is strictly <= 40 characters to eliminate mobile truncation', () => {
    expect(DEFAULT_PRESETS.length).toBeGreaterThanOrEqual(15);

    DEFAULT_PRESETS.forEach((preset) => {
      const len = preset.tagline.length;
      expect(
        len,
        `Preset "${preset.name}" (${preset.id}) tagline length (${len}) must be <= 40 characters. Tagline: "${preset.tagline}"`
      ).toBeLessThanOrEqual(40);

      expect(
        len,
        `Preset "${preset.name}" (${preset.id}) tagline length (${len}) must be at least 35 characters for richness. Tagline: "${preset.tagline}"`
      ).toBeGreaterThanOrEqual(35);
    });
  });

  it('verifies all preset packs map strictly to functional mood categories', () => {
    const validCategories = new Set(['Focus', 'Chill', 'Party', 'Circadian']);
    DEFAULT_PRESETS.forEach((preset) => {
      expect(validCategories.has(preset.pack)).toBe(true);
    });
  });

  it('validates each preset has a high-contrast color palette', () => {
    DEFAULT_PRESETS.forEach((preset) => {
      expect(preset.colors.length).toBeGreaterThanOrEqual(3);
      preset.colors.forEach((color) => {
        expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
      });
    });
  });
});

describe('Cloudflare Worker Edge Security, CORS, CSP & Stripe Fulfillment', () => {
  it('performs 301 canonical redirect for www.omnivibe.app to https://omnivibe.app', async () => {
    const req = new Request('http://www.omnivibe.app/stage?demo=true', {
      headers: { 'cf-connecting-ip': '1.2.3.4' },
    });

    const res = await worker.fetch(req, {}, {} as any);
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://omnivibe.app/stage?demo=true');
  });

  it('handles /api/health with edge telemetry status and strict CSP/HSTS headers on HTML', async () => {
    const req = new Request('https://omnivibe.app/api/health', {
      headers: { 'cf-connecting-ip': '1.2.3.4' },
    });

    const res = await worker.fetch(req, {}, {} as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.service).toBe('omnivibe-edge');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');

    const mockAssets = {
      fetch: async () => new Response('<!DOCTYPE html><title>OMNIVIBE</title>', { status: 200 }),
    };
    const htmlRes = await worker.fetch(
      new Request('https://omnivibe.app/', { headers: { 'cf-connecting-ip': '1.2.3.4' } }),
      { ASSETS: mockAssets },
      {} as any
    );
    const csp = htmlRes.headers.get('Content-Security-Policy') || '';
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain('ws://127.0.0.1:47890');
    expect(htmlRes.headers.get('Strict-Transport-Security')).toContain('max-age=31536000');
  });

  it('rejects unauthorized third-party Origins with 403 and fails closed on unconfigured Stripe checkout', async () => {
    const crossOriginReq = new Request('https://omnivibe.app/api/create-checkout', {
      method: 'POST',
      headers: { 'cf-connecting-ip': '1.2.3.100', Origin: 'https://evil.example' },
    });
    const crossRes = await worker.fetch(crossOriginReq, { STRIPE_API_KEY: 'sk_test_123' } as any, {} as any);
    expect(crossRes.status).toBe(403);

    const noKeyReq = new Request('https://omnivibe.app/api/create-checkout', {
      method: 'POST',
      headers: { 'cf-connecting-ip': '1.2.3.101', Origin: 'https://omnivibe.app' },
    });
    const noKeyRes = await worker.fetch(noKeyReq, {}, {} as any);
    expect(noKeyRes.status).toBe(503);
  });

  it('validates real cryptographic & server-configured keys via /api/verify-license and rejects bogus keys', async () => {
    const validKey = generateCustomerLicenseKey('standard_4');
    const validReq = new Request('https://omnivibe.app/api/verify-license', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '1.2.3.4' },
      body: JSON.stringify({ licenseKey: validKey }),
    });
    const validRes = await worker.fetch(validReq, {}, {} as any);
    expect(validRes.status).toBe(200);
    const validData = await validRes.json();
    expect(validData.ok).toBe(true);
    expect(validData.valid).toBe(true);

    // Server-side FOUNDER_LICENSE_KEYS secret works, while old hardcoded keys fail
    const founderReq = new Request('https://omnivibe.app/api/verify-license', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '1.2.3.4' },
      body: JSON.stringify({ licenseKey: 'OMNI-SERVER-SECRET-2026' }),
    });
    const founderRes = await worker.fetch(
      founderReq,
      { FOUNDER_LICENSE_KEYS: 'OMNI-SERVER-SECRET-2026' } as any,
      {} as any
    );
    expect(founderRes.status).toBe(200);

    // Old hardcoded master key without server env returns 401
    const oldBypassReq = new Request('https://omnivibe.app/api/verify-license', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '1.2.3.4' },
      body: JSON.stringify({ licenseKey: 'OMNI-FOUNDER-2026-FOREVER' }),
    });
    const oldBypassRes = await worker.fetch(oldBypassReq, {}, {} as any);
    expect(oldBypassRes.status).toBe(401);

    // Bogus Key
    const bogusReq = new Request('https://omnivibe.app/api/verify-license', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '1.2.3.4' },
      body: JSON.stringify({ licenseKey: 'OMNI-FAKE-KEY-1234' }),
    });
    const bogusRes = await worker.fetch(bogusReq, {}, {} as any);
    expect(bogusRes.status).toBe(401);
  });

  it('enforces rate limiting on /api/* routes after excessive requests', async () => {
    const testIp = `192.0.2.${Math.floor(Math.random() * 200) + 10}`;
    for (let i = 0; i < 60; i++) {
      const res = await worker.fetch(
        new Request('https://omnivibe.app/api/health', { headers: { 'cf-connecting-ip': testIp } }),
        {},
        {} as any
      );
      expect(res.status).toBe(200);
    }

    const limitedRes = await worker.fetch(
      new Request('https://omnivibe.app/api/health', { headers: { 'cf-connecting-ip': testIp } }),
      {},
      {} as any
    );
    expect(limitedRes.status).toBe(429);
    expect(limitedRes.headers.get('Retry-After')).toBeDefined();
  });

  it('blocks malicious exploit scanner paths (/.env, /wp-admin) at the edge with 403 WAF protection', async () => {
    const envRes = await worker.fetch(new Request('https://omnivibe.app/.env'), {}, {} as any);
    expect(envRes.status).toBe(403);
    expect(envRes.headers.get('X-Edge-Protection')).toBe('omnivibe-waf-blocked');

    const wpRes = await worker.fetch(
      new Request('https://omnivibe.app/wp-admin/setup-config.php'),
      {},
      {} as any
    );
    expect(wpRes.status).toBe(403);
  });

  it('rejects disallowed HTTP methods (DELETE, PUT) with 405 Method Not Allowed', async () => {
    const delRes = await worker.fetch(
      new Request('https://omnivibe.app/api/health', { method: 'DELETE' }),
      {},
      {} as any
    );
    expect(delRes.status).toBe(405);
  });

  it('blocks forged non-cs_ checkout-status IDs (400) and fails closed when Stripe key missing (503)', async () => {
    const forgedReq = new Request('https://omnivibe.app/api/checkout-status?session_id=hack_free_license_123456', {
      headers: { 'cf-connecting-ip': '1.2.3.5' },
    });
    const forgedRes = await worker.fetch(forgedReq, {}, {} as any);
    expect(forgedRes.status).toBe(400);

    const noSecretReq = new Request('https://omnivibe.app/api/checkout-status?session_id=cs_test_a1b2c3d4e5f6g7', {
      headers: { 'cf-connecting-ip': '1.2.3.5' },
    });
    const noSecretRes = await worker.fetch(noSecretReq, {}, {} as any);
    expect(noSecretRes.status).toBe(503);
  });

  it('verifies paid Stripe cs_test_ session via /api/checkout-status, sets HttpOnly cookie, and degrades on KV 429', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          id: 'cs_test_verified_payment_2026',
          payment_status: 'paid',
          amount_total: 999,
          customer_details: { email: 'buyer@example.com', name: 'Test Buyer' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )) as typeof fetch;

    const mockKv = {
      get: async () => null,
      put: async () => {
        throw new Error('KV 429: Daily write quota exceeded');
      },
    };

    try {
      const req = new Request('https://omnivibe.app/api/checkout-status?session_id=cs_test_verified_payment_2026', {
        headers: { 'cf-connecting-ip': '1.2.3.8', Origin: 'https://omnivibe.app' },
      });
      const res = await worker.fetch(
        req,
        { STRIPE_API_KEY: 'sk_test_mock', LICENSES_KV: mockKv } as any,
        {} as any
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.paid).toBe(true);
      expect(data.licenseKey).toMatch(/^OMNI-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-F0-9]{4}$/);
      expect(validateLicenseKey(data.licenseKey).isValid).toBe(true);

      const setCookie = res.headers.get('Set-Cookie');
      expect(setCookie).toContain('omnivibe_license=');
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('Secure');
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://omnivibe.app');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('fails closed on unsigned Stripe webhooks, validates dual v1 signatures idempotently, and handles refunds', async () => {
    const payload = JSON.stringify({
      id: 'evt_test_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_webhook_999',
          payment_status: 'paid',
          amount_total: 999,
          customer_details: { email: 'customer@example.com', name: 'Jane Doe' },
        },
      },
    });

    // 1. Missing webhook secret -> 503
    const unconfiguredRes = await worker.fetch(
      new Request('https://omnivibe.app/api/stripe-webhook', {
        method: 'POST',
        body: payload,
      }),
      {},
      {} as any
    );
    expect(unconfiguredRes.status).toBe(503);

    // 2. Invalid signature -> 400
    const badSigRes = await worker.fetch(
      new Request('https://omnivibe.app/api/stripe-webhook', {
        method: 'POST',
        headers: { 'stripe-signature': `t=${Math.floor(Date.now() / 1000)},v1=badhex` },
        body: payload,
      }),
      { STRIPE_WEBHOOK_SECRET: 'whsec_test_secret_123' } as any,
      {} as any
    );
    expect(badSigRes.status).toBe(400);

    // 3. Valid dual-v1 rotated signature fulfills idempotently
    const secret = 'whsec_test_secret_123';
    const sigHeader = signStripeTestWebhook(payload, secret);
    const kvStore = new Map<string, string>();
    const mailCalls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      mailCalls.push(String(input));
      return new Response('{}', { status: 202 });
    }) as typeof fetch;

    const mockKv = {
      get: async (k: string) => kvStore.get(k) ?? null,
      put: async (k: string, v: string) => {
        kvStore.set(k, v);
      },
      delete: async (k: string) => {
        kvStore.delete(k);
      },
    };

    try {
      const firstRes = await worker.fetch(
        new Request('https://omnivibe.app/api/stripe-webhook', {
          method: 'POST',
          headers: { 'stripe-signature': sigHeader },
          body: payload,
        }),
        { STRIPE_WEBHOOK_SECRET: secret, LICENSES_KV: mockKv } as any,
        {} as any
      );
      expect(firstRes.status).toBe(200);
      const firstJson = await firstRes.json();
      expect(firstJson.received).toBe(true);
      expect(firstJson.duplicate).toBe(false);
      expect(mailCalls).toHaveLength(1);

      // Retry of same webhook event does not double-send MailChannels email
      const retryRes = await worker.fetch(
        new Request('https://omnivibe.app/api/stripe-webhook', {
          method: 'POST',
          headers: { 'stripe-signature': sigHeader },
          body: payload,
        }),
        { STRIPE_WEBHOOK_SECRET: secret, LICENSES_KV: mockKv } as any,
        {} as any
      );
      const retryJson = await retryRes.json();
      expect(retryJson.duplicate).toBe(true);
      expect(mailCalls).toHaveLength(1);

      // 4. charge.refunded revokes license from KV
      const refundPayload = JSON.stringify({
        id: 'evt_refund_1',
        type: 'charge.refunded',
        data: {
          object: {
            metadata: { checkout_session_id: 'cs_test_webhook_999' },
            billing_details: { email: 'customer@example.com' },
          },
        },
      });
      const refundSig = signStripeTestWebhook(refundPayload, secret);
      const refundRes = await worker.fetch(
        new Request('https://omnivibe.app/api/stripe-webhook', {
          method: 'POST',
          headers: { 'stripe-signature': refundSig },
          body: refundPayload,
        }),
        { STRIPE_WEBHOOK_SECRET: secret, LICENSES_KV: mockKv } as any,
        {} as any
      );
      expect(refundRes.status).toBe(200);
      expect(kvStore.has(`session:cs_test_webhook_999`)).toBe(false);
      expect(kvStore.has(firstJson.licenseKey)).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('disables unauthenticated /api/store-verify (501) and hides unconfigured assetlinks (404)', async () => {
    const storeRes = await worker.fetch(
      new Request('https://omnivibe.app/api/store-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'google_play', purchaseToken: 'arbitrary_fake_token' }),
      }),
      {},
      {} as any
    );
    expect(storeRes.status).toBe(501);

    const assetLinksRes = await worker.fetch(
      new Request('https://omnivibe.app/.well-known/assetlinks.json'),
      {},
      {} as any
    );
    expect(assetLinksRes.status).toBe(404);
  });

  it('serves /index.html via SPA fallback for /studio even on 404 or 403 asset responses', async () => {
    const mockAssets = {
      fetch: async (r: Request) => {
        const u = new URL(r.url);
        if (u.pathname === '/index.html') {
          return new Response('<!DOCTYPE html><title>OMNIVIBE</title>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          });
        }
        return new Response('Not Found', { status: 404 });
      },
    };
    const res = await worker.fetch(
      new Request('https://omnivibe.app/studio', { headers: { 'cf-connecting-ip': '1.2.3.6' } }),
      { ASSETS: mockAssets },
      {} as any
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('OMNIVIBE');
  });

  it('creates $9.99 Stripe Checkout sessions with STRIPE_API_KEY and redirects GET /api/checkout', async () => {
    const originalFetch = globalThis.fetch;
    const capturedCalls: Array<{ url: string; auth: string | null; body: string }> = [];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      capturedCalls.push({
        url: String(input),
        auth: headers.get('Authorization'),
        body: String(init?.body || ''),
      });
      return new Response(
        JSON.stringify({
          id: 'cs_test_123',
          url: 'https://checkout.stripe.com/c/pay/cs_test_123',
          amount_total: 999,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    try {
      const postRes = await worker.fetch(
        new Request('https://omnivibe.app/api/create-checkout', {
          method: 'POST',
          headers: { 'cf-connecting-ip': '1.2.3.10', Origin: 'https://omnivibe.app' },
        }),
        { STRIPE_API_KEY: 'sk_test_mock_key' } as any,
        {} as any
      );
      expect(postRes.status).toBe(200);
      const postJson = await postRes.json();
      expect(postJson.ok).toBe(true);
      expect(postJson.priceUsd).toBe(9.99);
      expect(postJson.amountTotal).toBe(999);

      const getRes = await worker.fetch(
        new Request('https://omnivibe.app/api/checkout', {
          method: 'GET',
          headers: { 'cf-connecting-ip': '1.2.3.11' },
        }),
        { STRIPE_API_KEY: 'sk_test_mock_key' } as any,
        {} as any
      );
      expect(getRes.status).toBe(303);
      expect(getRes.headers.get('location')).toBe('https://checkout.stripe.com/c/pay/cs_test_123');

      for (const call of capturedCalls) {
        const params = new URLSearchParams(call.body);
        expect(params.get('line_items[0][price_data][unit_amount]')).toBe('999');
        expect(params.get('line_items[0][quantity]')).toBe('1');
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
