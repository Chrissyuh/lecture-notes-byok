import { z } from 'zod'
import { newId, type FlashcardReview, type Lecture, type LectureMaterial, type LectureNote, type TranscriptSegment } from './domain'

const lectureBackupSchema = z.object({
  lecture: z.object({
    title: z.string().min(1),
    status: z.string().optional(),
    consentConfirmed: z.boolean().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  }),
  segments: z.array(
    z.object({
      id: z.string().optional(),
      index: z.number(),
      startMs: z.number(),
      endMs: z.number(),
      speaker: z.string().optional(),
      text: z.string(),
      uncertain: z.boolean().optional(),
      createdAt: z.string().optional(),
      editedAt: z.string().optional(),
    }),
  ),
  materials: z
    .array(
      z.object({
        name: z.string().min(1),
        kind: z.enum(['pdf', 'slides', 'image', 'text', 'other']).default('other'),
        mimeType: z.string().optional(),
        sizeBytes: z.number().optional(),
        searchableText: z.string().optional(),
        linkedSegmentIds: z.array(z.string()).default([]),
        createdAt: z.string().optional(),
      }),
    )
    .default([]),
  notes: z.array(
    z.object({
      id: z.string().optional(),
      model: z.string(),
      summary: z.string(),
      outline: z.array(z.string()).default([]),
      keyPoints: z.array(z.string()).default([]),
      definitions: z.array(z.string()).default([]),
      openQuestions: z.array(z.string()).default([]),
      reviewTasks: z.array(z.string()).default([]),
      flashcards: z.array(z.object({ front: z.string(), back: z.string() })).default([]),
      citations: z.array(z.object({ label: z.string(), segmentIds: z.array(z.string()) })).default([]),
      createdAt: z.string().optional(),
      editedAt: z.string().optional(),
    }),
  ),
  cardReviews: z
    .array(
      z.object({
        noteId: z.string(),
        cardId: z.string(),
        correctCount: z.number().default(0),
        missedCount: z.number().default(0),
        lastReviewedAt: z.string().optional(),
      }),
    )
    .default([]),
})

export interface PreparedLectureBackup {
  lecture: Lecture
  segments: TranscriptSegment[]
  notes: LectureNote[]
  materials: LectureMaterial[]
  cardReviews: FlashcardReview[]
}

export function prepareLectureBackupImport(raw: unknown, courseId = 'course_default', importedAt = new Date().toISOString()) {
  const parsed = lectureBackupSchema.parse(raw)
  const lectureId = newId('lecture')
  const segmentIdMap = new Map<string, string>()
  const noteIdMap = new Map<string, string>()

  const lecture: Lecture = {
    id: lectureId,
    courseId,
    title: `${parsed.lecture.title} (imported)`,
    status: parsed.segments.length ? 'ready' : 'draft',
    consentConfirmed: Boolean(parsed.lecture.consentConfirmed),
    createdAt: importedAt,
    updatedAt: importedAt,
  }

  const segments: TranscriptSegment[] = parsed.segments
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((segment, index) => {
      const id = newId('seg')
      if (segment.id) segmentIdMap.set(segment.id, id)
      segmentIdMap.set(`seg-${segment.index}`, id)
      return {
        id,
        lectureId,
        index,
        startMs: segment.startMs,
        endMs: segment.endMs,
        speaker: segment.speaker?.trim() || undefined,
        text: segment.text.trim(),
        uncertain: Boolean(segment.uncertain),
        createdAt: segment.createdAt ?? importedAt,
        editedAt: segment.editedAt,
      }
    })
    .filter((segment) => segment.text.length > 0)

  const materials: LectureMaterial[] = parsed.materials.map((material) => {
    const searchableText = material.searchableText?.trim()
    return {
      id: newId('material'),
      lectureId,
      name: material.name.trim(),
      kind: material.kind,
      mimeType: material.mimeType ?? 'application/octet-stream',
      blob: new Blob([]),
      sizeBytes: material.sizeBytes ?? 0,
      searchableText: searchableText || undefined,
      linkedSegmentIds: material.linkedSegmentIds.map((id) => segmentIdMap.get(id) ?? id),
      createdAt: material.createdAt ?? importedAt,
    }
  })

  const notes: LectureNote[] = parsed.notes.map((note, index) => {
    const id = newId('note')
    if (note.id) noteIdMap.set(note.id, id)
    noteIdMap.set(`note-${index}`, id)
    return {
      id,
      lectureId,
      model: note.model,
      summary: note.summary.trim(),
      outline: note.outline,
      keyPoints: note.keyPoints,
      definitions: note.definitions,
      openQuestions: note.openQuestions,
      reviewTasks: note.reviewTasks,
      flashcards: note.flashcards,
      citations: note.citations.map((citation) => ({
        label: citation.label,
        segmentIds: citation.segmentIds.map((id) => segmentIdMap.get(id) ?? id),
      })),
      createdAt: note.createdAt ?? importedAt,
      editedAt: note.editedAt,
    }
  })

  const cardReviews: FlashcardReview[] = parsed.cardReviews
    .map((review) => {
      const noteId = noteIdMap.get(review.noteId)
      if (!noteId) return undefined
      const cardIndex = review.cardId.startsWith(`${review.noteId}-`) ? review.cardId.slice(review.noteId.length + 1) : undefined
      return {
        id: newId('review'),
        lectureId,
        noteId,
        cardId: cardIndex ? `${noteId}-${cardIndex}` : review.cardId,
        correctCount: review.correctCount,
        missedCount: review.missedCount,
        lastReviewedAt: review.lastReviewedAt ?? importedAt,
      } satisfies FlashcardReview
    })
    .filter((review): review is FlashcardReview => Boolean(review))

  return { lecture, segments, notes, materials, cardReviews } satisfies PreparedLectureBackup
}

export function parseLectureBackupJson(json: string) {
  return prepareLectureBackupImport(JSON.parse(json))
}
