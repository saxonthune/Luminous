import { test, expect } from '@playwright/test'

// The e2e suite is deliberately small: boot smokes (existence proofs that the
// composed app renders — the floor for headless-agent verify gates) plus
// regression pins for defects no cheaper layer could have caught. Pins are
// earned by incident, never written speculatively. Tests run against the
// fixture workspace in e2e/fixtures/, never the live .canvases.

test('atlas app boots: fixture document renders nodes', async ({ page }) => {
  await page.goto('/?app=atlas')
  await expect(page.locator('h1', { hasText: 'Atlases' })).toBeVisible()
  await page.getByRole('button', { name: 'sample' }).click()
  await expect(page.locator('[data-container-id]').first()).toBeVisible()
})
