import { test, expect } from '@playwright/test'

test('viewer loads RTP canvas via picker', async ({ page }) => {
  await page.goto('http://localhost:5200/')
  // Picker should appear with the "Canvases" heading
  await expect(page.locator('h1', { hasText: 'Canvases' })).toBeVisible()
  // Click the rtp-statechart entry
  await page.getByRole('button', { name: 'rtp-statechart' }).click()
  // ViewSwitcher renders a <select> with view options; 'Statechart' ships in rtpStatechartPack.
  await expect(page.locator('select')).toBeVisible()
  await expect(page.locator('select option', { hasText: 'Statechart' })).toBeAttached()
})
