import { describe, expect, it } from 'vitest'
import type { LectureNote } from './domain'
import {
  editableDraftToNotePatch,
  editableTextToList,
  hasNoteDraftChanges,
  hasValidNoteDraft,
  noteToEditableDraft,
} from './noteEdits'

const note: LectureNote = {
  id: 'note-1',
  lectureId: 'lecture-1',
  model: 'gpt-test',
  summary: 'Original summary',
  outline: ['Intro', 'Details'],
  keyPoints: ['Point one'],
  definitions: ['Term: definition'],
  openQuestions: [],
  reviewTasks: ['Review point one'],
  flashcards: [],
  citations: [],
  createdAt: '2026-06-26T00:00:00.000Z',
}

describe('note edit helpers', () => {
  it('converts newline text into trimmed note lists', () => {
    expect(editableTextToList(' First\n\nSecond \r\n Third ')).toEqual(['First', 'Second', 'Third'])
  })

  it('round-trips a note into an editable draft and patch', () => {
    const draft = noteToEditableDraft(note)
    const patch = editableDraftToNotePatch(draft)

    expect(patch).toMatchObject({
      summary: note.summary,
      outline: note.outline,
      keyPoints: note.keyPoints,
      reviewTasks: note.reviewTasks,
    })
  })

  it('detects changed and invalid drafts', () => {
    const draft = noteToEditableDraft(note)
    expect(hasNoteDraftChanges(note, draft)).toBe(false)

    draft.summary = 'Updated summary'
    expect(hasNoteDraftChanges(note, draft)).toBe(true)

    draft.summary = '   '
    expect(hasValidNoteDraft(draft)).toBe(false)
  })
})
