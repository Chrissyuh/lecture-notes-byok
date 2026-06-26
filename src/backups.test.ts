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
        materials: [
          {
            name: 'cell-slides.txt',
            kind: 'text',
            mimeType: 'text/plain',
            sizeBytes: 120,
            searchableText: 'Cell membrane slide text',
            linkedSegmentIds: ['old-seg'],
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
        cardReviews: [
          {
            noteId: 'old-note',
            cardId: 'old-note-0',
            correctCount: 2,
            missedCount: 1,
            lastReviewedAt: '2026-06-26T00:30:00.000Z',
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
    expect(prepared.cardReviews[0]).toMatchObject({
      lectureId: prepared.lecture.id,
      noteId: prepared.notes[0].id,
      cardId: `${prepared.notes[0].id}-0`,
      correctCount: 2,
      missedCount: 1,
      lastReviewedAt: '2026-06-26T00:30:00.000Z',
    })
    expect(prepared.materials[0]).toMatchObject({
      lectureId: prepared.lecture.id,
      name: 'cell-slides.txt',
      kind: 'text',
      mimeType: 'text/plain',
      sizeBytes: 120,
      searchableText: 'Cell membrane slide text',
      linkedSegmentIds: [prepared.segments[0].id],
    })
    expect(prepared.materials[0].blob.size).toBe(0)
  })

  it('rejects malformed backup payloads', () => {
    expect(() => prepareLectureBackupImport({ lecture: { title: '' }, segments: [], notes: [] })).toThrow()
  })
})
