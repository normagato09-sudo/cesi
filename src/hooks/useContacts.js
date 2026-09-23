import { useCallback, useEffect, useState } from 'react'
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

  // Sincroniza con otras pestañas donde esté abierta la app.
  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === null || e.key === STORAGE_KEY) refresh()
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [refresh])

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
