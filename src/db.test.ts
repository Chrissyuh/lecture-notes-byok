import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, deleteAllLectureData, deleteLectureCascade, ensureBootstrapData, getLocalDataStats } from './db'
import type { AudioChunk, Lecture, LectureNote, TranscriptSegment } from './domain'

describe('local database', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('bootstraps default settings, provider, and course', async () => {
    await ensureBootstrapData()

    await expect(db.settings.get('settings')).resolves.toMatchObject({
      id: 'settings',
      activeProvider: 'openai',
      activeCourseId: 'course_default',
    })
    await expect(db.providers.get('openai')).resolves.toMatchObject({
      id: 'openai',
      transcribeModel: 'gpt-4o-mini-transcribe',
    })
    await expect(db.courses.get('course_default')).resolves.toMatchObject({
      title: 'General lectures',
    })
  })

  it('deletes lecture-owned chunks, segments, and notes together', async () => {
    const createdAt = '2026-06-26T00:00:00.000Z'
    const lecture: Lecture = {
      id: 'lecture-1',
      courseId: 'course_default',
      title: 'Cascade test',
      status: 'ready',
      consentConfirmed: true,
      createdAt,
      updatedAt: createdAt,
    }
    const chunk: AudioChunk = {
      id: 'chunk-1',
      lectureId: lecture.id,
      index: 0,
      blob: new Blob(['audio']),
      mimeType: 'audio/webm',
      source: 'recording',
      sizeBytes: 5,
      durationMs: 60_000,
      createdAt,
    }
    const segment: TranscriptSegment = {
      id: 'seg-1',
      lectureId: lecture.id,
      chunkId: chunk.id,
      index: 0,
      startMs: 0,
      endMs: 60_000,
      text: 'Hello lecture',
      uncertain: false,
      createdAt,
    }
    const note: LectureNote = {
      id: 'note-1',
      lectureId: lecture.id,
      model: 'gpt-test',
      summary: 'Hello',
      outline: [],
      keyPoints: [],
      definitions: [],
      openQuestions: [],
      reviewTasks: [],
      flashcards: [],
      citations: [],
      createdAt,
    }

    await db.lectures.put(lecture)
    await db.chunks.put(chunk)
    await db.segments.put(segment)
    await db.notes.put(note)

    await deleteLectureCascade(lecture.id)

    await expect(db.lectures.count()).resolves.toBe(0)
    await expect(db.chunks.count()).resolves.toBe(0)
    await expect(db.segments.count()).resolves.toBe(0)
    await expect(db.notes.count()).resolves.toBe(0)
  })

  it('reports and clears local lecture data without deleting provider settings', async () => {
    await ensureBootstrapData()
    const createdAt = '2026-06-26T00:00:00.000Z'
    const lecture: Lecture = {
      id: 'lecture-1',
      courseId: 'course_default',
      title: 'Stats test',
      status: 'ready',
      consentConfirmed: true,
      createdAt,
      updatedAt: createdAt,
    }

    await db.lectures.put(lecture)
    await db.chunks.put({
      id: 'chunk-1',
      lectureId: lecture.id,
      index: 0,
      blob: new Blob(['audio']),
      mimeType: 'audio/webm',
      source: 'recording',
      sizeBytes: 5,
      durationMs: 60_000,
      createdAt,
    })
    await db.segments.put({
      id: 'seg-1',
      lectureId: lecture.id,
      index: 0,
      startMs: 0,
      endMs: 60_000,
      text: 'Hello',
      uncertain: false,
      createdAt,
    })

    await expect(getLocalDataStats()).resolves.toMatchObject({
      lectures: 1,
      audioChunks: 1,
      transcriptSegments: 1,
      notes: 0,
      audioBytes: 5,
    })

    await deleteAllLectureData()

    await expect(getLocalDataStats()).resolves.toMatchObject({
      lectures: 0,
      audioChunks: 0,
      transcriptSegments: 0,
      notes: 0,
      audioBytes: 0,
    })
    await expect(db.providers.get('openai')).resolves.toMatchObject({ id: 'openai' })
  })
})
