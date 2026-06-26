import { newId, type AudioChunk } from './domain'

export const OPENAI_TRANSCRIPTION_LIMIT_BYTES = 25 * 1024 * 1024
export const DEFAULT_IMPORT_CHUNK_BYTES = 24 * 1024 * 1024

export interface ImportedAudioChunkInput {
  lectureId: string
  file: File
  startIndex: number
  createdAt: string
  maxBytes?: number
}

export function buildImportedAudioChunks({
  lectureId,
  file,
  startIndex,
  createdAt,
  maxBytes = DEFAULT_IMPORT_CHUNK_BYTES,
}: ImportedAudioChunkInput): AudioChunk[] {
  if (maxBytes <= 0) throw new Error('maxBytes must be greater than zero')
  if (file.size === 0) throw new Error('Cannot import an empty audio file')

  const chunks: AudioChunk[] = []
  let offset = 0

  while (offset < file.size) {
    const end = Math.min(offset + maxBytes, file.size)
    const blob = file.slice(offset, end, file.type || 'application/octet-stream')
    chunks.push({
      id: newId('chunk'),
      lectureId,
      index: startIndex + chunks.length,
      blob,
      mimeType: blob.type || file.type || 'application/octet-stream',
      source: 'import',
      originalName: file.name,
      sizeBytes: blob.size,
      durationMs: 0,
      createdAt,
    })
    offset = end
  }

  return chunks
}

export function chunkLimitLabel(maxBytes = DEFAULT_IMPORT_CHUNK_BYTES) {
  return `${Math.floor(maxBytes / 1024 / 1024)} MB`
}
