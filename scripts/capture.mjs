import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const EXIT_DEFECT = 1
const EXIT_TRANSIENT = 75

const elapsed = label => {
  const started = performance.now()
  return () => console.log(`[timing] ${label}: ${Math.round(performance.now() - started)} ms`)
}

const fail = (message, exitCode) => {
  const error = new Error(message)
  error.exitCode = exitCode
  throw error
}

const url = process.env.CAPTURE_URL
const output = process.env.CAPTURE_DIR
if (!url) fail('CAPTURE_URL is required.', EXIT_DEFECT)
if (!output) fail('CAPTURE_DIR is required.', EXIT_DEFECT)

let target
try {
  target = new URL(url)
} catch {
  fail(`CAPTURE_URL is not a valid URL: ${url}`, EXIT_DEFECT)
}
if (!/^https?:$/.test(target.protocol)) fail('CAPTURE_URL must use http or https.', EXIT_DEFECT)

const runtime = process.env.PLAYWRIGHT_RUNTIME || join(process.env.HOME, '.local/share/omgithub-playwright')
const configPath = join(runtime, process.platform === 'darwin' ? 'metal.json' : 'linux.json')
let browserConfig = { launchOptions: { headless: true } }
if (existsSync(configPath)) {
  try {
    browserConfig = JSON.parse(readFileSync(configPath, 'utf8')).browser || browserConfig
  } catch (error) {
    console.error(`Ignoring invalid Playwright config: ${error.message}`)
  }
}

if (process.platform === 'linux' && !process.env.DISPLAY) {
  try {
    const display = readFileSync(join(runtime, 'display'), 'utf8').trim()
    if (display) process.env.DISPLAY = `:${display}`
  } catch {}
}

mkdirSync(output, { recursive: true })

let chromium
try {
  const require = createRequire(join(runtime, 'package.json'))
  ;({ chromium } = require('playwright'))
} catch (error) {
  fail(`Playwright is unavailable in ${runtime}: ${error.message}`, EXIT_TRANSIENT)
}

const views = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true }
]

let browser
let exitCode = 0

try {
  let timer = elapsed('launch browser')
  browser = await chromium.launch({ ...browserConfig.launchOptions, timeout: 30000 }).catch(error => {
    fail(`Could not launch browser: ${error.message}`, EXIT_TRANSIENT)
  })
  timer()

  for (const view of views) {
    const viewTimer = elapsed(`capture ${view.name}`)
    try {
      const context = await browser.newContext({
        viewport: { width: view.width, height: view.height },
        deviceScaleFactor: 1,
        isMobile: Boolean(view.isMobile),
        hasTouch: Boolean(view.hasTouch),
        reducedMotion: 'reduce'
      }).catch(error => fail(`Could not create ${view.name} context: ${error.message}`, EXIT_TRANSIENT))

      const page = await context.newPage().catch(error => {
        fail(`Could not open ${view.name} page: ${error.message}`, EXIT_TRANSIENT)
      })
      const pageErrors = []
      page.on('pageerror', error => {
        pageErrors.push(error.message)
        console.error(`pageerror (${view.name}): ${error.message}`)
      })
      page.setDefaultTimeout(30000)

      timer = elapsed(`navigate ${view.name}`)
      const response = await page.goto(url, { waitUntil: 'load', timeout: 45000 }).catch(error => {
        fail(`Navigation to ${url} failed: ${error.message}`, EXIT_TRANSIENT)
      })
      timer()

      if (!response) fail(`No response while loading ${url}.`, EXIT_TRANSIENT)
      if (!response.ok()) {
        const status = response.status()
        const transient = [408, 429, 500, 502, 503, 504].includes(status)
        fail(`HTTP ${status} loading ${url}.`, transient ? EXIT_TRANSIENT : EXIT_DEFECT)
      }

      timer = elapsed(`wait for rendered content (${view.name})`)
      await page.locator(process.env.CAPTURE_READY_SELECTOR || 'body').waitFor({ state: 'visible', timeout: 45000 }).catch(error => {
        fail(`Rendered content did not become visible: ${error.message}`, EXIT_DEFECT)
      })
      await page.waitForFunction(() => {
        const ready = document.body?.dataset.ready === 'true' || document.documentElement?.dataset.ready === 'true'
        const text = (document.body?.innerText || '').trim()
        return ready || (document.readyState === 'complete' && text.length > 20)
      }, { timeout: 30000 }).catch(error => {
        fail(`Rendered content never became ready: ${error.message}`, EXIT_DEFECT)
      })
      await page.evaluate(() => document.fonts?.ready).catch(() => {})
      await page.waitForTimeout(600)
      timer()

      const rendered = await page.evaluate(() => ({
        text: (document.body?.innerText || '').trim(),
        hasMain: Boolean(document.querySelector('main, #app, [data-ready]'))
      }))
      if (!rendered.text) fail('The page rendered no visible text.', EXIT_DEFECT)
      if (!rendered.hasMain) fail('The page rendered no recognizable app content.', EXIT_DEFECT)
      if (pageErrors.length) console.error(`Page reported ${pageErrors.length} script error(s); screenshots will be inspected.`)

      timer = elapsed(`screenshot ${view.name}`)
      const bytes = await page.screenshot({ type: 'png', timeout: 30000 }).catch(error => {
        const transient = error.name === 'TimeoutError' || !browser.isConnected()
        fail(`Screenshot failed: ${error.message}`, transient ? EXIT_TRANSIENT : EXIT_DEFECT)
      })
      timer()

      if (!Buffer.isBuffer(bytes) || bytes.length < 1024 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
        fail(`${view.name} screenshot is empty or not a PNG.`, EXIT_DEFECT)
      }

      writeFileSync(join(output, `final-${view.name}.png`), bytes)
      console.log(`Saved ${join(output, `final-${view.name}.png`)} (${bytes.length} bytes)`)
      await context.close().catch(error => console.error(`Context close warning: ${error.message}`))
    } finally {
      viewTimer()
    }
  }
} catch (error) {
  console.error(error.message)
  exitCode = error.exitCode || EXIT_DEFECT
} finally {
  await browser?.close().catch(error => {
    console.error(`Browser close warning: ${error.message}`)
    exitCode ||= EXIT_TRANSIENT
  })
}

process.exit(exitCode)
