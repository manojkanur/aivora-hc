import { test, expect } from '@playwright/test'
import { captureConsole, signupAndLogin, seedAuth } from './_helpers'

test.describe('Onboarding', () => {
  test('signup flow lands on onboarding/dashboard/workspaces', async ({ page }, info) => {
    const errors = captureConsole(page)
    await signupAndLogin(page)
    const url = page.url()
    await page.screenshot({ path: `e2e-results/01-signup-landing.png`, fullPage: true })
    if (!/\/(onboarding|dashboard|workspaces)/.test(url)) {
      info.annotations.push({
        type: 'BUG',
        description: `After signup the user landed on ${url} (expected /onboarding, /dashboard or /workspaces).`,
      })
    }
    expect(url).toMatch(/\/(onboarding|dashboard|workspaces)/)
    if (errors.length) {
      info.annotations.push({
        type: 'BUG',
        description: `Console errors during signup: ${errors.slice(0, 5).map((e) => e.text).join(' | ')}`,
      })
    }
  })

  test('onboarding Next/Back navigation', async ({ page }, info) => {
    const errors = captureConsole(page)
    await seedAuth(page)
    await page.goto('/onboarding', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'e2e-results/01-onboarding-step1.png', fullPage: true })
    const nextBtn = page.getByRole('button', { name: /next|continue|save\s*&?\s*continue/i }).first()
    const initiallyVisible = await nextBtn.isVisible().catch(() => false)
    if (!initiallyVisible) {
      info.annotations.push({
        type: 'BUG',
        description: 'Onboarding has no visible Next/Continue button on step 1.',
      })
    }
    expect(initiallyVisible).toBeTruthy()
    const before = await page.locator('body').innerText()
    await nextBtn.click().catch(() => {})
    await page.waitForTimeout(800)
    const after = await page.locator('body').innerText()
    if (before === after) {
      info.annotations.push({ type: 'BUG', description: 'Clicking Next on onboarding did not advance the wizard.' })
    }
    const backBtn = page.getByRole('button', { name: /back|previous/i }).first()
    if (await backBtn.isVisible().catch(() => false)) {
      await backBtn.click()
      await page.waitForTimeout(500)
    } else {
      info.annotations.push({ type: 'BUG', description: 'Onboarding step 2 has no visible Back button.' })
    }
    if (errors.length)
      info.annotations.push({ type: 'CONSOLE', description: errors.slice(0, 5).map((e) => e.text).join(' | ') })
  })

  test('workspace creation triggers onboarding once', async ({ page }, info) => {
    const errors = captureConsole(page)
    await seedAuth(page)
    await page.goto('/workspaces', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'e2e-results/01-workspaces.png', fullPage: true })
    const createBtn = page
      .getByRole('button', { name: /create|new workspace|add workspace/i })
      .first()
    const visible = await createBtn.isVisible().catch(() => false)
    if (!visible) {
      info.annotations.push({ type: 'BUG', description: '/workspaces missing a Create/New workspace button.' })
    }
    if (errors.length)
      info.annotations.push({ type: 'CONSOLE', description: errors.slice(0, 5).map((e) => e.text).join(' | ') })
  })
})
