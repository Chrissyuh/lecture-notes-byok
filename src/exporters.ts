import type { Lecture, LectureNote, TranscriptSegment } from './domain'

export function noteToMarkdown(lecture: Lecture, segments: TranscriptSegment[], note?: LectureNote) {
  const transcript = segments
    .map((segment) => `- ${Math.round(segment.startMs / 1000)}s [${segment.id}]: ${segment.text}`)
    .join('\n')

  if (!note) {
    return `# ${lecture.title}\n\n## Transcript\n\n${transcript}\n`
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
