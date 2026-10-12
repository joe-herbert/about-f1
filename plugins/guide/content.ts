import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { Marked, type Tokens } from 'marked'

export interface Heading {
  id: string
  text: string
  depth: number
}

export interface Article {
  section: string
  slug: string
  url: string
  title: string
  description: string
  keywords: string[]
  order: number
  updated?: string
  html: string
  headings: Heading[]
  /** Plain text split at each h2, for search results that jump to a heading. */
  chunks: { heading: string; id: string; text: string }[]
}

export interface Section {
  slug: string
  title: string
  blurb: string
  url: string
  articles: Article[]
}

export interface Guide {
  sections: Section[]
  /** Every article in reading order. */
  articles: Article[]
  byUrl: Map<string, Article>
  problems: string[]
}

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;|&#\d+;/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')

export const stripTags = (html: string) =>
  decode(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()

function parseFrontmatter(src: string, file: string) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(src)
  if (!m) throw new Error(`${file}: missing frontmatter`)
  const data: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':')
    if (i > 0) data[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return { data, body: src.slice(m[0].length) }
}

function renderMarkdown(md: string) {
  const headings: Heading[] = []
  const seen = new Map<string, number>()
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }: Tokens.Heading) {
        const inner = this.parser.parseInline(tokens)
        let id = slugify(inner)
        const n = seen.get(id) ?? 0
        seen.set(id, n + 1)
        if (n) id += `-${n + 1}`
        headings.push({ id, text: stripTags(inner), depth })
        return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${inner}</h${depth}>\n`
      },
      link({ href, title, tokens }: Tokens.Link) {
        const text = this.parser.parseInline(tokens)
        const ext = /^https?:\/\//.test(href)
        const t = title ? ` title="${title}"` : ''
        return ext ? `<a href="${href}"${t} rel="noopener" target="_blank">${text}</a>` : `<a href="${href}"${t}>${text}</a>`
      },
      table({ header, rows }: Tokens.Table) {
        const cell = (c: Tokens.TableCell) => this.tablecell(c)
        const head = `<tr>${header.map(cell).join('')}</tr>`
        const body = rows.map((r) => `<tr>${r.map(cell).join('')}</tr>`).join('')
        return `<div class="table-wrap"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>\n`
      },
    },
  })
  const html = marked.parse(md, { async: false })
  return { html, headings }
}

function chunk(html: string, title: string) {
  const parts = html.split(/(?=<h2 id=")/)
  return parts.map((p, i) => {
    const m = /^<h2 id="([^"]+)">(.*?)<\/h2>/.exec(p)
    return {
      heading: m && i > 0 ? stripTags(m[2]).replace(/^#\s*/, '') : title,
      id: m && i > 0 ? m[1] : '',
      text: stripTags(m ? p.slice(m[0].length) : p),
    }
  })
}

export function loadGuide(dir: string): Guide {
  const meta: { slug: string; title: string; blurb: string }[] = JSON.parse(readFileSync(join(dir, 'sections.json'), 'utf8'))
  const problems: string[] = []
  const sections: Section[] = meta.map((s) => {
    const sdir = join(dir, s.slug)
    const files = existsSync(sdir) ? readdirSync(sdir).filter((f) => f.endsWith('.md')) : []
    const articles = files.map((f): Article => {
      const file = join(sdir, f)
      const { data, body } = parseFrontmatter(readFileSync(file, 'utf8'), file)
      const slug = f.replace(/\.md$/, '')
      const { html, headings } = renderMarkdown(body)
      if (!data.title) problems.push(`${s.slug}/${f}: no title`)
      if (!data.description) problems.push(`${s.slug}/${f}: no description`)
      return {
        section: s.slug,
        slug,
        url: `/guide/${s.slug}/${slug}/`,
        title: data.title ?? slug,
        description: data.description ?? '',
        keywords: (data.keywords ?? '')
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean),
        order: Number(data.order ?? 99),
        updated: data.updated,
        html,
        headings,
        chunks: chunk(html, data.title ?? slug),
      }
    })
    articles.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
    return { ...s, url: `/guide/${s.slug}/`, articles }
  })

  const articles = sections.flatMap((s) => s.articles)
  const byUrl = new Map(articles.map((a) => [a.url, a]))

  // Catch broken links between guide pages before they ship.
  const pages = new Set(['/guide/', ...sections.map((s) => s.url), ...byUrl.keys()])
  for (const a of articles) {
    for (const [, href] of a.html.matchAll(/href="(\/guide\/[^"]*)"/g)) {
      const [path, hash] = href.split('#')
      if (!pages.has(path)) problems.push(`${a.url}: broken link ${href}`)
      else if (hash && byUrl.has(path) && !byUrl.get(path)!.headings.some((h) => h.id === hash))
        problems.push(`${a.url}: missing anchor ${href}`)
    }
  }
  return { sections, articles, byUrl, problems }
}

/** Compact search index: one entry per h2 chunk, article fields stored once. */
export function searchIndex(g: Guide) {
  const sectionTitle = new Map(g.sections.map((s) => [s.slug, s.title]))
  return {
    articles: g.articles.map((a) => ({
      t: a.title,
      u: a.url,
      s: sectionTitle.get(a.section),
      d: a.description,
      k: a.keywords.join(' '),
      c: a.chunks.map((c) => [c.heading, c.id, c.text]),
    })),
  }
}
