import { test, expect } from '@playwright/test'

test('viewer loads RTP canvas via picker', async ({ page }) => {
  await page.goto('http://localhost:5200/')
  // Picker should appear with the "Canvases" heading
  await expect(page.locator('h1', { hasText: 'Canvases' })).toBeVisible()
  // Click the rtp-statechart entry
  await page.getByRole('button', { name: 'rtp-statechart' }).click()
  // ViewSwitcher renders a toggle-group with one item per view. Views come
  // from rtp-statechart.pack.json, loaded as a sibling of the graph file
  // (or the bundled builtin fallback). The 'Statechart' view proves the
  // pack resolved and the chrome rendered.
  await expect(
    page.locator('.cactus-chrome-toggle-item', { hasText: 'Statechart' }),
  ).toBeVisible()
})
