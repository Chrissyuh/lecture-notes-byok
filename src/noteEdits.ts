import type { LectureNote } from './domain'

export interface EditableNoteDraft {
  summary: string
  outline: string
  keyPoints: string
  definitions: string
  openQuestions: string
  reviewTasks: string
}

export function listToEditableText(values: string[]) {
  return values.join('\n')
}

export function editableTextToList(value: string) {
  return value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

export function noteToEditableDraft(note: LectureNote): EditableNoteDraft {
  return {
    summary: note.summary,
    outline: listToEditableText(note.outline),
    keyPoints: listToEditableText(note.keyPoints),
    definitions: listToEditableText(note.definitions),
    openQuestions: listToEditableText(note.openQuestions),
    reviewTasks: listToEditableText(note.reviewTasks),
  }
}

export function editableDraftToNotePatch(draft: EditableNoteDraft) {
  return {
    summary: draft.summary.trim(),
    outline: editableTextToList(draft.outline),
    keyPoints: editableTextToList(draft.keyPoints),
    definitions: editableTextToList(draft.definitions),
    openQuestions: editableTextToList(draft.openQuestions),
    reviewTasks: editableTextToList(draft.reviewTasks),
  }
}

export function hasNoteDraftChanges(note: LectureNote | undefined, draft: EditableNoteDraft | undefined) {
  if (!note || !draft) return false
  const patch = editableDraftToNotePatch(draft)
  return (
    patch.summary !== note.summary ||
    patch.outline.join('\n') !== note.outline.join('\n') ||
    patch.keyPoints.join('\n') !== note.keyPoints.join('\n') ||
    patch.definitions.join('\n') !== note.definitions.join('\n') ||
    patch.openQuestions.join('\n') !== note.openQuestions.join('\n') ||
    patch.reviewTasks.join('\n') !== note.reviewTasks.join('\n')
  )
}

export function hasValidNoteDraft(draft: EditableNoteDraft | undefined) {
  return Boolean(draft?.summary.trim())
}
