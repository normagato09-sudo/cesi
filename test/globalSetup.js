// Los tests de fechas asumen la zona horaria de España, igual que la usuaria de la app.
export default function setup() {
  process.env.TZ = 'Europe/Madrid'
}
