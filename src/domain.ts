export type ProviderId = 'openai'

export type LectureStatus = 'draft' | 'recording' | 'processing' | 'ready' | 'error'
export type LocalJobType = 'transcribe-chunk' | 'generate-notes'
export type LocalJobStatus = 'queued' | 'running' | 'done' | 'error'

export interface Course {
  id: string
  title: string
  createdAt: string
}

export interface Lecture {
  id: string
  courseId: string
  title: string
  status: LectureStatus
  consentConfirmed: boolean
  createdAt: string
  updatedAt: string
  startedAt?: string
  endedAt?: string
  error?: string
}

export interface AudioChunk {
  id: string
  lectureId: string
  index: number
  blob: Blob
  mimeType: string
  source: 'recording' | 'import'
  originalName?: string
  sizeBytes: number
  durationMs: number
  createdAt: string
  transcribedAt?: string
}

export interface TranscriptSegment {
  id: string
  lectureId: string
  chunkId?: string
  index: number
  startMs: number
  endMs: number
  text: string
  uncertain: boolean
  createdAt: string
  editedAt?: string
}

export interface LocalJob {
  id: string
  lectureId: string
  type: LocalJobType
  targetId?: string
  status: LocalJobStatus
  attempts: number
  maxAttempts: number
  runAfter: string
  createdAt: string
  updatedAt: string
  lastError?: string
}

export interface LectureNote {
  id: string
  lectureId: string
  model: string
  summary: string
  outline: string[]
  keyPoints: string[]
  definitions: string[]
  openQuestions: string[]
  reviewTasks: string[]
  flashcards: Array<{ front: string; back: string }>
  citations: Array<{ label: string; segmentIds: string[] }>
  createdAt: string
  editedAt?: string
}

export interface ProviderProfile {
  id: ProviderId
  apiKeyCiphertext?: string
  apiKeySalt?: string
  apiKeyIv?: string
  apiKeySession?: string
  transcribeModel: string
  notesModel: string
  rememberKey: boolean
  updatedAt: string
}

export interface AppSettings {
  id: 'settings'
  activeProvider: ProviderId
  activeCourseId?: string
  chunkSeconds: number
  updatedAt: string
}

export interface NoteDraft {
  summary: string
  outline: string[]
  keyPoints: string[]
  definitions: string[]
  openQuestions: string[]
  reviewTasks: string[]
  flashcards: Array<{ front: string; back: string }>
  citations: Array<{ label: string; segmentIds: string[] }>
}

export const DEFAULT_SETTINGS: AppSettings = {
  id: 'settings',
  activeProvider: 'openai',
  chunkSeconds: 60,
  updatedAt: new Date().toISOString(),
}

export const DEFAULT_PROVIDER: ProviderProfile = {
  id: 'openai',
  transcribeModel: 'gpt-4o-mini-transcribe',
  notesModel: 'gpt-5.4-mini',
  rememberKey: false,
  updatedAt: new Date().toISOString(),
}

export function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`
}
