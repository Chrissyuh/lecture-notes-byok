import type { Lecture, LectureMaterial, LectureNote, TranscriptSegment } from './domain'

function materialLinks(material: LectureMaterial, segmentsById: Map<string, TranscriptSegment>) {
  return material.linkedSegmentIds
    .map((id) => {
      const segment = segmentsById.get(id)
      return segment ? `Segment ${segment.index + 1} (${Math.round(segment.startMs / 1000)}s)` : id
    })
    .join(', ')
}

function materialContextToMarkdown(materials: LectureMaterial[], segments: TranscriptSegment[]) {
  if (materials.length === 0) return ''

  const segmentsById = new Map(segments.map((segment) => [segment.id, segment]))
  const body = materials
    .map((material) => {
      const linked = materialLinks(material, segmentsById)
      const searchableText = material.searchableText ? `\n  Searchable text: ${material.searchableText}` : ''
      return `- ${material.name} (${material.kind}, ${material.mimeType}, ${material.sizeBytes} bytes)${
        linked ? `\n  Linked transcript: ${linked}` : ''
      }${searchableText}`
    })
    .join('\n')

  return `\n## Material Context\n\n${body}\n`
}

export function noteToMarkdown(lecture: Lecture, segments: TranscriptSegment[], note?: LectureNote, materials: LectureMaterial[] = []) {
  const transcript = segments
    .map((segment) => {
      const speaker = segment.speaker ? ` ${segment.speaker}` : ''
      return `- ${Math.round(segment.startMs / 1000)}s [${segment.id}]${speaker}: ${segment.text}`
    })
    .join('\n')

  if (!note) {
    return `# ${lecture.title}
${materialContextToMarkdown(materials, segments)}
## Transcript

${transcript}
`
  }

  const list = (title: string, values: string[]) =>
    values.length ? `\n## ${title}\n\n${values.map((value) => `- ${value}`).join('\n')}\n` : ''

  const flashcards = note.flashcards.length
    ? `\n## Flashcards\n\n${note.flashcards.map((card) => `- Q: ${card.front}\n  A: ${card.back}`).join('\n')}\n`
    : ''

  return `# ${lecture.title}

Generated with ${note.model}

## Summary

${note.summary}
${list('Outline', note.outline)}
${list('Key Points', note.keyPoints)}
${list('Definitions', note.definitions)}
${list('Open Questions', note.openQuestions)}
${list('Review Tasks', note.reviewTasks)}
${flashcards}
${materialContextToMarkdown(materials, segments)}
## Transcript

${transcript}
`
}

export function downloadText(filename: string, body: string, type = 'text/markdown') {
  const url = URL.createObjectURL(new Blob([body], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function flashcardsToCsv(note?: LectureNote) {
  if (!note) return ''
  return note.flashcards
    .map((card) => `"${card.front.replaceAll('"', '""')}","${card.back.replaceAll('"', '""')}"`)
    .join('\n')
}
