import { z } from 'zod'
import { newId, type Lecture, type LectureNote, type TranscriptSegment } from './domain'

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
      index: z.number(),
      startMs: z.number(),
      endMs: z.number(),
      text: z.string(),
      uncertain: z.boolean().optional(),
      createdAt: z.string().optional(),
      editedAt: z.string().optional(),
    }),
  ),
  notes: z.array(
    z.object({
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
})

export interface PreparedLectureBackup {
  lecture: Lecture
  segments: TranscriptSegment[]
  notes: LectureNote[]
}

export function prepareLectureBackupImport(raw: unknown, courseId = 'course_default', importedAt = new Date().toISOString()) {
  const parsed = lectureBackupSchema.parse(raw)
  const lectureId = newId('lecture')
  const segmentIdMap = new Map<string, string>()

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
      segmentIdMap.set(`seg-${segment.index}`, id)
      return {
        id,
        lectureId,
        index,
        startMs: segment.startMs,
        endMs: segment.endMs,
        text: segment.text.trim(),
        uncertain: Boolean(segment.uncertain),
        createdAt: segment.createdAt ?? importedAt,
        editedAt: segment.editedAt,
      }
    })
    .filter((segment) => segment.text.length > 0)

  const notes: LectureNote[] = parsed.notes.map((note) => ({
    id: newId('note'),
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
  }))

  return { lecture, segments, notes } satisfies PreparedLectureBackup
}

export function parseLectureBackupJson(json: string) {
  return prepareLectureBackupImport(JSON.parse(json))
}
