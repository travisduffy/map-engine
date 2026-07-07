/**
 * Hobbyist Quickstart verification (Epic 4 Task 4.4, ROADMAP §8 Phase 3 Exit
 * Gate). Not a performance benchmark — reuses this directory's standalone
 * Playwright infra (real Node `http`/`child_process`, not Vitest browser
 * mode) because it needs to build `example/dist` and serve it over real
 * HTTP, which Vitest's single-page browser-mode harness cannot do.
 *
 * Builds `example/dist`, serves it with a bare zero-config static file
 * server (no COOP/COEP or any special headers — PR-1) at both a root-path
 * deployment and a simulated GH-Pages project-site subpath deployment, then
 * drives the full public-API interaction surface with a real Chromium
 * browser: load, hover, click/select, scroll-wheel zoom, middle-mouse pan,
 * and map-mode toggle (asserted via a screenshot diff, since that's the
 * only way to prove the whole map actually recolored).
 */
import { test, expect, type Page } from 'playwright/test'
import * as http from 'node:http'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = path.resolve(process.cwd())
const DIST_DIR = path.join(ROOT, 'example/dist')

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
}

/** Bare static file server — no headers beyond Content-Type (PR-1: zero-config host). */
function serveStatic(webroot: string, port: number): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0])
    let filePath = path.join(webroot, urlPath)
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html')
    }
    if (!fs.existsSync(filePath)) {
      res.writeHead(404)
      res.end()
      return
    }
    res.setHeader(
      'Content-Type',
      MIME[path.extname(filePath)] ?? 'application/octet-stream'
    )
    fs.createReadStream(filePath).pipe(res)
  })
  return new Promise(resolve => {
    server.listen(port, () => resolve(server))
  })
}

/** Samples an 8x8 grid over the canvas until a real sector hover-hit renders (skeleton rows have no `<code>`). */
async function hoverUntilSectorFound(
  page: Page
): Promise<{ x: number; y: number }> {
  const box = (await page.locator('#map').boundingBox())!
  const grid = 8
  for (let i = 0; i < grid; i++) {
    for (let j = 0; j < grid; j++) {
      const x = box.x + (box.width * (i + 0.5)) / grid
      const y = box.y + (box.height * (j + 0.5)) / grid
      await page.mouse.move(x, y)
      if ((await page.locator('#hover-content code').count()) > 0) {
        return { x, y }
      }
    }
  }
  throw new Error(
    'quickstart-verify: no sector pixel found under an 8x8 canvas sampling grid'
  )
}

async function driveInteractionSurface(
  page: Page,
  baseUrl: string
): Promise<{ consoleErrors: string[]; failedRequests: string[] }> {
  const consoleErrors: string[] = []
  const failedRequests: string[] = []
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('requestfailed', req => failedRequests.push(req.url()))

  await page.goto(baseUrl)
  await expect(page.locator('#status')).toContainText('Ready', {
    timeout: 15_000,
  })

  // Real map data loaded through the public API (not just an empty shell).
  const sectorCount = Number(await page.locator('#sector-count').textContent())
  expect(sectorCount).toBeGreaterThan(0)
  expect(await page.locator('.sector-item').count()).toBe(sectorCount)

  // Hover + click/select.
  const point = await hoverUntilSectorFound(page)
  expect(await page.locator('#hover-content code').count()).toBeGreaterThan(0)
  await page.mouse.click(point.x, point.y)
  await expect(page.locator('#selected-content')).not.toHaveClass(/empty-state/)
  expect(await page.locator('#selected-content code').count()).toBeGreaterThan(
    0
  )

  // Scroll-wheel zoom.
  await page.mouse.wheel(0, -300)

  // Middle-mouse-drag pan.
  await page.mouse.move(point.x, point.y)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(point.x + 40, point.y + 40)
  await page.mouse.up({ button: 'middle' })

  // Map mode toggle — the only reliable proof the whole map recolored is a
  // pixel-level screenshot diff (per-sector click assertions above don't
  // exercise the palette LUT path at all).
  const beforeToggle = await page.locator('#map').screenshot()
  await page.click('#btn-mapmode-grayscale')
  await page.waitForTimeout(100)
  const afterGrayscale = await page.locator('#map').screenshot()
  expect(Buffer.compare(beforeToggle, afterGrayscale)).not.toBe(0)
  await page.click('#btn-mapmode-default')
  await page.waitForTimeout(100)
  const afterDefault = await page.locator('#map').screenshot()
  expect(Buffer.compare(afterGrayscale, afterDefault)).not.toBe(0)

  return { consoleErrors, failedRequests }
}

test.beforeAll(() => {
  execSync('npm run build:example', { cwd: ROOT, stdio: 'inherit' })
})

test('root-path static hosting: full interaction surface, zero console errors, zero failed requests', async ({
  page,
}) => {
  const server = await serveStatic(DIST_DIR, 4173)
  try {
    const { consoleErrors, failedRequests } = await driveInteractionSurface(
      page,
      'http://localhost:4173/'
    )
    expect(consoleErrors).toEqual([])
    expect(failedRequests).toEqual([])
  } finally {
    server.close()
  }
})

test('simulated GH-Pages project-site subpath (/example/dist/): same interaction surface, zero console errors, zero failed requests', async ({
  page,
}) => {
  // Serve the whole repo root so /example/dist/ is a genuine subpath, not
  // the webroot — this is what the relative `base: './'` fix (Documented
  // Deviation 3) exists to survive.
  const server = await serveStatic(ROOT, 4174)
  try {
    const { consoleErrors, failedRequests } = await driveInteractionSurface(
      page,
      'http://localhost:4174/example/dist/'
    )
    expect(consoleErrors).toEqual([])
    expect(failedRequests).toEqual([])
  } finally {
    server.close()
  }
})
