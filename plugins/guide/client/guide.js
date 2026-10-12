// Guide page behaviour: search, theme toggle, "on this page" highlighting.
;(() => {
  // ---------- theme ----------
  const root = document.documentElement
  document.querySelector('.theme-toggle')?.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark'
    root.dataset.theme = next
    try {
      localStorage.setItem('guide-theme', next)
      // Keep the dashboard in step if it has saved preferences.
      const raw = localStorage.getItem('f1-stats')
      if (raw) {
        const saved = JSON.parse(raw)
        if (saved?.state?.prefs) {
          saved.state.prefs.theme = next
          localStorage.setItem('f1-stats', JSON.stringify(saved))
        }
      }
    } catch {}
  })

  // ---------- favourites ----------
  // Saved in this browser only, newest first: [{ u: url, t: title, s: section }]
  const FAV_KEY = 'guide-favourites'
  const readFavs = () => {
    try {
      const v = JSON.parse(localStorage.getItem(FAV_KEY) || '[]')
      return Array.isArray(v) ? v : []
    } catch {
      return []
    }
  }
  const writeFavs = (list) => {
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(list))
    } catch {}
    renderFavs()
  }
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const removeIcon = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`

  function renderFavs() {
    const list = readFavs()
    for (const btn of document.querySelectorAll('[data-fav]')) {
      const on = list.some((f) => f.u === btn.dataset.url)
      btn.setAttribute('aria-pressed', String(on))
      btn.title = on ? 'Remove from favourites' : 'Add to favourites'
      btn.querySelector('span').textContent = on ? 'Favourited' : 'Favourite'
    }
    for (const box of document.querySelectorAll('[data-favs]')) {
      box.hidden = !list.length
      box.querySelector('ul').innerHTML = list
        .map(
          (f) =>
            `<li><a href="${esc(f.u)}"><strong>${esc(f.t)}</strong><span>${esc(f.s)}</span></a><button type="button" class="fav-remove" data-unfav="${esc(f.u)}" aria-label="Remove ${esc(f.t)} from favourites" title="Remove from favourites">${removeIcon}</button></li>`,
        )
        .join('')
    }
    for (const box of document.querySelectorAll('[data-favs-side]')) {
      box.hidden = !list.length
      box.querySelector('ul').innerHTML = list
        .map((f) => `<li><a href="${esc(f.u)}"${f.u === location.pathname ? ' aria-current="page"' : ''}>${esc(f.t)}</a></li>`)
        .join('')
    }
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-fav]')
    if (btn) {
      const list = readFavs()
      const { url, title, section } = btn.dataset
      writeFavs(list.some((f) => f.u === url) ? list.filter((f) => f.u !== url) : [{ u: url, t: title, s: section }, ...list])
      return
    }
    const rm = e.target.closest('[data-unfav]')
    if (rm) writeFavs(readFavs().filter((f) => f.u !== rm.dataset.unfav))
  })

  // Pages can be renamed, so refresh the saved title when visiting a favourite.
  const here = document.querySelector('[data-fav]')
  if (here) {
    const list = readFavs()
    const f = list.find((x) => x.u === here.dataset.url)
    if (f && (f.t !== here.dataset.title || f.s !== here.dataset.section)) {
      f.t = here.dataset.title
      f.s = here.dataset.section
      writeFavs(list)
    }
  }
  renderFavs()
  // Keep other open tabs in step.
  window.addEventListener('storage', (e) => e.key === FAV_KEY && renderFavs())

  // ---------- search ----------
  const STOP = new Set('a an and are at be by can could did do does explain explained f1 for from get gets got happen happens has have how i if in is it mean means me my of on or should the there they to was were what when where which who why will with work works would you your'.split(' '))

  const fold = (s) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[’']/g, '')

  const stem = (w) => {
    if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y'
    if (w.length > 4 && /(ss|ch|sh|x)es$/.test(w)) return w.slice(0, -2)
    if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
    if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3)
    if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2)
    return w
  }

  // Each field becomes " word word word " of stems, so a term matches at a word start.
  const prep = (s) => ' ' + fold(s).split(/[^a-z0-9]+/).filter(Boolean).map(stem).join(' ') + ' '

  const count = (hay, needle, cap) => {
    let n = 0
    for (let i = hay.indexOf(needle); i !== -1 && n < cap; i = hay.indexOf(needle, i + needle.length)) n++
    return n
  }

  let index = null
  let loading = null
  const load = () => {
    if (index) return Promise.resolve(index)
    loading ??= fetch(document.body.dataset.searchIndex)
      .then((r) => r.json())
      .then((data) => {
        index = data.articles.map((a) => ({
          title: a.t,
          url: a.u,
          section: a.s,
          desc: a.d,
          T: prep(a.t),
          K: prep(a.k),
          D: prep(a.d),
          chunks: a.c.map(([heading, id, text]) => ({ heading, id, text, H: prep(heading), B: prep(text) })),
        }))
        return index
      })
    return loading
  }

  // The guide uses British spelling, so map common US spellings onto it.
  const US = {
    license: 'licence', licenses: 'licences', tire: 'tyre', tires: 'tyres', checkered: 'chequered', curb: 'kerb', curbs: 'kerbs',
    color: 'colour', colors: 'colours', defense: 'defence', offense: 'offence', program: 'programme',
    neutralize: 'neutralise', neutralized: 'neutralised', penalize: 'penalise', penalized: 'penalised', aluminum: 'aluminium',
    meter: 'metre', meters: 'metres', liter: 'litre', liters: 'litres', gray: 'grey', center: 'centre', disqualify: 'disqualification',
  }

  const parse = (q) => {
    const words = fold(q).split(/[^a-z0-9]+/).filter(Boolean).map((w) => US[w] ?? w)
    const useful = words.filter((w) => !STOP.has(w))
    return (useful.length ? useful : words).map((w) => ({ raw: w, s: ' ' + stem(w) }))
  }

  // Strict search needs every word to match. If that finds nothing, a loose
  // pass accepts articles matching most of the words, ranked by how many.
  function search(q) {
    const strict = rank(q, false)
    return strict.length ? strict : rank(q, true)
  }

  function rank(q, loose) {
    const terms = parse(q)
    if (!terms.length || (loose && terms.length < 2)) return []
    const need = loose ? Math.ceil(terms.length / 2) : terms.length
    const phrase = prep(q).trim()
    const out = []
    for (const a of index) {
      let best = null
      for (const c of a.chunks) {
        let score = 0
        let hits = 0
        let headOnly = true
        for (const t of terms) {
          const ti = a.T.includes(t.s) ? 12 : 0
          const k = a.K.includes(t.s) ? 10 : 0
          const d = a.D.includes(t.s) ? 3 : 0
          const h = c.H.includes(t.s) ? 6 : 0
          const b = count(c.B, t.s, 6)
          if (ti || k || d || h || b) hits++
          if (!(ti || k)) headOnly = false
          score += ti + k + d + h + b
        }
        if (hits < need) continue
        if (loose) score = (score * hits) / terms.length
        if (phrase.length > 3 && c.H.includes(' ' + phrase)) score += 8
        if (!best || score > best.score) best = { c, score, headOnly }
      }
      if (!best) {
        // Terms may be spread across sections of the same article.
        const all = a.T + a.K + a.D + a.chunks.map((c) => c.B).join(' ')
        if (terms.filter((t) => all.includes(t.s)).length < need) continue
        best = { c: a.chunks[0], score: terms.length, headOnly: false }
      }
      let score = best.score
      if (phrase.length > 3 && a.T.includes(' ' + phrase)) score += 15
      out.push({ a, ...best, score })
    }
    out.sort((x, y) => y.score - x.score)
    return out.slice(0, 8).map(({ a, c, headOnly }) => {
      const top = headOnly || !c.id
      return {
        href: top ? a.url : `${a.url}#${c.id}`,
        title: a.title,
        where: top ? a.section : `${a.section} › ${c.heading}`,
        snip: snippet(top && !c.id ? a.desc : c.text, terms) || a.desc,
      }
    })
  }

  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  function snippet(text, terms) {
    // Highlight on a shortened stem so "penalties" also lights up "penalty".
    const pre = terms.map((t) => {
      const s = t.s.trim()
      return escRe(s.length > 4 ? s.replace(/[ye]$/, '') : s)
    })
    const re = new RegExp(`\\b(${pre.join('|')})[a-z0-9]*`, 'gi')
    const folded = fold(text)
    re.lastIndex = 0
    const m = re.exec(folded)
    let start = 0
    let end = Math.min(text.length, 170)
    if (m) {
      start = Math.max(0, m.index - 60)
      end = Math.min(text.length, m.index + 130)
    }
    if (start > 0) start = text.indexOf(' ', start) + 1
    if (end < text.length) end = text.lastIndexOf(' ', end)
    const piece = text.slice(start, end)
    const fp = folded.slice(start, end)
    let html = ''
    let last = 0
    re.lastIndex = 0
    for (let r; (r = re.exec(fp)); ) {
      html += esc(piece.slice(last, r.index)) + '<mark>' + esc(piece.slice(r.index, r.index + r[0].length)) + '</mark>'
      last = r.index + r[0].length
    }
    html += esc(piece.slice(last))
    return (start > 0 ? '… ' : '') + html + (end < text.length ? ' …' : '')
  }

  for (const box of document.querySelectorAll('[data-search]')) {
    const input = box.querySelector('input')
    const list = box.querySelector('.search-results')
    let results = []
    let sel = 0

    const close = () => {
      list.hidden = true
      input.setAttribute('aria-expanded', 'false')
    }
    const render = () => {
      if (!input.value.trim()) return close()
      list.hidden = false
      input.setAttribute('aria-expanded', 'true')
      if (!results.length) {
        list.innerHTML = `<div class="search-empty">Nothing found for “${esc(input.value.trim())}”. Try a different word, such as “flag” or “penalty”.</div>`
        return
      }
      list.innerHTML = results
        .map(
          (r, i) =>
            `<a href="${r.href}" role="option" aria-selected="${i === sel}"><div class="r-title">${esc(r.title)}</div><div class="r-where">${esc(r.where)}</div><div class="r-snip">${r.snip}</div></a>`,
        )
        .join('')
    }
    const run = async () => {
      await load()
      results = search(input.value)
      sel = 0
      render()
    }

    input.addEventListener('focus', () => {
      load()
      if (input.value.trim()) run()
    })
    input.addEventListener('input', run)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!results.length) return
        e.preventDefault()
        sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length
        render()
        list.children[sel]?.scrollIntoView({ block: 'nearest' })
      } else if (e.key === 'Enter') {
        if (results[sel]) location.href = results[sel].href
      } else if (e.key === 'Escape') {
        if (input.value) input.value = ''
        close()
        input.blur()
      }
    })
    list.addEventListener('mousemove', (e) => {
      const a = e.target.closest('a')
      const i = [...list.children].indexOf(a)
      if (i >= 0 && i !== sel) {
        sel = i
        for (const [j, el] of [...list.children].entries()) el.setAttribute('aria-selected', String(j === sel))
      }
    })
    document.addEventListener('click', (e) => {
      if (!box.contains(e.target)) close()
    })
  }

  // "/" jumps to search from anywhere on the page.
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
    const el = document.activeElement
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
    e.preventDefault()
    const inputs = [...document.querySelectorAll('[data-search] input')]
    ;(inputs.find((i) => i.closest('main')) ?? inputs[0])?.focus()
  })

  // Prefill from ?q= so searches can be linked to.
  const q = new URLSearchParams(location.search).get('q')
  if (q) {
    const input = document.querySelector('main [data-search] input') ?? document.querySelector('[data-search] input')
    if (input) {
      input.value = q
      input.focus()
      input.dispatchEvent(new Event('input'))
    }
  }

  // ---------- on this page ----------
  const tocLinks = [...document.querySelectorAll('.toc a')]
  if (tocLinks.length && 'IntersectionObserver' in window) {
    const byId = new Map(tocLinks.map((a) => [decodeURIComponent(a.hash.slice(1)), a]))
    const heads = [...byId.keys()].map((id) => document.getElementById(id)).filter(Boolean)
    const visible = new Set()
    const mark = () => {
      let current = heads.find((h) => visible.has(h)) ?? heads.filter((h) => h.getBoundingClientRect().top < 100).pop() ?? heads[0]
      for (const a of tocLinks) a.classList.toggle('active', byId.get(current?.id) === a)
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting) visible.add(en.target)
          else visible.delete(en.target)
        }
        mark()
      },
      { rootMargin: '-70px 0px -60% 0px' },
    )
    for (const h of heads) io.observe(h)
  }
})()
