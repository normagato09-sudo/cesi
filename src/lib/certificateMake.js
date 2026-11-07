// Generar el PDF de un certificado en el navegador (parte 44): fuentes incrustadas, firmas y logo
// descargados del bucket privado, y los datos del curso y de la persona.
import { buildCertificatePdf, loadCertificateFonts, nextCertificateCode } from './certificatePdf'
import { courseHours, loadAssetImage } from './certificateAssets'
import { courseClasses } from './attendance'
import { studentAttendance } from './courseOverview'
import { normalizeCourse } from './courses'

// cache: Map(id de firma o logo → imagen), para «Generar todos».
async function assetImage(client, item, cache) {
  if (!item) return null
  if (!cache.has(item.id)) cache.set(item.id, loadAssetImage(client, item))
  return cache.get(item.id)
}

/**
 * Crea el PDF (Blob). info: { course, personName, issuedOn, code, average, attendance, hours,
 * choice: { leftId, rightId, logoId, showStats } }. assets: { signatures, logos }.
 */
export async function makeCertificatePdf(client, info, assets, cache = new Map()) {
  const c = normalizeCourse(info.course)
  const find = (list, id) => (id ? list.find((x) => x.id === id) || null : null)
  const left = find(assets.signatures, info.choice.leftId)
  const right = find(assets.signatures, info.choice.rightId)
  const logo = find(assets.logos, info.choice.logoId)
  const [fonts, leftImg, rightImg, logoImg] = await Promise.all([
    loadCertificateFonts(),
    assetImage(client, left, cache),
    assetImage(client, right, cache),
    assetImage(client, logo, cache),
  ])
  const doc = await buildCertificatePdf(
    {
      personName: info.personName,
      courseName: c.name,
      startDate: c.startDate,
      endDate: c.endDate,
      hours: info.hours,
      issuedOn: info.issuedOn,
      code: info.code,
      showStats: info.choice.showStats,
      average: info.average,
      attendance: info.attendance,
      left: left ? { name: left.name, title: left.title, image: leftImg } : null,
      right: right ? { name: right.name, title: right.title, image: rightImg } : null,
      logo: logo ? { name: logo.name, image: logoImg } : null,
    },
    fonts,
  )
  return doc.output('blob')
}

export const todayKey = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// Datos de un certificado de `studentId` en `course` (media, asistencia, horas y código).
export function certificateInfo({ course, studentId, personName, ctx, issuedOn, choice }) {
  const cert = ctx.certs.get(`${course.id}|${studentId}`) || null
  const codes = [...ctx.certs.values()].map((c) => c.code)
  return {
    course,
    personName,
    issuedOn,
    choice,
    previous: cert,
    // Si ya tenía código, se queda el mismo (el certificado se vuelve a generar).
    code: cert?.code || nextCertificateCode(codes, issuedOn.slice(0, 4)),
    average: ctx.grades?.student.get(`${course.id}|${studentId}`)?.average ?? null,
    attendance: studentAttendance(ctx.attendance, studentId, course.id).percent,
    hours: courseHours(course, courseClasses(course, { extraClasses: ctx.extraClasses, records: ctx.attendance })),
  }
}

