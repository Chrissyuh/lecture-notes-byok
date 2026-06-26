import { describe, expect, it } from 'vitest'
import type { LectureNote } from './domain'
import { studyCardsFromNote, wrappedCardIndex } from './flashcards'

const note: LectureNote = {
  id: 'note-1',
  lectureId: 'lecture-1',
  model: 'gpt-test',
  summary: 'Summary',
  outline: [],
  keyPoints: [],
  definitions: [],
  openQuestions: [],
  reviewTasks: [],
  flashcards: [
    { front: '  What is entropy? ', back: ' Disorder. ' },
    { front: '', back: 'Ignored' },
  ],
  citations: [],
  createdAt: '2026-06-26T00:00:00.000Z',
}

describe('flashcard study helpers', () => {
  it('extracts valid trimmed study cards from the newest note', () => {
    expect(studyCardsFromNote(note)).toEqual([
      {
        id: 'note-1-0',
        front: 'What is entropy?',
        back: 'Disorder.',
      },
    ])
  })

  it('wraps card navigation indexes', () => {
    expect(wrappedCardIndex(0, -1, 3)).toBe(2)
    expect(wrappedCardIndex(2, 1, 3)).toBe(0)
    expect(wrappedCardIndex(0, 1, 0)).toBe(0)
  })
})
