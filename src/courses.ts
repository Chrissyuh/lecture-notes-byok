import { newId, type AppSettings, type Course, type Lecture } from './domain'

export function createCourseDraft(title: string, createdAt: string): Course {
  const cleanTitle = cleanCourseTitle(title)
  if (!cleanTitle) throw new Error('Course title is required')
  return {
    id: newId('course'),
    title: cleanTitle,
    createdAt,
  }
}

export function cleanCourseTitle(title: string) {
  return title.trim()
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

export function cleanLectureTitle(title: string) {
  return title.trim() || 'Untitled lecture'
}

export function canMoveLectureToCourse(courseId: string, courses: Course[]) {
  return courses.some((course) => course.id === courseId)
}

export function canDeleteCourse(courseId: string, courses: Course[], lectures: Lecture[]) {
  return courses.length > 1 && lectures.every((lecture) => lecture.courseId !== courseId)
}
