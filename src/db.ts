import Dexie, { type Table } from 'dexie'
import {
  DEFAULT_PROVIDER,
  DEFAULT_SETTINGS,
  type AppSettings,
  type AudioChunk,
  type Course,
  type Lecture,
  type LectureNote,
  type ProviderProfile,
  type TranscriptSegment,
} from './domain'

class LectureNotesDb extends Dexie {
  courses!: Table<Course, string>
  lectures!: Table<Lecture, string>
  chunks!: Table<AudioChunk, string>
  segments!: Table<TranscriptSegment, string>
  notes!: Table<LectureNote, string>
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
  }
}

export const db = new LectureNotesDb()

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
  await db.transaction('rw', db.lectures, db.chunks, db.segments, db.notes, async () => {
    await db.lectures.delete(lectureId)
    await db.chunks.where('lectureId').equals(lectureId).delete()
    await db.segments.where('lectureId').equals(lectureId).delete()
    await db.notes.where('lectureId').equals(lectureId).delete()
  })
}
