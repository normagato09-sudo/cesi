# CESI

CESI es un calendario propio para organizar reuniones y disponibilidad. Funciona en el navegador y se puede instalar en el móvil o el ordenador como aplicación (PWA). Los datos se guardan en el propio dispositivo y, si se configura Supabase, se sincronizan entre el móvil y el ordenador (ver [Sincronización entre dispositivos](#sincronización-entre-dispositivos-supabase)).

## Funciones

- **Inicio**: lo primero que se ve al abrir la app. Saludo con la fecha, botón «Ir al calendario» y bloques que llevan a su sección: reuniones de hoy y de mañana (hora, título, participantes y si tienen agenda preparada), tareas vencidas (en rojo), para hoy y de los próximos 7 días (se marcan como hechas desde ahí), reuniones de los últimos 7 días sin acta, próximas entrevistas y vacantes abiertas (con sus candidatos nuevos y en entrevista) y propuestas pendientes (si las hay). Si un bloque está vacío lo dice («Nada vencido 👌»). En el móvil las secciones van en una barra inferior: Inicio, Calendario, Tareas, Contactos y «Más» (Equipo, Vacantes y Resumen).
- **Calendario** con vistas de Mes, Semana y Día. En el móvil, la vista Semana muestra 3 días.
- **Reuniones y franjas "No disponible"**, con enlace de videollamada, descripción y repeticiones (diaria, semanal, mensual o anual). Todas las reuniones van en azul en el calendario; las franjas «No disponible», en gris; las opciones provisionales de una propuesta, en gris claro con borde discontinuo, y las reuniones en las que no asisto, atenuadas. No hay categorías, etiquetas ni proyectos (se quitaron; lo que guardaban las reuniones antiguas se conserva en los datos, pero ya no se ve ni se usa).
- **Cambiar o borrar un solo día de una serie**: al editar, mover, redimensionar o borrar una reunión que se repite, la app pregunta «Solo este día», «Este y los siguientes» o «Toda la serie». Un día cambiado tiene su propia hora, título, participantes o notas (en la reunión se ve «Cambiado solo este día», con la opción de volver a como era en la serie); un día cancelado desaparece del calendario, de «Buscar hueco» y de los resúmenes. «Este y los siguientes» termina la serie el día anterior y crea una nueva desde ese día; las notas de cada día se quedan en la serie que corresponde a su fecha.
- **Arrastrar y redimensionar** reuniones en las vistas Semana y Día, también con el dedo (y en las series, preguntando a qué días se aplica).
- **Detección de solapamientos**: avisa si una franja ya está ocupada.
- **Horario habitual**: ya no se edita en la app. Se usa el que estuviera guardado o, si no hay ninguno, de lunes a viernes de 9:00 a 18:00. Para cambiar tu horario de una semana concreta está «Disponibilidad de la semana». No hay margen entre reuniones ni reglas por tipo de reunión: al guardar o mover una reunión solo se avisa si algún participante no puede según su disponibilidad, y se puede guardar igualmente.
- **Buscar hueco**: solo propone huecos libres dentro de tu horario (el de la semana, si la has declarado, o el habitual) que encajan con la disponibilidad de los participantes, con un filtro de horas opcional. Si no hay huecos, dice qué contacto lo impide y deja ignorar su disponibilidad. Con «Yo no asisto» busca solo en la disponibilidad y las reuniones de los participantes (ver más abajo).
- **Reuniones en las que no asisto** («Yo no asisto», en el formulario de reunión y en «Buscar hueco»): para organizar que otras personas se reúnan entre ellas. La búsqueda usa solo la disponibilidad de los participantes y las reuniones de tu calendario en las que participan (no tu horario ni tus reuniones); si ninguno tiene disponibilidad apuntada, no busca. La reunión queda en tu calendario atenuada y con la etiqueta «Organizada por mí», pero no es tiempo tuyo: no cuenta en el Resumen ni en el Inicio, no ocupa tus huecos, no choca con tus reuniones. Al crearla se abre el **mensaje de convocatoria**, generado con una plantilla (sin IA): saludo con el nombre de cada participante, motivo, fecha, hora (y la hora local de quien esté en otra zona), duración, enlace o lugar, y agenda. Se puede editar y luego copiar o enviar por WhatsApp o email (a todos los participantes con email). También se abre desde la reunión con «Mensaje de convocatoria». El acta y las tareas funcionan igual que en las demás reuniones.
- **Proponer varias opciones**: marca de 2 a 5 huecos, se guardan como reuniones provisionales y se genera un mensaje para enviar por WhatsApp, email o copiar. Desde "Propuestas pendientes" confirmas la opción elegida.
- **Notas de cada reunión**, con guardado automático. En las reuniones que se repiten, cada día tiene sus propias notas. El bloque "Sin notas" de la barra lateral recuerda las reuniones de los últimos 7 días que aún no tienen notas.
- **Tareas** (sección Tareas): cada tarea tiene qué hay que hacer, responsable (tú o un contacto), fecha límite opcional y estado (pendiente o hecha). Se crean sueltas o desde el acta de una reunión («Nueva tarea» o «Convertir en tarea» en una decisión), y entonces quedan enlazadas a esa reunión (en las que se repiten, a esa sesión) y siguen a su sesión si la reunión se mueve de día o se parte. La lista se filtra por persona, estado y fecha (vencidas, para hoy, próximos 7 días, sin fecha); las vencidas se marcan en rojo. Al abrir una reunión se ven las tareas pendientes de sus participantes y las tuyas de reuniones anteriores con ellos.
- **Resumen** con la próxima reunión y las horas ocupadas y libres de hoy.
- **Resumen** (sección Resumen): eliges el periodo (esta semana, este mes, últimos 3 meses o personalizado, con flechas para ir al anterior o al siguiente) y ves el número de reuniones, las horas en reuniones y las horas libres dentro del horario comparadas con el periodo anterior («+3 h respecto a la semana anterior»); la evolución de las horas en reuniones de las últimas 12 semanas o 12 meses; las horas por día (en una semana) o por día de la semana (en periodos más largos) y por franja horaria; el reparto por departamento (de los miembros del equipo que participan) y por grupo; todas las personas con las que te has reunido, y la lista de reuniones (plegada en los periodos largos). Las franjas «No disponible» y las opciones provisionales no cuentan como reunión, y las reuniones que se solapan no se suman dos veces. Se puede imprimir o guardar en PDF.
- **Contactos**: ficha con email, teléfono, organización, cargo, notas, país y zona horaria, disponibilidad habitual, grupos y la lista de próximas reuniones y reuniones anteriores con cada contacto (con el principio de sus notas).
- **Disponibilidad de la semana**: además del horario habitual, cada semana (de lunes a domingo) se puede declarar con sus propias franjas, partiendo del horario habitual o de la semana anterior. Si una semana está declarada, sustituye al habitual esos 7 días en «Buscar hueco», las propuestas, el resumen semanal y las horas libres de hoy. Desde el domingo, un aviso en la barra lateral recuerda declarar la semana que viene (se puede descartar con «Usar mi horario habitual»).
- **Fotos de los contactos**: se recortan en cuadrado y se reducen a 512×512 px en WebP antes de guardarlas (JPG, PNG, WebP y HEIC si el navegador lo permite). Con sincronización se guardan en Supabase Storage y se ven también sin conexión una vez cargadas; sin ella, en el propio navegador (IndexedDB). Sin foto se muestran las iniciales.
- **Equipo**: cualquier contacto se puede marcar como miembro del equipo, con un perfil ampliado (foto, cargo, departamento, fecha de incorporación con la antigüedad calculada, trayectoria en texto libre, una lista de enlaces (las redes conocidas se reconocen solas), y estado activo o antiguo miembro). La sección Equipo muestra las tarjetas con buscador y filtros por departamento y estado, y la ficha de cada persona con sus reuniones, notas, disponibilidad y «Buscar hueco con esta persona».
- **Departamentos**: lista ordenada que se gestiona desde Equipo o Vacantes (botón «Departamentos»): añadir, renombrar (se cambia en todos los miembros y vacantes), subir y bajar, y borrar pidiendo a qué departamento pasar a quien lo use (o «Sin departamento»). Empieza con Directivo, Alianzas, Moderación, Eventos, Media, Técnico, Verificación, Reclutamiento, Finanzas, Radio, Marketing, Legal, Tienda, Socios y Profesores; si alguien usa uno que no está en la lista, se añade al final para no perderlo.
- **Vacantes y candidatos**: vacantes con título, departamento, descripción, requisitos, fecha de apertura y estado (abierta, en proceso o cubierta). Los candidatos se apuntan a mano y son contactos (con país, para poder buscar hueco y proponer reuniones) que solo aparecen en Contactos con el filtro «Candidatos». Cada candidato tiene CV (PDF de hasta 5 MB o un enlace), notas y estado (nuevo, entrevista, aceptado o descartado) con la fecha de cada cambio; la vacante los muestra en columnas por estado. «Buscar hueco para entrevista» abre Buscar hueco con la casilla «Entrevista de candidato» marcada, y al crear la reunión el candidato pasa a «entrevista». Esa casilla aparece en el formulario de reunión, en Buscar hueco y al proponer varias opciones cuando participa algún candidato; las reuniones marcadas salen en «Próximas entrevistas» del Inicio y en la reunión («Entrevista de candidato»). Las reuniones anteriores que tenían la categoría «Entrevista» o la etiqueta «entrevista» siguen contando como entrevistas mientras no se desmarque la casilla. «Aceptar e incorporar» abre su perfil de equipo ya rellenado, lo pasa al equipo con «DD/MM/AAAA – Se incorporó como…» al principio de su trayectoria, marca la vacante como cubierta y ofrece descartar al resto. Pasados 6 meses desde un descarte, Vacantes avisa y permite borrar sus datos personales (contacto, CV y notas), dejando solo un registro anónimo.
- **Grupos de contactos** (p. ej. "Profesores", "Equipo"), con color. Se filtran en Contactos y en la lista de participantes se puede añadir un grupo entero de una vez.
- **Participantes** elegidos de una lista desplegable conectada a Contactos. Desde la lista también se puede crear un contacto nuevo o añadir un invitado solo para esa reunión. Cada participante se muestra igual en toda la app: un indicador según su disponibilidad habitual (✓ verde «Puede», ✗ rojo «No puede», ? gris «Sin disponibilidad apuntada», con la explicación al pasar el ratón o al mantenerlo pulsado), su nombre, y bandera, país y hora local de la reunión («🇪🇸 España · 18:00», «🇲🇽 México (Ciudad de México) · 10:00 (día siguiente)»), con el aviso si le cae a una hora poco razonable. En listas y vistas previas se usa la versión compacta (indicador y nombre). Encima de la lista, el recuento («8 pueden · 1 no puede · 2 sin disponibilidad»). Al pasar el ratón por una reunión del calendario (o al mantenerla pulsada en el móvil; un toque corto la sigue abriendo) se ve una vista previa con sus participantes. Al crear, editar, mover o redimensionar una reunión, si algún participante no puede según su disponibilidad, la app avisa con los nombres y el motivo («No pueden según su disponibilidad: Ana (jueves solo por la mañana)…») y deja elegir «Buscar otro hueco» o «Guardar igualmente». Quien no tiene disponibilidad apuntada no genera aviso. En Chrome y Edge para Windows, que no dibujan las banderas emoji, la app carga su propia fuente de banderas.
- **Pendientes** (barra lateral): reuniones de los próximos 60 días con participantes que no pueden (p. ej. porque ha cambiado su disponibilidad), con acceso a la reunión, «Buscar otro hueco» (misma duración y participantes; al elegir el hueco se mueve la reunión) y «Mantener» (no volver a avisar de esa reunión por esas personas). Las que se guardaron con «Guardar igualmente» no aparecen, salvo que deje de poder otra persona.
- **Enlace para que un contacto rellene su ficha** (necesita la sincronización): en la ficha del contacto, «Enviar link para que lo rellene» crea un enlace `/ficha/<token>` para copiarlo o enviarlo por WhatsApp o email. La persona lo abre sin iniciar sesión y solo ve y cambia su nombre, email, teléfono, organización, cargo, país y disponibilidad (nada de notas, grupos, reuniones ni otros contactos). Caduca a los 30 días (o 7 o 90, a elegir); se puede regenerar (el anterior deja de valer) o desactivar. Cuando guarda, la ficha muestra «Actualizado por el contacto» con la fecha.
- **Confirmación de asistencia**: se quitó. Los enlaces `/confirmar/<token>` que ya se enviaron muestran solo «Este enlace ya no está activo»; la tabla `meeting_invites` y sus funciones siguen en Supabase, sin usarse, para no borrar datos.
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

Añade también `VITE_PUBLIC_URL` con la dirección de producción (**Settings → Domains**, p. ej. `https://cesi.example.com`), en Production y Preview. Los enlaces `/ficha/<token>` para que un contacto rellene sus datos siempre la usan: las URLs de despliegue de Vercel (`cesi-xxxx-….vercel.app`) están protegidas y el contacto no podría abrirlas. Sin ella, el enlace usa la dirección desde la que tengas abierta la app.

## Dónde se guardan los datos

Todo se guarda en el `localStorage` del navegador. Sin Supabase configurado, los datos están **solo en ese dispositivo y en ese navegador** y no se envía nada a ningún servidor. Con Supabase, `localStorage` hace de caché: la app abre al instante y funciona sin conexión, y los cambios se envían a la nube.

| Clave                    | Contenido                                        |
| ------------------------ | ------------------------------------------------ |
| `cesi_events_v1`         | Reuniones, franjas no disponibles y opciones provisionales de las propuestas. |
| `cesi_contacts_v1`       | Contactos, con su zona horaria y disponibilidad. |
| `cesi_working_hours_v1`  | Horario habitual (varias franjas por día). Ya no se edita; sin él, de lunes a viernes de 9:00 a 18:00. |
| `cesi_preferences_v1`    | Preferencias guardadas antes (margen entre reuniones y aviso por defecto de los recordatorios). Ya no se usan; se conservan en la sincronización y las copias. |
| `cesi_rules_v1`          | Reglas por tipo de reunión guardadas antes. Ya no se usan; se conservan en la sincronización y las copias. |
| `cesi_proposals_v1`      | Propuestas pendientes.                           |
| `cesi_groups_v1`         | Grupos de contactos.                             |
| `cesi_team_areas_v1`     | Departamentos del equipo (lista ordenada).       |
| `cesi_weekly_availability_v1` | Disponibilidad declarada de cada semana.    |
| `cesi_projects_v1`       | Proyectos de las reuniones guardados antes. Ya no se usan; se conservan en la sincronización y las copias. |
| `cesi_vacancies_v1`      | Vacantes (los candidatos van en los contactos).  |
| `cesi_tasks_v1`          | Tareas (sueltas o de una reunión).               |
| `cesi_sync_queue_v1`     | Cambios pendientes de enviar a Supabase (solo con sincronización). |
| `cesi_sync_state_v1`     | Estado de la sincronización de este dispositivo (solo con sincronización). |
| `cesi_auth_v1`           | Sesión de Supabase (solo con sincronización).    |
| `cesi_push_device_v1`    | Ya no se usa (era el dispositivo con los recordatorios activados; no se sincroniza). |

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

### Enlace para que un contacto rellene su ficha

Los enlaces se guardan en la tabla `contact_links` (token aleatorio de 32 bytes, contacto, caducidad y si está desactivado), que solo puede leer y cambiar su dueño. La página pública (`ficha.html`, servida en `/ficha/<token>` por `vercel.json`) no usa el cliente de Supabase ni accede a ninguna tabla: solo llama a dos funciones de la base de datos, `cesi_contact_form_get` y `cesi_contact_form_save`, que comprueban el token (que exista, no esté desactivado ni caducado), leen solo los campos permitidos y al guardar aceptan únicamente esos campos, con su tipo y longitud máxima. El cambio se guarda en la fila del contacto con `selfUpdatedAt` y llega a tus dispositivos con la sincronización normal.

Para activarlo en un proyecto que ya estaba funcionando, vuelve a ejecutar todo `supabase/schema.sql` en **SQL Editor** (no toca tus datos).

### Confirmación de asistencia (quitada)

La app ya no usa la tabla `meeting_invites` ni las funciones `cesi_meeting_invite_*`: se dejan en `supabase/schema.sql` para no borrar datos. `confirmar.html` (servida en `/confirmar/<token>` por `vercel.json`) ya no llama a Supabase: solo muestra «Este enlace ya no está activo».

## Copia de seguridad

En la barra lateral (en el móvil, el icono junto a las pestañas) pulsa **Copia de seguridad**:

- **Descargar copia** guarda un archivo `cesi-copia-AAAA-MM-DD.json` con las reuniones (con sus notas), los contactos, los grupos, el horario, la disponibilidad de cada semana, las preferencias, las reglas, las propuestas, los proyectos y las vacantes. Se siguen pudiendo importar las copias de versiones anteriores.
- **Importar copia** lee uno de esos archivos y, tras pedir confirmación, **sustituye todos los datos actuales** por los del archivo.

Sirve también para pasar los datos de un dispositivo a otro: descarga la copia en uno e impórtala en el otro.

## Tecnología

React 19, Vite, date-fns, lucide-react, vite-plugin-pwa y @supabase/supabase-js (solo se carga si la sincronización está configurada).
