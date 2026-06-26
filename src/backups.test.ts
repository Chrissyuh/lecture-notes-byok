import { describe, expect, it } from 'vitest'
import { prepareLectureBackupImport } from './backups'

describe('lecture backup import', () => {
  it('prepares an exported lecture backup with fresh local ids', () => {
    const prepared = prepareLectureBackupImport(
      {
        lecture: {
          id: 'old-lecture',
          title: 'Biology 101',
          consentConfirmed: true,
        },
        segments: [
          {
            id: 'old-seg',
            index: 0,
            startMs: 0,
            endMs: 60_000,
            speaker: 'Instructor',
            text: 'Cells have membranes.',
            uncertain: false,
          },
        ],
        notes: [
          {
            id: 'old-note',
            model: 'gpt-test',
            summary: 'Cell membranes were discussed.',
            outline: ['Cells'],
            keyPoints: ['Cells have membranes.'],
            definitions: [],
            openQuestions: [],
            reviewTasks: [],
            flashcards: [],
            citations: [{ label: 'Cells', segmentIds: ['seg-0'] }],
          },
        ],
      },
      'course_default',
      '2026-06-26T00:00:00.000Z',
    )

    expect(prepared.lecture.id).not.toBe('old-lecture')
    expect(prepared.lecture.title).toBe('Biology 101 (imported)')
    expect(prepared.segments).toHaveLength(1)
    expect(prepared.segments[0].lectureId).toBe(prepared.lecture.id)
    expect(prepared.segments[0].speaker).toBe('Instructor')
    expect(prepared.notes[0].lectureId).toBe(prepared.lecture.id)
    expect(prepared.notes[0].citations[0].segmentIds[0]).toBe(prepared.segments[0].id)
  })

  it('rejects malformed backup payloads', () => {
    expect(() => prepareLectureBackupImport({ lecture: { title: '' }, segments: [], notes: [] })).toThrow()
  })
})
