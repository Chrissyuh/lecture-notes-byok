import { describe, expect, it } from 'vitest'
import type { TranscriptSegment } from './domain'
import { buildNotesRequest, parseNotesResponse } from './openaiProvider'

const segments: TranscriptSegment[] = [
  {
    id: 'seg-1',
    lectureId: 'lecture-1',
    index: 0,
    startMs: 0,
    endMs: 60_000,
    text: 'Entropy measures energy dispersal.',
    uncertain: false,
    createdAt: '2026-06-26T00:00:00.000Z',
  },
]

const noteJson = {
  summary: 'Entropy was introduced.',
  outline: ['Entropy'],
  keyPoints: ['Entropy measures energy dispersal.'],
  definitions: [],
  openQuestions: [],
  reviewTasks: [],
  flashcards: [{ front: 'What does entropy measure?', back: 'Energy dispersal.' }],
  citations: [{ label: 'Entropy', segmentIds: ['seg-1'] }],
}

describe('OpenAI-compatible provider helpers', () => {
  it('builds Responses API note requests by default', () => {
    const request = buildNotesRequest('gpt-test', segments, 'responses')

    expect(request.path).toBe('/responses')
    expect(request.body).toMatchObject({
      model: 'gpt-test',
      text: {
        format: {
          type: 'json_schema',
          name: 'lecture_notes',
        },
      },
    })
  })

  it('builds chat-completions note requests for compatible endpoints', () => {
    const request = buildNotesRequest('local-model', segments, 'chat-completions')

    expect(request.path).toBe('/chat/completions')
    expect(request.body).toMatchObject({
      model: 'local-model',
      response_format: { type: 'json_object' },
    })
  })

  it('parses Responses and chat-completions note payloads', () => {
    expect(parseNotesResponse({ output_text: JSON.stringify(noteJson) }, 'responses')).toMatchObject({
      summary: 'Entropy was introduced.',
    })
    expect(
      parseNotesResponse(
        {
          choices: [{ message: { content: `\`\`\`json\n${JSON.stringify(noteJson)}\n\`\`\`` } }],
        },
        'chat-completions',
      ),
    ).toMatchObject({
      flashcards: [{ front: 'What does entropy measure?', back: 'Energy dispersal.' }],
    })
  })
})
