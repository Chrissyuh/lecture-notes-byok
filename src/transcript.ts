import type { TranscriptSegment } from './domain'

export function cleanTranscriptEdit(value: string) {
  return value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function findChangedTranscriptSegments(segments: TranscriptSegment[], drafts: Record<string, string>) {
  return segments
    .map((segment) => ({ segment, text: cleanTranscriptEdit(drafts[segment.id] ?? segment.text) }))
    .filter(({ segment, text }) => text.length > 0 && text !== segment.text)
}

export function hasEmptyTranscriptDraft(segments: TranscriptSegment[], drafts: Record<string, string>) {
  return segments.some((segment) => cleanTranscriptEdit(drafts[segment.id] ?? segment.text).length === 0)
}
