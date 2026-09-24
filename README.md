# CESI

CESI es un calendario propio para organizar reuniones y disponibilidad. Funciona en el navegador y se puede instalar en el móvil o el ordenador como aplicación (PWA). No necesita servidor ni cuenta: todos los datos se guardan en el propio dispositivo.

## Funciones

- **Calendario** con vistas de Mes, Semana y Día. En el móvil, la vista Semana muestra 3 días.
- **Reuniones y franjas "No disponible"**, con categorías, enlace de videollamada, descripción y repeticiones (diaria, semanal, mensual o anual).
- **Arrastrar y redimensionar** reuniones en las vistas Semana y Día, también con el dedo.
- **Detección de solapamientos**: avisa si una franja ya está ocupada.
- **Horario y preferencias**: horario habitual con varias franjas por día, margen entre reuniones y reglas por tipo de reunión (días, mañana/tarde o franja propia, duración máxima y máximo al día para una categoría o etiqueta). Si una reunión incumple una regla o deja menos margen del configurado con la reunión anterior o la siguiente, avisa con el motivo y deja guardarla igualmente.
- **Buscar hueco**: solo propone huecos dentro de tu horario, con el margen, las reglas del tipo de reunión y la disponibilidad de los participantes. Si no hay huecos, dice qué contacto lo impide.
- **Proponer varias opciones**: marca de 2 a 5 huecos, se guardan como reuniones provisionales y se genera un mensaje para enviar por WhatsApp, email o copiar. Desde "Propuestas pendientes" confirmas la opción elegida.
- **Etiquetas** en las reuniones.
- **Filtro del calendario** por categoría y por etiqueta, con un aviso bien visible mientras está activo.
- **Notas de cada reunión**, con guardado automático. En las reuniones que se repiten, cada día tiene sus propias notas. El bloque "Sin notas" de la barra lateral recuerda las reuniones de los últimos 7 días que aún no tienen notas.
- **Resumen** con la próxima reunión y las horas ocupadas y libres de hoy.
- **Contactos**: ficha con email, teléfono, organización, cargo, notas, país y zona horaria, disponibilidad habitual, grupos y la lista de próximas reuniones y reuniones anteriores con cada contacto (con el principio de sus notas).
- **Grupos de contactos** (p. ej. "Profesores", "Equipo"), con color. Se filtran en Contactos y en la lista de participantes se puede añadir un grupo entero de una vez.
- **Participantes** elegidos de una lista desplegable conectada a Contactos. Desde la lista también se puede crear un contacto nuevo o añadir un invitado solo para esa reunión. Si un participante está en otro país, se ve también su hora local.
- **Copia de seguridad**: exportar e importar todos los datos en un archivo JSON.
- **Sincronización entre pestañas**: si la app está abierta en varias pestañas del mismo navegador, los cambios se reflejan en todas.

## Cómo arrancarla

Necesitas [Node.js](https://nodejs.org/) 20.19 o superior.

```bash
npm install
npm run dev
```

Abre la dirección que aparece en la terminal (normalmente http://localhost:5173).

Otros comandos:

| Comando           | Qué hace                                      |
| ----------------- | --------------------------------------------- |
| `npm run build`   | Genera la versión de producción en `dist/`.   |
| `npm run preview` | Sirve localmente la versión de `dist/`.       |
| `npm run lint`    | Revisa el código con ESLint.                  |
| `npm test`        | Ejecuta los tests (Vitest).                   |

La lista de países (`src/lib/countries.js`) se genera a partir de la tz database de IANA con `node scripts/generate-countries.mjs`. Vuelve a ejecutarlo si quieres actualizar las zonas horarias.

## Despliegue (GitHub → Vercel)

El proyecto está en GitHub y conectado a Vercel:

1. Haz tus cambios y súbelos a la rama `main` (`git push origin main`).
2. Vercel detecta el push, ejecuta `npm run build` y publica la carpeta `dist/` automáticamente.
3. Los pushes a otras ramas generan despliegues de vista previa.

No hace falta configurar variables de entorno.

## Dónde se guardan los datos

Todo se guarda en el `localStorage` del navegador, **solo en ese dispositivo y en ese navegador**. No se envía nada a ningún servidor.

| Clave                    | Contenido                                        |
| ------------------------ | ------------------------------------------------ |
| `cesi_events_v1`         | Reuniones, franjas no disponibles y opciones provisionales de las propuestas. |
| `cesi_contacts_v1`       | Contactos, con su zona horaria y disponibilidad. |
| `cesi_working_hours_v1`  | Horario habitual (varias franjas por día).       |
| `cesi_preferences_v1`    | Preferencias, como el margen entre reuniones.    |
| `cesi_rules_v1`          | Reglas por tipo de reunión.                      |
| `cesi_proposals_v1`      | Propuestas pendientes.                           |
| `cesi_groups_v1`         | Grupos de contactos.                             |

`supabase/schema.sql` deja preparadas las tablas (con seguridad por filas) para sincronizar estos datos con Supabase en el futuro; la app todavía no está conectada.

Esto significa que:

- Los datos del móvil y los del ordenador son independientes.
- Si borras los datos de navegación del sitio, o usas una ventana privada, los datos se pierden.

## Copia de seguridad

En la barra lateral (en el móvil, el icono junto a las pestañas) pulsa **Copia de seguridad**:

- **Descargar copia** guarda un archivo `cesi-copia-AAAA-MM-DD.json` con las reuniones (con sus notas), los contactos, los grupos, el horario, las preferencias, las reglas y las propuestas. Se siguen pudiendo importar las copias de versiones anteriores.
- **Importar copia** lee uno de esos archivos y, tras pedir confirmación, **sustituye todos los datos actuales** por los del archivo.

Sirve también para pasar los datos de un dispositivo a otro: descarga la copia en uno e impórtala en el otro.

## Tecnología

React 19, Vite, date-fns, lucide-react y vite-plugin-pwa.
