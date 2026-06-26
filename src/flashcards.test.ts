import { describe, expect, it } from 'vitest'
import type { FlashcardReview, LectureNote } from './domain'
import { nextReviewCounts, reviewForCard, reviewLabel, studyCardsFromNote, wrappedCardIndex } from './flashcards'

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

  it('summarizes and updates review progress', () => {
    const review: FlashcardReview = {
      id: 'review-1',
      lectureId: 'lecture-1',
      noteId: 'note-1',
      cardId: 'note-1-0',
      correctCount: 2,
      missedCount: 1,
      lastReviewedAt: '2026-06-26T00:00:00.000Z',
    }

    expect(reviewForCard('note-1-0', [review])).toBe(review)
    expect(reviewLabel(review)).toBe('2 known / 1 missed')
    expect(reviewLabel(undefined)).toBe('Not reviewed')
    expect(nextReviewCounts(review, true)).toEqual({ correctCount: 3, missedCount: 1 })
    expect(nextReviewCounts(review, false)).toEqual({ correctCount: 2, missedCount: 2 })
  })
})
