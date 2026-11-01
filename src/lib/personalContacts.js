import { validateContactCountry } from './contacts'

// Contactos personales de cada persona de equipo (ver supabase/parte24_contactos_de_cada_persona.sql):
// privados, solo los ve su dueño. Se leen y escriben directamente en team_contacts y
// team_contact_groups (las reglas de acceso solo dejan tocar los propios). Se usan con las mismas
// pantallas que mis contactos, así que se pasan a la misma forma: { id, name, organization, role,
// country, timeZone, email, phone, notes, groupIds, createdAt, updatedAt }.

export function rowToContact(r) {
  return {
    id: r.id,
    name: r.name || '',
    organization: r.organization || '',
    role: r.role || '',
    country: r.country || '',
    timeZone: r.time_zone || '',
    email: r.email || '',
    phone: r.phone || '',
    notes: r.notes || '',
    groupIds: r.group_ids || [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    // Es suyo: lo puede editar (ver isExternalContact).
    external: true,
  }
}

// Lo que se guarda de un contacto (lo del formulario; sin foto ni disponibilidad).
export function contactToRow(values) {
  const problem = validateContactCountry(values)
  if (problem) throw new Error(problem)
  const name = (values.name || '').trim()
  if (!name) throw new Error('Escribe el nombre.')
  return {
    name,
    organization: (values.organization || '').trim(),
    role: (values.role || '').trim(),
    country: values.country,
    time_zone: values.timeZone,
    email: (values.email || '').trim(),
    phone: (values.phone || '').trim(),
    notes: (values.notes || '').trim(),
    group_ids: Array.isArray(values.groupIds) ? values.groupIds : [],
  }
}

export function rowToGroup(r) {
  return { id: r.id, name: r.name, color: r.color || '' }
}

const byName = (a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' })

function check({ data, error }) {
  if (error) throw new Error(personalErrorText(error))
  return data
}

export async function listPersonalContacts(client) {
  return (check(await client.from('team_contacts').select('*')) || []).map(rowToContact).sort(byName)
}

export async function listPersonalGroups(client) {
  return (check(await client.from('team_contact_groups').select('*')) || []).map(rowToGroup).sort(byName)
}

export async function createPersonalContact(client, values) {
  return rowToContact(check(await client.from('team_contacts').insert(contactToRow(values)).select().single()))
}

export async function updatePersonalContact(client, id, values) {
  return rowToContact(check(await client.from('team_contacts').update(contactToRow(values)).eq('id', id).select().single()))
}

export async function deletePersonalContact(client, id) {
  check(await client.from('team_contacts').delete().eq('id', id))
}

export async function createPersonalGroup(client, name, color = '') {
  return rowToGroup(check(await client.from('team_contact_groups').insert({ name: name.trim(), color }).select().single()))
}

export async function updatePersonalGroup(client, id, patch) {
  check(await client.from('team_contact_groups').update(patch).eq('id', id))
}

export async function deletePersonalGroup(client, id) {
  check(await client.from('team_contact_groups').delete().eq('id', id))
}

export function personalErrorText(err) {
  if (err?.code === '42P01' || err?.code === 'PGRST205') return 'Falta ejecutar en Supabase el SQL de la parte 24 (contactos de cada persona).'
  return err?.message || 'No se pudo guardar. Comprueba la conexión.'
}
