import { describe, expect, it } from 'vitest'
import { activeCourseId, createCourseDraft, filterLecturesByCourse } from './courses'
import type { Course, Lecture } from './domain'

const courses: Course[] = [
  { id: 'course-a', title: 'Biology', createdAt: '2026-06-26T00:00:00.000Z' },
  { id: 'course-b', title: 'Physics', createdAt: '2026-06-26T00:00:00.000Z' },
]

const lectures: Lecture[] = [
  {
    id: 'lecture-a',
    courseId: 'course-a',
    title: 'Cells',
    status: 'ready',
    consentConfirmed: true,
    createdAt: '2026-06-26T00:00:00.000Z',
    updatedAt: '2026-06-26T00:00:00.000Z',
  },
  {
    id: 'lecture-b',
    courseId: 'course-b',
    title: 'Forces',
    status: 'ready',
    consentConfirmed: true,
    createdAt: '2026-06-26T00:00:00.000Z',
    updatedAt: '2026-06-26T00:00:00.000Z',
  },
]

describe('course helpers', () => {
  it('creates a trimmed course draft', () => {
    const course = createCourseDraft('  Chemistry  ', '2026-06-26T00:00:00.000Z')

    expect(course.title).toBe('Chemistry')
    expect(course.id).toMatch(/^course_/)
  })

  it('chooses a valid active course or falls back to the first course', () => {
    expect(activeCourseId({ id: 'settings', activeProvider: 'openai', activeCourseId: 'course-b', chunkSeconds: 60, updatedAt: '' }, courses)).toBe(
      'course-b',
    )
    expect(activeCourseId({ id: 'settings', activeProvider: 'openai', activeCourseId: 'missing', chunkSeconds: 60, updatedAt: '' }, courses)).toBe(
      'course-a',
    )
  })

  it('filters lectures by active course', () => {
    expect(filterLecturesByCourse(lectures, 'course-a').map((lecture) => lecture.id)).toEqual(['lecture-a'])
  })
})
