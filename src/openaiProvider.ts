import { z } from 'zod'
import type { NoteDraft, NotesApiStyle, TranscriptSegment } from './domain'

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

export interface ProviderRequestOptions {
  baseUrl: string
  notesApiStyle: NotesApiStyle
}

function normalizedBaseUrl(baseUrl: string) {
  return (baseUrl.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '')
}

function lectureNotesSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'outline', 'keyPoints', 'definitions', 'openQuestions', 'reviewTasks', 'flashcards', 'citations'],
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
  }
}

function transcriptPrompt(segments: TranscriptSegment[]) {
  return segments
    .map((segment) => {
      const speaker = segment.speaker ? ` ${segment.speaker}` : ''
      return `[${segment.id}] ${Math.round(segment.startMs / 1000)}s${speaker}: ${segment.text}`
    })
    .join('\n')
}

function parseJsonText(value: unknown) {
  const text = String(value ?? '').trim()
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  return notesSchema.parse(JSON.parse(fenced?.[1] ?? text)) as NoteDraft
}

async function providerFetch(apiKey: string, baseUrl: string, path: string, init: RequestInit) {
  const response = await fetch(`${normalizedBaseUrl(baseUrl)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(init.headers ?? {}),
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Provider ${response.status}: ${body.slice(0, 400)}`)
  }

  return response.json()
}

export async function validateOpenAiKey(apiKey: string, baseUrl = 'https://api.openai.com/v1') {
  await providerFetch(apiKey, baseUrl, '/models', { method: 'GET' })
}

export async function transcribeWithOpenAi(apiKey: string, blob: Blob, model: string, baseUrl = 'https://api.openai.com/v1') {
  const file = new File([blob], 'lecture-chunk.webm', { type: blob.type || 'audio/webm' })
  const body = new FormData()
  body.set('file', file)
  body.set('model', model)
  body.set('response_format', 'json')

  const json = await providerFetch(apiKey, baseUrl, '/audio/transcriptions', {
    method: 'POST',
    body,
  })

  return String(json.text ?? '').trim()
}

function responsesPayload(model: string, transcript: string) {
  return {
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
        schema: lectureNotesSchema(),
      },
    },
  }
}

function chatCompletionsPayload(model: string, transcript: string) {
  return {
    model,
    messages: [
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
    response_format: { type: 'json_object' },
  }
}

export function buildNotesRequest(model: string, segments: TranscriptSegment[], notesApiStyle: NotesApiStyle) {
  const transcript = transcriptPrompt(segments)
  if (notesApiStyle === 'chat-completions') {
    return { path: '/chat/completions', body: chatCompletionsPayload(model, transcript) }
  }
  return { path: '/responses', body: responsesPayload(model, transcript) }
}

export function parseNotesResponse(json: any, notesApiStyle: NotesApiStyle) {
  if (notesApiStyle === 'chat-completions') {
    return parseJsonText(json.choices?.[0]?.message?.content)
  }
  const text = json.output_text ?? json.output?.flatMap((item: any) => item.content ?? []).find((part: any) => part.text)?.text
  return parseJsonText(text)
}

export async function generateNotesWithOpenAi(
  apiKey: string,
  segments: TranscriptSegment[],
  model: string,
  options: ProviderRequestOptions,
) {
  const request = buildNotesRequest(model, segments, options.notesApiStyle)
  const json = await providerFetch(apiKey, options.baseUrl, request.path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request.body),
  })

  return parseNotesResponse(json, options.notesApiStyle)
}
