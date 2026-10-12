import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import { loadGuide, searchIndex } from './content.ts'
import { articlePage, homePage, notFoundPage, sectionPage, sitemap, type Assets, type PageOpts } from './pages.ts'

interface Options extends PageOpts {
  /** Folder holding sections.json and one subfolder of Markdown per section. */
  dir: string
}

const clientDir = join(import.meta.dirname, 'client')
const read = (f: string) => readFileSync(join(clientDir, f), 'utf8')
const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 8)

/**
 * Builds the plain-English rules guide as static HTML under /guide/, so every
 * page is indexable without running the dashboard app. In dev the pages are
 * rendered per request, so edits to the Markdown show on reload.
 */
export function guide(opts: Options): Plugin {
  let isBuild = false
  return {
    name: 'guide',
    configResolved(c) {
      isBuild = c.command === 'build'
    },

    configureServer(server) {
      server.watcher.add(opts.dir)
      server.watcher.on('change', (f) => {
        if (f.startsWith(opts.dir) || f.startsWith(clientDir)) server.ws.send({ type: 'full-reload' })
      })
      const assets: Assets = { css: '/guide/_/guide.css', js: '/guide/_/guide.js', index: '/guide/_/search-index.json' }
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0]
        if (path !== '/guide' && !path.startsWith('/guide/')) return next()
        const send = (status: number, type: string, body: string) => {
          res.statusCode = status
          res.setHeader('Content-Type', type)
          res.end(body)
        }
        try {
          if (path === assets.css) return send(200, 'text/css', read('guide.css'))
          if (path === assets.js) return send(200, 'text/javascript', read('guide.js'))
          const g = loadGuide(opts.dir)
          for (const p of g.problems) server.config.logger.warn(`[guide] ${p}`)
          if (path === assets.index) return send(200, 'application/json', JSON.stringify(searchIndex(g)))
          const url = path.endsWith('/') ? path : path + '/'
          if (url !== path) {
            res.statusCode = 301
            res.setHeader('Location', url)
            return res.end()
          }
          if (url === '/guide/') return send(200, 'text/html', homePage(g, opts, assets))
          const section = g.sections.find((s) => s.url === url)
          if (section) return send(200, 'text/html', sectionPage(g, section, opts, assets))
          const article = g.byUrl.get(url)
          if (article) return send(200, 'text/html', articlePage(g, article, opts, assets))
          return send(404, 'text/html', notFoundPage(g, opts, assets))
        } catch (e) {
          next(e)
        }
      })
    },

    generateBundle() {
      if (!isBuild) return
      const g = loadGuide(opts.dir)
      if (g.problems.length) this.error(`Guide content problems:\n  ${g.problems.join('\n  ')}`)

      const css = read('guide.css')
      const js = read('guide.js')
      const index = JSON.stringify(searchIndex(g))
      const assets: Assets = {
        css: `/assets/guide-${hash(css)}.css`,
        js: `/assets/guide-${hash(js)}.js`,
        index: `/assets/guide-search-${hash(index)}.json`,
      }
      const emit = (fileName: string, source: string) => this.emitFile({ type: 'asset', fileName, source })
      emit(assets.css.slice(1), css)
      emit(assets.js.slice(1), js)
      emit(assets.index.slice(1), index)

      emit('guide/index.html', homePage(g, opts, assets))
      emit('guide/404.html', notFoundPage(g, opts, assets))
      for (const s of g.sections) emit(`guide/${s.slug}/index.html`, sectionPage(g, s, opts, assets))
      for (const a of g.articles) emit(`guide/${a.section}/${a.slug}/index.html`, articlePage(g, a, opts, assets))
      emit('sitemap.xml', sitemap(g, opts))
      emit('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${opts.siteUrl}/sitemap.xml\n`)
    },
  }
}
