import { useRef, useState } from 'react'
import { deleteFile, sameFile } from '../lib/files/files'
import { isEmail, validateContactCountry } from '../lib/contacts'
import { defaultContactZone, zoneValue } from '../lib/timezones'
import { cleanWeek, emptyWeek, normalizeWeek, validateWeek } from '../lib/weeklySchedule'

// Punto de partida al activar la disponibilidad: lunes a viernes de 09:00 a 18:00.
function defaultAvailability() {
  return emptyWeek().map((e) => (e.day >= 1 && e.day <= 5 ? { ...e, enabled: true, slots: [{ start: '09:00', end: '18:00' }] } : e))
}

/**
 * Borrador de los datos de un contacto (nombre, foto, email, teléfono, organización, cargo, país
 * y zona, grupos, disponibilidad y notas). Lo usan el formulario del contacto y el perfil de
 * equipo, para que los datos del contacto se editen siempre en el mismo sitio y se guarden una
 * sola vez, en el contacto.
 */
export function useContactDraft(initialContact, groups = []) {
  const seed = initialContact || {}
  const [name, setName] = useState(seed.name || '')
  const [email, setEmail] = useState(seed.email || '')
  const [phone, setPhone] = useState(seed.phone || '')
  const [organization, setOrganization] = useState(seed.organization || '')
  const [role, setRole] = useState(seed.role || '')
  const [notes, setNotes] = useState(seed.notes || '')
  const [photo, setPhoto] = useState(seed.photo || null)
  // Solo grupos que siguen existiendo.
  const [groupIds, setGroupIds] = useState(() => (seed.groupIds || []).filter((id) => groups.some((g) => g.id === id)))
  // País obligatorio; los contactos nuevos empiezan con España (península y Baleares).
  const [zone, setZone] = useState(() => zoneValue(seed.timeZone, seed.country) || defaultContactZone())
  const [hasAvailability, setHasAvailability] = useState(!!seed.availability)
  const [availability, setAvailability] = useState(() =>
    seed.availability ? normalizeWeek(seed.availability, defaultAvailability()) : defaultAvailability(),
  )
  // Fotos subidas en este formulario: si no se guarda, se borran para no dejar archivos sueltos.
  const uploadedRef = useRef([])

  const handlePhoto = (ref) => {
    if (ref) uploadedRef.current.push(ref)
    setPhoto(ref)
  }

  const toggleGroup = (id) => setGroupIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  // Mensaje de error o null si los datos son válidos.
  const validate = () => {
    if (!name.trim()) return 'El nombre es obligatorio.'
    if (email.trim() && !isEmail(email)) return 'El email no tiene un formato válido.'
    const countryProblem = validateContactCountry(zone || {})
    if (countryProblem) return countryProblem
    if (hasAvailability) {
      const problem = validateWeek(availability)
      if (problem) return `Disponibilidad: ${problem}`
    }
    return null
  }

  // Datos del contacto para guardar.
  const toContactData = () => ({
    name: name.trim(),
    email: email.trim(),
    phone: phone.trim(),
    organization: organization.trim(),
    role: role.trim(),
    notes: notes.trim(),
    groupIds,
    photo,
    country: zone.country,
    timeZone: zone.timeZone,
    // Al guardar desde el formulario el país queda revisado.
    countryUnreviewed: false,
    availability: hasAvailability ? cleanWeek(availability) : null,
  })

  // Tras guardar: la foto anterior (si se ha cambiado o quitado) y las subidas descartadas ya no se usan.
  const commitFiles = () => {
    if (seed.photo && !sameFile(seed.photo, photo)) deleteFile(seed.photo)
    for (const ref of uploadedRef.current) if (!sameFile(ref, photo)) deleteFile(ref)
    uploadedRef.current = []
  }

  // Al cancelar: se borran las fotos subidas en este formulario.
  const discardFiles = () => {
    for (const ref of uploadedRef.current) deleteFile(ref)
    uploadedRef.current = []
  }

  return {
    seed,
    groups,
    values: { name, email, phone, organization, role, notes, photo, groupIds, zone, hasAvailability, availability },
    set: { setName, setEmail, setPhone, setOrganization, setRole, setNotes, setZone, setHasAvailability, setAvailability },
    handlePhoto,
    toggleGroup,
    validate,
    toContactData,
    commitFiles,
    discardFiles,
  }
}
