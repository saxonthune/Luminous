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

test('escape cancels box editing without changes', async ({ page }) => {
  await page.goto('/?app=dataflow')
  await page.getByRole('button', { name: 'sample' }).click()
  await expect(page.getByText('Bracket w/ teams')).toBeVisible()
  const box = page.locator('[data-container-id]').first()
  const originalName = await box.locator('.text-sm').first().innerText()
  await box.dblclick()
  const descField = box.locator('textarea').first()
  await expect(descField).toBeVisible()
  await descField.fill('discarded text')
  await page.keyboard.press('Escape')
  await expect(descField).not.toBeVisible()
  await expect(box.getByText(originalName)).toBeVisible()
})

test('committing a box edit renders the description as markdown', async ({ page, request }) => {
  // The e2e server serves the checkout's real .canvases workspace — snapshot
  // the document and restore it so the suite never leaves the tree dirty.
  const original = await (await request.get('/api/document/sample.dataflow.json')).json()
  try {
    await page.goto('/?app=dataflow')
    await page.getByRole('button', { name: 'sample' }).click()
    await expect(page.getByText('Bracket w/ teams')).toBeVisible()
    const box = page.locator('[data-container-id]').first()
    await box.dblclick()
    const descField = box.locator('textarea').first()
    await expect(descField).toBeVisible()
    await descField.fill('now **bold** text')
    await page.keyboard.press('Control+Enter')
    await expect(box.locator('strong', { hasText: 'bold' })).toBeVisible()
  } finally {
    await request.post('/api/document/write', {
      data: { path: 'sample.dataflow.json', content: original },
    })
  }
})
