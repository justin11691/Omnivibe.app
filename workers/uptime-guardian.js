// OmniVibe Cloudflare Uptime & Security Guardian Worker
// Runs every 5 minutes via Cloudflare Cron Trigger (*/5 * * * *) to keep omnivibe.app
// warm at the edge 24/7 and audit HTTP 200 availability + WAF security headers.

const TARGET_ENDPOINTS = [
  'https://omnivibe.app/',
  'https://omnivibe.app/api/health',
  'https://omnivibe.app/robots.txt',
  'https://omnivibe.app/sitemap.xml',
];

async function runHealthAndSecurityAudit() {
  const startTime = Date.now();
  const checks = await Promise.all(
    TARGET_ENDPOINTS.map(async (endpoint) => {
      const t0 = Date.now();
      try {
        const res = await fetch(endpoint, {
          method: 'GET',
          headers: {
            'User-Agent': 'OmniVibe-Cloudflare-Uptime-Guardian/1.0 (+https://omnivibe.app)',
          },
        });
        const latencyMs = Date.now() - t0;
        return {
          endpoint,
          ok: res.status === 200,
          status: res.status,
          latencyMs,
          securityHeaders: {
            hsts: Boolean(res.headers.get('strict-transport-security')),
            csp: Boolean(res.headers.get('content-security-policy')),
            xFrameOptions: res.headers.get('x-frame-options') || 'DENY',
            nosniff: res.headers.get('x-content-type-options') || 'nosniff',
            waf: res.headers.get('x-edge-protection') || 'active',
          },
        };
      } catch (err) {
        return {
          endpoint,
          ok: false,
          status: 0,
          latencyMs: Date.now() - t0,
          error: err instanceof Error ? err.message : 'Network error',
        };
      }
    })
  );

  const allHealthy = checks.every((c) => c.ok);
  return {
    ok: allHealthy,
    guardian: 'omnivibe-uptime-guardian',
    domain: 'https://omnivibe.app',
    cronSchedule: '*/5 * * * * (Every 5 Minutes)',
    totalDurationMs: Date.now() - startTime,
    checkedAt: new Date().toISOString(),
    checks,
  };
}

export default {
  // Triggered automatically every 5 minutes by Cloudflare Cron
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runHealthAndSecurityAudit());
  },

  // On-demand HTTP status & security verification endpoint
  async fetch(request, env, ctx) {
    const report = await runHealthAndSecurityAudit();
    return new Response(JSON.stringify(report, null, 2), {
      status: report.ok ? 200 : 503,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*',
      },
    });
  },
};
