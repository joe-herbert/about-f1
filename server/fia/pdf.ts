import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

/** A run of text on a PDF page, positioned in PDF points from the bottom left. */
export interface Word {
  str: string
  x: number
  /** Horizontal centre, for matching values to centred column headings */
  cx: number
  y: number
}

/** Words sharing a baseline, left to right. */
export interface Line {
  page: number
  y: number
  words: Word[]
  text: string
}

/** Text lines of every page in reading order (top to bottom, page by page). */
export async function pdfLines(data: Uint8Array): Promise<Line[]> {
  const task = getDocument({ data, useSystemFonts: true })
  const doc = await task.promise
  const out: Line[] = []
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const content = await page.getTextContent()
      const words: Word[] = []
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue
        const x = item.transform[4]
        words.push({ str: item.str.trim(), x, cx: x + item.width / 2, y: item.transform[5] })
      }
      // Group by baseline, allowing a point or two of drift between runs on one line.
      words.sort((a, b) => b.y - a.y || a.x - b.x)
      const lines: Line[] = []
      for (const w of words) {
        const line = lines.find((l) => Math.abs(l.y - w.y) <= 2)
        if (line) line.words.push(w)
        else lines.push({ page: p, y: w.y, words: [w], text: '' })
      }
      for (const l of lines) {
        l.words.sort((a, b) => a.x - b.x)
        l.text = l.words.map((w) => w.str).join(' ')
      }
      out.push(...lines.sort((a, b) => b.y - a.y))
    }
  } finally {
    await task.destroy()
  }
  return out
}
