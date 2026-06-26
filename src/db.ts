import Dexie, { type Table } from 'dexie'
import {
  DEFAULT_PROVIDER,
  DEFAULT_SETTINGS,
  type AppSettings,
  type AudioChunk,
  type Course,
  type Lecture,
  type LectureNote,
  type LocalJob,
  type ProviderProfile,
  type TranscriptSegment,
} from './domain'

class LectureNotesDb extends Dexie {
  courses!: Table<Course, string>
  lectures!: Table<Lecture, string>
  chunks!: Table<AudioChunk, string>
  segments!: Table<TranscriptSegment, string>
  notes!: Table<LectureNote, string>
  jobs!: Table<LocalJob, string>
  providers!: Table<ProviderProfile, string>
  settings!: Table<AppSettings, string>

  constructor() {
    super('lecture-notes-byok')
    this.version(1).stores({
      courses: 'id, createdAt',
      lectures: 'id, courseId, status, updatedAt',
      chunks: 'id, lectureId, index, transcribedAt',
      segments: 'id, lectureId, index',
      notes: 'id, lectureId, createdAt',
      providers: 'id',
      settings: 'id',
    })
    this.version(2).stores({
      courses: 'id, createdAt',
      lectures: 'id, courseId, status, updatedAt',
      chunks: 'id, lectureId, index, transcribedAt',
      segments: 'id, lectureId, index',
      notes: 'id, lectureId, createdAt',
      jobs: 'id, lectureId, type, status, runAfter, targetId',
      providers: 'id',
      settings: 'id',
    })
  }
}

export const db = new LectureNotesDb()

export interface LocalDataStats {
  lectures: number
  audioChunks: number
  transcriptSegments: number
  notes: number
  queuedJobs: number
  audioBytes: number
}

export async function ensureBootstrapData() {
  const now = new Date().toISOString()
  const settings = await db.settings.get('settings')
  if (!settings) {
    await db.settings.put({ ...DEFAULT_SETTINGS, updatedAt: now })
  }

  const provider = await db.providers.get('openai')
  if (!provider) {
    await db.providers.put({ ...DEFAULT_PROVIDER, updatedAt: now })
  }

  const courseCount = await db.courses.count()
  if (courseCount === 0) {
    const course: Course = {
      id: 'course_default',
      title: 'General lectures',
      createdAt: now,
    }
    await db.courses.put(course)
    await db.settings.update('settings', { activeCourseId: course.id, updatedAt: now })
  }
}

export async function deleteLectureCascade(lectureId: string) {
  await db.transaction('rw', db.lectures, db.chunks, db.segments, db.notes, db.jobs, async () => {
    await db.lectures.delete(lectureId)
    await db.chunks.where('lectureId').equals(lectureId).delete()
    await db.segments.where('lectureId').equals(lectureId).delete()
    await db.notes.where('lectureId').equals(lectureId).delete()
    await db.jobs.where('lectureId').equals(lectureId).delete()
  })
}

export async function getLocalDataStats(): Promise<LocalDataStats> {
  const [lectures, audioChunks, transcriptSegments, notes, queuedJobs, chunks] = await Promise.all([
    db.lectures.count(),
    db.chunks.count(),
    db.segments.count(),
    db.notes.count(),
    db.jobs.where('status').anyOf(['queued', 'running', 'error']).count(),
    db.chunks.toArray(),
  ])

  return {
    lectures,
    audioChunks,
    transcriptSegments,
    notes,
    queuedJobs,
    audioBytes: chunks.reduce((total, chunk) => total + (chunk.sizeBytes || chunk.blob.size || 0), 0),
  }
}

export async function deleteAllLectureData() {
  await db.transaction('rw', db.lectures, db.chunks, db.segments, db.notes, db.jobs, async () => {
    await Promise.all([db.lectures.clear(), db.chunks.clear(), db.segments.clear(), db.notes.clear(), db.jobs.clear()])
  })
}
