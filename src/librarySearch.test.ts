import { describe, expect, it } from 'vitest'
import type { Lecture, LectureNote, TranscriptSegment } from './domain'
import { searchLibrary } from './librarySearch'

const lectures: Lecture[] = [
  {
    id: 'lecture-1',
    courseId: 'course',
    title: 'Photosynthesis',
    status: 'ready',
    consentConfirmed: true,
    createdAt: '2026-06-26T00:00:00.000Z',
    updatedAt: '2026-06-26T00:00:00.000Z',
  },
  {
    id: 'lecture-2',
    courseId: 'course',
    title: 'Signal Processing',
    status: 'ready',
    consentConfirmed: true,
    createdAt: '2026-06-26T00:00:00.000Z',
    updatedAt: '2026-06-26T00:00:00.000Z',
  },
]

const segments: TranscriptSegment[] = [
  {
    id: 'seg-1',
    lectureId: 'lecture-1',
    index: 0,
    startMs: 0,
    endMs: 60_000,
    text: 'Chlorophyll absorbs light.',
    uncertain: false,
    createdAt: '2026-06-26T00:00:00.000Z',
  },
]

const notes: LectureNote[] = [
  {
    id: 'note-1',
    lectureId: 'lecture-2',
    model: 'gpt-test',
    summary: 'Sampling frequency was covered.',
    outline: [],
    keyPoints: ['Nyquist describes the minimum sampling rate.'],
    definitions: [],
    openQuestions: [],
    reviewTasks: [],
    flashcards: [],
    citations: [],
    createdAt: '2026-06-26T00:00:00.000Z',
  },
]

describe('library search', () => {
  it('returns all lectures without matches for an empty query', () => {
    expect(searchLibrary(lectures, segments, notes, '')).toHaveLength(2)
  })

  it('matches lecture titles, transcripts, and notes case-insensitively', () => {
    expect(searchLibrary(lectures, segments, notes, 'photo')[0].lecture.id).toBe('lecture-1')
    expect(searchLibrary(lectures, segments, notes, 'chlorophyll')[0].matches[0]).toContain('Transcript')
    expect(searchLibrary(lectures, segments, notes, 'nyquist')[0].lecture.id).toBe('lecture-2')
  })

  it('returns no results when no local content matches', () => {
    expect(searchLibrary(lectures, segments, notes, 'mitosis')).toEqual([])
  })
})
