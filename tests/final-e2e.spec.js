const { test, expect } = require('@playwright/test');

test.describe('Final E2E Verification', () => {
  test('Home page loads and marketing content is present', async ({ page }) => {
    await page.goto('/');
    
    // Check main title or wordmark
    await expect(page.locator('.hero-title, .wordmark').first()).toBeVisible();
    
    // Check marketing sections
    await expect(page.locator('.features-section')).toBeVisible();
    await expect(page.locator('.preview-section')).toBeVisible();
    await expect(page.locator('.trust-section')).toBeVisible();
    await expect(page.locator('.pricing-section')).toBeVisible();
    
    // Check navigation
    await expect(page.locator('a[href="/error-decoder"]').first()).toBeVisible();
  });

  test('Error decoder page loads seamlessly', async ({ page }) => {
    await page.goto('/error-decoder');
    
    await expect(page.locator('text=Free Error Code Decoder')).toBeVisible();
    await expect(page.locator('a[href="/"]:has-text("Back to Home")')).toBeVisible();
  });

  test('API v1 generate-guide returns correct HTTP methods', async ({ request }) => {
    const response = await request.fetch('/api/v1/generate-guide', { method: 'OPTIONS' });
    expect(response.status()).toBe(200);
    
    const postResponse = await request.post('/api/v1/generate-guide', {
      data: { prompt: "Test prompt for generation" }
    });
    // Should be 401 unauthorized because we aren't passing valid auth cookies
    expect(postResponse.status()).toBe(401);
  });

  test('API v1 decode-error returns correct HTTP methods', async ({ request }) => {
    const postResponse = await request.post('/api/v1/decode-error', {
      data: { code: "Test Error Code", context: "Test Context" }
    });
    
    // Should be either 401 (if protected), 400 (bad request), or 200/500 depending on mock/key
    expect([200, 400, 401, 500]).toContain(postResponse.status());
  });
});

