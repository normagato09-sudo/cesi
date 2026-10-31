import './ReservarPage.css'

// El enlace de reservas ya no se usa: cualquier enlace muestra que ya no está disponible.
export default function ReservarClosed() {
  return (
    <main className="rp-closed">
      <h1>Este enlace ya no está disponible</h1>
      <p>Si querías reunirte con CIFA, escríbenos por los canales habituales.</p>
    </main>
  )
}
