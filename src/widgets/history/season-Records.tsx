import { useMemo } from 'react'
import { FIRST_SEASON } from '../../api/jolpica/hooks'
import { useRecords } from '../../api/records/load'
import { DataTable } from '../../components/DataTable'
import { Empty, gate } from '../../components/ui'
import { useConstructorColors } from '../../lib/history'
import { DEFAULT_RECORD, GROUPS, STATS, findRecord, recordCount } from '../../lib/records/catalogue'
import { type Row, activeDrivers, buildCtx, fmtDate } from '../../lib/records/core'
import { useStore, type OptionValue } from '../../store'
import type { OptionFieldProps, WidgetDef, WidgetProps } from '../types'
import './history-season.css'

interface Ranked extends Row {
  rank: number
  highlight: boolean
}

/** Stat (grouped as on statsf1.com) and the record within it. */
function RecordPicker({ id, value, onChange }: { id?: string; value: string; onChange: (v: string) => void }) {
  const { stat, record } = findRecord(value)
  const pickStat = (statId: string) => {
    const next = STATS.find((s) => s.id === statId)!
    const suffix = record.id.slice(stat.id.length)
    onChange((next.records.find((r) => r.id === `${next.id}${suffix}`) ?? next.records[0]).id)
  }
  return (
    <div className="rec-pick">
      <select id={id} aria-label="Statistic" value={stat.id} onChange={(e) => pickStat(e.target.value)}>
        {GROUPS.map((g) => (
          <optgroup key={g} label={g}>
            {STATS.filter((s) => s.group === g).map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <select aria-label="Record" value={record.id} onChange={(e) => onChange(e.target.value)}>
        {stat.records.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function RecordField({ id, label, help, value, onChange }: OptionFieldProps) {
  return (
    <div className="field">
      <span>{label}</span>
      <RecordPicker id={id} value={String(value || DEFAULT_RECORD)} onChange={(v) => onChange(v as OptionValue)} />
      {help && <small>{help}</small>}
    </div>
  )
}

function DriverRecords({ instance, opts }: WidgetProps) {
  const data = useRecords()
  const colorOf = useConstructorColors()
  const setOption = useStore((s) => s.setWidgetOption)
  const recordId = String(opts.record || DEFAULT_RECORD)
  const { stat, record } = findRecord(recordId)
  const from = Number(opts.from) || FIRST_SEASON
  const to = Number(opts.to) || 9999
  const minStarts = Math.max(1, Number(opts.minStarts) || 1)
  const topN = Math.max(5, Number(opts.topN) || 25)
  const highlightId = String(opts.driver || '')

  const ctx = useMemo(() => (data.data ? buildCtx(data.data, from, to, minStarts) : null), [data.data, from, to, minStarts])

  const model = useMemo(() => {
    if (!ctx) return null
    let rows = record.compute(ctx)
    rows.sort((a, b) => (record.asc ? a.value - b.value : b.value - a.value) || (a.date ?? '').localeCompare(b.date ?? ''))
    if (record.perDriver && opts.active) {
      const active = activeDrivers(ctx)
      rows = rows.filter((r) => r.d !== undefined && active.has(r.d))
    }
    if (record.perDriver && opts.perNation) {
      const seen = new Set<string>()
      rows = rows.filter((r) => {
        const nat = r.d !== undefined ? ctx.r.drivers[r.d].nat : null
        if (!nat || seen.has(nat)) return false
        seen.add(nat)
        return true
      })
    }
    const hl = highlightId ? ctx.r.drivers.find((d) => d.jid === highlightId || d.id === highlightId)?.i : undefined
    const ranked: Ranked[] = []
    rows.forEach((r, k) => {
      const rank = k > 0 && rows[k - 1].value === r.value ? ranked[k - 1].rank : k + 1
      ranked.push({ ...r, rank, highlight: hl !== undefined && r.d === hl })
    })
    const top = ranked.slice(0, topN)
    const extra = ranked.slice(topN).filter((r) => r.highlight).slice(0, 3)
    const max = Math.max(...top.map((r) => Math.abs(r.value)), 0)
    return { rows: [...top, ...extra], total: ranked.length, max }
  }, [ctx, record, opts.active, opts.perNation, highlightId, topN])

  const g = gate(data)
  if (g) return g
  if (!ctx || !model) return <Empty>No record data.</Empty>

  // Livery colours are keyed by Jolpica constructor id.
  const teamColor = (t: number) => colorOf(ctx.r.teams[t]?.jid ?? ctx.r.teams[t]?.id)
  const bars = record.bars !== false && !record.asc && model.max > 0
  const nat = (r: Ranked) => (opts.perNation && r.d !== undefined ? ctx.r.drivers[r.d].nat : null)
  const coverage = record.dataFrom && record.dataFrom > from ? `Data from ${record.dataFrom}.` : null

  return (
    <div className="rec">
      <RecordPicker value={record.id} onChange={(v) => setOption(instance.id, 'record', v)} />
      <p className="rec-help">
        {record.help} {coverage}
        {(from > FIRST_SEASON || to < 9999) && ` ${from}–${to < 9999 ? to : 'now'}.`}
      </p>
      <div className="rec-table">
        <DataTable
          rows={model.rows}
          rowKey={(r) => r.key}
          rowClassName={(r) => (r.highlight ? 'rec-hl' : undefined)}
          empty="No one qualifies for this record in the chosen seasons."
          columns={[
            { key: 'rank', label: '#', align: 'right', width: 28 },
            {
              key: 'label',
              label: record.perDriver ? 'Driver' : stat.title,
              render: (r) => (
                <span className="hs-cell">
                  {r.t !== undefined && <span className="hs-swatch" style={{ background: teamColor(r.t) }} />}
                  <span className="rec-label">{r.label}</span>
                  {nat(r) && <span className="minor-text">{nat(r)}</span>}
                </span>
              ),
            },
            {
              key: 'value',
              label: record.valueLabel ?? stat.title,
              align: 'right',
              render: (r) => <b className="rec-value">{r.display}</b>,
            },
            ...(bars
              ? [
                  {
                    key: 'bar',
                    label: '',
                    width: '22%',
                    minor: true,
                    sort: (r: Ranked) => r.value,
                    render: (r: Ranked) => (
                      <span className="rec-bar">
                        <i style={{ width: `${(Math.abs(r.value) / model.max) * 100}%`, background: r.t !== undefined ? teamColor(r.t) : undefined }} />
                      </span>
                    ),
                  },
                ]
              : []),
            { key: 'detail', label: '', minor: true, render: (r) => <span className="rec-detail">{r.detail ?? ''}</span> },
          ]}
        />
      </div>
      <p className="rec-foot">
        {model.total > model.rows.length ? `Top ${Math.min(topN, model.total)} of ${model.total}. ` : ''}
        Data: f1db and Jolpica, to {fmtDate(ctx.r.through)}.{data.data?.liveError && ' Latest races could not be loaded.'}
      </p>
    </div>
  )
}

export const histRecords: WidgetDef = {
  type: 'hist-records',
  name: 'Driver records',
  description: `${recordCount.toLocaleString('en-GB')} all-time driver records in the style of statsf1.com: titles, wins, poles, podiums, laps led, ages, streaks, per-season and per-Grand Prix bests, since 1950.`,
  category: 'Records',
  sessionless: true,
  defaultSize: { w: 12, h: 16 },
  Component: DriverRecords,
  options: [
    { key: 'record', label: 'Record', type: 'custom', default: DEFAULT_RECORD, Field: RecordField },
    { key: 'from', label: 'From season', type: 'number', default: FIRST_SEASON, min: FIRST_SEASON, max: 2100 },
    { key: 'to', label: 'To season', type: 'number', default: 0, min: 0, max: 2100, help: '0 = the latest season.' },
    { key: 'topN', label: 'Show top', type: 'number', default: 25, min: 5, max: 500 },
    { key: 'minStarts', label: 'Minimum starts', type: 'number', default: 30, min: 1, max: 300, help: 'For per-start rates and averages.' },
    { key: 'active', label: 'Current drivers only', type: 'toggle', default: false },
    { key: 'perNation', label: 'Best per nationality', type: 'toggle', default: false, help: 'Keep only the top driver from each country.' },
    { key: 'driver', label: 'Highlight driver', type: 'histDriver', default: '', help: 'Marked in the table and shown even when outside the top.' },
  ],
}
