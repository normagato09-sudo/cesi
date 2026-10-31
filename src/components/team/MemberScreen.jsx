import { useEffect, useMemo, useState } from 'react'
import { teacherAttendanceActions } from '../../lib/teacherAttendance'
import ContactsView from '../ContactsView.jsx'
import TeamView from '../TeamView.jsx'
import VacancyListView from '../VacancyListView.jsx'
import VacanciesView from '../VacanciesView.jsx'
import StudentsView from '../StudentsView.jsx'
import AttendanceView from '../AttendanceView.jsx'
import { DEFAULT_DEPARTMENTS } from '../../lib/departments'
import { NO_ATTENDANCE_ACTIONS, SECTION_SCREENS, fetchScreenData, screenErrorText } from '../../lib/screenData'
import { useMinuteClock } from '../../hooks/useMinuteClock'
import { findCandidacy } from '../../lib/vacancies'
import { keyOf } from '../../lib/sharedCalendar'
import { addNoteRemote, listAlliancePeople, removeNoteRemote, saveAlliance, saveExternalContact } from '../../lib/alliances'
import AlliancePanel from '../alliances/AlliancePanel.jsx'
import AlliancesView from '../alliances/AlliancesView.jsx'

const noop = () => {}
const NO_RECORDS = []

// Una pantalla de la ceo (Contactos externos, Equipo, Vacantes, Cursos, Alumnos o Asistencia) para
// una persona de equipo con permiso: sus datos de cesi_screen_data (parte 11) en la misma pantalla
// de la ceo, en solo lectura (en este paso, también con «Editar»). asId / asArea: «Ver como» de la
// ceo (una persona o un área). El área Profesor solo ve sus cursos y, con su cuenta, pasa lista en
// sus clases (parte 15); en «Ver como», también en solo lectura. Alianzas crea y edita los
// contactos externos y su seguimiento (parte 16; Directivo, solo ver), y tiene la pantalla Alianzas.
// zone: la de la persona (para «hoy»).
export default function MemberScreen({ client, section, zone, asId = null, asArea = null }) {
  const screen = SECTION_SCREENS[section]
  const now = useMinuteClock()
  const [state, setState] = useState({ key: null, data: null, error: null })
  const [selectedId, setSelectedId] = useState(null)
  const [selectedCandidacyId, setSelectedCandidacyId] = useState(null)
  const key = `${screen}:${asId || ''}:${asArea || ''}`

  useEffect(() => {
    if (!client || !screen) return
    let active = true
    fetchScreenData(client, screen, asId, asArea).then(
      (data) => active && setState({ key, data, error: null }),
      (err) => active && setState({ key, data: null, error: screenErrorText(err) }),
    )
    return () => {
      active = false
    }
  }, [client, screen, asId, asArea, key])

  // Al cambiar de pantalla, nada elegido.
  const [shownKey, setShownKey] = useState(key)
  if (shownKey !== key) {
    setShownKey(key)
    setSelectedId(null)
    setSelectedCandidacyId(null)
  }

  // Pase de lista del profesor (parte 15): lo que guarda se ve al momento aquí y le llega a la ceo.
  const [marked, setMarked] = useState({ key: null, records: [] })
  const attendance = marked.key === key ? marked.records : state.data?.attendance || NO_RECORDS
  const canMark = !!state.data?.canMark && state.key === key
  const students = state.data?.students
  const teacherActions = useMemo(
    () =>
      canMark
        ? teacherAttendanceActions({ client, students, records: attendance, onChange: (update) => setMarked((prev) => ({ key, records: update(prev.key === key ? prev.records : attendance) })) })
        : NO_ATTENDANCE_ACTIONS,
    [canMark, client, students, attendance, key],
  )

  // Alianzas (parte 16): lo que guarda Alianzas sustituye a la ficha en la lista (y le llega a la ceo).
  const allianceOn = !!state.data?.alliance && state.key === key
  const allianceEdit = !!state.data?.allianceEdit && state.key === key
  const [people, setPeople] = useState([])
  useEffect(() => {
    if (!client || !allianceOn) return
    let active = true
    listAlliancePeople(client).then(
      (rows) => active && setPeople(rows || []),
      () => active && setPeople([]),
    )
    return () => {
      active = false
    }
  }, [client, allianceOn])
  const putContact = (doc) => {
    setState((s) =>
      s.key !== key || !s.data
        ? s
        : {
            ...s,
            data: {
              ...s.data,
              contacts: [...s.data.contacts.filter((c) => c.id !== doc.id), doc].sort((a, b) =>
                (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }),
              ),
            },
          },
    )
    return doc
  }
  const allianceApi = {
    save: async (contactId, input) => putContact(await saveAlliance(client, contactId, input)),
    addNote: async (contactId, text) => putContact(await addNoteRemote(client, contactId, text)),
    removeNote: async (contactId, noteId) => putContact(await removeNoteRemote(client, contactId, noteId)),
  }
  const today = keyOf(now, zone)
  const renderAlliance = allianceOn ? (c) => <AlliancePanel contact={c} canEdit={allianceEdit} people={people} api={allianceApi} today={today} /> : null

  if (!screen) return null
  if (state.key !== key || (!state.data && !state.error)) return <p className="member-screen-note">Cargando…</p>
  if (state.error) return <p className="member-screen-note error">{state.error}</p>

  const { contacts, groups, vacancies, courses, extraClasses } = state.data

  if (section === 'alliances') {
    if (!allianceOn) return <p className="member-screen-note">No tienes acceso a esta pantalla.</p>
    return <AlliancesView contacts={contacts} canEdit={allianceEdit} people={people} api={allianceApi} today={today} />
  }

  if (section === 'contacts') {
    return (
      <ContactsView
        readOnly
        editExternal={allianceEdit}
        renderAlliance={renderAlliance}
        contacts={contacts}
        groups={groups}
        rawEvents={[]}
        now={now}
        selectedContactId={selectedId}
        onSelectContact={setSelectedId}
        onAddContact={async (values) => putContact(await saveExternalContact(client, null, values))}
        onEditContact={async (id, values) => putContact(await saveExternalContact(client, id, values))}
        onRemoveContact={noop}
        onOpenEvent={noop}
        onNewMeetingWithContact={noop}
        onCreateGroup={noop}
        onRenameGroup={noop}
        onGroupColor={noop}
        onDeleteGroup={noop}
        areas={DEFAULT_DEPARTMENTS}
        onSaveTeamProfile={noop}
        onArchiveContact={noop}
        onUnarchiveContact={noop}
        onReturnToTeam={noop}
        onOpenTeamMember={noop}
        onOpenCandidate={noop}
      />
    )
  }

  if (section === 'team') {
    return (
      <TeamView
        readOnly
        contacts={contacts}
        groups={groups}
        rawEvents={[]}
        now={now}
        areas={DEFAULT_DEPARTMENTS}
        selectedMemberId={selectedId}
        onSelectMember={setSelectedId}
        onSaveProfile={noop}
        onMarkFormer={noop}
        onKeepActive={noop}
        onRemoveFromTeam={noop}
        onOpenEvent={noop}
        onNewMeeting={noop}
        onOpenCandidate={noop}
        onReorder={noop}
      />
    )
  }

  if (section === 'vacancies') {
    const open = selectedId || (selectedCandidacyId && findCandidacy(contacts, selectedCandidacyId))
    if (!open) return <VacancyListView vacancies={vacancies} contacts={contacts} now={now} areas={DEFAULT_DEPARTMENTS} onOpenVacancy={setSelectedId} />
    return (
      <VacanciesView
        readOnly
        vacancies={vacancies}
        contacts={contacts}
        rawEvents={[]}
        now={now}
        areas={DEFAULT_DEPARTMENTS}
        groups={groups}
        selectedVacancyId={selectedId}
        onSelectVacancy={setSelectedId}
        selectedCandidacyId={selectedCandidacyId}
        onSelectCandidacy={setSelectedCandidacyId}
        onCreateVacancy={noop}
        onUpdateVacancy={noop}
        onDeleteVacancy={noop}
        onAddCandidacy={noop}
        onEditCandidacy={noop}
        onRemoveCandidacy={noop}
        onCandidateStatus={noop}
        onFindInterviewSlot={noop}
        onIncorporate={noop}
        onOpenEvent={noop}
        onOpenTeamMember={noop}
      />
    )
  }

  if (section === 'attendance') {
    return (
      <AttendanceView
        readOnly
        courses={courses}
        students={students}
        contacts={contacts}
        attendance={attendance}
        extraClasses={extraClasses}
        actions={teacherActions}
        canMark={canMark}
        client={client}
      />
    )
  }

  // Cursos y Alumnos (la misma pantalla de la ceo, cada una en su pestaña).
  return (
    <StudentsView
      readOnly
      tab={section}
      students={students}
      courses={courses}
      contacts={contacts}
      attendance={attendance}
      extraClasses={extraClasses}
      attendanceActions={teacherActions}
      canMark={canMark}
      client={client}
      now={now}
      selectedStudentId={selectedId}
      onSelectStudent={setSelectedId}
      onAddStudent={noop}
      onEditStudent={noop}
      onRemoveStudent={noop}
      onCreateCourse={noop}
      onRenameCourse={noop}
      onUpdateCourse={noop}
      onDeleteCourse={noop}
    />
  )
}
