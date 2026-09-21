import { AlertTriangle } from 'lucide-react'
import './MissingConfig.css'

export default function MissingConfig() {
  return (
    <div className="missing-config">
      <div className="missing-config-card">
        <div className="missing-config-icon">
          <AlertTriangle size={22} strokeWidth={1.75} />
        </div>
        <h1>Falta configurar Google</h1>
        <p>
          CESI necesita un <strong>Client ID de OAuth de Google</strong> para poder
          conectarse a tu Google Calendar. Todavía no se ha definido la variable de
          entorno <code>VITE_GOOGLE_CLIENT_ID</code>.
        </p>

        <div className="missing-config-steps">
          <h2>Cómo configurarlo</h2>
          <ol>
            <li>
              Entra en{' '}
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noreferrer"
              >
                Google Cloud Console → Credenciales
              </a>
              .
            </li>
            <li>Crea un ID de cliente OAuth 2.0 de tipo "Aplicación web".</li>
            <li>
              Añade tu origen local (p. ej. <code>http://localhost:5173</code>) en
              "Orígenes autorizados de JavaScript".
            </li>
            <li>
              Copia el <strong>Client ID</strong> (nunca el Client Secret).
            </li>
            <li>
              Crea un archivo <code>.env</code> en la raíz del proyecto a partir de{' '}
              <code>.env.example</code> y añade:
            </li>
          </ol>
          <pre>VITE_GOOGLE_CLIENT_ID=tu-client-id.apps.googleusercontent.com</pre>
          <ol start={6}>
            <li>Reinicia el servidor de desarrollo (<code>npm run dev</code>).</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
