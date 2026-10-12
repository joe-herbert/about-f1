export interface Meeting {
  meeting_key: number
  meeting_name: string
  meeting_official_name: string
  location: string
  country_code: string
  country_name: string
  country_flag?: string
  circuit_key: number
  circuit_short_name: string
  circuit_type?: string
  circuit_image?: string
  date_start: string
  date_end?: string
  gmt_offset: string
  year: number
}

export interface Session {
  session_key: number
  session_type: string
  session_name: string
  date_start: string
  date_end: string
  meeting_key: number
  circuit_key: number
  circuit_short_name: string
  country_code: string
  country_name: string
  location: string
  gmt_offset: string
  year: number
  is_cancelled?: boolean
  /** IANA zone of the circuit (Jolpica seasons); OpenF1 sessions use gmt_offset */
  time_zone?: string
  /** false when only the date is recorded (Jolpica races before 2005) */
  time_known?: boolean
}

export interface Driver {
  meeting_key: number
  session_key: number
  driver_number: number
  broadcast_name: string
  full_name: string
  name_acronym: string
  team_name: string | null
  team_colour: string | null
  first_name: string
  last_name: string
  headshot_url: string | null
  country_code: string | null
  /** Jolpica driverId, when the record came from (or was matched to) Jolpica */
  driver_id?: string
}

export interface Lap {
  session_key: number
  driver_number: number
  lap_number: number
  date_start: string | null
  duration_sector_1: number | null
  duration_sector_2: number | null
  duration_sector_3: number | null
  i1_speed: number | null
  i2_speed: number | null
  st_speed: number | null
  is_pit_out_lap: boolean
  lap_duration: number | null
  segments_sector_1: (number | null)[] | null
  segments_sector_2: (number | null)[] | null
  segments_sector_3: (number | null)[] | null
}

export interface Stint {
  session_key: number
  stint_number: number
  driver_number: number
  lap_start: number
  lap_end: number
  compound: string
  tyre_age_at_start: number
}

export interface Pit {
  date: string
  session_key: number
  driver_number: number
  lap_number: number
  pit_duration: number | null
  stop_duration?: number | null
  lane_duration?: number | null
}

export interface Position {
  date: string
  session_key: number
  driver_number: number
  position: number
}

export interface Interval {
  date: string
  session_key: number
  driver_number: number
  gap_to_leader: number | string | null
  interval: number | string | null
}

export interface Weather {
  date: string
  session_key: number
  air_temperature: number
  track_temperature: number
  humidity: number
  pressure: number
  rainfall: number
  wind_direction: number
  wind_speed: number
}

export interface RaceControl {
  date: string
  session_key: number
  driver_number: number | null
  lap_number: number | null
  category: string
  flag: string | null
  scope: string | null
  sector: number | null
  qualifying_phase?: number | null
  message: string
}

export interface TeamRadio {
  date: string
  session_key: number
  driver_number: number
  recording_url: string
}

export interface SessionResult {
  session_key: number
  meeting_key: number
  driver_number: number
  position: number | null
  number_of_laps: number | null
  points?: number | null
  dnf: boolean
  dns: boolean
  dsq: boolean
  /** Number for races; array of [Q1, Q2, Q3] for qualifying */
  duration: number | (number | null)[] | null
  gap_to_leader: number | string | (number | string | null)[] | null
}

export interface StartingGrid {
  session_key: number
  driver_number: number
  position: number
  lap_duration: number | null
}

export interface Overtake {
  session_key: number
  overtaking_driver_number: number
  overtaken_driver_number: number
  date: string
  position: number
}

export interface ChampionshipDriver {
  meeting_key: number
  session_key: number
  driver_number: number
  /** Driver details when the standings come from Jolpica (covers drivers absent from this race) */
  driver?: Driver
  position_start: number | null
  position_current: number | null
  points_start: number | null
  points_current: number | null
}

export interface ChampionshipTeam {
  meeting_key: number
  session_key: number
  team_name: string
  position_start: number | null
  position_current: number | null
  points_start: number | null
  points_current: number | null
}

export interface CarData {
  date: string
  driver_number: number
  speed: number
  throttle: number
  brake: number
  n_gear: number
  rpm: number
  drs: number | null
}

export interface Location {
  date: string
  driver_number: number
  x: number
  y: number
  z: number
}
