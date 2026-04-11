import { test, expect } from '@playwright/test'

test('app loads and shows document picker', async ({ page }) => {
  await page.goto('http://localhost:5200')
  await expect(page.locator('text=New canvas')).toBeVisible()
})
