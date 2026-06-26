import { describe, expect, it } from 'vitest'
import type { Lecture, LectureNote, TranscriptSegment } from './domain'
import { flashcardsToCsv, noteToMarkdown } from './exporters'

const lecture: Lecture = {
  id: 'lecture-1',
  courseId: 'course-1',
  title: 'Signal Processing',
  status: 'ready',
  consentConfirmed: true,
  createdAt: '2026-06-26T00:00:00.000Z',
  updatedAt: '2026-06-26T00:00:00.000Z',
}

const segments: TranscriptSegment[] = [
  {
    id: 'seg-1',
    lectureId: lecture.id,
    index: 0,
    startMs: 0,
    endMs: 60_000,
    speaker: 'Instructor',
    text: 'Sampling turns a continuous signal into discrete observations.',
    uncertain: false,
    createdAt: lecture.createdAt,
  },
]

const note: LectureNote = {
  id: 'note-1',
  lectureId: lecture.id,
  model: 'gpt-test',
  summary: 'Sampling was introduced.',
  outline: ['Sampling theorem'],
  keyPoints: ['Sampling creates discrete observations.'],
  definitions: ['Sampling: measuring a signal at intervals.'],
  openQuestions: ['What happens below Nyquist?'],
  reviewTasks: ['Derive the Nyquist limit.'],
  flashcards: [{ front: 'What is sampling?', back: 'Measuring a signal at intervals.' }],
  citations: [{ label: 'Sampling intro', segmentIds: ['seg-1'] }],
  createdAt: lecture.createdAt,
}

describe('exporters', () => {
  it('exports notes and timestamped transcript to markdown', () => {
    const markdown = noteToMarkdown(lecture, segments, note)

    expect(markdown).toContain('# Signal Processing')
    expect(markdown).toContain('## Summary')
    expect(markdown).toContain('Sampling was introduced.')
    expect(markdown).toContain('- 0s [seg-1] Instructor: Sampling turns a continuous signal')
  })

  it('exports flashcards as escaped CSV', () => {
    expect(flashcardsToCsv(note)).toBe('"What is sampling?","Measuring a signal at intervals."')
  })
})
