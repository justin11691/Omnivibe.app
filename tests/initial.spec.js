const { test, expect } = require('./helpers');

test.describe('Initial Test Suite', () => {
  test('should load the home page and have correct title and hero header', async ({ page }) => {
    // Navigate to the wrangler dev server
    await page.goto('/');

    // Check title
    await expect(page).toHaveTitle(/OmniGuide \| AI-Powered Repair & DIY Courses/);

    // Check hero heading
    const heading = page.locator('#hero-title');
    await expect(heading).toHaveText('Master any repair in minutes.');
  });

  test('should verify the mock-server is running and accessible', async ({ request }) => {
    // Perform a request directly to the mock-server port
    const response = await request.get('http://127.0.0.1:8789/healthcheck');
    expect(response.ok()).toBeTruthy();
    
    const body = await response.json();
    expect(body).toEqual({ status: 'ok' });
  });
});
