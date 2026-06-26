import type { Lecture, LectureNote, TranscriptSegment } from './domain'

export interface LibrarySearchResult {
  lecture: Lecture
  matches: string[]
}

function normalize(value: string) {
  return value.toLowerCase().trim()
}

function includesQuery(value: string, query: string) {
  return normalize(value).includes(query)
}

function clipSnippet(value: string, query: string) {
  const normalizedValue = normalize(value)
  const index = normalizedValue.indexOf(query)
  if (index < 0) return value.slice(0, 120)
  const start = Math.max(0, index - 36)
  const end = Math.min(value.length, index + query.length + 84)
  const prefix = start > 0 ? '...' : ''
  const suffix = end < value.length ? '...' : ''
  return `${prefix}${value.slice(start, end)}${suffix}`
}

export function searchLibrary(
  lectures: Lecture[],
  segments: TranscriptSegment[],
  notes: LectureNote[],
  rawQuery: string,
): LibrarySearchResult[] {
  const query = normalize(rawQuery)
  if (!query) return lectures.map((lecture) => ({ lecture, matches: [] }))

  return lectures
    .map((lecture) => {
      const matches: string[] = []
      if (includesQuery(lecture.title, query)) matches.push(`Title: ${lecture.title}`)

      for (const segment of segments.filter((item) => item.lectureId === lecture.id)) {
        if (includesQuery(segment.text, query)) {
          matches.push(`Transcript ${segment.index + 1}: ${clipSnippet(segment.text, query)}`)
        }
      }

      for (const note of notes.filter((item) => item.lectureId === lecture.id)) {
        const noteFields = [
          note.summary,
          ...note.outline,
          ...note.keyPoints,
          ...note.definitions,
          ...note.openQuestions,
          ...note.reviewTasks,
          ...note.flashcards.flatMap((card) => [card.front, card.back]),
        ]
        const match = noteFields.find((field) => includesQuery(field, query))
        if (match) matches.push(`Notes: ${clipSnippet(match, query)}`)
      }

      return { lecture, matches }
    })
    .filter((result) => result.matches.length > 0)
}
