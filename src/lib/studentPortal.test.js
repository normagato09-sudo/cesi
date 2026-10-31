import { describe, expect, it } from 'vitest'
import {
  cellLabel,
  copyMondayToWeekdays,
  emptyHours,
  fichaPatch,
  formFromProfile,
  hoursFromWeek,
  initials,
  newStudentFromPortal,
  portalDiffers,
  profileRowFromForm,
  toggleHour,
  totalHours,
  validatePortalForm,
  weekFromHours,
  zoneShort,
} from './studentPortal'
import { validateStudent } from './students'
import { validateWeek } from './weeklySchedule'

function hoursOf(map) {
  let hours = emptyHours()
  for (const [day, list] of Object.entries(map)) for (const h of list) hours = toggleHour(hours, Number(day), h, true)
  return hours
}

describe('weekFromHours', () => {
  it('junta las horas seguidas y la última acaba a las 23:59', () => {
    const week = weekFromHours(hoursOf({ 1: [17, 18, 20], 0: [22, 23] }))
    expect(week.find((d) => d.day === 1)).toEqual({ day: 1, enabled: true, slots: [{ start: '17:00', end: '19:00' }, { start: '20:00', end: '21:00' }] })
    expect(week.find((d) => d.day === 0).slots).toEqual([{ start: '22:00', end: '23:59' }])
    expect(week.find((d) => d.day === 3)).toEqual({ day: 3, enabled: false, slots: [] })
    expect(validateWeek(week)).toBeNull()
  })

  it('ida y vuelta con hoursFromWeek', () => {
    const hours = hoursOf({ 2: [0, 1, 5], 6: [23] })
    const back = hoursFromWeek(weekFromHours(hours))
    expect([...back[2]].sort((a, b) => a - b)).toEqual([0, 1, 5])
    expect([...back[6]]).toEqual([23])
    expect(totalHours(back)).toBe(4)
  })
})

describe('tabla', () => {
  it('copia el lunes a martes–viernes y etiqueta cada celda', () => {
    const hours = copyMondayToWeekdays(hoursOf({ 1: [9, 10], 6: [12] }))
    expect(totalHours(hours)).toBe(11)
    expect([...hours[6]]).toEqual([12])
    expect(cellLabel(1, 17)).toBe('lunes de 17:00 a 18:00')
  })
})

describe('formulario', () => {
  const detected = { country: 'MX', timeZone: 'America/Mexico_City' }

  it('la primera vez propone nombre, Discord y la zona del navegador', () => {
    const form = formFromProfile(null, { display_name: 'Ana López', discord_username: 'ana_l' }, detected)
    expect(form).toMatchObject({ fullName: 'Ana López', discord: 'ana_l', country: 'MX', timeZone: 'America/Mexico_City', birthdayDay: '' })
  })

  it('marca lo que falta', () => {
    const errors = validatePortalForm({ ...formFromProfile(null, {}, { country: '', timeZone: '' }), birthdayDay: 30, birthdayMonth: 2 })
    expect(Object.keys(errors).sort()).toEqual(['birthday', 'country', 'fullName', 'hours'])
  })

  it('la zona tiene que ser del país', () => {
    const form = { ...formFromProfile(null, { display_name: 'Ana' }, detected), country: 'ES', hours: hoursOf({ 1: [9] }) }
    expect(validatePortalForm(form)).toEqual({ timeZone: 'Elige tu zona horaria.' })
  })

  it('guarda el cumpleaños como MM-DD', () => {
    const form = { ...formFromProfile(null, { display_name: ' Ana   López ' }, detected), birthdayDay: 5, birthdayMonth: 3, hours: hoursOf({ 1: [9] }) }
    expect(validatePortalForm(form)).toEqual({})
    const row = profileRowFromForm(form)
    expect(row).toMatchObject({ full_name: 'Ana López', country: 'MX', time_zone: 'America/Mexico_City', birthday: '03-05' })
    expect(formFromProfile(row, {}, detected)).toMatchObject({ birthdayDay: 5, birthdayMonth: 3 })
  })

  it('zona en formato corto, con la región en español', () => {
    expect(zoneShort('Europe/Madrid')).toBe('Europa/Madrid')
    expect(zoneShort('America/Guayaquil')).toBe('América/Guayaquil')
    expect(zoneShort('America/Argentina/Buenos_Aires')).toBe('América/Argentina/Buenos Aires')
    expect(zoneShort('')).toBe('')
  })

  it('iniciales', () => {
    expect(initials('Ana María López')).toBe('AL')
    expect(initials('ana')).toBe('A')
    expect(initials('')).toBe('?')
  })
})

describe('con mi ficha', () => {
  const availability = weekFromHours(hoursOf({ 1: [17, 18] }))
  const portal = { completed_at: '2026-10-29T10:00:00Z', full_name: 'Ana López', discord: 'ana_l', country: 'MX', time_zone: 'America/Mexico_City', availability }
  const student = { name: 'Ana', country: 'MX', timeZone: 'America/Mexico_City', availability, notes: 'mías' }

  it('avisa si cambian país, zona o disponibilidad (no el nombre)', () => {
    expect(portalDiffers(portal, student)).toBe(false)
    expect(portalDiffers({ ...portal, full_name: 'Otra' }, student)).toBe(false)
    expect(portalDiffers({ ...portal, time_zone: 'America/Cancun' }, student)).toBe(true)
    expect(portalDiffers({ ...portal, availability: weekFromHours(hoursOf({ 1: [17] })) }, student)).toBe(true)
    expect(portalDiffers({ ...portal, completed_at: null, country: 'ES' }, student)).toBe(false)
  })

  it('copiar a la ficha: solo país, zona y disponibilidad', () => {
    expect(Object.keys(fichaPatch(portal)).sort()).toEqual(['availability', 'country', 'timeZone'])
    expect(portalDiffers(portal, { ...student, country: 'ES', ...fichaPatch(portal) })).toBe(false)
  })

  it('la ficha nueva desde Accesos es válida y nace con todo copiado', () => {
    const data = newStudentFromPortal(portal, { email: 'ana@example.com' }, '2026-10-29')
    expect(validateStudent(data)).toBeNull()
    expect(data).toMatchObject({ name: 'Ana López', email: 'ana@example.com', discord: 'ana_l', enrolledAt: '2026-10-29' })
    expect(portalDiffers(portal, data)).toBe(false)
  })
})
