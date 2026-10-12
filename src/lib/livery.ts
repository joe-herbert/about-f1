// Recognisable livery colours for constructors old and new, keyed by Jolpica
// constructorId. Unknown teams take the categorical palette in order of first
// appearance (never generated hues), then grey.

export const LIVERY: Record<string, string> = {
  ferrari: '#dc0000',
  mclaren: '#ff8000',
  mercedes: '#00a19c',
  red_bull: '#3671c6',
  williams: '#1868db',
  alpine: '#0093cc',
  renault: '#f5c400',
  aston_martin: '#229971',
  sauber: '#52a832',
  kick_sauber: '#52e252',
  audi: '#bb0a30',
  alfa: '#a6051a',
  haas: '#8f969d',
  rb: '#6692ff',
  alphatauri: '#4e7c9b',
  toro_rosso: '#469bff',
  force_india: '#f596c8',
  racing_point: '#f596c8',
  lotus_f1: '#c8a400',
  team_lotus: '#0b6b3a',
  lotus: '#0b6b3a',
  brabham: '#1d4f91',
  tyrrell: '#1f3b73',
  benetton: '#2fb34a',
  jordan: '#e5c300',
  brawn: '#9bd14f',
  bmw_sauber: '#1e5bc6',
  toyota: '#b5121b',
  honda: '#9a9a9a',
  jaguar: '#0b5d3b',
  minardi: '#3b3b3b',
  stewart: '#e8e8e8',
  ligier: '#0050a0',
  march: '#e86a1b',
  cooper: '#004225',
  maserati: '#b60d1e',
  vanwall: '#1f5e3b',
  brm: '#2b5329',
  matra: '#2266cc',
  prost: '#24408e',
  arrows: '#f08a00',
  cadillac: '#8c8c8c',
}

export const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948']

/** Colour assigner: livery when known, else palette slots in order of first request. */
export function liveryAssigner() {
  const assigned = new Map<string, string>()
  let next = 0
  return (constructorId: string | undefined) => {
    if (!constructorId) return '#8a8f98'
    let hex = assigned.get(constructorId)
    if (!hex) {
      hex = LIVERY[constructorId] ?? PALETTE[next++] ?? '#8a8f98'
      assigned.set(constructorId, hex)
    }
    return hex
  }
}
