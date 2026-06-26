import { z } from 'zod'
import type { NoteDraft, TranscriptSegment } from './domain'

const notesSchema = z.object({
  summary: z.string(),
  outline: z.array(z.string()).default([]),
  keyPoints: z.array(z.string()).default([]),
  definitions: z.array(z.string()).default([]),
  openQuestions: z.array(z.string()).default([]),
  reviewTasks: z.array(z.string()).default([]),
  flashcards: z.array(z.object({ front: z.string(), back: z.string() })).default([]),
  citations: z.array(z.object({ label: z.string(), segmentIds: z.array(z.string()) })).default([]),
})

async function openaiFetch(apiKey: string, path: string, init: RequestInit) {
  const response = await fetch(`https://api.openai.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(init.headers ?? {}),
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`OpenAI ${response.status}: ${body.slice(0, 400)}`)
  }

  return response.json()
}

export async function validateOpenAiKey(apiKey: string) {
  await openaiFetch(apiKey, '/models', { method: 'GET' })
}

export async function transcribeWithOpenAi(apiKey: string, blob: Blob, model: string) {
  const file = new File([blob], 'lecture-chunk.webm', { type: blob.type || 'audio/webm' })
  const body = new FormData()
  body.set('file', file)
  body.set('model', model)
  body.set('response_format', 'json')

  const json = await openaiFetch(apiKey, '/audio/transcriptions', {
    method: 'POST',
    body,
  })

  return String(json.text ?? '').trim()
}

export async function generateNotesWithOpenAi(apiKey: string, segments: TranscriptSegment[], model: string) {
  const transcript = segments
    .map((segment) => `[${segment.id}] ${Math.round(segment.startMs / 1000)}s: ${segment.text}`)
    .join('\n')

  const json = await openaiFetch(apiKey, '/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'system',
          content:
            'Create lecture notes as compact JSON. Every generated item that uses lecture content should cite transcript segment ids when possible.',
        },
        {
          role: 'user',
          content: `Return only JSON with summary, outline, keyPoints, definitions, openQuestions, reviewTasks, flashcards, and citations.\n\n${transcript}`,
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'lecture_notes',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: [
              'summary',
              'outline',
              'keyPoints',
              'definitions',
              'openQuestions',
              'reviewTasks',
              'flashcards',
              'citations',
            ],
            properties: {
              summary: { type: 'string' },
              outline: { type: 'array', items: { type: 'string' } },
              keyPoints: { type: 'array', items: { type: 'string' } },
              definitions: { type: 'array', items: { type: 'string' } },
              openQuestions: { type: 'array', items: { type: 'string' } },
              reviewTasks: { type: 'array', items: { type: 'string' } },
              flashcards: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['front', 'back'],
                  properties: {
                    front: { type: 'string' },
                    back: { type: 'string' },
                  },
                },
              },
              citations: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['label', 'segmentIds'],
                  properties: {
                    label: { type: 'string' },
                    segmentIds: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    }),
  })

  const text = json.output_text ?? json.output?.flatMap((item: any) => item.content ?? []).find((part: any) => part.text)?.text
  return notesSchema.parse(JSON.parse(String(text))) as NoteDraft
}
