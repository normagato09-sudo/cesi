import { ExternalLink, Link2 } from 'lucide-react'
import { SiteBadge } from './LinksEditor.jsx'
import { linkSite, linkTitle, normalizeUrl } from '../lib/links'
import './Links.css'

// Enlaces en una ficha: se abren en una pestaña nueva. Las redes conocidas llevan su nombre.
export default function LinkList({ links }) {
  if (!links || links.length === 0) return null
  return (
    <ul className="link-list">
      {links.map((l) => {
        const site = linkSite(l.url)
        return (
          <li key={l.id}>
            <a href={normalizeUrl(l.url)} target="_blank" rel="noreferrer" title={normalizeUrl(l.url)}>
              {site ? <SiteBadge site={site} /> : <Link2 size={15} strokeWidth={1.75} className="link-list-icon" />}
              <span className="link-list-text">{linkTitle(l)}</span>
              <ExternalLink size={13} strokeWidth={1.75} className="link-list-open" />
            </a>
          </li>
        )
      })}
    </ul>
  )
}
