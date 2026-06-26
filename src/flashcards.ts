import type { LectureNote } from './domain'

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
