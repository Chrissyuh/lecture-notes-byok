import { describe, expect, it, vi } from 'vitest'
import type { AudioChunk, LocalJob } from './domain'
import { createNotesJob, createTranscriptionJobs, nextRunAfter, summarizeJobs } from './queue'

vi.mock('./domain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./domain')>()
  return {
    ...actual,
    newId: (prefix: string) => `${prefix}_test`,
  }
})

const createdAt = '2026-06-26T00:00:00.000Z'

function chunk(id: string, transcribedAt?: string): AudioChunk {
  return {
    id,
    lectureId: 'lecture-1',
    index: 0,
    blob: new Blob(['audio']),
    mimeType: 'audio/webm',
    source: 'recording',
    sizeBytes: 5,
    durationMs: 60_000,
    createdAt,
    transcribedAt,
  }
}

function job(status: LocalJob['status'], targetId?: string): LocalJob {
  return {
    id: `job-${status}-${targetId ?? 'notes'}`,
    lectureId: 'lecture-1',
    type: targetId ? 'transcribe-chunk' : 'generate-notes',
    targetId,
    status,
    attempts: 0,
    maxAttempts: 3,
    runAfter: createdAt,
    createdAt,
    updatedAt: createdAt,
  }
}

describe('local processing queue helpers', () => {
  it('creates transcription jobs only for pending chunks without active jobs', () => {
    expect(
      createTranscriptionJobs([chunk('chunk-1'), chunk('chunk-2', createdAt)], [job('queued', 'chunk-1')], createdAt),
    ).toEqual([])
    expect(createTranscriptionJobs([chunk('chunk-1')], [job('error', 'chunk-1')], createdAt)).toEqual([])
    expect(createTranscriptionJobs([chunk('chunk-1')], [job('done', 'chunk-1')], createdAt)).toMatchObject([
      {
        lectureId: 'lecture-1',
        type: 'transcribe-chunk',
        targetId: 'chunk-1',
        status: 'queued',
      },
    ])
  })

  it('creates one active notes job per lecture', () => {
    expect(createNotesJob('lecture-1', [job('running')], createdAt)).toBeUndefined()
    expect(createNotesJob('lecture-1', [job('error')], createdAt)).toBeUndefined()
    expect(createNotesJob('lecture-1', [job('done')], createdAt)).toMatchObject({
      lectureId: 'lecture-1',
      type: 'generate-notes',
      status: 'queued',
    })
  })

  it('summarizes status counts and calculates backoff windows', () => {
    expect(summarizeJobs([job('queued'), job('running'), job('done'), job('error')])).toEqual({
      queued: 1,
      running: 1,
      done: 1,
      error: 1,
    })
    expect(nextRunAfter(createdAt, 1)).toBe('2026-06-26T00:00:30.000Z')
    expect(nextRunAfter(createdAt, 6)).toBe('2026-06-26T00:15:00.000Z')
  })
})
