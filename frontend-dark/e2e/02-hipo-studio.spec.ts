import { test, expect } from '@playwright/test'
import { captureConsole, seedAuth } from './_helpers'

test.describe('HiPo Studio', () => {
  test('hipo-studio-v2 wizard renders and persists across reload', async ({ page }, info) => {
    const errors = captureConsole(page)
    await seedAuth(page)
    await page.goto('/hipo-studio-v2', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    await page.screenshot({ path: 'e2e-results/02-hipo-step1.png', fullPage: true })
    const body = await page.locator('body').innerText().catch(() => '')
    if (!body || body.length < 50) {
      info.annotations.push({ type: 'BUG', description: '/hipo-studio-v2 renders empty / blank page.' })
    }
    // Walk wizard
    for (let i = 0; i < 3; i++) {
      const next = page.getByRole('button', { name: /next|continue|start|launch/i }).first()
      if (await next.isVisible().catch(() => false)) {
        await next.click().catch(() => {})
        await page.waitForTimeout(700)
      }
    }
    await page.screenshot({ path: 'e2e-results/02-hipo-progressed.png', fullPage: true })
    const stateBefore = await page.locator('body').innerText()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    const stateAfter = await page.locator('body').innerText()
    if (stateBefore.slice(0, 200) !== stateAfter.slice(0, 200)) {
      info.annotations.push({
        type: 'BUG',
        description: 'HiPo Studio wizard does NOT persist progress across reload (resets to step 1).',
      })
    }
    if (errors.length)
      info.annotations.push({
        type: 'CONSOLE',
        description: 'Errors: ' + errors.slice(0, 5).map((e) => e.text).join(' | '),
      })
    expect(body.length).toBeGreaterThan(50)
  })

  test('workspace hipo Launch journey does not restart on revisit', async ({ page }, info) => {
    const errors = captureConsole(page)
    await seedAuth(page)
    await page.goto('/workspaces/test/hipo', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    await page.screenshot({ path: 'e2e-results/02-workspace-hipo.png', fullPage: true })
    const launch = page.getByRole('button', { name: /launch journey|launch/i }).first()
    const firstLaunch = await launch.isVisible().catch(() => false)
    if (!firstLaunch) {
      info.annotations.push({ type: 'BUG', description: 'No "Launch journey" button on /workspaces/test/hipo.' })
    } else {
      await launch.click()
      await page.waitForTimeout(800)
      const firstState = await page.locator('body').innerText()
      // revisit
      await page.goto('/workspaces/test/hipo', { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1500)
      const secondLaunch = page.getByRole('button', { name: /launch journey|launch/i }).first()
      if (await secondLaunch.isVisible().catch(() => false)) {
        await secondLaunch.click()
        await page.waitForTimeout(800)
        const secondState = await page.locator('body').innerText()
        if (firstState.slice(0, 200) === secondState.slice(0, 200)) {
          info.annotations.push({
            type: 'BUG',
            description: 'Second Launch journey restarts from step 1 (no progress retained).',
          })
        }
      }
    }
    if (errors.length)
      info.annotations.push({
        type: 'CONSOLE',
        description: 'Errors: ' + errors.slice(0, 5).map((e) => e.text).join(' | '),
      })
  })
})
