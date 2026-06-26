import type { FlashcardReview, LectureNote } from './domain'

export interface StudyCard {
  id: string
  front: string
  back: string
}

export function studyCardsFromNote(note: LectureNote | undefined): StudyCard[] {
  if (!note) return []
  return note.flashcards
    .map((card, index) => ({
      id: `${note.id}-${index}`,
      front: card.front.trim(),
      back: card.back.trim(),
    }))
    .filter((card) => card.front.length > 0 && card.back.length > 0)
}

export function wrappedCardIndex(currentIndex: number, delta: number, total: number) {
  if (total <= 0) return 0
  return (currentIndex + delta + total) % total
}

export function reviewForCard(cardId: string, reviews: FlashcardReview[]) {
  return reviews.find((review) => review.cardId === cardId)
}

export function reviewLabel(review: FlashcardReview | undefined) {
  if (!review) return 'Not reviewed'
  return `${review.correctCount} known / ${review.missedCount} missed`
}

export function nextReviewCounts(review: FlashcardReview | undefined, remembered: boolean) {
  return {
    correctCount: (review?.correctCount ?? 0) + (remembered ? 1 : 0),
    missedCount: (review?.missedCount ?? 0) + (remembered ? 0 : 1),
  }
}
