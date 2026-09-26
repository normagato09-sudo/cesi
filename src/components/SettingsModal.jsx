import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Bell, BellOff, Send, Settings, Smartphone, X } from 'lucide-react'
import { REMINDER_OPTIONS } from '../lib/reminders'
import {
  browserPushEnv,
  enableThisDevice,
  listDevices,
  pushAvailability,
  removeDevice,
  sendTestNotification,
  thisDeviceId,
} from '../lib/push'
import { useSync } from '../lib/sync/syncContext'
import './AvailabilityModal.css'
import './SettingsModal.css'

// Ajustes → Recordatorios: aviso antes de cada reunión (también con la app cerrada).
export default function SettingsModal({ preferences, onSaveReminders, onClose }) {
  const signedIn = !!useSync()
  const [availability] = useState(() => pushAvailability(browserPushEnv({ signedIn })))
  const [devices, setDevices] = useState(null) // null = cargando
  const [currentId, setCurrentId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const canUseDevices = signedIn && availability.reason !== 'no-sync'

  const reload = async () => {
    const [id, list] = await Promise.all([thisDeviceId().catch(() => null), listDevices()])
    setCurrentId(id)
    setDevices(list)
  }

  useEffect(() => {
    if (!canUseDevices) return
    let active = true
    Promise.all([thisDeviceId().catch(() => null), listDevices()])
      .then(([id, list]) => {
        if (!active) return
        setCurrentId(id)
        setDevices(list)
      })
      .catch((err) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [canUseDevices])

  const enabledHere = !!currentId && (devices || []).some((d) => d.id === currentId)

  const run = async (action, doneMessage) => {
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      const result = await action()
      await reload()
      setInfo(typeof doneMessage === 'function' ? doneMessage(result) : doneMessage)
    } catch (err) {
      setError(err.message || 'No se pudo completar. Inténtalo de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  const handleToggle = (on) => {
    if (on) {
      // La zona horaria de este dispositivo es la que se usa para calcular los avisos.
      onSaveReminders({ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || null })
      run(enableThisDevice, 'Avisos activados en este dispositivo.')
    } else {
      run(() => removeDevice(currentId), 'Avisos desactivados en este dispositivo.')
    }
  }

  const handleRemove = (device) => {
    const here = device.id === currentId
    const question = here
      ? '¿Quitar este dispositivo? Dejarás de recibir los avisos aquí.'
      : `¿Quitar «${device.device_name || 'Dispositivo'}»? Dejará de recibir los avisos.`
    if (!window.confirm(question)) return
    run(() => removeDevice(device.id), 'Dispositivo quitado.')
  }

  const handleTest = () =>
    run(sendTestNotification, (result) => {
      const n = result?.sent ?? 0
      return n === 1 ? 'Notificación de prueba enviada a 1 dispositivo.' : `Notificación de prueba enviada a ${n} dispositivos.`
    })

  return (
    <div className="availability-backdrop" onClick={onClose}>
      <div className="availability-modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(e) => e.stopPropagation()}>
        <div className="availability-header">
          <h2 id="settings-title">
            <Settings size={17} strokeWidth={1.75} />
            Ajustes
          </h2>
          <button type="button" className="availability-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="availability-scroll">
          <section className="availability-section">
            <h3>Recordatorios</h3>
            <p className="availability-hint">
              Un aviso antes de cada reunión, también con la app cerrada, en el móvil y en el ordenador. No se avisa de
              los bloques «No disponible» ni de las opciones provisionales. En las reuniones que se repiten se avisa de
              cada día. En cada reunión puedes cambiar el aviso o quitarlo.
            </p>

            {!availability.ok && (
              <p className="settings-notice" role="status">
                <BellOff size={15} strokeWidth={1.75} />
                <span>{availability.message}</span>
              </p>
            )}

            <label className={`settings-switch ${!availability.ok || busy || devices === null ? 'disabled' : ''}`}>
              <input
                type="checkbox"
                checked={enabledHere}
                disabled={!availability.ok || busy || devices === null}
                onChange={(e) => handleToggle(e.target.checked)}
              />
              <span className="settings-switch-track" aria-hidden="true" />
              <span className="settings-switch-text">
                <strong>Avisos en este dispositivo</strong>
                <span>{enabledHere ? 'Activados' : 'Desactivados'}</span>
              </span>
            </label>

            <label className="settings-field">
              <span>Aviso por defecto</span>
              <select
                className="availability-select"
                value={preferences.reminders.defaultMinutes}
                onChange={(e) => onSaveReminders({ defaultMinutes: Number(e.target.value) })}
              >
                {REMINDER_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m} minutos antes
                  </option>
                ))}
              </select>
            </label>

            {canUseDevices && (
              <div className="settings-devices">
                <h4>Dispositivos con los avisos activados</h4>
                {devices === null && !error && <p className="availability-hint">Cargando…</p>}
                {devices?.length === 0 && <p className="availability-hint">Ninguno todavía.</p>}
                {devices?.length > 0 && (
                  <ul>
                    {devices.map((d) => (
                      <li key={d.id}>
                        <Smartphone size={16} strokeWidth={1.75} />
                        <span className="settings-device-text">
                          <strong>
                            {d.device_name || 'Dispositivo'}
                            {d.id === currentId && <span className="settings-device-here">Este dispositivo</span>}
                          </strong>
                          <span>Desde el {format(new Date(d.created_at), "d 'de' MMMM yyyy", { locale: es })}</span>
                        </span>
                        <button type="button" className="settings-device-remove" onClick={() => handleRemove(d)} disabled={busy}>
                          Quitar
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  className="settings-test"
                  onClick={handleTest}
                  disabled={busy || !devices || devices.length === 0}
                >
                  <Send size={14} strokeWidth={1.75} />
                  Enviar notificación de prueba
                </button>
              </div>
            )}

            {error && (
              <div className="availability-error" role="alert">
                {error}
              </div>
            )}
            {info && (
              <p className="settings-info" role="status">
                <Bell size={14} strokeWidth={1.75} />
                {info}
              </p>
            )}
          </section>
        </div>

        <div className="availability-footer">
          <button type="button" className="availability-submit" onClick={onClose}>
            Hecho
          </button>
        </div>
      </div>
    </div>
  )
}
