import { parseRichText } from '../lib/richText'

function Inline({ parts }) {
  return parts.map((p, i) =>
    p.type === 'bold' ? (
      <strong key={i}>{p.text}</strong>
    ) : p.type === 'italic' ? (
      <em key={i}>{p.text}</em>
    ) : p.type === 'link' ? (
      <a key={i} href={p.href} target="_blank" rel="noreferrer noopener">
        {p.text}
      </a>
    ) : (
      <span key={i}>{p.text}</span>
    ),
  )
}

// Texto con formato sencillo (richText.js) pintado con elementos de React: nunca como HTML.
export default function RichText({ text, className = '' }) {
  return (
    <div className={`rich-text ${className}`}>
      {parseRichText(text).map((b, i) =>
        b.type === 'p' ? (
          <p key={i}>
            {b.lines.map((line, j) => (
              <span key={j}>
                {j > 0 && <br />}
                <Inline parts={line} />
              </span>
            ))}
          </p>
        ) : b.type === 'ul' ? (
          <ul key={i}>
            {b.items.map((item, j) => (
              <li key={j}>
                <Inline parts={item} />
              </li>
            ))}
          </ul>
        ) : (
          <ol key={i}>
            {b.items.map((item, j) => (
              <li key={j}>
                <Inline parts={item} />
              </li>
            ))}
          </ol>
        ),
      )}
    </div>
  )
}
