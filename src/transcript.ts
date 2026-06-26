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

export function cleanSpeakerLabel(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

export function findChangedTranscriptSegments(
  segments: TranscriptSegment[],
  textDrafts: Record<string, string>,
  speakerDrafts: Record<string, string> = {},
) {
  return segments
    .map((segment) => {
      const text = cleanTranscriptEdit(textDrafts[segment.id] ?? segment.text)
      const speaker = cleanSpeakerLabel(speakerDrafts[segment.id] ?? segment.speaker ?? '')
      return { segment, text, speaker: speaker || undefined }
    })
    .filter(
      ({ segment, text, speaker }) =>
        text.length > 0 && (text !== segment.text || (speaker ?? '') !== (segment.speaker ?? '')),
    )
}

export function hasEmptyTranscriptDraft(segments: TranscriptSegment[], drafts: Record<string, string>) {
  return segments.some((segment) => cleanTranscriptEdit(drafts[segment.id] ?? segment.text).length === 0)
}
