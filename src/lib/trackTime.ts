import type { Session } from '../api/types'

/** IANA time zone for every Jolpica circuitId, so historical offsets (and DST) come from the browser's tz database. */
export const CIRCUIT_TIME_ZONES: Record<string, string> = {
  adelaide: 'Australia/Adelaide',
  'ain-diab': 'Africa/Casablanca',
  aintree: 'Europe/London',
  albert_park: 'Australia/Melbourne',
  americas: 'America/Chicago',
  anderstorp: 'Europe/Stockholm',
  avus: 'Europe/Berlin',
  bahrain: 'Asia/Bahrain',
  baku: 'Asia/Baku',
  boavista: 'Europe/Lisbon',
  brands_hatch: 'Europe/London',
  bremgarten: 'Europe/Zurich',
  buddh: 'Asia/Kolkata',
  catalunya: 'Europe/Madrid',
  charade: 'Europe/Paris',
  dallas: 'America/Chicago',
  detroit: 'America/Detroit',
  dijon: 'Europe/Paris',
  donington: 'Europe/London',
  essarts: 'Europe/Paris',
  estoril: 'Europe/Lisbon',
  fuji: 'Asia/Tokyo',
  galvez: 'America/Argentina/Buenos_Aires',
  george: 'Africa/Johannesburg',
  hockenheimring: 'Europe/Berlin',
  hungaroring: 'Europe/Budapest',
  imola: 'Europe/Rome',
  indianapolis: 'America/Indiana/Indianapolis',
  interlagos: 'America/Sao_Paulo',
  istanbul: 'Europe/Istanbul',
  jacarepagua: 'America/Sao_Paulo',
  jarama: 'Europe/Madrid',
  jeddah: 'Asia/Riyadh',
  jerez: 'Europe/Madrid',
  kyalami: 'Africa/Johannesburg',
  las_vegas: 'America/Los_Angeles',
  lemans: 'Europe/Paris',
  long_beach: 'America/Los_Angeles',
  losail: 'Asia/Qatar',
  madring: 'Europe/Madrid',
  magny_cours: 'Europe/Paris',
  marina_bay: 'Asia/Singapore',
  miami: 'America/New_York',
  monaco: 'Europe/Monaco',
  monsanto: 'Europe/Lisbon',
  montjuic: 'Europe/Madrid',
  monza: 'Europe/Rome',
  mosport: 'America/Toronto',
  mugello: 'Europe/Rome',
  nivelles: 'Europe/Brussels',
  nurburgring: 'Europe/Berlin',
  okayama: 'Asia/Tokyo',
  pedralbes: 'Europe/Madrid',
  pescara: 'Europe/Rome',
  phoenix: 'America/Phoenix',
  portimao: 'Europe/Lisbon',
  red_bull_ring: 'Europe/Vienna',
  reims: 'Europe/Paris',
  ricard: 'Europe/Paris',
  riverside: 'America/Los_Angeles',
  rodriguez: 'America/Mexico_City',
  sebring: 'America/New_York',
  sepang: 'Asia/Kuala_Lumpur',
  shanghai: 'Asia/Shanghai',
  silverstone: 'Europe/London',
  sochi: 'Europe/Moscow',
  spa: 'Europe/Brussels',
  suzuka: 'Asia/Tokyo',
  tremblant: 'America/Toronto',
  valencia: 'Europe/Madrid',
  vegas: 'America/Los_Angeles',
  villeneuve: 'America/Toronto',
  watkins_glen: 'America/New_York',
  yas_marina: 'Asia/Dubai',
  yeongam: 'Asia/Seoul',
  zandvoort: 'Europe/Amsterdam',
  zeltweg: 'Europe/Vienna',
  zolder: 'Europe/Brussels',
}

/** "08:00:00" / "-04:00:00" → minutes east of UTC */
function offsetMinutes(gmt: string): number | null {
  const m = gmt.match(/^(-)?(\d{1,2}):(\d{2})/)
  if (!m) return null
  const mins = Number(m[2]) * 60 + Number(m[3])
  return m[1] ? -mins : mins
}

export interface TrackClock {
  /** "20:00" at the track */
  time: string
  /** Weekday at the track, set only when it differs from the viewer's day */
  day: string | null
  /** "UTC+8" */
  zone: string
}

/**
 * The session start as the track's local wall clock. Uses the session's IANA zone when
 * known (Jolpica seasons), else OpenF1's fixed gmt_offset. Null when the start time
 * itself isn't recorded.
 */
export function trackClock(session: Session): TrackClock | null {
  if (session.time_known === false) return null
  const start = new Date(session.date_start)
  const viewerDay = start.toLocaleDateString([], { weekday: 'short' })

  if (session.time_zone) {
    const parts = new Intl.DateTimeFormat([], {
      timeZone: session.time_zone,
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      timeZoneName: 'shortOffset',
      hourCycle: 'h23',
    }).formatToParts(start)
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
    const day = get('weekday')
    return { time: `${get('hour')}:${get('minute')}`, day: day !== viewerDay ? day : null, zone: get('timeZoneName').replace('GMT', 'UTC').replace('-', '−') }
  }

  const off = offsetMinutes(session.gmt_offset)
  if (off === null) return null
  const shifted = new Date(start.getTime() + off * 60000)
  const day = shifted.toLocaleDateString([], { weekday: 'short', timeZone: 'UTC' })
  const h = Math.trunc(Math.abs(off) / 60)
  const mm = Math.abs(off) % 60
  const zone = off === 0 ? 'UTC' : `UTC${off < 0 ? '−' : '+'}${h}${mm ? `:${String(mm).padStart(2, '0')}` : ''}`
  return { time: shifted.toISOString().slice(11, 16), day: day !== viewerDay ? day : null, zone }
}
