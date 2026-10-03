import { createCollection } from './store'

// Reglas por tipo de reunión. Ya no se aplican ni se pueden editar desde la app; solo se
// conservan los datos guardados (sincronización con Supabase y copias de seguridad).

export const STORAGE_KEY = 'cesi_rules_v1'

export const rulesStore = createCollection(STORAGE_KEY, { prefix: 'rule' })

export function getAllRules() {
  return rulesStore.getAll()
}
