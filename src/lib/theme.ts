import { useEffect, useState } from 'react'
import { useStore } from '../store'

export interface Tokens {
  mode: 'light' | 'dark'
  page: string
  panel: string
  panel2: string
  ink: string
  ink2: string
  muted: string
  hair: string
  axis: string
  accent: string
  good: string
  warn: string
  bad: string
  seqLow: string
  seqHigh: string
  divNeg: string
  divMid: string
  divPos: string
}

export const LIGHT: Tokens = {
  mode: 'light',
  page: '#e8ecf0',
  panel: '#fbfcfd',
  panel2: '#f1f3f6',
  ink: '#161b24',
  ink2: '#4c5768',
  muted: '#7b8594',
  hair: '#dde2e8',
  axis: '#c3cad4',
  accent: '#2446cc',
  good: '#0ca30c',
  warn: '#fab219',
  bad: '#d03b3b',
  seqLow: '#cde2fb',
  seqHigh: '#0d366b',
  divNeg: '#2a78d6',
  divMid: '#eef0f2',
  divPos: '#e34948',
}

export const DARK: Tokens = {
  mode: 'dark',
  page: '#0e1117',
  panel: '#161a22',
  panel2: '#1d222c',
  ink: '#e8ebf0',
  ink2: '#b2bac7',
  muted: '#7e8796',
  hair: '#252b36',
  axis: '#353d4a',
  accent: '#7891ff',
  good: '#0ca30c',
  warn: '#fab219',
  bad: '#e05252',
  seqLow: '#1a2333',
  seqHigh: '#86b6ef',
  divNeg: '#3987e5',
  divMid: '#2b313b',
  divPos: '#e66767',
}

export function useSystemDark() {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const fn = (e: MediaQueryListEvent) => setDark(e.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])
  return dark
}

export function useTokens(): Tokens {
  const pref = useStore((s) => s.prefs.theme)
  const sysDark = useSystemDark()
  const dark = pref === 'dark' || (pref === 'system' && sysDark)
  return dark ? DARK : LIGHT
}

/* ---------- domain colours ---------- */

export const COMPOUNDS: Record<string, { light: string; dark: string; label: string; short: string }> = {
  SOFT: { light: '#da291c', dark: '#e8473a', label: 'Soft', short: 'S' },
  MEDIUM: { light: '#e8b500', dark: '#ffd12e', label: 'Medium', short: 'M' },
  HARD: { light: '#9aa1ab', dark: '#eceef1', label: 'Hard', short: 'H' },
  INTERMEDIATE: { light: '#2f9e1f', dark: '#43b02a', label: 'Intermediate', short: 'I' },
  WET: { light: '#0067ad', dark: '#2b8fd6', label: 'Wet', short: 'W' },
  UNKNOWN: { light: '#8a8f98', dark: '#6b717b', label: 'Unknown', short: '?' },
}

export function compoundColor(c: string | null | undefined, t: Tokens) {
  const k = COMPOUNDS[(c ?? 'UNKNOWN').toUpperCase()] ?? COMPOUNDS.UNKNOWN
  return t.mode === 'dark' ? k.dark : k.light
}

export const FLAG_COLORS: Record<string, string> = {
  GREEN: '#1fa34a',
  YELLOW: '#f2c200',
  'DOUBLE YELLOW': '#f2c200',
  RED: '#d63031',
  BLUE: '#2d7ff9',
  CHEQUERED: '#888888',
  BLACK: '#222222',
  'BLACK AND WHITE': '#777777',
  'BLACK AND ORANGE': '#e8752a',
  CLEAR: '#1fa34a',
}

/** Mix a hex colour toward another by t (0..1). */
export function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t)
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t)
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t)
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`
}

/** Luminance-based ink for text sitting inside a filled mark. */
export function inkOn(hex: string) {
  const p = parseInt(hex.slice(1), 16)
  const lum = (0.2126 * ((p >> 16) & 255) + 0.7152 * ((p >> 8) & 255) + 0.0722 * (p & 255)) / 255
  return lum > 0.6 ? '#10141b' : '#ffffff'
}
