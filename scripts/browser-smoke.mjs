import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { text } from 'node:stream/consumers'
import { chromium } from 'playwright'

const baseUrl = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:4173/lecture-notes-byok/'
const previewCommand =
  process.platform === 'win32'
    ? { command: 'cmd.exe', args: ['/d', '/s', '/c', 'npm run preview -- --host 127.0.0.1 --port 4173'] }
    : { command: 'npm', args: ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173'] }

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForServer(url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  let lastError

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await wait(500)
  }

  throw lastError ?? new Error(`Timed out waiting for ${url}`)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const preview = spawn(previewCommand.command, previewCommand.args, {
  stdio: 'inherit',
  shell: false,
})

let browser

try {
  await waitForServer(baseUrl)
  browser = await chromium.launch()
  const context = await browser.newContext({ acceptDownloads: true })
  const page = await context.newPage()

  await page.goto(baseUrl)
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.deleteDatabase('lecture-notes-byok')
        request.onsuccess = () => resolve(undefined)
        request.onerror = () => reject(request.error)
        request.onblocked = () => resolve(undefined)
      }),
  )
  await page.reload()
  await page.getByRole('heading', { name: 'Create a lecture' }).waitFor()

  await page.getByLabel('Title').fill('Browser Smoke Lecture')
  await page.getByLabel('I have permission to record this lecture and will follow course policy.').check()
  await page.getByRole('button', { name: 'Create' }).click()
  await page.getByRole('heading', { name: 'Browser Smoke Lecture' }).waitFor()

  await page.getByRole('button', { name: 'Library' }).click()
  const details = page.locator('.detail-editor')
  await details.getByLabel('Title').fill('Browser Smoke Lecture Renamed')
  await details.getByRole('button', { name: 'Save Details' }).click()
  await page.getByText('Lecture details saved.').waitFor()
  await page.getByRole('heading', { name: 'Browser Smoke Lecture Renamed' }).waitFor()

  await page.getByRole('button', { name: 'Capture' }).click()
  await page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Manual Transcript' }) })
    .locator('textarea')
    .fill('Entropy connects heat, disorder, and reversible lecture examples.')
  await page.getByRole('button', { name: 'Add Segment' }).click()
  await page.getByText('Manual transcript segment added.').waitFor()

  const tempDir = await mkdtemp(path.join(tmpdir(), 'lecture-notes-smoke-'))
  const materialPath = path.join(tempDir, 'entropy-slides.txt')
  await writeFile(materialPath, 'Entropy reversible slide text')
  await page.locator('input[accept*=".pdf"]').setInputFiles(materialPath)
  await page.getByText('entropy-slides.txt').waitFor()
  await page.getByText('Segment 1 (0:00)').waitFor()

  await page.getByRole('button', { name: 'Notes' }).click()
  await page.getByText('Entropy connects heat, disorder, and reversible lecture examples.').waitFor()
  await page.getByPlaceholder('Speaker label').fill('Professor Rivera')
  await page.getByRole('button', { name: 'Save Transcript Edits' }).click()
  await page.getByText('Saved 1 transcript edit.').waitFor()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'JSON Backup' }).click()
  const download = await downloadPromise
  const stream = await download.createReadStream()
  assert(stream, 'download stream was not available')
  const exported = JSON.parse(await text(stream))

  assert(exported.lecture.title === 'Browser Smoke Lecture Renamed', 'exported lecture title did not match')
  assert(exported.segments?.[0]?.text.includes('Entropy connects heat'), 'exported transcript segment was missing')
  assert(exported.segments?.[0]?.speaker === 'Professor Rivera', 'exported speaker label was missing')
  assert(exported.materials?.[0]?.name === 'entropy-slides.txt', 'exported material metadata was missing')
  assert(exported.materials?.[0]?.linkedSegmentIds?.length === 1, 'exported material link was missing')
} finally {
  if (browser) await browser.close()
  preview.kill()
}
