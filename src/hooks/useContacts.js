import { useCallback, useEffect, useState } from 'react'
import { onStoredDataChanged } from '../lib/dataEvents'
import {
  STORAGE_KEY,
  getAllContacts,
  createContact as storageCreateContact,
  updateContact as storageUpdateContact,
  deleteContact as storageDeleteContact,
} from '../lib/contacts'

export function useContacts() {
  const [contacts, setContacts] = useState(() => getAllContacts())

  const refresh = useCallback(() => setContacts(getAllContacts()), [])

  // Cambios desde otras pestañas o desde otro dispositivo (sincronización).
  useEffect(
    () =>
      onStoredDataChanged((key) => {
        if (key === null || key === STORAGE_KEY) refresh()
      }),
    [refresh],
  )

  const addContact = useCallback(
    (data) => {
      const contact = storageCreateContact(data)
      refresh()
      return contact
    },
    [refresh],
  )

  const editContact = useCallback(
    (id, patch) => {
      const contact = storageUpdateContact(id, patch)
      refresh()
      return contact
    },
    [refresh],
  )

  const removeContact = useCallback(
    (id) => {
      storageDeleteContact(id)
      refresh()
    },
    [refresh],
  )

  return { contacts, addContact, editContact, removeContact, refresh }
}
