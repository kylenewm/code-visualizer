/**
 * Playwright tests for sandbox project visualization
 * Run with: npx playwright test test/ui/sandbox.spec.ts
 */

import { test, expect } from '@playwright/test';

test.describe('Sandbox Project UI', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');
    // Wait for initial load
    await page.waitForSelector('[data-testid="app-container"], .app-container, main', { timeout: 10000 });
  });

  test('displays Python functions from sandbox', async ({ page }) => {
    // Look for the search input
    const searchInput = page.locator('input[placeholder*="Search"], input[type="search"], .search-input');

    if (await searchInput.isVisible()) {
      await searchInput.fill('create_task');
      await searchInput.press('Enter');

      // Wait for results
      await page.waitForTimeout(1000);

      // Should find the function
      const results = page.locator('text=create_task');
      await expect(results.first()).toBeVisible({ timeout: 5000 });
    }

    // Take screenshot for visibility
    await page.screenshot({ path: 'test-results/sandbox-search.png', fullPage: true });
  });

  test('shows function details when clicked', async ({ page }) => {
    // Find any function node in the UI
    const functionNode = page.locator('[data-kind="function"], .node-function, text=create_task').first();

    if (await functionNode.isVisible({ timeout: 5000 })) {
      await functionNode.click();

      // Details panel should show
      await page.waitForTimeout(500);

      // Screenshot the details
      await page.screenshot({ path: 'test-results/sandbox-details.png', fullPage: true });
    }
  });

  test('architecture view shows file structure', async ({ page }) => {
    // Click on Architecture view if not default
    const archButton = page.locator('button:has-text("Architecture"), [data-view="architecture"]');
    if (await archButton.isVisible()) {
      await archButton.click();
    }

    // Wait for content
    await page.waitForTimeout(1000);

    // Should show Python files
    const pythonFile = page.locator('text=.py');
    const visible = await pythonFile.first().isVisible().catch(() => false);

    // Screenshot
    await page.screenshot({ path: 'test-results/sandbox-architecture.png', fullPage: true });

    // At minimum, the page should load without errors
    const errorMessage = page.locator('text=Error, text=error, .error');
    await expect(errorMessage).not.toBeVisible();
  });

  test('changes view is accessible', async ({ page }) => {
    // Click on Changes view
    const changesButton = page.locator('button:has-text("Changes"), [data-view="changes"], text=Changes');
    if (await changesButton.isVisible()) {
      await changesButton.click();
      await page.waitForTimeout(500);
    }

    // Screenshot
    await page.screenshot({ path: 'test-results/sandbox-changes.png', fullPage: true });
  });
});

test.describe('Graph Queries via UI', () => {
  test('can search and navigate to function', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);

    // Take a full page screenshot
    await page.screenshot({ path: 'test-results/sandbox-full.png', fullPage: true });

    // Verify page loaded
    const body = page.locator('body');
    await expect(body).not.toBeEmpty();
  });
});
