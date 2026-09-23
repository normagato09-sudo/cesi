# CESI

CESI es un calendario propio para organizar reuniones y disponibilidad. Funciona en el navegador y se puede instalar en el móvil o el ordenador como aplicación (PWA). No necesita servidor ni cuenta: todos los datos se guardan en el propio dispositivo.

## Funciones

- **Calendario** con vistas de Mes, Semana y Día. En el móvil, la vista Semana muestra 3 días.
- **Reuniones y franjas "No disponible"**, con categorías, enlace de videollamada, descripción y repeticiones (diaria, semanal, mensual o anual).
- **Arrastrar y redimensionar** reuniones en las vistas Semana y Día, también con el dedo.
- **Detección de solapamientos**: avisa si una franja ya está ocupada.
- **Buscar hueco**: propone huecos libres dando prioridad a tu horario habitual.
- **Horario habitual** configurable por día de la semana.
- **Resumen** con la próxima reunión y las horas ocupadas y libres de hoy.
- **Contactos**: ficha con email, teléfono, organización, cargo y notas, y la lista de próximas reuniones y reuniones anteriores con cada contacto.
- **Participantes** elegidos de una lista desplegable conectada a Contactos. Desde la lista también se puede crear un contacto nuevo o añadir un invitado solo para esa reunión.
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
| `cesi_events_v1`         | Reuniones y franjas no disponibles.              |
| `cesi_contacts_v1`       | Contactos.                                       |
| `cesi_working_hours_v1`  | Horario habitual de cada día de la semana.       |

Esto significa que:

- Los datos del móvil y los del ordenador son independientes.
- Si borras los datos de navegación del sitio, o usas una ventana privada, los datos se pierden.

## Copia de seguridad

En la barra lateral (en el móvil, el icono junto a las pestañas) pulsa **Copia de seguridad**:

- **Descargar copia** guarda un archivo `cesi-copia-AAAA-MM-DD.json` con las reuniones, los contactos y el horario habitual.
- **Importar copia** lee uno de esos archivos y, tras pedir confirmación, **sustituye todos los datos actuales** por los del archivo.

Sirve también para pasar los datos de un dispositivo a otro: descarga la copia en uno e impórtala en el otro.

## Tecnología

React 19, Vite, date-fns, lucide-react y vite-plugin-pwa.
