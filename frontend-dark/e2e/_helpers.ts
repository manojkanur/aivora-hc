import { Page } from '@playwright/test'

export function uniqueEmail() {
  return `playwright_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@example.com`
}

export async function signupAndLogin(page: Page) {
  const email = uniqueEmail()
  await page.goto('/signup', { waitUntil: 'domcontentloaded' })
  await page.locator('input[autocomplete="name"]').fill('Playwright Tester')
  await page.locator('input[autocomplete="email"]').fill(email)
  await page.locator('input[autocomplete="new-password"]').first().fill('Test1234!')
  await page.locator('input[autocomplete="new-password"]').nth(1).fill('Test1234!')
  await page.locator('input[type="checkbox"]').first().check().catch(() => {})
  await page.locator('button[type="submit"]').click()
  await page
    .waitForURL(/\/(onboarding|dashboard|workspaces)/, { timeout: 15_000 })
    .catch(() => {})
  return { email }
}

export async function seedAuth(page: Page) {
  await page.addInitScript(() => {
    const data = {
      state: {
        token: 'fake',
        user: {
          id: 'u1',
          name: 'Tester',
          email: 't@a.test',
          role: 'owner',
          xp_points: 0,
          level: 1,
        },
        tenant: { id: 't1', name: 'Test Tenant', plan: 'professional' },
        isAuthenticated: true,
      },
      version: 0,
    }
    localStorage.setItem('aivora-auth-dark', JSON.stringify(data))
  })
  await page.goto('/')
}

export type ConsoleIssue = { type: 'error' | 'pageerror'; text: string; url?: string }

export function captureConsole(page: Page): ConsoleIssue[] {
  const issues: ConsoleIssue[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text()
      // Filter out common noise (favicon, network 404s for missing assets)
      if (/favicon|net::ERR_FAILED.*\.(png|jpg|svg)/.test(text)) return
      issues.push({ type: 'error', text, url: page.url() })
    }
  })
  page.on('pageerror', (err) => {
    issues.push({ type: 'pageerror', text: err.message, url: page.url() })
  })
  return issues
}

export type ContrastIssue = { text: string; selector: string; color: string; bg: string; ratio: number }

export async function checkContrastIssues(page: Page): Promise<ContrastIssue[]> {
  return await page.evaluate(() => {
    function parseColor(c: string): [number, number, number, number] {
      const m = c.match(/rgba?\(([^)]+)\)/)
      if (!m) return [0, 0, 0, 1]
      const parts = m[1].split(',').map((p) => parseFloat(p.trim()))
      return [parts[0] || 0, parts[1] || 0, parts[2] || 0, parts[3] ?? 1]
    }
    function lum([r, g, b]: number[]) {
      const a = [r, g, b].map((v) => {
        v = v / 255
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
      })
      return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]
    }
    function getBg(el: Element): [number, number, number, number] {
      let cur: Element | null = el
      while (cur) {
        const c = getComputedStyle(cur).backgroundColor
        const [r, g, b, a] = parseColor(c)
        if (a > 0.1) return [r, g, b, a]
        cur = cur.parentElement
      }
      return [12, 14, 20, 1]
    }
    function pathOf(el: Element): string {
      const tag = el.tagName.toLowerCase()
      const id = (el as HTMLElement).id ? `#${(el as HTMLElement).id}` : ''
      const cls = (el as HTMLElement).className && typeof (el as HTMLElement).className === 'string'
        ? '.' + ((el as HTMLElement).className as string).split(/\s+/).filter(Boolean).slice(0, 2).join('.')
        : ''
      return `${tag}${id}${cls}`
    }
    const issues: ContrastIssue[] = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const seen = new Set<Element>()
    let node: Node | null
    while ((node = walker.nextNode())) {
      const text = (node.textContent || '').trim()
      if (!text || text.length < 2) continue
      const el = node.parentElement
      if (!el || seen.has(el)) continue
      seen.add(el)
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      const style = getComputedStyle(el)
      if (style.visibility === 'hidden' || style.display === 'none' || parseFloat(style.opacity) < 0.3) continue
      const fg = parseColor(style.color)
      if (fg[3] < 0.3) continue
      const bg = getBg(el)
      const fl = lum(fg)
      const bl = lum(bg)
      const ratio = (Math.max(fl, bl) + 0.05) / (Math.min(fl, bl) + 0.05)
      if (Math.abs(fl - bl) < 0.05 || ratio < 1.8) {
        issues.push({
          text: text.slice(0, 60),
          selector: pathOf(el),
          color: style.color,
          bg: `rgb(${bg[0]},${bg[1]},${bg[2]})`,
          ratio: Number(ratio.toFixed(2)),
        })
        if (issues.length >= 30) break
      }
    }
    return issues
  })
}
