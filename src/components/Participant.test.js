import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import Participant from './Participant.jsx'

// La foto se carga después (useFileUrl); en el primer render salen las iniciales en su sitio.
const render = (props) => renderToStaticMarkup(createElement(Participant, props))

describe('Participant: foto (o iniciales) en tamaño completo', () => {
  const contact = { id: 'c1', name: 'Ana Pérez', photo: 'file_ana' }

  it('en las listas, tamaño sm', () => {
    expect(render({ contact })).toMatch(/class="contact-avatar sm"[^>]*>AP</)
  })

  it('en los chips del formulario, tamaño xs', () => {
    expect(render({ contact, onRemove: () => {} })).toContain('class="contact-avatar xs"')
  })

  it('también para invitados sin ficha', () => {
    expect(render({ guest: 'Luis Gil' })).toContain('class="contact-avatar sm"')
  })

  it('no en el tamaño compacto', () => {
    expect(render({ contact, size: 'compact' })).not.toContain('contact-avatar')
  })
})
