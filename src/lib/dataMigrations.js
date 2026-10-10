import { getAllContacts, updateContact } from './contacts'
import { getAllGroups, groupsStore } from './groups'
import { formerToArchivePlan } from './archive'
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

  // Los antiguos miembros pasan al archivo y se quita el grupo «Antiguos miembros».
  if (!isMigrationDone(MIGRATIONS.formerToArchive2026)) {
    const plan = formerToArchivePlan(getAllContacts(), getAllGroups(), now)
    for (const { id, patch } of plan.contactPatches) updateContact(id, patch)
    if (plan.groupId) groupsStore.remove(plan.groupId)
    markMigrationDone(MIGRATIONS.formerToArchive2026, now)
    ran.push(MIGRATIONS.formerToArchive2026)
  }

  return ran
}
