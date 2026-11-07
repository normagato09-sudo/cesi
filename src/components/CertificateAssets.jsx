import { useEffect, useState } from 'react'
import { ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react'
import { CERT_BUCKET } from '../lib/certificates'
import { assetsErrorText, deleteAsset, imageFileError, saveLogo, saveSignature } from '../lib/certificateAssets'

// Miniatura de una imagen guardada (enlace temporal del bucket privado).
function Thumb({ client, path }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let active = true
    client.storage
      .from(CERT_BUCKET)
      .createSignedUrl(path, 600)
      .then(({ data }) => active && setUrl(data?.signedUrl || null), () => {})
    return () => {
      active = false
    }
  }, [client, path])
  return <span className="cert-thumb">{url ? <img src={url} alt="" /> : null}</span>
}

function AssetForm({ kind, item, teachers, onCancel, onSave }) {
  const [form, setForm] = useState(() => ({
    name: item?.name || '',
    title: item?.title || '',
    teacherId: item?.teacher_id || '',
    isCeoDefault: !!item?.is_ceo_default,
    file: null,
  }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSave(form)
    } catch (err) {
      setError(assetsErrorText(err))
      setBusy(false)
    }
  }

  return (
    <form className="cert-asset-form" onSubmit={submit}>
      <label className="cert-field">
        <span>{kind === 'sig' ? 'Nombre de quien firma' : 'Nombre de la empresa'}</span>
        <input type="text" maxLength={120} value={form.name} onChange={(e) => set({ name: e.target.value })} />
      </label>
      {kind === 'sig' && (
        <>
          <label className="cert-field">
            <span>Cargo (p. ej. «CEO de CIFA» o «Directora · Empresa X»)</span>
            <input type="text" maxLength={120} value={form.title} onChange={(e) => set({ title: e.target.value })} />
          </label>
          <label className="cert-field">
            <span>Es la firma de un profesor (sale sola en sus cursos)</span>
            <select value={form.teacherId} onChange={(e) => set({ teacherId: e.target.value })}>
              <option value="">No</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="cert-check">
            <input type="checkbox" checked={form.isCeoDefault} onChange={(e) => set({ isCeoDefault: e.target.checked })} />
            <span>Es mi firma (firma derecha por defecto)</span>
          </label>
        </>
      )}
      <label className="cert-field">
        <span>Imagen PNG o JPG (máx. 2 MB){item ? ' — solo si la cambias' : ''}</span>
        <input
          type="file"
          accept=".png,.jpg,.jpeg,image/png,image/jpeg"
          onChange={(e) => {
            const file = e.target.files?.[0] || null
            setError(file ? imageFileError(file) : null)
            set({ file })
          }}
        />
      </label>
      {error && <p className="cert-error">{error}</p>}
      <div className="cert-actions">
        <button type="button" className="cert-btn" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
        <button type="submit" className="cert-btn primary" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}

/**
 * «Firmas» o «Logos» de los certificados (parte 44), solo la ceo. kind: 'sig' | 'logo'.
 * items: la lista; teachers: [{ id, name }] (profesores, para unir una firma a uno). onChanged().
 */
export default function CertificateAssets({ client, kind, items, teachers = [], onChanged }) {
  const [form, setForm] = useState(null) // { item } (null: nuevo)
  const [error, setError] = useState(null)
  const table = kind === 'sig' ? 'certificate_signatures' : 'certificate_logos'
  const teacherName = (id) => teachers.find((t) => t.id === id)?.name

  const save = async (values) => {
    if (kind === 'sig') await saveSignature(client, values, form.item)
    else await saveLogo(client, values, form.item)
    setForm(null)
    onChanged()
  }
  const remove = async (item) => {
    if (!window.confirm(`¿Borrar «${item.name}»? Los certificados ya emitidos no cambian.`)) return
    try {
      await deleteAsset(client, table, item)
      onChanged()
    } catch (err) {
      setError(assetsErrorText(err))
    }
  }

  return (
    <section className="cert-assets">
      <div className="cert-course-head">
        <h2>{kind === 'sig' ? 'Firmas' : 'Logos de empresas colaboradoras'}</h2>
        {!form && (
          <button type="button" className="cert-btn primary" onClick={() => setForm({ item: null })}>
            <Plus size={14} strokeWidth={2} /> {kind === 'sig' ? 'Nueva firma' : 'Nuevo logo'}
          </button>
        )}
      </div>
      {form && <AssetForm kind={kind} item={form.item} teachers={teachers} onCancel={() => setForm(null)} onSave={save} />}
      {error && <p className="cert-error">{error}</p>}
      {items.length === 0 ? (
        <p className="cert-muted cert-pad">
          <ImagePlus size={15} strokeWidth={1.75} /> {kind === 'sig' ? 'Todavía no hay firmas.' : 'Todavía no hay logos.'}
        </p>
      ) : (
        <ul className="cert-list">
          {items.map((it) => (
            <li key={it.id} className="cert-row">
              <div className="cert-asset">
                <Thumb client={client} path={it.file_path} />
                <div className="cert-who">
                  <strong>{it.name}</strong>
                  {kind === 'sig' && (
                    <span className="cert-stats">
                      {[it.title, it.is_ceo_default ? 'Mi firma (por defecto)' : '', it.teacher_id ? `Profesor: ${teacherName(it.teacher_id) || '—'}` : ''].filter(Boolean).join(' · ') || 'Sin cargo'}
                    </span>
                  )}
                </div>
              </div>
              <div className="cert-state">
                <button type="button" className="cert-link" onClick={() => setForm({ item: it })}>
                  <Pencil size={13} strokeWidth={1.75} /> Editar
                </button>
                <button type="button" className="cert-link danger" onClick={() => remove(it)}>
                  <Trash2 size={13} strokeWidth={1.75} /> Borrar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
