import { useEffect, useState } from 'react'
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

const noop = () => {}

// Una pantalla de la ceo (Contactos externos, Equipo, Vacantes, Cursos, Alumnos o Asistencia) para
// una persona de equipo con permiso: sus datos de cesi_screen_data (parte 11) en la misma pantalla
// de la ceo, en solo lectura (en este paso, también con «Editar»). asId: «Ver como» de la ceo.
export default function MemberScreen({ client, section, asId = null }) {
  const screen = SECTION_SCREENS[section]
  const now = useMinuteClock()
  const [state, setState] = useState({ key: null, data: null, error: null })
  const [selectedId, setSelectedId] = useState(null)
  const [selectedCandidacyId, setSelectedCandidacyId] = useState(null)
  const key = `${screen}:${asId || ''}`

  useEffect(() => {
    if (!client || !screen) return
    let active = true
    fetchScreenData(client, screen, asId).then(
      (data) => active && setState({ key, data, error: null }),
      (err) => active && setState({ key, data: null, error: screenErrorText(err) }),
    )
    return () => {
      active = false
    }
  }, [client, screen, asId, key])

  // Al cambiar de pantalla, nada elegido.
  const [shownKey, setShownKey] = useState(key)
  if (shownKey !== key) {
    setShownKey(key)
    setSelectedId(null)
    setSelectedCandidacyId(null)
  }

  if (!screen) return null
  if (state.key !== key || (!state.data && !state.error)) return <p className="member-screen-note">Cargando…</p>
  if (state.error) return <p className="member-screen-note error">{state.error}</p>

  const { contacts, groups, vacancies, courses, students, attendance, extraClasses } = state.data

  if (section === 'contacts') {
    return (
      <ContactsView
        readOnly
        contacts={contacts}
        groups={groups}
        rawEvents={[]}
        now={now}
        selectedContactId={selectedId}
        onSelectContact={setSelectedId}
        onAddContact={noop}
        onEditContact={noop}
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
        actions={NO_ATTENDANCE_ACTIONS}
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
      attendanceActions={NO_ATTENDANCE_ACTIONS}
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
