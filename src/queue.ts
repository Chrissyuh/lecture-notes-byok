import type { AudioChunk, LocalJob, LocalJobStatus } from './domain'
import { newId } from './domain'

export interface QueueSummary {
  queued: number
  running: number
  done: number
  error: number
}

export function summarizeJobs(jobs: LocalJob[]): QueueSummary {
  return jobs.reduce(
    (summary, job) => ({ ...summary, [job.status]: summary[job.status] + 1 }),
    { queued: 0, running: 0, done: 0, error: 0 } satisfies QueueSummary,
  )
}

export function retryDelayMs(attempts: number) {
  return Math.min(15 * 60_000, 2 ** Math.max(0, attempts - 1) * 30_000)
}

export function nextRunAfter(nowIso: string, attempts: number) {
  return new Date(new Date(nowIso).getTime() + retryDelayMs(attempts)).toISOString()
}

export function jobBlocksDuplicate(job: LocalJob) {
  return job.status !== 'done'
}

export function createTranscriptionJobs(chunks: AudioChunk[], existingJobs: LocalJob[], createdAt: string) {
  const activeTargets = new Set(
    existingJobs
      .filter((job) => job.type === 'transcribe-chunk' && job.targetId && jobBlocksDuplicate(job))
      .map((job) => job.targetId),
  )

  return chunks
    .filter((chunk) => !chunk.transcribedAt && !activeTargets.has(chunk.id))
    .map(
      (chunk) =>
        ({
          id: newId('job'),
          lectureId: chunk.lectureId,
          type: 'transcribe-chunk',
          targetId: chunk.id,
          status: 'queued',
          attempts: 0,
          maxAttempts: 3,
          runAfter: createdAt,
          createdAt,
          updatedAt: createdAt,
        }) satisfies LocalJob,
    )
}

export function createNotesJob(lectureId: string, existingJobs: LocalJob[], createdAt: string) {
  const alreadyActive = existingJobs.some((job) => job.type === 'generate-notes' && jobBlocksDuplicate(job))
  if (alreadyActive) return undefined

  return {
    id: newId('job'),
    lectureId,
    type: 'generate-notes',
    status: 'queued',
    attempts: 0,
    maxAttempts: 2,
    runAfter: createdAt,
    createdAt,
    updatedAt: createdAt,
  } satisfies LocalJob
}

export function runnableJobStatuses(): LocalJobStatus[] {
  return ['queued', 'error']
}
