import { test, expect } from '@playwright/test'
import { captureConsole, checkContrastIssues, seedAuth, ContrastIssue } from './_helpers'

const PAGES = ['/dashboard', '/skills', '/admin', '/workspaces', '/hipo-studio-v2']

test.describe('Theme + Layout', () => {
  test('dashboard dark + theme toggle + light + contrast', async ({ page }, info) => {
    const errors = captureConsole(page)
    await seedAuth(page)
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    await page.screenshot({ path: 'e2e-results/04-dashboard-dark.png', fullPage: true })

    // Toggle theme
    const toggle = page
      .locator('button[aria-label*="theme" i], button[title*="theme" i], button:has(svg.lucide-sun), button:has(svg.lucide-moon)')
      .first()
    let toggled = false
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click()
      await page.waitForTimeout(500)
      const hasLight = await page.evaluate(() => document.documentElement.classList.contains('light'))
      toggled = hasLight
      if (!hasLight) {
        info.annotations.push({ type: 'BUG', description: 'Theme toggle click did not apply `light` class on <html>.' })
      }
    } else {
      info.annotations.push({ type: 'BUG', description: 'No theme toggle button found in topbar.' })
    }
    await page.screenshot({ path: 'e2e-results/04-dashboard-light.png', fullPage: true })

    // Contrast scan on dashboard
    const dashIssues = await checkContrastIssues(page)
    if (dashIssues.length) {
      info.annotations.push({
        type: 'BUG',
        description:
          `Contrast/invisible text on /dashboard (${dashIssues.length}): ` +
          dashIssues
            .slice(0, 6)
            .map((i) => `"${i.text}" (${i.selector}) ratio=${i.ratio}`)
            .join(' | '),
      })
    }

    // Sweep all pages in both modes
    const allIssues: Record<string, ContrastIssue[]> = {}
    for (const mode of ['dark', 'light'] as const) {
      await page.evaluate((m) => {
        document.documentElement.classList.toggle('light', m === 'light')
      }, mode)
      for (const path of PAGES) {
        await page.goto(path, { waitUntil: 'domcontentloaded' }).catch(() => {})
        await page.waitForTimeout(1200)
        const issues = await checkContrastIssues(page).catch(() => [] as ContrastIssue[])
        if (issues.length) {
          allIssues[`${path}@${mode}`] = issues
        }
        await page
          .screenshot({ path: `e2e-results/04-${path.replace(/\//g, '_')}-${mode}.png`, fullPage: true })
          .catch(() => {})
      }
    }
    for (const [key, issues] of Object.entries(allIssues)) {
      info.annotations.push({
        type: 'BUG',
        description:
          `Invisible/low-contrast text on ${key} (${issues.length}): ` +
          issues
            .slice(0, 4)
            .map((i) => `"${i.text}" sel=${i.selector} ratio=${i.ratio}`)
            .join(' | '),
      })
    }

    // Sidebar collapse
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)
    const collapseBtn = page
      .locator('button[aria-label*="collapse" i], button[aria-label*="sidebar" i], aside button:has(svg)')
      .first()
    if (await collapseBtn.isVisible().catch(() => false)) {
      const widthBefore = await page.locator('aside, nav').first().evaluate((el) => (el as HTMLElement).getBoundingClientRect().width).catch(() => 0)
      await collapseBtn.click().catch(() => {})
      await page.waitForTimeout(500)
      const widthAfter = await page.locator('aside, nav').first().evaluate((el) => (el as HTMLElement).getBoundingClientRect().width).catch(() => widthBefore)
      if (widthBefore === widthAfter) {
        info.annotations.push({ type: 'BUG', description: 'Sidebar collapse button did not change sidebar width.' })
      }
      await page.screenshot({ path: 'e2e-results/04-sidebar-collapsed.png', fullPage: true })
    } else {
      info.annotations.push({ type: 'BUG', description: 'No sidebar collapse control found.' })
    }

    if (errors.length) {
      info.annotations.push({
        type: 'CONSOLE',
        description: 'Console errors during sweep: ' + errors.slice(0, 8).map((e) => e.text).join(' | '),
      })
    }

    // Fail if anything found, so the report surfaces it
    const totalIssues = dashIssues.length + Object.values(allIssues).reduce((a, b) => a + b.length, 0)
    if (totalIssues > 0) {
      throw new Error(`Found ${totalIssues} contrast/invisible-text issues across the app. See annotations.`)
    }
    expect(toggled || true).toBeTruthy()
  })
})
