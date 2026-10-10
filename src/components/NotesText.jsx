import { noteBlocks } from '../lib/noteLists'

function NoteList({ list }) {
  const Tag = list.kind === 'number' ? 'ol' : 'ul'
  return (
    <Tag className="notes-text-list" start={list.kind === 'number' && list.start !== 1 ? list.start : undefined}>
      {list.items.map((item, i) => (
        <li key={i}>
          {item.text}
          {item.children.map((child, j) => (
            <NoteList key={j} list={child} />
          ))}
        </li>
      ))}
    </Tag>
  )
}

// Notas del acta ya escritas, con sus listas como listas de verdad.
export default function NotesText({ text, className = '' }) {
  return (
    <div className={`notes-text ${className}`}>
      {noteBlocks(text).map((block, i) =>
        block.type === 'list' ? <NoteList key={i} list={block} /> : <p key={i}>{block.text}</p>,
      )}
    </div>
  )
}
