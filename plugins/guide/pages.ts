import type { Article, Guide, Section } from './content.ts'

export interface Assets {
  css: string
  js: string
  index: string
}

export interface PageOpts {
  siteUrl: string
  siteName: string
  season: string
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Reads the dashboard's saved theme too, so both halves of the site match.
// Same theme as the dashboard: 'f1-theme' is the browser's copy of its theme preference.
const themeScript = `(function(){var t;try{t=localStorage.getItem('f1-theme')||(JSON.parse(localStorage.getItem('f1-stats')||'{}').state||{prefs:{}}).prefs.theme}catch(e){}var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light'})()`

const brandMark = `<svg viewBox="0 0 28 16" width="28" height="16" aria-hidden="true"><path d="M1 15 L9 1 H27 L25 5 H12 L10.5 8 H22 L20 12 H8.5 L7 15 Z" fill="currentColor"/></svg>`

const searchBox = (big = false) => `
<div class="search${big ? ' search-big' : ''}" data-search>
  <svg class="search-icon" viewBox="0 0 24 24" width="${big ? 20 : 16}" height="${big ? 20 : 16}" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
  <input type="search" placeholder="${big ? 'Search the guide: safety car, tyre rules, penalties…' : 'Search the guide'}" aria-label="Search the guide" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false" aria-autocomplete="list" />
  ${big ? '' : '<kbd aria-hidden="true">/</kbd>'}
  <div class="search-results" role="listbox" hidden></div>
</div>`

function shell(o: PageOpts, a: Assets, p: { title: string; description: string; path: string; body: string; jsonLd?: object }) {
  const canonical = o.siteUrl + p.path
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}" />
<link rel="canonical" href="${canonical}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="${esc(o.siteName)}" />
<meta property="og:title" content="${esc(p.title)}" />
<meta property="og:description" content="${esc(p.description)}" />
<meta property="og:url" content="${canonical}" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<script>${themeScript}</script>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@500;600;700;800&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="${a.css}" />
${p.jsonLd ? `<script type="application/ld+json">${JSON.stringify(p.jsonLd)}</script>` : ''}
<script src="${a.js}" defer></script>
</head>
<body data-search-index="${a.index}">
<a class="skip" href="#content">Skip to content</a>
<header class="topbar">
  <a class="brand" href="/guide/" aria-label="${esc(o.siteName)} guide home">${brandMark}<span>${esc(o.siteName)}</span></a>
  <nav class="topnav" aria-label="Site">
    <a href="/guide/" class="${p.path.startsWith('/guide/') ? 'active' : ''}">Guide</a>
    <a href="/">Dashboards</a>
  </nav>
  ${searchBox()}
  <button type="button" class="icon-btn theme-toggle" aria-label="Toggle dark mode" title="Toggle dark mode">
    <svg class="i-sun" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    <svg class="i-moon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
  </button>
</header>
${p.body}
<footer class="footer">
  <p>Written for the ${esc(o.season)} season. The FIA publishes the full regulations, and they change often, so treat the official documents as the final word.</p>
  <p>${esc(o.siteName)} is an unofficial fan site. Not associated with Formula 1, the FIA or any team. F1 and Formula 1 are trademarks of Formula One Licensing B.V.</p>
</footer>
</body>
</html>
`
}

function sidebar(g: Guide, current?: { section: string; url?: string }) {
  const groups = g.sections
    .map((s) => {
      const open = s.slug === current?.section
      const links = s.articles
        .map((a) => `<li><a href="${a.url}"${a.url === current?.url ? ' aria-current="page"' : ''}>${esc(a.title)}</a></li>`)
        .join('')
      return `<details${open ? ' open' : ''}><summary><a href="${s.url}"${!current?.url && open ? ' aria-current="page"' : ''}>${esc(s.title)}</a></summary><ul>${links}</ul></details>`
    })
    .join('\n')
  const favs = `<div class="sidebar-favs" data-favs-side hidden><p>Favourites</p><ul></ul></div>`
  return `<nav class="sidebar" aria-label="Guide contents">
  <details class="sidebar-toggle"><summary>Browse the guide</summary><div class="sidebar-inner">${favs}${groups}</div></details>
  <div class="sidebar-inner sidebar-wide">${favs}${groups}</div>
</nav>`
}

export function homePage(g: Guide, o: PageOpts, a: Assets) {
  const cards = g.sections
    .map(
      (s) => `<section class="card">
  <h2><a href="${s.url}">${esc(s.title)}</a></h2>
  <p>${esc(s.blurb)}</p>
  <ul>${s.articles.map((x) => `<li><a href="${x.url}">${esc(x.title)}</a></li>`).join('')}</ul>
</section>`,
    )
    .join('\n')
  const start = ['basics/what-is-formula-1', 'basics/race-weekend', 'race/safety-car', 'penalties/types-of-penalties', 'car/active-aerodynamics', 'tyres/tyre-rules']
    .map((k) => g.byUrl.get(`/guide/${k}/`))
    .filter((x): x is Article => !!x)
  const body = `<main id="content" class="home">
  <div class="hero">
    <h1>How Formula 1 works</h1>
    <p class="lead">The rules, the jargon and the way a race weekend runs, explained in plain English. Search for anything, or start with one of the sections below.</p>
    ${searchBox(true)}
    ${start.length ? `<p class="popular"><span>Popular:</span> ${start.map((x) => `<a href="${x.url}">${esc(x.title)}</a>`).join('')}</p>` : ''}
  </div>
  <section class="favs" data-favs hidden>
    <h2>Your favourites</h2>
    <ul></ul>
  </section>
  <div class="cards">${cards}</div>
</main>`
  return shell(o, a, {
    title: `F1 rules and regulations explained | ${o.siteName}`,
    description: 'A plain-English guide to Formula 1: race weekends, qualifying, flags, the safety car, penalties, tyres, the 2026 cars, points and more.',
    path: '/guide/',
    body,
  })
}

export function sectionPage(g: Guide, s: Section, o: PageOpts, a: Assets) {
  const list = s.articles
    .map((x) => `<li><a href="${x.url}"><strong>${esc(x.title)}</strong><span>${esc(x.description)}</span></a></li>`)
    .join('\n')
  const body = `<div class="layout">
  ${sidebar(g, { section: s.slug })}
  <main id="content" class="article">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/guide/">Guide</a></nav>
    <h1>${esc(s.title)}</h1>
    <p class="lead">${esc(s.blurb)}</p>
    <ul class="article-list">${list}</ul>
  </main>
</div>`
  return shell(o, a, { title: `${s.title} | ${o.siteName}`, description: s.blurb, path: s.url, body })
}

export function articlePage(g: Guide, x: Article, o: PageOpts, a: Assets) {
  const s = g.sections.find((s) => s.slug === x.section)!
  const i = g.articles.indexOf(x)
  const prev = g.articles[i - 1]
  const next = g.articles[i + 1]
  const toc = x.headings.filter((h) => h.depth === 2)
  const body = `<div class="layout has-toc">
  ${sidebar(g, { section: x.section, url: x.url })}
  <main id="content" class="article">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/guide/">Guide</a><span aria-hidden="true">/</span><a href="${s.url}">${esc(s.title)}</a></nav>
    <div class="title-row">
      <h1>${esc(x.title)}</h1>
      <button type="button" class="fav-btn" data-fav data-url="${x.url}" data-title="${esc(x.title)}" data-section="${esc(s.title)}" aria-pressed="false" title="Add to favourites">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8Z" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
        <span>Favourite</span>
      </button>
    </div>
    <div class="prose">${x.html}</div>
    <nav class="pager" aria-label="Next and previous">
      ${prev ? `<a class="prev" href="${prev.url}"><span>Previous</span>${esc(prev.title)}</a>` : '<span></span>'}
      ${next ? `<a class="next" href="${next.url}"><span>Next</span>${esc(next.title)}</a>` : '<span></span>'}
    </nav>
  </main>
  ${
    toc.length > 1
      ? `<aside class="toc" aria-label="On this page"><p>On this page</p><ul>${toc.map((h) => `<li><a href="#${h.id}">${esc(h.text)}</a></li>`).join('')}</ul></aside>`
      : '<aside class="toc"></aside>'
  }
</div>`
  return shell(o, a, {
    title: `${x.title} | ${o.siteName}`,
    description: x.description,
    path: x.url,
    body,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: x.title,
      description: x.description,
      url: o.siteUrl + x.url,
      ...(x.updated ? { dateModified: x.updated } : {}),
      isPartOf: { '@type': 'WebSite', name: o.siteName, url: o.siteUrl },
    },
  })
}

export function notFoundPage(g: Guide, o: PageOpts, a: Assets) {
  const body = `<div class="layout">
  ${sidebar(g)}
  <main id="content" class="article">
    <h1>Page not found</h1>
    <p class="lead">That page doesn't exist, or it has moved. Try searching for it instead.</p>
    ${searchBox(true)}
  </main>
</div>`
  return shell(o, a, { title: `Page not found | ${o.siteName}`, description: 'Page not found', path: '/guide/404.html', body })
}

export function sitemap(g: Guide, o: PageOpts) {
  const urls = ['/', '/guide/', ...g.sections.map((s) => s.url), ...g.articles.map((a) => a.url)]
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${o.siteUrl}${u}</loc></url>`).join('\n')}
</urlset>
`
}
