import { describe, expect, it, vi } from 'vitest'
import type { TranscriptSegment } from './domain'
import { alignMaterialToSegments, buildLectureMaterial, materialKindForFile, updateMaterialText } from './materials'

vi.mock('./domain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./domain')>()
  return {
    ...actual,
    newId: (prefix: string) => `${prefix}_test`,
  }
})

const segments: TranscriptSegment[] = [
  {
    id: 'seg-1',
    lectureId: 'lecture-1',
    index: 0,
    startMs: 0,
    endMs: 60_000,
    text: 'Today we define entropy and reversible thermodynamic processes.',
    uncertain: false,
    createdAt: '2026-06-26T00:00:00.000Z',
  },
  {
    id: 'seg-2',
    lectureId: 'lecture-1',
    index: 1,
    startMs: 60_000,
    endMs: 120_000,
    text: 'The next proof compares eigenvalues and matrix diagonalization.',
    uncertain: false,
    createdAt: '2026-06-26T00:00:00.000Z',
  },
]

describe('lecture materials', () => {
  it('classifies common lecture support files', () => {
    expect(materialKindForFile('week-1.pdf', 'application/pdf')).toBe('pdf')
    expect(materialKindForFile('slides.pptx', '')).toBe('slides')
    expect(materialKindForFile('board.jpg', 'image/jpeg')).toBe('image')
    expect(materialKindForFile('captions.vtt', '')).toBe('text')
  })

  it('aligns searchable text to the most relevant transcript segments', () => {
    expect(alignMaterialToSegments('Entropy process and reversible cycle', segments)).toEqual(['seg-1'])
    expect(alignMaterialToSegments('Matrix proof with eigenvalues', segments)).toEqual(['seg-2'])
  })

  it('builds uploaded text materials with extracted text and linked segments', async () => {
    const file = new File(['Entropy lecture slide text'], 'slides.txt', { type: 'text/plain' })

    await expect(buildLectureMaterial(file, 'lecture-1', segments, '2026-06-26T00:00:00.000Z')).resolves.toMatchObject({
      id: 'material_test',
      lectureId: 'lecture-1',
      kind: 'text',
      searchableText: 'Entropy lecture slide text',
      linkedSegmentIds: ['seg-1'],
    })
  })

  it('recomputes links when a user adds searchable slide text', () => {
    expect(
      updateMaterialText(
        {
          id: 'material-1',
          lectureId: 'lecture-1',
          name: 'deck.pdf',
          kind: 'pdf',
          mimeType: 'application/pdf',
          blob: new Blob(['pdf']),
          sizeBytes: 3,
          linkedSegmentIds: [],
          createdAt: '2026-06-26T00:00:00.000Z',
        },
        'diagonalization eigenvalues',
        segments,
      ),
    ).toEqual({
      searchableText: 'diagonalization eigenvalues',
      linkedSegmentIds: ['seg-2'],
    })
  })
})
