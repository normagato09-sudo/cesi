// Ajustes de una sola vez para convertir la trayectoria en texto de algunos miembros, decididos
// al revisar la conversión con los datos reales (29/09/2026). Van por id de contacto y solo se
// usan al convertir (ver migrateRoles en trajectory.js): a quien ya tiene `roles` no le afectan.
// Cuando todos los dispositivos tengan la trayectoria nueva, se puede borrar este archivo.
export const TRAJECTORY_FIXES = {
  // Errata en el cargo de la ficha: el de la trayectoria en texto es el correcto.
  '45e7efa5-fc08-434e-ad88-70c69b9dcabb': { role: 'Revisor de Postulaciones' },
  // Siguen con los dos roles a la vez.
  '1028aebc-5035-4b66-b84b-c2fb00aaf36b': { areas: { Profesor: 'Profesores' }, current: ['Profesor'] },
  'dae86de3-199c-4775-8e11-445670a4ecb0': { areas: { Mod: 'Moderación' }, current: ['Mod'] },
  // Dejaron el rol anterior al empezar el nuevo: solo falta su departamento.
  '38557b44-74f9-4477-8975-20b9f40c0051': { areas: { Profesor: 'Profesores' } },
  'cfcd7328-3aa1-4ec3-a48b-6c7569a9be70': { areas: { Subdirector: 'Directivo' } },
  '574211ae-3045-4e41-8198-4d46de634ef7': { areas: { 'Soporte Técnico': 'Técnico' } },
}
