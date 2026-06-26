import {
  BookOpen,
  Download,
  FileText,
  KeyRound,
  Mic,
  Play,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Square,
  Upload,
  RotateCcw,
  Trash2,
  WandSparkles,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { buildImportedAudioChunks, chunkLimitLabel } from './audioChunks'
import { prepareLectureBackupImport } from './backups'
import { activeCourseId, createCourseDraft, filterLecturesByCourse } from './courses'
import { decryptSecret, encryptSecret } from './cryptoBox'
import {
  db,
  deleteAllLectureData,
  deleteLectureCascade,
  ensureBootstrapData,
  getLocalDataStats,
  type LocalDataStats,
} from './db'
import {
  DEFAULT_PROVIDER,
  newId,
  type AudioChunk,
  type AppSettings,
  type Course,
  type Lecture,
  type LectureMaterial,
  type LectureNote,
  type LocalJob,
  type ProviderProfile,
  type TranscriptSegment,
} from './domain'
import { searchLibrary, type LibrarySearchResult } from './librarySearch'
import { downloadText, flashcardsToCsv, noteToMarkdown } from './exporters'
import { studyCardsFromNote, wrappedCardIndex } from './flashcards'
import {
  editableDraftToNotePatch,
  hasNoteDraftChanges,
  hasValidNoteDraft,
  noteToEditableDraft,
  type EditableNoteDraft,
} from './noteEdits'
import { generateNotesWithOpenAi, transcribeWithOpenAi, validateOpenAiKey } from './openaiProvider'
import { createNotesJob, createTranscriptionJobs, nextRunAfter, summarizeJobs } from './queue'
import { buildLectureMaterial, updateMaterialText } from './materials'
import { findChangedTranscriptSegments, hasEmptyTranscriptDraft } from './transcript'

type ActiveTab = 'capture' | 'notes' | 'library' | 'settings'

function now() {
  return new Date().toISOString()
}

function msLabel(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = `${total % 60}`.padStart(2, '0')
  return `${minutes}:${seconds}`
}

function fileSafe(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'lecture'
}

function bytesLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function App() {
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const startedAtRef = useRef<number>(0)
  const chunkIndexRef = useRef<number>(0)
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState<ActiveTab>('capture')
  const [courses, setCourses] = useState<Course[]>([])
  const [settings, setSettings] = useState<AppSettings>()
  const [lectures, setLectures] = useState<Lecture[]>([])
  const [selectedLectureId, setSelectedLectureId] = useState<string>()
  const [chunks, setChunks] = useState<AudioChunk[]>([])
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [notes, setNotes] = useState<LectureNote[]>([])
  const [materials, setMaterials] = useState<LectureMaterial[]>([])
  const [jobs, setJobs] = useState<LocalJob[]>([])
  const [provider, setProvider] = useState<ProviderProfile>(DEFAULT_PROVIDER)
  const [sessionKey, setSessionKey] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [status, setStatus] = useState('Local workspace ready.')
  const [courseTitle, setCourseTitle] = useState('')
  const [lectureTitle, setLectureTitle] = useState('New lecture')
  const [consentConfirmed, setConsentConfirmed] = useState(false)
  const [manualTranscript, setManualTranscript] = useState('')
  const [importingAudio, setImportingAudio] = useState(false)
  const [importingBackup, setImportingBackup] = useState(false)
  const [importingMaterials, setImportingMaterials] = useState(false)
  const [materialTextDrafts, setMaterialTextDrafts] = useState<Record<string, string>>({})
  const [processingQueue, setProcessingQueue] = useState(false)
  const [segmentDrafts, setSegmentDrafts] = useState<Record<string, string>>({})
  const [speakerDrafts, setSpeakerDrafts] = useState<Record<string, string>>({})
  const [noteDraft, setNoteDraft] = useState<EditableNoteDraft>()
  const [studyCardIndex, setStudyCardIndex] = useState(0)
  const [showStudyAnswer, setShowStudyAnswer] = useState(false)
  const [libraryQuery, setLibraryQuery] = useState('')
  const [libraryResults, setLibraryResults] = useState<LibrarySearchResult[]>([])
  const [localStats, setLocalStats] = useState<LocalDataStats>({
    lectures: 0,
    audioChunks: 0,
    transcriptSegments: 0,
    notes: 0,
    materials: 0,
    queuedJobs: 0,
    audioBytes: 0,
    materialBytes: 0,
  })

  useEffect(() => {
    void ensureBootstrapData().then(() => setReady(true))
  }, [])

  useEffect(() => {
    if (!ready) return
    const subscriptions = [
      db.courses.orderBy('createdAt').toArray().then(setCourses),
      db.settings.get('settings').then(setSettings),
      db.lectures.orderBy('updatedAt').reverse().toArray().then(setLectures),
      db.providers.get('openai').then((value) => value && setProvider(value)),
    ]
    void Promise.all(subscriptions)
  }, [ready])

  const selectedCourseId = activeCourseId(settings, courses)
  const selectedCourse = courses.find((course) => course.id === selectedCourseId)
  const courseLectures = useMemo(() => filterLecturesByCourse(lectures, selectedCourseId), [lectures, selectedCourseId])

  useEffect(() => {
    if (courseLectures.length === 0) {
      if (selectedLectureId) setSelectedLectureId(undefined)
      return
    }
    if (!selectedLectureId || !courseLectures.some((lecture) => lecture.id === selectedLectureId)) {
      setSelectedLectureId(courseLectures[0].id)
    }
  }, [courseLectures, selectedLectureId])

  useEffect(() => {
    if (!selectedLectureId) return
    void refreshLectureData(selectedLectureId)
  }, [selectedLectureId])

  useEffect(() => {
    if (!ready) return
    if (!libraryQuery.trim()) {
      setLibraryResults(searchLibrary(courseLectures, [], [], ''))
      return
    }

    let cancelled = false
    void Promise.all([db.segments.toArray(), db.notes.toArray()]).then(([allSegments, allNotes]) => {
      if (!cancelled) setLibraryResults(searchLibrary(courseLectures, allSegments, allNotes, libraryQuery))
    })
    return () => {
      cancelled = true
    }
  }, [ready, courseLectures, libraryQuery])

  const selectedLecture = lectures.find((lecture) => lecture.id === selectedLectureId)
  const latestNote = notes[0]
  const studyCards = useMemo(() => studyCardsFromNote(latestNote), [latestNote])
  const activeStudyCard = studyCards[studyCardIndex]
  const queueSummary = useMemo(() => summarizeJobs(jobs), [jobs])
  const segmentLabelById = useMemo(
    () =>
      Object.fromEntries(
        segments.map((segment) => [
          segment.id,
          `Segment ${segment.index + 1} (${msLabel(segment.startMs)})`,
        ]),
      ),
    [segments],
  )
  const hasTranscriptEdits = useMemo(
    () => findChangedTranscriptSegments(segments, segmentDrafts, speakerDrafts).length > 0,
    [segments, segmentDrafts, speakerDrafts],
  )
  const hasNoteEdits = useMemo(() => hasNoteDraftChanges(latestNote, noteDraft), [latestNote, noteDraft])
  const hasEncryptedKey = Boolean(provider.apiKeyCiphertext && provider.apiKeySalt && provider.apiKeyIv)

  useEffect(() => {
    setStudyCardIndex(0)
    setShowStudyAnswer(false)
  }, [latestNote?.id])

  async function refreshLists() {
    setCourses(await db.courses.orderBy('createdAt').toArray())
    setSettings(await db.settings.get('settings'))
    setLectures(await db.lectures.orderBy('updatedAt').reverse().toArray())
    const nextProvider = await db.providers.get('openai')
    if (nextProvider) setProvider(nextProvider)
    setLocalStats(await getLocalDataStats())
  }

  async function refreshLectureData(lectureId: string) {
    const [nextChunks, nextSegments, nextNotes, nextMaterials, nextJobs] = await Promise.all([
      db.chunks.where('lectureId').equals(lectureId).sortBy('index'),
      db.segments.where('lectureId').equals(lectureId).sortBy('index'),
      db.notes.where('lectureId').equals(lectureId).reverse().sortBy('createdAt'),
      db.materials.where('lectureId').equals(lectureId).sortBy('createdAt'),
      db.jobs.where('lectureId').equals(lectureId).sortBy('createdAt'),
    ])
    const orderedNotes = nextNotes.reverse()
    setChunks(nextChunks)
    setSegments(nextSegments)
    setNotes(orderedNotes)
    setMaterials(nextMaterials)
    setJobs(nextJobs)
    setSegmentDrafts(Object.fromEntries(nextSegments.map((segment) => [segment.id, segment.text])))
    setSpeakerDrafts(Object.fromEntries(nextSegments.map((segment) => [segment.id, segment.speaker ?? ''])))
    setMaterialTextDrafts(Object.fromEntries(nextMaterials.map((material) => [material.id, material.searchableText ?? ''])))
    const newestNote = orderedNotes[0]
    setNoteDraft(newestNote ? noteToEditableDraft(newestNote) : undefined)
  }

  async function createLecture() {
    if (!selectedCourseId) {
      setStatus('Create a course before adding a lecture.')
      return
    }
    const createdAt = now()
    const lecture: Lecture = {
      id: newId('lecture'),
      courseId: selectedCourseId,
      title: lectureTitle.trim() || 'Untitled lecture',
      status: 'draft',
      consentConfirmed,
      createdAt,
      updatedAt: createdAt,
    }
    await db.lectures.put(lecture)
    setSelectedLectureId(lecture.id)
    setStatus('Lecture created.')
    await refreshLists()
  }

  async function createCourse() {
    try {
      const createdAt = now()
      const course = createCourseDraft(courseTitle, createdAt)
      await db.transaction('rw', db.courses, db.settings, async () => {
        await db.courses.put(course)
        await db.settings.update('settings', { activeCourseId: course.id, updatedAt: createdAt })
      })
      setCourseTitle('')
      setStatus(`Created course: ${course.title}.`)
      await refreshLists()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Course creation failed.')
    }
  }

  async function selectCourse(courseId: string) {
    await db.settings.update('settings', { activeCourseId: courseId, updatedAt: now() })
    setSelectedLectureId(undefined)
    await refreshLists()
  }

  async function startRecording() {
    if (!selectedLecture) return
    if (!selectedLecture.consentConfirmed) {
      setStatus('Confirm recording permission before starting capture.')
      return
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
    const recorder = new MediaRecorder(stream, { mimeType })
    streamRef.current = stream
    recorderRef.current = recorder
    startedAtRef.current = performance.now()
    chunkIndexRef.current = chunks.length

    recorder.ondataavailable = async (event) => {
      if (!event.data.size || !selectedLectureId) return
      const index = chunkIndexRef.current++
      const elapsed = performance.now() - startedAtRef.current
      const chunk: AudioChunk = {
        id: newId('chunk'),
        lectureId: selectedLectureId,
        index,
        blob: event.data,
        mimeType: event.data.type || mimeType,
        source: 'recording',
        sizeBytes: event.data.size,
        durationMs: elapsed,
        createdAt: now(),
      }
      await db.chunks.put(chunk)
      await refreshLectureData(selectedLectureId)
      setStatus(`Saved audio chunk ${index + 1}.`)
    }

    recorder.start(60_000)
    await db.lectures.update(selectedLecture.id, {
      status: 'recording',
      startedAt: selectedLecture.startedAt ?? now(),
      updatedAt: now(),
    })
    setStatus('Recording. Chunks are saved locally every minute.')
    await refreshLists()
  }

  async function stopRecording() {
    recorderRef.current?.requestData()
    recorderRef.current?.stop()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    recorderRef.current = null
    streamRef.current = null

    if (selectedLecture) {
      await db.lectures.update(selectedLecture.id, { status: 'processing', endedAt: now(), updatedAt: now() })
      await refreshLists()
    }
    setStatus('Recording stopped. Transcribe when ready.')
  }

  async function addManualTranscript() {
    if (!selectedLecture || !manualTranscript.trim()) return
    const existing = await db.segments.where('lectureId').equals(selectedLecture.id).count()
    const segment: TranscriptSegment = {
      id: newId('seg'),
      lectureId: selectedLecture.id,
      index: existing,
      startMs: existing * 60_000,
      endMs: (existing + 1) * 60_000,
      speaker: existing === 0 ? 'Instructor' : undefined,
      text: manualTranscript.trim(),
      uncertain: false,
      createdAt: now(),
    }
    await db.segments.put(segment)
    await db.lectures.update(selectedLecture.id, { status: 'ready', updatedAt: now() })
    setManualTranscript('')
    setStatus('Manual transcript segment added.')
    await refreshLists()
    await refreshLectureData(selectedLecture.id)
  }

  function updateNoteDraft(field: keyof EditableNoteDraft, value: string) {
    setNoteDraft((draft) => {
      if (draft) return { ...draft, [field]: value }
      if (!latestNote) return draft
      return { ...noteToEditableDraft(latestNote), [field]: value }
    })
  }

  async function saveNoteEdits() {
    if (!selectedLecture || !latestNote || !noteDraft) return
    if (!hasValidNoteDraft(noteDraft)) {
      setStatus('Notes need a non-empty summary before saving.')
      return
    }

    if (!hasNoteDraftChanges(latestNote, noteDraft)) {
      setStatus('No note edits to save.')
      return
    }

    const editedAt = now()
    await db.transaction('rw', db.notes, db.lectures, async () => {
      await db.notes.update(latestNote.id, {
        ...editableDraftToNotePatch(noteDraft),
        editedAt,
      } satisfies Partial<LectureNote>)
      await db.lectures.update(selectedLecture.id, { updatedAt: editedAt })
    })

    setStatus('Saved note edits.')
    await refreshLists()
    await refreshLectureData(selectedLecture.id)
  }

  function moveStudyCard(delta: number) {
    setStudyCardIndex((index) => wrappedCardIndex(index, delta, studyCards.length))
    setShowStudyAnswer(false)
  }

  async function importAudioFiles(files: FileList | null) {
    if (!selectedLecture || !files?.length) return

    setImportingAudio(true)
    try {
      let nextIndex = await db.chunks.where('lectureId').equals(selectedLecture.id).count()
      const createdAt = now()
      const imported: AudioChunk[] = []

      for (const file of Array.from(files)) {
        const fileChunks = buildImportedAudioChunks({
          lectureId: selectedLecture.id,
          file,
          startIndex: nextIndex,
          createdAt,
        })
        imported.push(...fileChunks)
        nextIndex += fileChunks.length
      }

      await db.chunks.bulkPut(imported)
      await db.lectures.update(selectedLecture.id, { status: 'processing', updatedAt: now() })
      await refreshLists()
      await refreshLectureData(selectedLecture.id)
      setStatus(`Imported ${imported.length} audio chunk${imported.length === 1 ? '' : 's'} for transcription.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Audio import failed.')
    } finally {
      setImportingAudio(false)
    }
  }

  async function importBackupFile(file: File | undefined) {
    if (!file) return

    setImportingBackup(true)
    try {
      const prepared = prepareLectureBackupImport(JSON.parse(await file.text()), selectedCourseId)
      await db.transaction('rw', db.lectures, db.segments, db.notes, async () => {
        await db.lectures.put(prepared.lecture)
        await db.segments.bulkPut(prepared.segments)
        await db.notes.bulkPut(prepared.notes)
      })
      setSelectedLectureId(prepared.lecture.id)
      setStatus(`Imported backup: ${prepared.lecture.title}.`)
      await refreshLists()
      await refreshLectureData(prepared.lecture.id)
    } catch (error) {
      setStatus(error instanceof Error ? `Backup import failed: ${error.message}` : 'Backup import failed.')
    } finally {
      setImportingBackup(false)
    }
  }

  async function importMaterialFiles(files: FileList | null) {
    if (!selectedLecture || !files?.length) return

    setImportingMaterials(true)
    try {
      const createdAt = now()
      const nextMaterials = await Promise.all(
        Array.from(files).map((file) => buildLectureMaterial(file, selectedLecture.id, segments, createdAt)),
      )
      await db.materials.bulkPut(nextMaterials)
      await db.lectures.update(selectedLecture.id, { updatedAt: createdAt })
      setStatus(`Attached ${nextMaterials.length} lecture material${nextMaterials.length === 1 ? '' : 's'}.`)
      await refreshLists()
      await refreshLectureData(selectedLecture.id)
    } catch (error) {
      setStatus(error instanceof Error ? `Material import failed: ${error.message}` : 'Material import failed.')
    } finally {
      setImportingMaterials(false)
    }
  }

  async function saveMaterialText(material: LectureMaterial) {
    if (!selectedLecture) return
    const updatedAt = now()
    const patch = updateMaterialText(material, materialTextDrafts[material.id] ?? '', segments)
    await db.transaction('rw', db.materials, db.lectures, async () => {
      await db.materials.update(material.id, patch)
      await db.lectures.update(selectedLecture.id, { updatedAt })
    })
    setStatus(`Updated material links for ${material.name}.`)
    await refreshLists()
    await refreshLectureData(selectedLecture.id)
  }

  async function removeMaterial(materialId: string) {
    if (!selectedLecture) return
    await db.materials.delete(materialId)
    await db.lectures.update(selectedLecture.id, { updatedAt: now() })
    setStatus('Removed lecture material.')
    await refreshLists()
    await refreshLectureData(selectedLecture.id)
  }

  async function queueTranscriptionJobs() {
    if (!selectedLecture) return
    const createdAt = now()
    const newJobs = createTranscriptionJobs(chunks, jobs, createdAt)
    if (newJobs.length === 0) {
      setStatus('No new transcription jobs to queue.')
      return
    }

    await db.jobs.bulkPut(newJobs)
    await db.lectures.update(selectedLecture.id, { status: 'processing', updatedAt: createdAt })
    setStatus(`Queued ${newJobs.length} transcription job${newJobs.length === 1 ? '' : 's'}.`)
    await refreshLists()
    await refreshLectureData(selectedLecture.id)
    await processQueue()
  }

  async function processQueue() {
    if (!selectedLecture) return
    const key = await resolveApiKey()
    if (!key) {
      setStatus('Add a session key or unlock a remembered key before processing queued provider jobs.')
      return
    }

    setProcessingQueue(true)
    try {
      let processed = 0
      let failed = 0
      for (;;) {
        const currentJobs = await db.jobs.where('lectureId').equals(selectedLecture.id).toArray()
        const currentTime = Date.now()
        const runnable = currentJobs
          .filter(
            (job) =>
              (job.status === 'queued' || job.status === 'error') &&
              job.attempts < job.maxAttempts &&
              new Date(job.runAfter).getTime() <= currentTime,
          )
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]

        if (!runnable) break
        const succeeded = await runQueueJob(runnable, key)
        processed += 1
        if (!succeeded) failed += 1
        await refreshLists()
        await refreshLectureData(selectedLecture.id)
      }

      if (processed === 0) {
        setStatus('No queued jobs are ready to run yet.')
      } else if (failed > 0) {
        setStatus(`Processed ${processed} queued job${processed === 1 ? '' : 's'}; ${failed} need retry.`)
      } else {
        setStatus(`Processed ${processed} queued job${processed === 1 ? '' : 's'}.`)
      }
    } finally {
      setProcessingQueue(false)
    }
  }

  async function runQueueJob(job: LocalJob, key: string) {
    if (!selectedLecture) return false
    const attempt = job.attempts + 1
    const startedAt = now()
    await db.jobs.update(job.id, { status: 'running', attempts: attempt, updatedAt: startedAt, lastError: undefined })

    try {
      if (job.type === 'transcribe-chunk') {
        const chunk = job.targetId ? await db.chunks.get(job.targetId) : undefined
        if (!chunk) throw new Error('Audio chunk was deleted.')
        setStatus(`Transcribing chunk ${chunk.index + 1}.`)
        const existingSegment = await db.segments.where('chunkId').equals(chunk.id).first()
        if (!chunk.transcribedAt && !existingSegment) {
          const text = await transcribeWithOpenAi(key, chunk.blob, provider.transcribeModel, provider.baseUrl)
          const completedAt = now()
          const segment: TranscriptSegment = {
            id: newId('seg'),
            lectureId: selectedLecture.id,
            chunkId: chunk.id,
            index: chunk.index,
            startMs: chunk.index * 60_000,
            endMs: (chunk.index + 1) * 60_000,
            speaker: chunk.index === 0 ? 'Instructor' : undefined,
            text,
            uncertain: text.length === 0,
            createdAt: completedAt,
          }
          await db.transaction('rw', db.chunks, db.segments, async () => {
            await db.segments.put(segment)
            await db.chunks.update(chunk.id, { transcribedAt: completedAt })
          })
        } else if (!chunk.transcribedAt) {
          await db.chunks.update(chunk.id, { transcribedAt: now() })
        }
      } else {
        const currentSegments = await db.segments.where('lectureId').equals(selectedLecture.id).sortBy('index')
        if (currentSegments.length === 0) throw new Error('No transcript segments are available.')
        setStatus('Generating structured notes from queued job.')
        const draft = await generateNotesWithOpenAi(key, currentSegments, provider.notesModel, {
          baseUrl: provider.baseUrl,
          notesApiStyle: provider.notesApiStyle,
        })
        const note: LectureNote = {
          id: newId('note'),
          lectureId: selectedLecture.id,
          model: provider.notesModel,
          ...draft,
          createdAt: now(),
        }
        await db.notes.put(note)
      }

      const completedAt = now()
      await db.transaction('rw', db.jobs, db.lectures, async () => {
        await db.jobs.update(job.id, { status: 'done', updatedAt: completedAt, lastError: undefined })
        await db.lectures.update(selectedLecture.id, { status: 'ready', updatedAt: completedAt })
      })
      return true
    } catch (error) {
      const failedAt = now()
      const message = error instanceof Error ? error.message : 'Provider job failed.'
      await db.transaction('rw', db.jobs, db.lectures, async () => {
        await db.jobs.update(job.id, {
          status: 'error',
          updatedAt: failedAt,
          runAfter: nextRunAfter(failedAt, attempt),
          lastError: message,
        })
        await db.lectures.update(selectedLecture.id, { status: 'error', error: message, updatedAt: failedAt })
      })
      setStatus(`Queued job failed: ${message}`)
      return false
    }
  }

  async function queueNoteGeneration() {
    if (!selectedLecture || segments.length === 0) return
    const createdAt = now()
    const job = createNotesJob(selectedLecture.id, jobs, createdAt)
    if (!job) {
      setStatus('A note-generation job is already queued for this lecture.')
      return
    }

    await db.jobs.put(job)
    await db.lectures.update(selectedLecture.id, { status: 'processing', updatedAt: createdAt })
    setStatus('Queued note-generation job.')
    await refreshLists()
    await refreshLectureData(selectedLecture.id)
    await processQueue()
  }

  async function retryFailedJobs() {
    if (!selectedLecture) return
    const failed = jobs.filter((job) => job.status === 'error')
    if (failed.length === 0) {
      setStatus('No failed jobs to retry.')
      return
    }

    const retryAt = now()
    await Promise.all(
      failed.map((job) =>
        db.jobs.update(job.id, {
          status: 'queued',
          attempts: 0,
          runAfter: retryAt,
          updatedAt: retryAt,
          lastError: undefined,
        }),
      ),
    )
    setStatus(`Re-queued ${failed.length} failed job${failed.length === 1 ? '' : 's'}.`)
    await refreshLectureData(selectedLecture.id)
    await processQueue()
  }

  async function saveTranscriptEdits() {
    if (!selectedLecture) return
    if (hasEmptyTranscriptDraft(segments, segmentDrafts)) {
      setStatus('Transcript segments cannot be saved empty.')
      return
    }

    const changed = findChangedTranscriptSegments(segments, segmentDrafts, speakerDrafts)
    if (changed.length === 0) {
      setStatus('No transcript edits to save.')
      return
    }

    const editedAt = now()
    await db.transaction('rw', db.segments, db.lectures, async () => {
      for (const { segment, text, speaker } of changed) {
        await db.segments.update(segment.id, { text, speaker, uncertain: false, editedAt })
      }
      await db.lectures.update(selectedLecture.id, { updatedAt: editedAt })
    })

    setStatus(`Saved ${changed.length} transcript edit${changed.length === 1 ? '' : 's'}.`)
    await refreshLists()
    await refreshLectureData(selectedLecture.id)
  }

  async function saveProvider() {
    const next: ProviderProfile = { ...provider, apiKeySession: sessionKey || undefined, updatedAt: now() }
    await db.providers.put(next)
    setProvider(next)
    setStatus('Provider settings saved for this browser.')
  }

  async function validateKey() {
    const key = await resolveApiKey()
    if (!key) {
      setStatus('Enter a key first.')
      return
    }
    setStatus('Validating provider key.')
    await validateOpenAiKey(key, provider.baseUrl)
    setStatus('Provider key validated.')
  }

  async function rememberKey() {
    if (!sessionKey || !passphrase) {
      setStatus('Enter a session key and passphrase first.')
      return
    }
    const box = await encryptSecret(sessionKey, passphrase)
    const next = {
      ...provider,
      apiKeyCiphertext: box.ciphertext,
      apiKeySalt: box.salt,
      apiKeyIv: box.iv,
      rememberKey: true,
      updatedAt: now(),
    }
    await db.providers.put(next)
    setProvider(next)
    setStatus('Encrypted key saved locally. The passphrase is not stored.')
  }

  async function unlockKey() {
    if (!provider.apiKeyCiphertext || !provider.apiKeySalt || !provider.apiKeyIv || !passphrase) return
    const plain = await decryptSecret(provider.apiKeyCiphertext, provider.apiKeySalt, provider.apiKeyIv, passphrase)
    setSessionKey(plain)
    setStatus('Remembered key unlocked for this session.')
  }

  async function forgetKey() {
    const next = {
      ...provider,
      apiKeyCiphertext: undefined,
      apiKeySalt: undefined,
      apiKeyIv: undefined,
      apiKeySession: undefined,
      rememberKey: false,
      updatedAt: now(),
    }
    await db.providers.put(next)
    setProvider(next)
    setSessionKey('')
    setPassphrase('')
    setStatus('Stored key material removed from this browser.')
  }

  async function resolveApiKey() {
    if (sessionKey) return sessionKey
    if (provider.apiKeySession) return provider.apiKeySession
    return ''
  }

  function exportMarkdown() {
    if (!selectedLecture) return
    downloadText(`${fileSafe(selectedLecture.title)}.md`, noteToMarkdown(selectedLecture, segments, latestNote))
  }

  function exportJson() {
    if (!selectedLecture) return
    downloadText(
      `${fileSafe(selectedLecture.title)}.json`,
      JSON.stringify(
        {
          lecture: selectedLecture,
          segments,
          notes,
          materials: materials.map((material) => ({
            id: material.id,
            lectureId: material.lectureId,
            name: material.name,
            kind: material.kind,
            mimeType: material.mimeType,
            sizeBytes: material.sizeBytes,
            searchableText: material.searchableText,
            linkedSegmentIds: material.linkedSegmentIds,
            createdAt: material.createdAt,
          })),
        },
        null,
        2,
      ),
      'application/json',
    )
  }

  function exportCards() {
    if (!latestNote) return
    downloadText(`${fileSafe(selectedLecture?.title ?? 'lecture')}-anki.csv`, flashcardsToCsv(latestNote), 'text/csv')
  }

  async function removeLecture(id: string) {
    await deleteLectureCascade(id)
    setSelectedLectureId(undefined)
    await refreshLists()
    setStatus('Lecture deleted from local storage.')
  }

  async function removeAllLectureData() {
    if (!window.confirm('Delete all local lectures, audio chunks, transcripts, and generated notes on this device?')) return
    await deleteAllLectureData()
    setSelectedLectureId(undefined)
    setChunks([])
    setSegments([])
    setNotes([])
    setMaterials([])
    setJobs([])
    setSegmentDrafts({})
    setSpeakerDrafts({})
    setMaterialTextDrafts({})
    setNoteDraft(undefined)
    await refreshLists()
    setStatus('All local lecture data was deleted from this browser.')
  }

  if (!ready) return <main className="boot">Preparing local database...</main>

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <BookOpen size={26} />
          <div>
            <strong>Open Lecture Notes</strong>
            <span>Public-source BYOK capture</span>
          </div>
        </div>
        <nav>
          {[
            ['capture', Mic, 'Capture'],
            ['notes', FileText, 'Notes'],
            ['library', BookOpen, 'Library'],
            ['settings', KeyRound, 'Keys'],
          ].map(([id, Icon, label]) => (
            <button key={id as string} className={tab === id ? 'active' : ''} onClick={() => setTab(id as ActiveTab)}>
              <Icon size={18} />
              {label as string}
            </button>
          ))}
        </nav>
        <div className="status">{status}</div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Local-first workspace</p>
            <h1>{selectedLecture?.title ?? 'Create a lecture'}</h1>
            <p className="muted">{selectedCourse?.title ?? 'No course selected'}</p>
          </div>
          <div className="pill-row">
            <span>{courseLectures.length} lectures in course</span>
            <span>{segments.length} transcript segments</span>
            <span>{chunks.length} audio chunks</span>
            <span>{materials.length} materials</span>
            <span>{queueSummary.queued + queueSummary.running + queueSummary.error} active jobs</span>
          </div>
        </header>

        {tab === 'capture' && (
          <div className="grid two">
            <section className="panel wide">
              <h2>Course</h2>
              <div className="course-row">
                <label>
                  Active course
                  <select value={selectedCourseId ?? ''} onChange={(event) => void selectCourse(event.target.value)}>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  New course
                  <input value={courseTitle} onChange={(event) => setCourseTitle(event.target.value)} placeholder="Course name" />
                </label>
                <button disabled={!courseTitle.trim()} onClick={createCourse}>
                  <Plus size={18} />
                  Add Course
                </button>
              </div>
            </section>

            <section className="panel">
              <h2>New Lecture</h2>
              <label>
                Title
                <input value={lectureTitle} onChange={(event) => setLectureTitle(event.target.value)} />
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={consentConfirmed}
                  onChange={(event) => setConsentConfirmed(event.target.checked)}
                />
                I have permission to record this lecture and will follow course policy.
              </label>
              <button className="primary" onClick={createLecture}>
                <Plus size={18} />
                Create
              </button>
            </section>

            <section className="panel">
              <h2>Capture</h2>
              <p className="muted">
                Audio stays in IndexedDB on this device until you explicitly transcribe or export it.
              </p>
              <div className="button-row">
                <button className="primary" disabled={!selectedLecture || selectedLecture.status === 'recording'} onClick={startRecording}>
                  <Play size={18} />
                  Record
                </button>
                <button disabled={!selectedLecture || selectedLecture.status !== 'recording'} onClick={stopRecording}>
                  <Square size={18} />
                  Stop
                </button>
                <button disabled={!selectedLecture || chunks.length === 0 || processingQueue} onClick={queueTranscriptionJobs}>
                  <WandSparkles size={18} />
                  Queue Transcription
                </button>
              </div>
              <div className="chunk-list">
                {chunks.map((chunk) => (
                  <span key={chunk.id}>
                    Chunk {chunk.index + 1} - {chunk.source} -{' '}
                    {chunk.sizeBytes ? `${Math.ceil(chunk.sizeBytes / 1024)} KB` : msLabel(chunk.durationMs)} -{' '}
                    {chunk.transcribedAt ? 'done' : 'pending'}
                  </span>
                ))}
              </div>
            </section>

            <section className="panel wide">
              <h2>Import Audio</h2>
              <p className="muted">
                Import lecture audio or downloaded class recordings. Files are split into local chunks of {chunkLimitLabel()} or less before transcription.
              </p>
              <label className="file-picker">
                <Upload size={18} />
                Choose audio files
                <input
                  type="file"
                  accept="audio/*,video/webm,video/mp4"
                  multiple
                  disabled={!selectedLecture || importingAudio}
                  onChange={(event) => {
                    void importAudioFiles(event.target.files)
                    event.currentTarget.value = ''
                  }}
                />
              </label>
            </section>

            <section className="panel wide">
              <h2>Lecture Materials</h2>
              <p className="muted">
                Attach slides, PDFs, images, captions, or text notes. Text-bearing files are matched to transcript segments locally.
              </p>
              <label className="file-picker">
                <Upload size={18} />
                Choose materials
                <input
                  type="file"
                  accept=".pdf,.ppt,.pptx,.key,.odp,.txt,.md,.markdown,.vtt,.srt,.csv,.tsv,image/*,application/pdf,text/*"
                  multiple
                  disabled={!selectedLecture || importingMaterials}
                  onChange={(event) => {
                    void importMaterialFiles(event.target.files)
                    event.currentTarget.value = ''
                  }}
                />
              </label>
              <div className="material-list">
                {materials.map((material) => (
                  <article key={material.id} className="material-card">
                    <div>
                      <strong>{material.name}</strong>
                      <span>
                        {material.kind} - {bytesLabel(material.sizeBytes)} -{' '}
                        {material.linkedSegmentIds.length
                          ? material.linkedSegmentIds.map((id) => segmentLabelById[id] ?? id).join(', ')
                          : 'no transcript links yet'}
                      </span>
                    </div>
                    <label>
                      Searchable text
                      <textarea
                        value={materialTextDrafts[material.id] ?? ''}
                        placeholder="Paste slide titles, PDF text, or key terms to align this file with transcript segments."
                        onChange={(event) =>
                          setMaterialTextDrafts((drafts) => ({ ...drafts, [material.id]: event.target.value }))
                        }
                        rows={3}
                      />
                    </label>
                    <div className="button-row">
                      <button onClick={() => saveMaterialText(material)}>
                        <Save size={18} />
                        Save Links
                      </button>
                      <button onClick={() => removeMaterial(material.id)}>
                        <Trash2 size={18} />
                        Remove
                      </button>
                    </div>
                  </article>
                ))}
                {materials.length === 0 && <p className="muted">No local materials attached to this lecture.</p>}
              </div>
            </section>

            <section className="panel wide">
              <h2>Processing Queue</h2>
              <div className="stat-grid queue-stats">
                <span>
                  <strong>{queueSummary.queued}</strong>
                  Queued
                </span>
                <span>
                  <strong>{queueSummary.running}</strong>
                  Running
                </span>
                <span>
                  <strong>{queueSummary.error}</strong>
                  Needs retry
                </span>
                <span>
                  <strong>{queueSummary.done}</strong>
                  Done
                </span>
              </div>
              <div className="button-row">
                <button disabled={!selectedLecture || processingQueue} onClick={processQueue}>
                  <WandSparkles size={18} />
                  Process Queue
                </button>
                <button disabled={!selectedLecture || queueSummary.error === 0 || processingQueue} onClick={retryFailedJobs}>
                  <RotateCcw size={18} />
                  Retry Failed
                </button>
              </div>
              <div className="job-list">
                {jobs.slice(-5).map((job) => (
                  <span key={job.id}>
                    {job.type === 'transcribe-chunk' ? 'Transcription' : 'Notes'} - {job.status} - attempts {job.attempts}/
                    {job.maxAttempts}
                    {job.lastError ? ` - ${job.lastError}` : ''}
                  </span>
                ))}
                {jobs.length === 0 && <p className="muted">No queued provider work for this lecture.</p>}
              </div>
            </section>

            <section className="panel wide">
              <h2>Manual Transcript</h2>
              <p className="muted">Useful for testing without a provider key or pasting captions from a class recording.</p>
              <textarea value={manualTranscript} onChange={(event) => setManualTranscript(event.target.value)} rows={5} />
              <button disabled={!selectedLecture || !manualTranscript.trim()} onClick={addManualTranscript}>
                <Save size={18} />
                Add Segment
              </button>
            </section>
          </div>
        )}

        {tab === 'notes' && (
          <div className="grid two">
            <section className="panel">
              <h2>Transcript</h2>
              {segments.length === 0 ? (
                <p className="muted">No transcript yet.</p>
              ) : (
                <>
                  <div className="segment-editor">
                    {segments.map((segment) => (
                      <label key={segment.id} className="segment-card">
                        <span>
                          Segment {segment.index + 1} - {msLabel(segment.startMs)}
                          {segment.speaker ? ` - ${segment.speaker}` : ''}
                          {segment.editedAt ? ' - edited' : ''}
                        </span>
                        <input
                          value={speakerDrafts[segment.id] ?? segment.speaker ?? ''}
                          placeholder="Speaker label"
                          onChange={(event) =>
                            setSpeakerDrafts((drafts) => ({ ...drafts, [segment.id]: event.target.value }))
                          }
                        />
                        <textarea
                          value={segmentDrafts[segment.id] ?? segment.text}
                          onChange={(event) =>
                            setSegmentDrafts((drafts) => ({ ...drafts, [segment.id]: event.target.value }))
                          }
                          rows={4}
                        />
                      </label>
                    ))}
                  </div>
                  <button disabled={!hasTranscriptEdits} onClick={saveTranscriptEdits}>
                    <Save size={18} />
                    Save Transcript Edits
                  </button>
                </>
              )}
            </section>
            <section className="panel">
              <h2>Generated Notes</h2>
              <button className="primary" disabled={segments.length === 0 || processingQueue} onClick={queueNoteGeneration}>
                <WandSparkles size={18} />
                Queue Notes
              </button>
              {latestNote && noteDraft ? (
                <article className="notes">
                  <label>
                    Summary
                    <textarea value={noteDraft.summary} onChange={(event) => updateNoteDraft('summary', event.target.value)} rows={4} />
                  </label>
                  <label>
                    Outline
                    <textarea value={noteDraft.outline} onChange={(event) => updateNoteDraft('outline', event.target.value)} rows={4} />
                  </label>
                  <label>
                    Key Points
                    <textarea value={noteDraft.keyPoints} onChange={(event) => updateNoteDraft('keyPoints', event.target.value)} rows={5} />
                  </label>
                  <label>
                    Definitions
                    <textarea value={noteDraft.definitions} onChange={(event) => updateNoteDraft('definitions', event.target.value)} rows={4} />
                  </label>
                  <label>
                    Open Questions
                    <textarea
                      value={noteDraft.openQuestions}
                      onChange={(event) => updateNoteDraft('openQuestions', event.target.value)}
                      rows={4}
                    />
                  </label>
                  <label>
                    Review Tasks
                    <textarea value={noteDraft.reviewTasks} onChange={(event) => updateNoteDraft('reviewTasks', event.target.value)} rows={4} />
                  </label>
                  <button disabled={!hasNoteEdits} onClick={saveNoteEdits}>
                    <Save size={18} />
                    Save Note Edits
                  </button>
                </article>
              ) : (
                <p className="muted">No notes generated yet.</p>
              )}
            </section>
            <section className="panel wide">
              <h2>Flashcard Review</h2>
              {activeStudyCard ? (
                <div className="study-card">
                  <span>
                    Card {studyCardIndex + 1} of {studyCards.length}
                  </span>
                  <strong>{activeStudyCard.front}</strong>
                  {showStudyAnswer && <p>{activeStudyCard.back}</p>}
                  <div className="button-row">
                    <button onClick={() => moveStudyCard(-1)}>Previous</button>
                    <button className="primary" onClick={() => setShowStudyAnswer((value) => !value)}>
                      {showStudyAnswer ? 'Hide Answer' : 'Show Answer'}
                    </button>
                    <button onClick={() => moveStudyCard(1)}>Next</button>
                  </div>
                </div>
              ) : (
                <p className="muted">No flashcards in the latest generated note.</p>
              )}
            </section>

            <section className="panel wide">
              <h2>Export</h2>
              <div className="button-row">
                <button disabled={!selectedLecture} onClick={exportMarkdown}>
                  <Download size={18} />
                  Markdown
                </button>
                <button disabled={!selectedLecture} onClick={exportJson}>
                  <Download size={18} />
                  JSON Backup
                </button>
                <button disabled={!latestNote} onClick={exportCards}>
                  <Download size={18} />
                  Anki CSV
                </button>
              </div>
            </section>
          </div>
        )}

        {tab === 'library' && (
          <section className="panel">
            <h2>Lecture Library</h2>
            <p className="muted">Browse and search lectures in the active course. Backup imports are restored into that course.</p>
            <label>
              Active course
              <select value={selectedCourseId ?? ''} onChange={(event) => void selectCourse(event.target.value)}>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="search-box">
              <Search size={18} />
              <input
                value={libraryQuery}
                placeholder="Search titles, transcripts, notes, and flashcards"
                onChange={(event) => setLibraryQuery(event.target.value)}
              />
            </label>
            <label className="file-picker">
              <Upload size={18} />
              Import JSON backup
              <input
                type="file"
                accept="application/json,.json"
                disabled={importingBackup}
                onChange={(event) => {
                  void importBackupFile(event.target.files?.[0])
                  event.currentTarget.value = ''
                }}
              />
            </label>
            <div className="lecture-list">
              {libraryResults.map(({ lecture, matches }) => (
                <button
                  key={lecture.id}
                  className={lecture.id === selectedLectureId ? 'lecture active' : 'lecture'}
                  onClick={() => setSelectedLectureId(lecture.id)}
                >
                  <span>
                    <strong>{lecture.title}</strong>
                    <small>
                      {lecture.status} - {new Date(lecture.updatedAt).toLocaleString()}
                    </small>
                    {matches.slice(0, 2).map((match) => (
                      <small key={match} className="match">
                        {match}
                      </small>
                    ))}
                  </span>
                  <Trash2
                    size={18}
                    onClick={(event) => {
                      event.stopPropagation()
                      void removeLecture(lecture.id)
                    }}
                  />
                </button>
              ))}
              {libraryResults.length === 0 && <p className="muted">No local lectures match that search.</p>}
            </div>
          </section>
        )}

        {tab === 'settings' && (
          <div className="grid two">
            <section className="panel">
              <h2>OpenAI-Compatible Provider</h2>
              <label>
                Session API key
                <input
                  type="password"
                  value={sessionKey}
                  placeholder="sk-..."
                  onChange={(event) => setSessionKey(event.target.value)}
                />
              </label>
              <label>
                Base URL
                <input
                  value={provider.baseUrl}
                  placeholder="https://api.openai.com/v1"
                  onChange={(event) => setProvider({ ...provider, baseUrl: event.target.value })}
                />
              </label>
              <label>
                Transcription model
                <input
                  value={provider.transcribeModel}
                  onChange={(event) => setProvider({ ...provider, transcribeModel: event.target.value })}
                />
              </label>
              <label>
                Notes model
                <input value={provider.notesModel} onChange={(event) => setProvider({ ...provider, notesModel: event.target.value })} />
              </label>
              <label>
                Notes API
                <select
                  value={provider.notesApiStyle}
                  onChange={(event) =>
                    setProvider({
                      ...provider,
                      notesApiStyle: event.target.value === 'chat-completions' ? 'chat-completions' : 'responses',
                    })
                  }
                >
                  <option value="responses">Responses API</option>
                  <option value="chat-completions">Chat Completions JSON</option>
                </select>
              </label>
              <div className="button-row">
                <button className="primary" onClick={saveProvider}>
                  <Save size={18} />
                  Save
                </button>
                <button onClick={validateKey}>
                  <ShieldCheck size={18} />
                  Validate
                </button>
              </div>
            </section>

            <section className="panel">
              <h2>Remember Key</h2>
              <p className="muted">
                Optional local encryption uses your passphrase and Web Crypto. Browser storage is not a high-security vault.
              </p>
              <label>
                Passphrase
                <input type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} />
              </label>
              <div className="button-row">
                <button disabled={!sessionKey || !passphrase} onClick={rememberKey}>
                  <KeyRound size={18} />
                  Encrypt
                </button>
                <button disabled={!hasEncryptedKey || !passphrase} onClick={unlockKey}>
                  <KeyRound size={18} />
                  Unlock
                </button>
                <button disabled={!hasEncryptedKey && !sessionKey} onClick={forgetKey}>
                  <Trash2 size={18} />
                  Forget
                </button>
              </div>
            </section>

            <section className="panel wide">
              <h2>Local Data</h2>
              <div className="stat-grid">
                <span>
                  <strong>{localStats.lectures}</strong>
                  Lectures
                </span>
                <span>
                  <strong>{localStats.audioChunks}</strong>
                  Audio chunks
                </span>
                <span>
                  <strong>{localStats.transcriptSegments}</strong>
                  Transcript segments
                </span>
                <span>
                  <strong>{localStats.notes}</strong>
                  Notes
                </span>
                <span>
                  <strong>{localStats.materials}</strong>
                  Materials
                </span>
                <span>
                  <strong>{localStats.queuedJobs}</strong>
                  Active jobs
                </span>
                <span>
                  <strong>{bytesLabel(localStats.audioBytes)}</strong>
                  Stored audio
                </span>
                <span>
                  <strong>{bytesLabel(localStats.materialBytes)}</strong>
                  Stored materials
                </span>
              </div>
              <button disabled={localStats.lectures === 0} onClick={removeAllLectureData}>
                <Trash2 size={18} />
                Delete All Lecture Data
              </button>
            </section>
          </div>
        )}
      </section>
    </main>
  )
}

export default App
