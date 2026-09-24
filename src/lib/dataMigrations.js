import { getAllContacts, updateContact } from './contacts'
import { getAllVacancies, vacanciesStore } from './vacancies'
import { resetDepartments } from './departments'
import { saveTeamAreas } from './team'
import { MIGRATIONS, isMigrationDone, markMigrationDone } from './migrations'

// Migraciones únicas de datos. La app llama a runPendingMigrations() cuando ya ha descargado los
// datos de la nube (o no hay sincronización). Cada una deja su marca, que sincroniza, y los
// cambios se guardan como cambios normales, así también llegan a Supabase.
// Devuelve los ids de las migraciones que se han hecho ahora (vacío si no había ninguna).
export function runPendingMigrations(now = new Date()) {
  const ran = []

  if (!isMigrationDone(MIGRATIONS.departments2026)) {
    const plan = resetDepartments(getAllContacts(), getAllVacancies())
    for (const { id, patch } of plan.contactPatches) updateContact(id, patch)
    for (const { id, patch } of plan.vacancyPatches) vacanciesStore.update(id, patch)
    saveTeamAreas(plan.list)
    markMigrationDone(MIGRATIONS.departments2026, now)
    ran.push(MIGRATIONS.departments2026)
  }

  return ran
}
