// Jolpica F1 (Ergast-compatible) response shapes. All numbers arrive as strings.

export interface JDriver {
  driverId: string
  permanentNumber?: string
  code?: string
  url?: string
  givenName: string
  familyName: string
  dateOfBirth?: string
  nationality?: string
}

export interface JConstructor {
  constructorId: string
  url?: string
  name: string
  nationality?: string
}

export interface JCircuit {
  circuitId: string
  url?: string
  circuitName: string
  Location: { lat: string; long: string; locality: string; country: string }
}

export interface JTime {
  millis?: string
  time: string
}

export interface JResult {
  number: string
  position: string
  positionText: string
  points: string
  Driver: JDriver
  Constructor: JConstructor
  grid: string
  laps: string
  status: string
  Time?: JTime
  FastestLap?: { rank?: string; lap: string; Time?: { time: string }; AverageSpeed?: { units: string; speed: string } }
}

export interface JQualifying {
  number: string
  position: string
  Driver: JDriver
  Constructor: JConstructor
  Q1?: string
  Q2?: string
  Q3?: string
}

export interface JTiming {
  driverId: string
  position: string
  time: string
}

export interface JLap {
  number: string
  Timings: JTiming[]
}

export interface JPitStop {
  driverId: string
  lap: string
  stop: string
  time: string
  duration: string
}

export interface JSessionTime {
  date: string
  time?: string
}

export interface JRace {
  season: string
  round: string
  url?: string
  raceName: string
  Circuit: JCircuit
  date: string
  time?: string
  FirstPractice?: JSessionTime
  SecondPractice?: JSessionTime
  ThirdPractice?: JSessionTime
  Qualifying?: JSessionTime
  Sprint?: JSessionTime
  SprintQualifying?: JSessionTime
  Results?: JResult[]
  SprintResults?: JResult[]
  QualifyingResults?: JQualifying[]
  Laps?: JLap[]
  PitStops?: JPitStop[]
}

export interface JDriverStanding {
  position?: string
  positionText: string
  points: string
  wins: string
  Driver: JDriver
  Constructors: JConstructor[]
}

export interface JConstructorStanding {
  position?: string
  positionText: string
  points: string
  wins: string
  Constructor: JConstructor
}

export interface JStandingsList {
  season: string
  round: string
  DriverStandings?: JDriverStanding[]
  ConstructorStandings?: JConstructorStanding[]
}

export interface JSeason {
  season: string
  url?: string
}

/** Merged, de-paginated payload. Only the table the endpoint returns is filled. */
export interface JData {
  total: number
  races: JRace[]
  standings: JStandingsList[]
  drivers: JDriver[]
  constructors: JConstructor[]
  circuits: JCircuit[]
  seasons: JSeason[]
}
