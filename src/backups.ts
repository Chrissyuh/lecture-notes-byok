import { z } from 'zod'
import { newId, type Lecture, type LectureMaterial, type LectureNote, type TranscriptSegment } from './domain'

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
  materials: LectureMaterial[]
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

  return { lecture, segments, notes, materials } satisfies PreparedLectureBackup
}

export function parseLectureBackupJson(json: string) {
  return prepareLectureBackupImport(JSON.parse(json))
}
