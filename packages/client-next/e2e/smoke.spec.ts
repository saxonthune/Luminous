import { test, expect } from '@playwright/test'

test('viewer loads a canvas via picker', async ({ page }) => {
  await page.goto('http://localhost:5200/')
  // Picker should appear with the "Canvases" heading
  await expect(page.locator('h1', { hasText: 'Canvases' })).toBeVisible()
  // Click the sample-primitives entry
  await page.getByRole('button', { name: 'sample-primitives' }).click()
  // ViewSwitcher renders a toggle-group with one item per view. The
  // primitives pack ships an "Architecture" view; its presence proves the
  // pack resolved and the chrome rendered.
  await expect(
    page.locator('.cactus-chrome-toggle-item', { hasText: 'Architecture' }),
  ).toBeVisible()
})
