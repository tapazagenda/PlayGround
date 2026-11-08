#!/usr/bin/env bash
# Capture the exact public preview at desktop and mobile sizes.
set -euo pipefail

cd "$(dirname "$0")"

: "${CAPTURE_URL:?CAPTURE_URL is required}"
: "${CAPTURE_DIR:?CAPTURE_DIR is required}"
: "${RUNTIME_DIR:?RUNTIME_DIR is required}"

printf '[capture] url=%s\n' "$CAPTURE_URL"
printf '[capture] out=%s\n' "$CAPTURE_DIR"
/usr/bin/time -p mkdir -p "$CAPTURE_DIR"

set +e
/usr/bin/time -p env CAPTURE_URL="$CAPTURE_URL" CAPTURE_DIR="$CAPTURE_DIR" node --input-type=module <<'NODE'
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const runtime = join(process.env.HOME, '.local/share/omgithub-playwright');
const require = createRequire(join(runtime, 'package.json'));
const { chromium } = require('playwright');
const config = JSON.parse(readFileSync(join(runtime, process.platform === 'darwin' ? 'metal.json' : 'linux.json'), 'utf8'));
if (process.platform === 'linux') process.env.DISPLAY ||= ':' + readFileSync(join(runtime, 'display'), 'utf8').trim();
const url = process.env.CAPTURE_URL;
const output = process.env.CAPTURE_DIR;
if (!url || !output) throw new Error('CAPTURE_URL and CAPTURE_DIR are required.');
try { new URL(url); } catch { throw new Error('CAPTURE_URL must be an absolute URL.'); }
mkdirSync(output, { recursive: true });

let browser;
let exitCode = 1;
try {
  try {
    browser = await chromium.launch({ ...config.browser.launchOptions, timeout: 30000 });
  } catch (error) {
    error.exitCode = 75;
    throw error;
  }

  for (const [name, width, height] of [['desktop', 1280, 800], ['mobile', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(15000);
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('response', response => {
      if (new URL(response.url()).origin === new URL(url).origin && response.status() >= 400) {
        pageErrors.push(`HTTP ${response.status()} ${response.url()}`);
      }
    });

    let response;
    try {
      response = await page.goto(url, { waitUntil: 'load', timeout: 45000 });
    } catch (error) {
      error.exitCode = 75;
      throw error;
    }
    if (!response || response.status() >= 500 || response.status() === 408 || response.status() === 429) {
      const error = new Error(`Temporary navigation failure (HTTP ${response?.status() ?? 'no response'}).`);
      error.exitCode = 75;
      throw error;
    }
    if (!response.ok()) throw new Error(`Preview returned HTTP ${response.status()}.`);

    // Confirm the actual game UI is rendered rather than treating an HTTP 200 shell as success.
    await page.locator('#gameShell').waitFor({ state: 'visible' });
    await page.locator('#welcomeTitle').waitFor({ state: 'visible' });
    await page.locator('#startButton').waitFor({ state: 'visible' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(output, `final-${name}.png`), fullPage: false, timeout: 30000 });
    await page.close();
    if (pageErrors.length) throw new Error(`${name} page errors: ${pageErrors.join('; ')}`);
    console.log(`[capture] ${name} rendered (${width}x${height})`);
  }
  exitCode = 0;
} catch (error) {
  console.error(error);
  exitCode = error.exitCode || 1;
} finally {
  try { await browser?.close(); } catch (error) {
    console.error(error);
    if (!exitCode) exitCode = 75;
  }
}
process.exitCode = exitCode;
NODE
code=$?
set -e
printf '[capture] renderer exit=%s\n' "$code"
if [[ "$code" -ne 0 ]]; then
  case "$code" in
    75) exit 75 ;;
    *) exit 1 ;;
  esac
fi

/usr/bin/time -p node - "$CAPTURE_DIR" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const dir = process.argv[2];
for (const [name, expectedWidth, expectedHeight] of [['final-desktop.png', 1280, 800], ['final-mobile.png', 390, 844]]) {
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) {
    console.error(`[capture] missing ${name}`);
    process.exit(1);
  }
  const buffer = fs.readFileSync(file);
  if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    console.error(`[capture] invalid PNG: ${name}`);
    process.exit(1);
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width !== expectedWidth || height !== expectedHeight) {
    console.error(`[capture] unexpected dimensions for ${name}: ${width}x${height}`);
    process.exit(1);
  }
  console.log(`[capture] ${name} ok (${width}x${height}, ${buffer.length} bytes)`);
}
NODE

echo '[capture] done'
