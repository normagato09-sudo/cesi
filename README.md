# CESI

CESI es un calendario propio para organizar reuniones y disponibilidad. Funciona en el navegador y se puede instalar en el móvil o el ordenador como aplicación (PWA). Los datos se guardan en el propio dispositivo y, si se configura Supabase, se sincronizan entre el móvil y el ordenador (ver [Sincronización entre dispositivos](#sincronización-entre-dispositivos-supabase)).

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
- **Resumen semanal** (sección Resumen): número de reuniones, horas en reuniones y horas libres dentro del horario comparadas con la semana anterior, horas por día, reparto por categoría, etiqueta y grupo, contactos con los que más te has reunido y la lista de reuniones con el principio de sus notas. Se puede imprimir o guardar en PDF.
- **Contactos**: ficha con email, teléfono, organización, cargo, notas, país y zona horaria, disponibilidad habitual, grupos y la lista de próximas reuniones y reuniones anteriores con cada contacto (con el principio de sus notas).
- **Disponibilidad de la semana**: además del horario habitual, cada semana (de lunes a domingo) se puede declarar con sus propias franjas, partiendo del horario habitual o de la semana anterior. Si una semana está declarada, sustituye al habitual esos 7 días en «Buscar hueco», las propuestas, el resumen semanal y las horas libres de hoy. Desde el domingo, un aviso en la barra lateral recuerda declarar la semana que viene (se puede descartar con «Usar mi horario habitual»).
- **Proyectos**: cada reunión puede tener un proyecto (con nombre y color, activo o archivado). Se gestionan desde el formulario de reunión o desde el filtro del calendario, se ven como un chip de color en la reunión, se pueden filtrar en el calendario junto con la categoría y la etiqueta, y el resumen semanal reparte las horas por proyecto. Al borrar un proyecto sus reuniones se conservan, sin proyecto.
- **Fotos de los contactos**: se recortan en cuadrado y se reducen a 512×512 px en WebP antes de guardarlas (JPG, PNG, WebP y HEIC si el navegador lo permite). Con sincronización se guardan en Supabase Storage y se ven también sin conexión una vez cargadas; sin ella, en el propio navegador (IndexedDB). Sin foto se muestran las iniciales.
- **Equipo**: cualquier contacto se puede marcar como miembro del equipo, con un perfil ampliado (foto, cargo, departamento, fecha de incorporación con la antigüedad calculada, trayectoria, hitos en una línea de tiempo, una lista de enlaces (las redes conocidas se reconocen solas), y estado activo o antiguo miembro). La sección Equipo muestra las tarjetas con buscador y filtros por departamento y estado, y la ficha de cada persona con sus reuniones, notas, disponibilidad y «Buscar hueco con esta persona».
- **Departamentos**: lista ordenada que se gestiona desde Equipo o Vacantes (botón «Departamentos»): añadir, renombrar (se cambia en todos los miembros y vacantes), subir y bajar, y borrar pidiendo a qué departamento pasar a quien lo use (o «Sin departamento»). Empieza con Directivo, Alianzas, Moderación, Eventos, Media, Técnico, Verificación, Reclutamiento, Finanzas, Radio, Marketing, Legal, Tienda, Socios y Profesores; si alguien usa uno que no está en la lista, se añade al final para no perderlo.
- **Vacantes y candidatos**: vacantes con título, departamento, descripción, requisitos, fecha de apertura y estado (abierta, en proceso o cubierta). Los candidatos se apuntan a mano y son contactos (con país, para poder buscar hueco y proponer reuniones) que solo aparecen en Contactos con el filtro «Candidatos». Cada candidato tiene CV (PDF de hasta 5 MB o un enlace), notas y estado (nuevo, entrevista, aceptado o descartado) con la fecha de cada cambio; la vacante los muestra en columnas por estado. «Buscar hueco para entrevista» abre Buscar hueco con la categoría Entrevista, y al crear la reunión el candidato pasa a «entrevista». «Aceptar e incorporar» abre su perfil de equipo ya rellenado, lo pasa al equipo con el hito «Se incorporó como…», marca la vacante como cubierta y ofrece descartar al resto. Pasados 6 meses desde un descarte, Vacantes avisa y permite borrar sus datos personales (contacto, CV y notas), dejando solo un registro anónimo.
- **Grupos de contactos** (p. ej. "Profesores", "Equipo"), con color. Se filtran en Contactos y en la lista de participantes se puede añadir un grupo entero de una vez.
- **Participantes** elegidos de una lista desplegable conectada a Contactos. Desde la lista también se puede crear un contacto nuevo o añadir un invitado solo para esa reunión. Si un participante está en otro país, se ve también su hora local.
- **Copia de seguridad**: exportar e importar todos los datos en un archivo JSON.
- **Sincronización entre pestañas**: si la app está abierta en varias pestañas del mismo navegador, los cambios se reflejan en todas.
- **Sincronización entre dispositivos** con Supabase (opcional): inicio de sesión con email y contraseña, funciona sin conexión y los cambios de otro dispositivo aparecen solos.

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

Sin variables de entorno la app funciona solo con los datos de cada dispositivo. Para activar la sincronización hay que añadir `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en Vercel (ver abajo).

## Dónde se guardan los datos

Todo se guarda en el `localStorage` del navegador. Sin Supabase configurado, los datos están **solo en ese dispositivo y en ese navegador** y no se envía nada a ningún servidor. Con Supabase, `localStorage` hace de caché: la app abre al instante y funciona sin conexión, y los cambios se envían a la nube.

| Clave                    | Contenido                                        |
| ------------------------ | ------------------------------------------------ |
| `cesi_events_v1`         | Reuniones, franjas no disponibles y opciones provisionales de las propuestas. |
| `cesi_contacts_v1`       | Contactos, con su zona horaria y disponibilidad. |
| `cesi_working_hours_v1`  | Horario habitual (varias franjas por día).       |
| `cesi_preferences_v1`    | Preferencias, como el margen entre reuniones.    |
| `cesi_rules_v1`          | Reglas por tipo de reunión.                      |
| `cesi_proposals_v1`      | Propuestas pendientes.                           |
| `cesi_groups_v1`         | Grupos de contactos.                             |
| `cesi_team_areas_v1`     | Departamentos del equipo (lista ordenada).       |
| `cesi_weekly_availability_v1` | Disponibilidad declarada de cada semana.    |
| `cesi_projects_v1`       | Proyectos de las reuniones.                      |
| `cesi_vacancies_v1`      | Vacantes (los candidatos van en los contactos).  |
| `cesi_sync_queue_v1`     | Cambios pendientes de enviar a Supabase (solo con sincronización). |
| `cesi_sync_state_v1`     | Estado de la sincronización de este dispositivo (solo con sincronización). |
| `cesi_auth_v1`           | Sesión de Supabase (solo con sincronización).    |

Las fotos (y los CV) no van en `localStorage` sino en IndexedDB (`cesi-files`): sin sincronización es su único sitio; con ella, es la caché de lo que está en Supabase Storage.

Sin sincronización:

- Los datos del móvil y los del ordenador son independientes.
- Si borras los datos de navegación del sitio, o usas una ventana privada, los datos se pierden.

## Sincronización entre dispositivos (Supabase)

Con Supabase configurado, la app pide iniciar sesión y mantiene los mismos datos en todos tus dispositivos: reuniones (con notas y opciones provisionales), contactos (con país, zona, disponibilidad y grupos), grupos, horario, disponibilidad de cada semana, preferencias, reglas, propuestas, proyectos y vacantes (con sus candidatos).

- **Local-first**: cada cambio se guarda primero en el dispositivo y después se envía. Sin conexión se queda en una cola que se reintenta al volver la conexión y al volver a la app.
- Al abrir la app se descargan los cambios, y con Realtime los de otro dispositivo aparecen solos.
- **Conflictos**: si el mismo dato se cambia en dos dispositivos, gana el cambio más reciente. Los borrados también se sincronizan.
- **Primer inicio de sesión**: si el dispositivo tiene datos y la cuenta está vacía, ofrece "Subir los datos de este dispositivo". Si hay datos en los dos sitios, pregunta si conservar los de la nube, los de este dispositivo o fusionarlos.
- En la barra lateral se ve el estado ("Sincronizado", "Sincronizando…" o "Sin conexión, se sincronizará luego") y el botón **Cerrar sesión** (en el móvil, en el icono de la nube junto a las pestañas).
- La copia de seguridad JSON sigue funcionando igual. Las fotos y los CV no van dentro: solo su referencia.

### Cómo activarla

1. **Crear el proyecto**: entra en [supabase.com](https://supabase.com), pulsa **New project**, ponle un nombre (p. ej. `cesi`), elige una región de Europa, escribe una contraseña para la base de datos y crea el proyecto.
2. **Crear las tablas**: en el proyecto, abre **SQL Editor → New query**, pega todo el contenido de `supabase/schema.sql` y pulsa **Run**. Crea las tablas con seguridad por filas (cada usuario solo ve sus datos), activa Realtime y crea el bucket privado de Storage `cesi-photos` para las fotos y los CV, con políticas para que cada usuario solo pueda leer y escribir en su propia carpeta. Se puede volver a ejecutar sin perder datos.
3. **Crear tu usuario**: **Authentication → Users → Add user → Create new user**, escribe tu email y una contraseña y marca **Auto Confirm User**.
4. **Desactivar los registros nuevos** (importante, después de crear tu usuario): **Authentication → Sign In / Providers** (en algunas versiones, **Authentication → Settings**) y desactiva **Allow new users to sign up**. Guarda. Así nadie más puede crearse una cuenta en tu proyecto.
5. **Copiar las claves**: **Project Settings → API** (o **API Keys**): copia la **Project URL** y la clave **anon public** (o la **publishable key**). Esta clave es pública por diseño (va dentro de la app); los datos los protegen la seguridad por filas y tener los registros desactivados. No uses nunca la clave `service_role` / `secret`.
6. **En tu ordenador**: copia `.env.example` como `.env.local` y rellena:
   ```
   VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
   Reinicia `npm run dev`. `.env.local` no se sube nunca a GitHub (está en `.gitignore`).
7. **En Vercel**: **Settings → Environment Variables**, añade `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con los mismos valores (marca Production y Preview) y vuelve a desplegar (**Deployments → ⋯ → Redeploy**): Vite mete las variables al compilar, así que hace falta un despliegue nuevo.
8. Abre la app, inicia sesión y, la primera vez, pulsa **Subir los datos de este dispositivo** en el dispositivo que ya tenía tus datos. En los demás, inicia sesión y elige qué hacer si también tenían datos.

Si quitas las variables, la app vuelve a funcionar solo con los datos de cada dispositivo.

## Copia de seguridad

En la barra lateral (en el móvil, el icono junto a las pestañas) pulsa **Copia de seguridad**:

- **Descargar copia** guarda un archivo `cesi-copia-AAAA-MM-DD.json` con las reuniones (con sus notas), los contactos, los grupos, el horario, la disponibilidad de cada semana, las preferencias, las reglas, las propuestas, los proyectos y las vacantes. Se siguen pudiendo importar las copias de versiones anteriores.
- **Importar copia** lee uno de esos archivos y, tras pedir confirmación, **sustituye todos los datos actuales** por los del archivo.

Sirve también para pasar los datos de un dispositivo a otro: descarga la copia en uno e impórtala en el otro.

## Tecnología

React 19, Vite, date-fns, lucide-react, vite-plugin-pwa y @supabase/supabase-js (solo se carga si la sincronización está configurada).
