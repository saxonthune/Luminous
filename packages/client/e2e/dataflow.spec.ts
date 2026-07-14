import { test, expect } from '@playwright/test'

test('viewer loads a dataflow document via picker', async ({ page }) => {
  await page.goto('http://localhost:5200/?app=dataflow')
  await expect(page.locator('h1', { hasText: 'Dataflows' })).toBeVisible()
  await page.getByRole('button', { name: 'sample' }).click()
  await expect(page.getByText('Bracket w/ teams')).toBeVisible()
})

test('viewer renders group clusters as tinted underlays', async ({ page }) => {
  await page.goto('http://localhost:5200/?app=dataflow')
  await expect(page.locator('h1', { hasText: 'Dataflows' })).toBeVisible()
  await page.getByRole('button', { name: 'fifa-part-4' }).click()
  await expect(page.locator('[data-cluster-id]')).toHaveCount(2)
  await expect(page.getByText('Static Files')).toBeVisible()
})
