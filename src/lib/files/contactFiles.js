import { getAllContacts, updateContact } from '../contacts'
import { loadSyncState } from '../sync/engine'
import { deleteFile, hasRemoteFiles, promoteDeviceFile } from './files'

// Archivos que cuelgan de un contacto: su foto y, si es candidato (o se incorporó desde una
// candidatura), su CV.
export function contactFileRefs(contact) {
  const refs = []
  if (contact?.photo) refs.push({ ref: contact.photo, folder: 'photos' })
  for (const cv of [contact?.candidacy?.cv, contact?.teamProfile?.cv]) {
    if (cv && cv.store) refs.push({ ref: cv, folder: 'cvs' })
  }
  return refs
}

export function deleteContactFiles(contact) {
  return Promise.all(contactFileRefs(contact).map(({ ref }) => deleteFile(ref)))
}

// Al activar la sincronización, las fotos y CV que estaban solo en este dispositivo se suben.
export async function promoteDeviceFiles() {
  if (!hasRemoteFiles() || !loadSyncState()?.initialized) return
  for (const contact of getAllContacts()) {
    const patch = {}
    if (contact.photo?.store === 'device') patch.photo = await promoteDeviceFile(contact.photo, 'photos')
    const cv = contact.candidacy?.cv
    if (cv?.store === 'device') patch.candidacy = { ...contact.candidacy, cv: await promoteDeviceFile(cv, 'cvs') }
    const teamCv = contact.teamProfile?.cv
    if (teamCv?.store === 'device') patch.teamProfile = { ...contact.teamProfile, cv: await promoteDeviceFile(teamCv, 'cvs') }
    if (Object.keys(patch).length > 0) updateContact(contact.id, patch)
  }
}
