/**
 * UI Tests with Playwright
 *
 * Tests the frontend UI functionality.
 */

import { test, expect } from '@playwright/test';

test.describe('CodeFlow Visualizer UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('loads the app', async ({ page }) => {
    // Check title
    await expect(page.locator('h1')).toContainText('CodeFlow Visualizer');
  });

  test('shows view tabs', async ({ page }) => {
    // Check all three tabs exist
    await expect(page.locator('.view-tab', { hasText: 'Recent' })).toBeVisible();
    await expect(page.locator('.view-tab', { hasText: 'Walkthrough' })).toBeVisible();
    await expect(page.locator('.view-tab', { hasText: 'Graph' })).toBeVisible();
  });

  test('switches between view modes', async ({ page }) => {
    // Click Recent tab
    await page.click('.view-tab:has-text("Recent")');
    await expect(page.locator('.recent-changes')).toBeVisible();

    // Click Walkthrough tab
    await page.click('.view-tab:has-text("Walkthrough")');
    await expect(page.locator('.call-tree-view')).toBeVisible();

    // Click Graph tab
    await page.click('.view-tab:has-text("Graph")');
    await expect(page.locator('.graph-container')).toBeVisible();
  });

  test('shows status bar', async ({ page }) => {
    await expect(page.locator('.status-bar')).toBeVisible();
  });

  test('shows keyboard hints', async ({ page }) => {
    await expect(page.locator('.keyboard-hints')).toBeVisible();
  });

  test('search bar exists', async ({ page }) => {
    await expect(page.locator('.search-bar input')).toBeVisible();
  });
});

test.describe('Graph View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('.view-tab:has-text("Graph")');
  });

  test('shows graph container', async ({ page }) => {
    await expect(page.locator('.graph-container')).toBeVisible();
  });

  test('shows zoom controls', async ({ page }) => {
    await expect(page.locator('.zoom-controls')).toBeVisible();
  });
});

test.describe('Walkthrough View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('.view-tab:has-text("Walkthrough")');
  });

  test('shows call tree view', async ({ page }) => {
    await expect(page.locator('.call-tree-view')).toBeVisible();
  });

  test('shows entry point selector', async ({ page }) => {
    await expect(page.locator('.entry-selector')).toBeVisible();
  });

  test('shows depth control', async ({ page }) => {
    await expect(page.locator('.depth-control')).toBeVisible();
  });
});

test.describe('Recent Changes View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.click('.view-tab:has-text("Recent")');
  });

  test('shows recent changes panel', async ({ page }) => {
    await expect(page.locator('.recent-changes')).toBeVisible();
  });
});

test.describe('Node Details Sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('shows empty state when no node selected', async ({ page }) => {
    await expect(page.locator('.node-details .empty-state')).toBeVisible();
  });
});
