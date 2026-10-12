import { useState, type ReactNode } from 'react'
import { useStore } from '../../store'
import type { WidgetDef, WidgetProps } from '../types'
import './misc.css'

/** Inline markdown: **bold**, *italic*, `code`, [text](https://url). Built as React nodes, so no HTML injection. */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^\s)]+)\))/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    const k = `${keyBase}-${i++}`
    if (tok.startsWith('**')) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>)
    else if (tok.startsWith('`')) out.push(<code key={k}>{tok.slice(1, -1)}</code>)
    else if (tok.startsWith('[')) {
      const label = tok.slice(1, tok.indexOf(']'))
      out.push(
        <a key={k} href={m[2]} target="_blank" rel="noreferrer noopener">
          {label}
        </a>,
      )
    } else out.push(<em key={k}>{tok.slice(1, -1)}</em>)
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function render(md: string): ReactNode[] {
  const blocks: ReactNode[] = []
  const lines = md.split('\n')
  let list: string[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) {
      const k = `p${blocks.length}`
      blocks.push(<p key={k}>{inline(para.join(' '), k)}</p>)
      para = []
    }
    if (list.length) {
      const k = `ul${blocks.length}`
      blocks.push(
        <ul key={k}>
          {list.map((li, i) => (
            <li key={i}>{inline(li, `${k}-${i}`)}</li>
          ))}
        </ul>,
      )
      list = []
    }
  }
  for (const raw of lines) {
    const line = raw.trimEnd()
    const h = line.match(/^(#{1,3})\s+(.*)$/)
    const li = line.match(/^\s*[-*]\s+(.*)$/)
    if (h) {
      flush()
      const k = `h${blocks.length}`
      const Tag = (`h${h[1].length}`) as 'h1' | 'h2' | 'h3'
      blocks.push(<Tag key={k}>{inline(h[2], k)}</Tag>)
    } else if (li) {
      if (para.length) flush()
      list.push(li[1])
    } else if (!line.trim()) flush()
    else {
      if (list.length) flush()
      para.push(line)
    }
  }
  flush()
  return blocks
}

function Notes({ instance, opts }: WidgetProps) {
  const text = String(opts.text ?? '')
  const [draft, setDraft] = useState<string | null>(null)

  if (draft !== null)
    return (
      <textarea
        className="mw-notes-edit"
        autoFocus
        value={draft}
        aria-label="Edit note"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          useStore.getState().setWidgetOption(instance.id, 'text', draft)
          setDraft(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setDraft(null)
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) (e.target as HTMLTextAreaElement).blur()
        }}
        // Keep typing and selecting from dragging the panel.
        onMouseDown={(e) => e.stopPropagation()}
      />
    )

  return (
    <div className="mw-notes" onDoubleClick={() => setDraft(text)} title="Double-click to edit">
      {text.trim() ? render(text) : <span className="mw-hint">Double-click to write a note. Supports # headings, **bold**, - lists and [links](https://openf1.org).</span>}
    </div>
  )
}

export const notes: WidgetDef = {
  type: 'notes',
  name: 'Notes',
  description: 'Your own notes alongside the data. Double-click to edit; supports headings, bold, lists and links.',
  category: 'Utility',
  defaultSize: { w: 6, h: 6 },
  sessionless: true,
  Component: Notes,
  options: [{ key: 'text', label: 'Note', type: 'textarea', default: '' }],
}
