import { describe, expect, it } from 'vitest'
import { buildImportedAudioChunks } from './audioChunks'

describe('audio chunk import', () => {
  it('splits a file into provider-sized chunks', () => {
    const file = new File([new Uint8Array(10)], 'lecture.webm', { type: 'audio/webm' })

    const chunks = buildImportedAudioChunks({
      lectureId: 'lecture-1',
      file,
      startIndex: 3,
      createdAt: '2026-06-26T00:00:00.000Z',
      maxBytes: 4,
    })

    expect(chunks).toHaveLength(3)
    expect(chunks.map((chunk) => chunk.index)).toEqual([3, 4, 5])
    expect(chunks.map((chunk) => chunk.sizeBytes)).toEqual([4, 4, 2])
    expect(chunks.every((chunk) => chunk.source === 'import')).toBe(true)
    expect(chunks.every((chunk) => chunk.originalName === 'lecture.webm')).toBe(true)
  })

  it('rejects empty audio files', () => {
    const file = new File([], 'empty.webm', { type: 'audio/webm' })

    expect(() =>
      buildImportedAudioChunks({
        lectureId: 'lecture-1',
        file,
        startIndex: 0,
        createdAt: '2026-06-26T00:00:00.000Z',
      }),
    ).toThrow('Cannot import an empty audio file')
  })
})
