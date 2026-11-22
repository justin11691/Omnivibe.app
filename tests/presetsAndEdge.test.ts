import { describe, it, expect } from 'vitest';
import { DEFAULT_PRESETS } from '../src/data/defaultPresets';
import { validateLicenseKey } from '../src/utils/licenseEngine';
import worker from '../src/worker';

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
      expect(
        validCategories.has(preset.pack),
        `Preset "${preset.name}" has invalid pack "${preset.pack}". Must be one of Focus, Chill, Party, Circadian.`
      ).toBe(true);
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

describe('Cloudflare Worker Edge Logic & License Endpoints', () => {
  it('performs 301 canonical redirect for www.omnivibe.app to https://omnivibe.app', async () => {
    const req = new Request('http://www.omnivibe.app/stage?demo=true', {
      headers: { 'cf-connecting-ip': '1.2.3.4' },
    });

    const res = await worker.fetch(req, {}, {} as any);
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('https://omnivibe.app/stage?demo=true');
  });

  it('handles /api/health with edge telemetry status', async () => {
    const req = new Request('https://omnivibe.app/api/health', {
      headers: { 'cf-connecting-ip': '1.2.3.4' },
    });

    const res = await worker.fetch(req, {}, {} as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.service).toBe('omnivibe-edge');
    expect(body.timestamp).toBeDefined();
  });

  it('handles /api/create-checkout and returns verified Stripe checkout url', async () => {
    const req = new Request('https://omnivibe.app/api/create-checkout', {
      method: 'POST',
      headers: { 'cf-connecting-ip': '1.2.3.4' },
    });

    const res = await worker.fetch(req, {}, {} as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.checkoutUrl).toBeDefined();
    expect(body.checkoutUrl).toContain('stripe.com');
  });

  it('validates real license keys via /api/verify-license and rejects bogus keys', async () => {
    // 1. Valid Master Founder Key
    const validReq = new Request('https://omnivibe.app/api/verify-license', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '1.2.3.4' },
      body: JSON.stringify({ licenseKey: 'OMNI-FOUNDER-2026-FOREVER' }),
    });
    const validRes = await worker.fetch(validReq, {}, {} as any);
    expect(validRes.status).toBe(200);
    const validData = await validRes.json();
    expect(validData.ok).toBe(true);
    expect(validData.valid).toBe(true);
    expect(validData.tier).toBe('FOUNDER_VIP');

    // 2. Bogus Key
    const bogusReq = new Request('https://omnivibe.app/api/verify-license', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '1.2.3.4' },
      body: JSON.stringify({ licenseKey: 'OMNI-FAKE-KEY-1234' }),
    });
    const bogusRes = await worker.fetch(bogusReq, {}, {} as any);
    expect(bogusRes.status).toBe(401);
    const bogusData = await bogusRes.json();
    expect(bogusData.valid).toBe(false);
  });

  it('enforces rate limiting on /api/* routes after excessive requests', async () => {
    const testIp = `192.0.2.${Math.floor(Math.random() * 200) + 10}`;

    // Send 60 requests (allowed)
    for (let i = 0; i < 60; i++) {
      const req = new Request('https://omnivibe.app/api/health', {
        headers: { 'cf-connecting-ip': testIp },
      });
      const res = await worker.fetch(req, {}, {} as any);
      expect(res.status).toBe(200);
    }

    // 61st request should be rate limited with 429
    const limitedReq = new Request('https://omnivibe.app/api/health', {
      headers: { 'cf-connecting-ip': testIp },
    });
    const limitedRes = await worker.fetch(limitedReq, {}, {} as any);
    expect(limitedRes.status).toBe(429);
    expect(limitedRes.headers.get('Retry-After')).toBeDefined();
  });

  it('blocks malicious exploit scanner paths (/.env, /wp-admin) at the edge with 403 WAF protection', async () => {
    const envProbe = new Request('https://omnivibe.app/.env');
    const envRes = await worker.fetch(envProbe, {}, {} as any);
    expect(envRes.status).toBe(403);
    expect(envRes.headers.get('X-Edge-Protection')).toBe('omnivibe-waf-blocked');

    const wpProbe = new Request('https://omnivibe.app/wp-admin/setup-config.php');
    const wpRes = await worker.fetch(wpProbe, {}, {} as any);
    expect(wpRes.status).toBe(403);
  });

  it('rejects disallowed HTTP methods (DELETE, PUT) with 405 Method Not Allowed', async () => {
    const delReq = new Request('https://omnivibe.app/api/health', { method: 'DELETE' });
    const delRes = await worker.fetch(delReq, {}, {} as any);
    expect(delRes.status).toBe(405);
  });

  it('issues valid deterministic offline license keys via /api/checkout-status', async () => {
    const req = new Request('https://omnivibe.app/api/checkout-status?session_id=test_live_verify_2026', {
      headers: { 'cf-connecting-ip': '1.2.3.5' },
    });
    const res = await worker.fetch(req, {}, {} as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.paid).toBe(true);
    expect(data.licenseKey).toMatch(/^OMNI-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-F0-9]{4}$/);
    expect(validateLicenseKey(data.licenseKey).isValid).toBe(true);
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
    const req = new Request('https://omnivibe.app/studio', {
      headers: { 'cf-connecting-ip': '1.2.3.6' },
    });
    const res = await worker.fetch(req, { ASSETS: mockAssets }, {} as any);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('OMNIVIBE');
  });

  it('rejects invalid or malformed checkout session_id formats with 400 to prevent KV churn', async () => {
    const invalidReq = new Request('https://omnivibe.app/api/checkout-status?session_id=bad!', {
      headers: { 'cf-connecting-ip': '1.2.3.7' },
    });
    const res = await worker.fetch(invalidReq, {}, {} as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it('sets secure HttpOnly omnivibe_license cookie on successful checkout and validation', async () => {
    const req = new Request('https://omnivibe.app/api/checkout-status?session_id=test_live_verify_2026', {
      headers: { 'cf-connecting-ip': '1.2.3.8' },
    });
    const res = await worker.fetch(req, {}, {} as any);
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('Set-Cookie');
    expect(setCookie).toBeDefined();
    expect(setCookie).toContain('omnivibe_license=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
  });

  it('gracefully degrades on KV quota exhaustion (429) without failing checkout', async () => {
    const mockKv = {
      get: async () => null,
      put: async () => {
        throw new Error('KV 429: Daily write quota of 1000 exceeded');
      },
    };
    const req = new Request('https://omnivibe.app/api/checkout-status?session_id=test_live_verify_quota_test', {
      headers: { 'cf-connecting-ip': '1.2.3.9' },
    });
    const res = await worker.fetch(req, { LICENSES_KV: mockKv } as any, {} as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.paid).toBe(true);
    expect(data.licenseKey).toBeDefined();
  });
});
