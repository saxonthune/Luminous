import { test, expect } from '@playwright/test'

// The e2e suite is deliberately small: boot smokes (existence proofs that the
// composed app renders — the floor for headless-agent verify gates) plus
// regression pins for defects no cheaper layer could have caught. Pins are
// earned by incident, never written speculatively. Tests run against the
// fixture workspace in e2e/fixtures/, never the live .canvases.

test('dataflow app boots: fixture document renders boxes and group envelopes', async ({ page }) => {
  await page.goto('/?app=dataflow')
  await expect(page.locator('h1', { hasText: 'Dataflows' })).toBeVisible()
  await page.getByRole('button', { name: 'grouped' }).click()
  // Existence invariants over the fixture: its boxes render as nodes and each
  // of its two groups projects to exactly one underlay envelope.
  await expect(page.locator('[data-container-id]').first()).toBeVisible()
  await expect(page.locator('[data-cluster-id]')).toHaveCount(2)
})

// Regression pin (2026-07-14): the submenu closed while the pointer crossed
// from its trigger into the panel — the SubContent was unportalled and the
// Sub had no overlap/gutter, leaving a dead gap. Only the composed
// browser+portal+pointer system can exhibit this.
test('submenu stays open while the pointer moves into it', async ({ page }) => {
  await page.goto('/?app=dataflow')
  await page.getByRole('button', { name: 'grouped' }).click()
  await page.locator('[data-container-id]').first().click({ button: 'right' })
  const trigger = page.getByRole('menuitem', { name: /Add to Group/ })
  await trigger.hover()
  const subItem = page.getByRole('menuitem', { name: 'New Group…' })
  await expect(subItem).toBeVisible()
  const from = (await trigger.boundingBox())!
  const to = (await subItem.boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 })
  await expect(subItem).toBeVisible()
})
