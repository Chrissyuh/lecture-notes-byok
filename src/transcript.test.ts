import { describe, expect, it } from 'vitest'
import type { TranscriptSegment } from './domain'
import { cleanTranscriptEdit, findChangedTranscriptSegments, hasEmptyTranscriptDraft } from './transcript'

const segment: TranscriptSegment = {
  id: 'seg-1',
  lectureId: 'lecture-1',
  index: 0,
  startMs: 0,
  endMs: 60_000,
  text: 'Original text',
  uncertain: true,
  createdAt: '2026-06-26T00:00:00.000Z',
}

describe('transcript editing helpers', () => {
  it('normalizes pasted transcript text without flattening paragraphs', () => {
    expect(cleanTranscriptEdit('  first line  \r\n\r\n\r\n second line  ')).toBe('first line\n\nsecond line')
  })

  it('finds changed non-empty segment drafts', () => {
    const changed = findChangedTranscriptSegments([segment], { 'seg-1': 'Corrected text' })

    expect(changed).toHaveLength(1)
    expect(changed[0].text).toBe('Corrected text')
  })

  it('flags empty drafts before saving transcript edits', () => {
    expect(hasEmptyTranscriptDraft([segment], { 'seg-1': '   ' })).toBe(true)
  })
})
