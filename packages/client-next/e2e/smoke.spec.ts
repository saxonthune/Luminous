import { test, expect } from '@playwright/test'

test('viewer loads RTP canvas', async ({ page }) => {
  await page.goto('http://localhost:5200/')
  // ViewSwitcher renders a <select> with view options; 'Statechart' ships in rtpStatechartPack.
  await expect(page.locator('select')).toBeVisible()
  await expect(page.locator('select option', { hasText: 'Statechart' })).toBeAttached()
})
