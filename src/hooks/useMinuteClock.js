import { useEffect, useState } from 'react'

// Fecha actual que se actualiza justo al empezar cada minuto (para relojes en pantalla).
export function useMinuteClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let timeout
    const schedule = () => {
      const current = new Date()
      const msToNextMinute = 60000 - (current.getSeconds() * 1000 + current.getMilliseconds())
      timeout = setTimeout(() => {
        setNow(new Date())
        schedule()
      }, msToNextMinute + 50)
    }
    schedule()
    return () => clearTimeout(timeout)
  }, [])

  return now
}
