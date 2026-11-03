import { useEffect, useRef } from 'react'
import {
  bestSchedules,
  canText,
  listCoursePeople,
  peopleFromRows,
  proposalText,
  sameSchedule,
  scheduleAction,
  schedulePatch,
} from '../lib/autoSchedule'
import { studentsInCourse } from '../lib/courses'
import { keyOf } from '../lib/sharedCalendar'

const sortedIds = (list) => list.map((s) => s.id).sort()
const sameIds = (a = [], b = []) => a.length === b.length && a.every((id, i) => id === b[i])

/**
 * Horario automático de los cursos organizados («Organizar horario»), al abrir la app o Cursos:
 * si se ha unido o ido algún alumno, antes de empezar el curso se recalcula y se guarda solo; ya
 * empezado, se deja la propuesta en el curso (course.schedulePending) para que la ceo o Directivo
 * la confirmen. scheduler: { client, zone, save(curso, cambio) } (null: nada).
 */
export function useScheduleAutopilot(scheduler, courses, students) {
  // Lo ya intentado en esta sesión (curso → alumnos y horario): si falla, no se repite sin parar.
  const tried = useRef(new Map())

  useEffect(() => {
    if (!scheduler || !courses?.length) return
    const today = keyOf(new Date(), scheduler.zone)
    for (const course of courses) {
      const act = scheduleAction(course, students, today)
      if (act.action === 'none') continue
      const enrolled = sortedIds(studentsInCourse(course.id, students))
      const signature = `${enrolled.join(',')}|${JSON.stringify(course.schedule || null)}`
      if (tried.current.get(course.id) === signature) continue
      // Ya hay una propuesta para estos mismos alumnos: se espera a que la confirmen.
      if (act.action === 'propose' && sameIds(course.schedulePending?.students, enrolled)) continue
      tried.current.set(course.id, signature)
      listCoursePeople(scheduler.client, course.id)
        .then(async (rows) => {
          const { teacher, students: people } = peopleFromRows(rows)
          const [best] = bestSchedules({ course, teacher, students: people })
          const snapshot = { scheduleAuto: { students: sortedIds(people), at: new Date().toISOString() } }
          if (!best || sameSchedule(best.schedule, course.schedule)) {
            // Nada mejor: el horario se queda y se apunta quién hay ahora.
            await scheduler.save(course, { ...snapshot, schedulePending: null })
          } else if (act.action === 'recalc') {
            await scheduler.save(course, schedulePatch(best, people))
          } else {
            await scheduler.save(course, {
              schedulePending: { schedule: best.schedule, text: proposalText(act, best.schedule), canText: canText(best), students: sortedIds(people) },
            })
          }
        })
        .catch(() => {})
    }
  }, [scheduler, courses, students])
}
