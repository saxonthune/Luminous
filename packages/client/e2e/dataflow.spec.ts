import { test, expect } from '@playwright/test'

test('viewer loads a dataflow document via picker', async ({ page }) => {
  await page.goto('/?app=dataflow')
  await expect(page.locator('h1', { hasText: 'Dataflows' })).toBeVisible()
  await page.getByRole('button', { name: 'sample' }).click()
  await expect(page.getByText('Bracket w/ teams')).toBeVisible()
})

test('viewer renders group clusters as tinted underlays', async ({ page }) => {
  await page.goto('/?app=dataflow')
  await expect(page.locator('h1', { hasText: 'Dataflows' })).toBeVisible()
  await page.getByRole('button', { name: 'fifa-part-4' }).click()
  await expect(page.locator('[data-cluster-id]')).toHaveCount(2)
  await expect(page.getByText('Static Files')).toBeVisible()
})

test('right-clicking a box opens its context menu', async ({ page }) => {
  await page.goto('/?app=dataflow')
  await page.getByRole('button', { name: 'sample' }).click()
  await page.locator('[data-container-id]').first().click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: 'Duplicate', exact: true })).toBeVisible()
})

test('right-clicking the background opens the Add Box menu', async ({ page }) => {
  await page.goto('/?app=dataflow')
  await page.getByRole('button', { name: 'sample' }).click()
  await expect(page.getByText('Bracket w/ teams')).toBeVisible()
  // Bottom-right corner of the viewport — far from any laid-out box.
  await page.mouse.click(page.viewportSize()!.width - 20, page.viewportSize()!.height - 20, { button: 'right' })
  await expect(page.getByRole('menuitem', { name: 'Add Box' })).toBeVisible()
})
