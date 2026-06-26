import { newId, type LectureMaterial, type LectureMaterialKind, type TranscriptSegment } from './domain'

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'csv', 'tsv', 'vtt', 'srt'])
const SLIDE_EXTENSIONS = new Set(['ppt', 'pptx', 'key', 'odp'])

export function materialKindForFile(name: string, mimeType: string): LectureMaterialKind {
  const extension = name.split('.').pop()?.toLowerCase() ?? ''
  if (mimeType === 'application/pdf' || extension === 'pdf') return 'pdf'
  if (SLIDE_EXTENSIONS.has(extension)) return 'slides'
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('text/') || TEXT_EXTENSIONS.has(extension)) return 'text'
  return 'other'
}

export function canReadSearchableText(name: string, mimeType: string) {
  return materialKindForFile(name, mimeType) === 'text'
}

function tokenize(value: string) {
  return Array.from(new Set(value.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []))
}

export function alignMaterialToSegments(searchableText: string, segments: TranscriptSegment[], maxMatches = 3) {
  const terms = tokenize(searchableText)
  if (terms.length === 0) return []

  return segments
    .map((segment) => {
      const haystack = segment.text.toLowerCase()
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0)
      return { segment, score }
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.segment.index - b.segment.index)
    .slice(0, maxMatches)
    .map(({ segment }) => segment.id)
}

export async function buildLectureMaterial(file: File, lectureId: string, segments: TranscriptSegment[], createdAt: string) {
  const searchableText = canReadSearchableText(file.name, file.type) ? (await file.text()).trim() : ''
  return {
    id: newId('material'),
    lectureId,
    name: file.name,
    kind: materialKindForFile(file.name, file.type),
    mimeType: file.type || 'application/octet-stream',
    blob: file,
    sizeBytes: file.size,
    searchableText: searchableText || undefined,
    linkedSegmentIds: alignMaterialToSegments(searchableText || file.name, segments),
    createdAt,
  } satisfies LectureMaterial
}

export function updateMaterialText(material: LectureMaterial, searchableText: string, segments: TranscriptSegment[]) {
  const trimmed = searchableText.trim()
  return {
    searchableText: trimmed || undefined,
    linkedSegmentIds: alignMaterialToSegments(trimmed || material.name, segments),
  } satisfies Pick<LectureMaterial, 'searchableText' | 'linkedSegmentIds'>
}
