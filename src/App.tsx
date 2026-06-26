import {
  BookOpen,
  Download,
  FileText,
  KeyRound,
  Mic,
  Play,
  Plus,
  Save,
  ShieldCheck,
  Square,
  Upload,
  Trash2,
  WandSparkles,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { buildImportedAudioChunks, chunkLimitLabel } from './audioChunks'
import { decryptSecret, encryptSecret } from './cryptoBox'
import { db, deleteLectureCascade, ensureBootstrapData } from './db'
import {
  DEFAULT_PROVIDER,
  newId,
  type AudioChunk,
  type Lecture,
  type LectureNote,
  type ProviderProfile,
  type TranscriptSegment,
} from './domain'
import { downloadText, flashcardsToCsv, noteToMarkdown } from './exporters'
import {
  editableDraftToNotePatch,
  hasNoteDraftChanges,
  hasValidNoteDraft,
  noteToEditableDraft,
  type EditableNoteDraft,
} from './noteEdits'
import { generateNotesWithOpenAi, transcribeWithOpenAi, validateOpenAiKey } from './openaiProvider'
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

function App() {
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const startedAtRef = useRef<number>(0)
  const chunkIndexRef = useRef<number>(0)
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState<ActiveTab>('capture')
  const [lectures, setLectures] = useState<Lecture[]>([])
  const [selectedLectureId, setSelectedLectureId] = useState<string>()
  const [chunks, setChunks] = useState<AudioChunk[]>([])
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const [notes, setNotes] = useState<LectureNote[]>([])
  const [provider, setProvider] = useState<ProviderProfile>(DEFAULT_PROVIDER)
  const [sessionKey, setSessionKey] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [status, setStatus] = useState('Local workspace ready.')
  const [lectureTitle, setLectureTitle] = useState('New lecture')
  const [consentConfirmed, setConsentConfirmed] = useState(false)
  const [manualTranscript, setManualTranscript] = useState('')
  const [importingAudio, setImportingAudio] = useState(false)
  const [segmentDrafts, setSegmentDrafts] = useState<Record<string, string>>({})
  const [noteDraft, setNoteDraft] = useState<EditableNoteDraft>()

  useEffect(() => {
    void ensureBootstrapData().then(() => setReady(true))
  }, [])

  useEffect(() => {
    if (!ready) return
    const subscriptions = [
      db.lectures.orderBy('updatedAt').reverse().toArray().then(setLectures),
      db.providers.get('openai').then((value) => value && setProvider(value)),
    ]
    void Promise.all(subscriptions)
  }, [ready])

  useEffect(() => {
    if (!selectedLectureId && lectures[0]) setSelectedLectureId(lectures[0].id)
  }, [lectures, selectedLectureId])

  useEffect(() => {
    if (!selectedLectureId) return
    void refreshLectureData(selectedLectureId)
  }, [selectedLectureId])

  const selectedLecture = lectures.find((lecture) => lecture.id === selectedLectureId)
  const latestNote = notes[0]
  const hasTranscriptEdits = useMemo(
    () => findChangedTranscriptSegments(segments, segmentDrafts).length > 0,
    [segments, segmentDrafts],
  )
  const hasNoteEdits = useMemo(() => hasNoteDraftChanges(latestNote, noteDraft), [latestNote, noteDraft])
  const hasEncryptedKey = Boolean(provider.apiKeyCiphertext && provider.apiKeySalt && provider.apiKeyIv)

  async function refreshLists() {
    setLectures(await db.lectures.orderBy('updatedAt').reverse().toArray())
    const nextProvider = await db.providers.get('openai')
    if (nextProvider) setProvider(nextProvider)
  }

  async function refreshLectureData(lectureId: string) {
    const [nextChunks, nextSegments, nextNotes] = await Promise.all([
      db.chunks.where('lectureId').equals(lectureId).sortBy('index'),
      db.segments.where('lectureId').equals(lectureId).sortBy('index'),
      db.notes.where('lectureId').equals(lectureId).reverse().sortBy('createdAt'),
    ])
    const orderedNotes = nextNotes.reverse()
    setChunks(nextChunks)
    setSegments(nextSegments)
    setNotes(orderedNotes)
    setSegmentDrafts(Object.fromEntries(nextSegments.map((segment) => [segment.id, segment.text])))
    const newestNote = orderedNotes[0]
    setNoteDraft(newestNote ? noteToEditableDraft(newestNote) : undefined)
  }

  async function createLecture() {
    const createdAt = now()
    const lecture: Lecture = {
      id: newId('lecture'),
      courseId: 'course_default',
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

  async function transcribePendingChunks() {
    if (!selectedLecture) return
    const key = await resolveApiKey()
    if (!key) {
      setStatus('Add a session key or unlock a remembered key first.')
      return
    }

    const pending = chunks.filter((chunk) => !chunk.transcribedAt)
    if (pending.length === 0) {
      setStatus('No pending audio chunks to transcribe.')
      return
    }

    await db.lectures.update(selectedLecture.id, { status: 'processing', updatedAt: now() })
    for (const chunk of pending) {
      setStatus(`Transcribing chunk ${chunk.index + 1} of ${pending.length}.`)
      const text = await transcribeWithOpenAi(key, chunk.blob, provider.transcribeModel)
      const segment: TranscriptSegment = {
        id: newId('seg'),
        lectureId: selectedLecture.id,
        chunkId: chunk.id,
        index: chunk.index,
        startMs: chunk.index * 60_000,
        endMs: (chunk.index + 1) * 60_000,
        text,
        uncertain: text.length === 0,
        createdAt: now(),
      }
      await db.transaction('rw', db.chunks, db.segments, async () => {
        await db.segments.put(segment)
        await db.chunks.update(chunk.id, { transcribedAt: now() })
      })
    }

    await db.lectures.update(selectedLecture.id, { status: 'ready', updatedAt: now() })
    setStatus('Transcription complete.')
    await refreshLists()
    await refreshLectureData(selectedLecture.id)
  }

  async function generateNotes() {
    if (!selectedLecture || segments.length === 0) return
    const key = await resolveApiKey()
    if (!key) {
      setStatus('Add a session key or unlock a remembered key first.')
      return
    }

    setStatus('Generating structured notes.')
    const draft = await generateNotesWithOpenAi(key, segments, provider.notesModel)
    const note: LectureNote = {
      id: newId('note'),
      lectureId: selectedLecture.id,
      model: provider.notesModel,
      ...draft,
      createdAt: now(),
    }
    await db.notes.put(note)
    await db.lectures.update(selectedLecture.id, { status: 'ready', updatedAt: now() })
    setStatus('Notes generated.')
    await refreshLists()
    await refreshLectureData(selectedLecture.id)
  }

  async function saveTranscriptEdits() {
    if (!selectedLecture) return
    if (hasEmptyTranscriptDraft(segments, segmentDrafts)) {
      setStatus('Transcript segments cannot be saved empty.')
      return
    }

    const changed = findChangedTranscriptSegments(segments, segmentDrafts)
    if (changed.length === 0) {
      setStatus('No transcript edits to save.')
      return
    }

    const editedAt = now()
    await db.transaction('rw', db.segments, db.lectures, async () => {
      for (const { segment, text } of changed) {
        await db.segments.update(segment.id, { text, uncertain: false, editedAt })
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
    setStatus('Validating OpenAI key.')
    await validateOpenAiKey(key)
    setStatus('OpenAI key validated.')
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
      JSON.stringify({ lecture: selectedLecture, segments, notes }, null, 2),
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
          </div>
          <div className="pill-row">
            <span>{lectures.length} lectures</span>
            <span>{segments.length} transcript segments</span>
            <span>{chunks.length} audio chunks</span>
          </div>
        </header>

        {tab === 'capture' && (
          <div className="grid two">
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
                <button disabled={!selectedLecture || chunks.length === 0} onClick={transcribePendingChunks}>
                  <WandSparkles size={18} />
                  Transcribe
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
                          {segment.editedAt ? ' - edited' : ''}
                        </span>
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
              <button className="primary" disabled={segments.length === 0} onClick={generateNotes}>
                <WandSparkles size={18} />
                Generate Notes
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
            <div className="lecture-list">
              {lectures.map((lecture) => (
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
            </div>
          </section>
        )}

        {tab === 'settings' && (
          <div className="grid two">
            <section className="panel">
              <h2>OpenAI Provider</h2>
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
          </div>
        )}
      </section>
    </main>
  )
}

export default App
