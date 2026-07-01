import { test, expect } from '@playwright/test'
import { captureConsole, seedAuth } from './_helpers'

test.describe('Skills Marketplace + Admin', () => {
  test('/skills shows category pills and filters studios', async ({ page }, info) => {
    const errors = captureConsole(page)
    await seedAuth(page)
    await page.goto('/skills', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    await page.screenshot({ path: 'e2e-results/03-skills.png', fullPage: true })
    const pills = page.locator('button').filter({ hasText: /^[A-Z][a-zA-Z &]{2,30}$/ })
    const pillCount = await pills.count().catch(() => 0)
    if (pillCount < 2) {
      info.annotations.push({ type: 'BUG', description: '/skills shows fewer than 2 category pills/filters.' })
    }
    let changed = false
    if (pillCount >= 2) {
      const beforeText = await page.locator('main, body').innerText()
      await pills.nth(1).click().catch(() => {})
      await page.waitForTimeout(500)
      const afterText = await page.locator('main, body').innerText()
      changed = beforeText !== afterText
      if (!changed) {
        info.annotations.push({ type: 'BUG', description: 'Clicking a /skills category pill does not change visible studios.' })
      }
    }
    if (errors.length)
      info.annotations.push({ type: 'CONSOLE', description: errors.slice(0, 5).map((e) => e.text).join(' | ') })
  })

  test('/admin categories editor + KB upload', async ({ page }, info) => {
    const errors = captureConsole(page)
    await seedAuth(page)
    await page.goto('/admin', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    await page.screenshot({ path: 'e2e-results/03-admin.png', fullPage: true })
    const body = await page.locator('body').innerText().catch(() => '')
    if (!/categor/i.test(body)) {
      info.annotations.push({ type: 'BUG', description: '/admin missing a "Categories" editor section.' })
    }
    if (!/skill/i.test(body)) {
      info.annotations.push({ type: 'BUG', description: '/admin missing skill management area.' })
    }
    // Try to find a file input for KB upload
    const fileInput = page.locator('input[type="file"]').first()
    const hasInput = await fileInput.count()
    if (hasInput === 0) {
      info.annotations.push({ type: 'BUG', description: '/admin has no file input for skill knowledge base upload.' })
    } else {
      await fileInput.setInputFiles({
        name: 'test.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4 test'),
      }).catch((e) => {
        info.annotations.push({ type: 'BUG', description: 'Uploading a PDF to admin KB input failed: ' + e.message })
      })
      await page.waitForTimeout(500)
    }
    if (errors.length)
      info.annotations.push({ type: 'CONSOLE', description: errors.slice(0, 5).map((e) => e.text).join(' | ') })
  })

  test('/skills reflects admin overrides', async ({ page }, info) => {
    const errors = captureConsole(page)
    await seedAuth(page)
    await page.goto('/skills', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    const body = await page.locator('body').innerText()
    if (body.length < 50) {
      info.annotations.push({ type: 'BUG', description: '/skills page renders empty after admin visit.' })
    }
    expect(body.length).toBeGreaterThan(50)
    if (errors.length)
      info.annotations.push({ type: 'CONSOLE', description: errors.slice(0, 5).map((e) => e.text).join(' | ') })
  })
})
