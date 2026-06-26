import { newId, type AppSettings, type Course, type Lecture } from './domain'

export function createCourseDraft(title: string, createdAt: string): Course {
  const cleanTitle = title.trim()
  if (!cleanTitle) throw new Error('Course title is required')
  return {
    id: newId('course'),
    title: cleanTitle,
    createdAt,
  }
}

export function activeCourseId(settings: AppSettings | undefined, courses: Course[]) {
  if (settings?.activeCourseId && courses.some((course) => course.id === settings.activeCourseId)) {
    return settings.activeCourseId
  }
  return courses[0]?.id
}

export function filterLecturesByCourse(lectures: Lecture[], courseId: string | undefined) {
  if (!courseId) return lectures
  return lectures.filter((lecture) => lecture.courseId === courseId)
}
