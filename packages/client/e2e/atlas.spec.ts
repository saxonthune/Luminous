import { test, expect } from '@playwright/test'

// The e2e suite is deliberately small: boot smokes (existence proofs that the
// composed app renders — the floor for headless-agent verify gates) plus
// regression pins for defects no cheaper layer could have caught. Pins are
// earned by incident, never written speculatively. Tests run against the
// fixture workspace in e2e/fixtures/, never the live .luminous.

test('atlas app boots: fixture document renders nodes', async ({ page }) => {
  await page.goto('/?app=atlas')
  await expect(page.locator('h1', { hasText: 'Atlases' })).toBeVisible()
  await page.getByRole('button', { name: 'sample' }).click()
  await expect(page.locator('[data-container-id]').first()).toBeVisible()
})

test('atlas draws a containment route without deriving a second semantic edge', async ({ page }) => {
  await page.goto('/?app=atlas')
  await page.getByRole('button', { name: 'sample' }).click()

  // The fixture has one authored Edge. Its crossing is split only in the
  // rendered route: every hit segment still names that single semantic edge.
  const routeBand = page.locator('[data-cactus-edge-route-band]')
  await expect(routeBand.first()).toBeVisible()
  const segments = page.locator('line[data-edge-id]')
  await expect(segments.first()).toBeVisible()
  expect(await segments.evaluateAll((els) => new Set(els.map((el) => el.getAttribute('data-edge-id'))).size)).toBe(1)
})
