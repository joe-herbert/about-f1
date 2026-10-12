import type { Prefs } from '../store'

/** 83.456 -> "1:23.456" */
export function lapTime(sec: number | null | undefined, digits = 3): string {
  if (sec === null || sec === undefined || !isFinite(sec)) return '—'
  const m = Math.floor(sec / 60)
  const s = sec - m * 60
  const ss = s.toFixed(digits).padStart(digits + 3, '0')
  return m ? `${m}:${ss}` : s.toFixed(digits)
}

/** 6120.8 -> "1:42:00.8" */
export function raceTime(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !isFinite(sec)) return '—'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = (sec % 60).toFixed(3).padStart(6, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

export function gap(v: number | string | null | undefined, digits = 3): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'string') return v
  if (v === 0) return 'Leader'
  return `+${v.toFixed(digits)}`
}

export function delta(v: number | null | undefined, digits = 3): string {
  if (v === null || v === undefined || !isFinite(v)) return '—'
  return `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(digits)}`
}

export function speed(kmh: number | null | undefined, prefs: Pick<Prefs, 'speedUnit'>): string {
  if (kmh === null || kmh === undefined) return '—'
  return prefs.speedUnit === 'mph' ? `${Math.round(kmh * 0.621371)} mph` : `${Math.round(kmh)} km/h`
}

export function speedValue(kmh: number, prefs: Pick<Prefs, 'speedUnit'>) {
  return prefs.speedUnit === 'mph' ? kmh * 0.621371 : kmh
}

export function temp(c: number | null | undefined, prefs: Pick<Prefs, 'tempUnit'>): string {
  if (c === null || c === undefined) return '—'
  return prefs.tempUnit === 'F' ? `${(c * 1.8 + 32).toFixed(1)}°F` : `${c.toFixed(1)}°C`
}

export function tempValue(c: number, prefs: Pick<Prefs, 'tempUnit'>) {
  return prefs.tempUnit === 'F' ? c * 1.8 + 32 : c
}

export function clock(iso: string, gmtOffset?: string): string {
  const d = new Date(iso)
  if (gmtOffset) {
    const [h, m] = gmtOffset.split(':').map(Number)
    const sign = gmtOffset.startsWith('-') ? -1 : 1
    const local = new Date(d.getTime() + sign * (Math.abs(h) * 60 + m) * 60000)
    return local.toISOString().slice(11, 19)
  }
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function dateShort(iso: string): string {
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' })
}

export function ordinal(n: number | null | undefined): string {
  if (!n) return '—'
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export function compact(n: number): string {
  return Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K` : String(Math.round(n * 10) / 10)
}
