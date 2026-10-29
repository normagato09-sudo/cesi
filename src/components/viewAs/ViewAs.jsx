import { Suspense, lazy, useCallback, useMemo, useState } from 'react'
import { Eye, LogOut } from 'lucide-react'
import AccountStatusScreen from '../AccountStatusScreen.jsx'
import MemberApp from '../MemberApp.jsx'
import ViewAsPicker from './ViewAsPicker.jsx'
import { ViewAsContext } from './viewAsContext'
import './ViewAs.css'

const StudentPortal = lazy(() => import('../StudentPortal.jsx'))

const noop = () => {}

// «Ver como» (TEMPORAL, solo la ceo): ver la app como un papel sin cerrar sesión.
// - Envuelve la app de la ceo (SyncGate). La app sigue montada pero oculta, así que al «Salir» se
//   vuelve a la misma pantalla. El estado solo vive en memoria: al recargar, se sale.
// - Solo lectura: las vistas previas no reciben el cliente de Supabase (no pueden leer ni escribir
//   nada; los datos se leen una vez al elegir) y van con readOnly (botones de guardar desactivados).
// Para quitarlo: borrar esta carpeta y su uso en SyncGate, Sidebar y App (onViewAs / «Ver como…»).
export default function ViewAs({ client, children }) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [view, setView] = useState(null) // { role, label, ... } (ver ViewAsPicker)

  const open = useCallback(() => setPickerOpen(true), [])
  const value = useMemo(() => ({ open }), [open])

  return (
    <ViewAsContext.Provider value={value}>
      <div className="view-as-host" hidden={!!view}>
        {children}
      </div>

      {pickerOpen && (
        <ViewAsPicker
          client={client}
          onClose={() => setPickerOpen(false)}
          onPick={(next) => {
            setPickerOpen(false)
            setView(next)
          }}
        />
      )}

      {view && (
        <div className="view-as-layer">
          <div className="view-as-banner" role="status">
            <Eye size={16} strokeWidth={2} aria-hidden="true" />
            <span>
              Estás viendo la app como <strong>{view.label}</strong> · Solo lectura
            </span>
            <button type="button" onClick={() => setView(null)}>
              <LogOut size={15} strokeWidth={2} />
              Salir
            </button>
          </div>
          <div className="view-as-content">
            {view.role === 'pendiente' && <AccountStatusScreen kind="waiting" email="persona@ejemplo.com" readOnly onSignOut={noop} />}
            {view.role === 'equipo' && (
              <MemberApp client={null} email={view.email} name={view.name} area={view.area} levels={view.levels} readOnly onSignOut={noop} />
            )}
            {view.role === 'alumno' && (
              <Suspense fallback={<div className="app-loading" />}>
                <StudentPortal client={null} userId={null} preview={{ account: view.account, profile: view.profile }} readOnly onSignOut={noop} />
              </Suspense>
            )}
          </div>
        </div>
      )}
    </ViewAsContext.Provider>
  )
}
