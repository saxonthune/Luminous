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

// Regression pin (2026-07-14): dragging a group label did nothing — the label
// lived in the underlay, painted beneath the node layer's full-canvas wrapper,
// so the pointer could never reach it and the drag dead-ended into a marquee.
// Unit tests rendered the underlay in isolation and passed; only the composed
// stacking order exhibits the defect.
test('dragging a group label moves every member box', async ({ page }) => {
  await page.goto('/?app=dataflow')
  await page.getByRole('button', { name: 'grouped' }).click()
  const standings = page.locator('[data-container-id="standings"]')
  await expect(standings).toBeVisible()
  // Let the initial fitView animation settle before measuring positions.
  await page.waitForTimeout(500)

  const teamList = page.locator('[data-container-id="team-list"]')
  const outsider = page.locator('[data-container-id="scorer"]')
  const standingsBefore = (await standings.boundingBox())!
  const teamListBefore = (await teamList.boundingBox())!
  const outsiderBefore = (await outsider.boundingBox())!

  const label = page.getByText('Static Files', { exact: true })
  const labelBox = (await label.boundingBox())!
  await page.mouse.move(labelBox.x + labelBox.width / 2, labelBox.y + labelBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(labelBox.x + labelBox.width / 2 + 80, labelBox.y + labelBox.height / 2 + 60, { steps: 8 })
  await page.mouse.up()

  // Node screen movement equals the mouse delta: the drag divides by the zoom
  // scale and rendering multiplies it back.
  const standingsAfter = (await standings.boundingBox())!
  const teamListAfter = (await teamList.boundingBox())!
  const outsiderAfter = (await outsider.boundingBox())!
  expect(standingsAfter.x - standingsBefore.x).toBeCloseTo(80, 0)
  expect(standingsAfter.y - standingsBefore.y).toBeCloseTo(60, 0)
  expect(teamListAfter.x - teamListBefore.x).toBeCloseTo(80, 0)
  expect(teamListAfter.y - teamListBefore.y).toBeCloseTo(60, 0)
  // A box outside the group stays put.
  expect(outsiderAfter.x).toBeCloseTo(outsiderBefore.x, 0)
  expect(outsiderAfter.y).toBeCloseTo(outsiderBefore.y, 0)
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
