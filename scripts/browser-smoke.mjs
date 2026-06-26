import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { text } from 'node:stream/consumers'
import { chromium } from 'playwright'

const port = process.env.SMOKE_PORT ?? String(4300 + Math.floor(Math.random() * 1000))
const baseUrl = process.env.SMOKE_BASE_URL ?? `http://127.0.0.1:${port}/lecture-notes-byok/`
const viteBin = path.join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js')
const previewCommand = {
  command: process.execPath,
  args: [viteBin, 'preview', '--host', '127.0.0.1', '--port', port],
}

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

function step(message) {
  console.log(`[browser-smoke] ${message}`)
}

const preview = spawn(previewCommand.command, previewCommand.args, {
  stdio: 'inherit',
  shell: false,
})

let browser

try {
  step('waiting for preview server')
  await waitForServer(baseUrl)
  step('opening browser')
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

  step('creating and renaming course')
  await page.getByPlaceholder('Course name').fill('Browser Smoke Course')
  await page.getByRole('button', { name: 'Add Course' }).click()
  await page.getByText('Created course: Browser Smoke Course.').waitFor()
  await page.locator('.detail-editor').getByLabel('Title').fill('Browser Smoke Course Renamed')
  await page.getByRole('button', { name: 'Save Course' }).click()
  await page.getByText('Course details saved.').waitFor()
  await page.getByText('Browser Smoke Course Renamed').first().waitFor()

  step('creating lecture')
  await page
    .locator('section.panel')
    .filter({ has: page.getByRole('heading', { name: 'New Lecture' }) })
    .getByLabel('Title')
    .fill('Browser Smoke Lecture')
  await page.getByLabel('I have permission to record this lecture and will follow course policy.').check()
  await page.getByRole('button', { name: 'Create' }).click()
  await page.getByRole('heading', { name: 'Browser Smoke Lecture' }).waitFor()

  step('renaming lecture')
  await page.getByRole('button', { name: 'Library' }).click()
  const details = page.locator('.detail-editor')
  await details.getByLabel('Title').fill('Browser Smoke Lecture Renamed')
  await details.getByRole('button', { name: 'Save Details' }).click()
  await page.getByText('Lecture details saved.').waitFor()
  await page.getByRole('heading', { name: 'Browser Smoke Lecture Renamed' }).waitFor()

  step('adding transcript')
  await page.getByRole('button', { name: 'Capture' }).click()
  await page
    .locator('section.panel')
    .filter({ has: page.getByRole('heading', { name: 'Manual Transcript' }) })
    .locator('textarea')
    .fill('Entropy connects heat, disorder, and reversible lecture examples.')
  await page.getByRole('button', { name: 'Add Segment' }).click()
  await page.getByText('Manual transcript segment added.').waitFor()

  step('attaching material')
  const tempDir = await mkdtemp(path.join(tmpdir(), 'lecture-notes-smoke-'))
  const materialPath = path.join(tempDir, 'entropy-slides.txt')
  await writeFile(materialPath, 'Entropy reversible slide text')
  await page.locator('input[accept*=".pdf"]').setInputFiles(materialPath)
  await page.getByText('entropy-slides.txt').waitFor()
  await page.getByText('Segment 1 (0:00)').waitFor()

  step('editing speaker')
  await page.getByRole('button', { name: 'Notes' }).click()
  await page.getByText('Entropy connects heat, disorder, and reversible lecture examples.').waitFor()
  await page.getByPlaceholder('Speaker label').fill('Professor Rivera')
  await page.getByRole('button', { name: 'Save Transcript Edits' }).click()
  await page.getByText('Saved 1 transcript edit.').waitFor()

  step('exporting Markdown')
  const markdownDownloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Markdown' }).click()
  const markdownDownload = await markdownDownloadPromise
  const markdownStream = await markdownDownload.createReadStream()
  assert(markdownStream, 'markdown download stream was not available')
  const markdown = await text(markdownStream)
  assert(markdown.includes('## Material Context'), 'markdown material context was missing')
  assert(markdown.includes('entropy-slides.txt'), 'markdown material name was missing')
  assert(markdown.includes('Linked transcript: Segment 1 (0s)'), 'markdown material transcript link was missing')

  step('exporting JSON')
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

  const backupWithFlashcard = {
    ...exported,
    notes: [
      {
        id: 'source-note-1',
        model: 'smoke-model',
        summary: 'Entropy connects heat and disorder.',
        outline: ['Entropy basics'],
        keyPoints: ['Reversible examples preserve entropy.'],
        definitions: ['Entropy: a state function related to heat transfer.'],
        openQuestions: ['How does irreversibility change entropy?'],
        reviewTasks: ['Compare reversible and irreversible examples.'],
        flashcards: [{ front: 'What does entropy connect?', back: 'Heat, disorder, and reversible examples.' }],
        citations: [{ label: 'Entropy intro', segmentIds: [exported.segments[0].id] }],
        createdAt: '2026-06-26T00:00:00.000Z',
      },
    ],
  }
  const backupPath = path.join(tempDir, 'backup.json')
  await writeFile(backupPath, JSON.stringify(backupWithFlashcard, null, 2))

  step('importing JSON backup')
  await page.getByRole('button', { name: 'Library' }).click()
  await page.locator('input[accept="application/json,.json"]').setInputFiles(backupPath)
  await page.getByText('Imported backup: Browser Smoke Lecture Renamed (imported).').waitFor()
  await page.getByRole('button', { name: 'Capture' }).click()
  await page.getByText('entropy-slides.txt').waitFor()
  await page.getByText('Segment 1 (0:00)').waitFor()

  step('reviewing flashcard progress')
  await page.getByRole('button', { name: 'Notes' }).click()
  await page.getByText('What does entropy connect?').waitFor()
  await page.getByRole('button', { name: 'Show Answer' }).click()
  await page.getByText('Heat, disorder, and reversible examples.').waitFor()
  await page.getByRole('button', { name: 'Known' }).click()
  await page.getByText('Marked flashcard as known.').waitFor()
  await page.getByText('1 known / 0 missed').waitFor()
  await page.getByRole('button', { name: 'Missed' }).click()
  await page.getByText('Marked flashcard as missed.').waitFor()
  await page.getByText('1 known / 1 missed').waitFor()

  step('exporting reviewed flashcard backup')
  const reviewedDownloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'JSON Backup' }).click()
  const reviewedDownload = await reviewedDownloadPromise
  const reviewedStream = await reviewedDownload.createReadStream()
  assert(reviewedStream, 'reviewed backup stream was not available')
  const reviewedExport = JSON.parse(await text(reviewedStream))
  assert(reviewedExport.cardReviews?.[0]?.correctCount === 1, 'reviewed backup known count was missing')
  assert(reviewedExport.cardReviews?.[0]?.missedCount === 1, 'reviewed backup missed count was missing')
  assert(reviewedExport.cardReviews?.[0]?.noteId === reviewedExport.notes?.[0]?.id, 'reviewed backup note id was not linked')
  step('passed')
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  if (browser) await browser.close()
  preview.kill()
}
