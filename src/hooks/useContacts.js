import { useCallback, useState } from 'react'
import {
  getAllContacts,
  createContact as storageCreateContact,
  updateContact as storageUpdateContact,
  deleteContact as storageDeleteContact,
} from '../lib/contacts'

export function useContacts() {
  const [contacts, setContacts] = useState(() => getAllContacts())

  const refresh = useCallback(() => setContacts(getAllContacts()), [])

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
