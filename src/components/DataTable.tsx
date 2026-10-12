import { useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'

export interface Column<T> {
  key: string
  label: string
  align?: 'left' | 'right' | 'center'
  /** Rendered cell; defaults to String(row[key]) */
  render?: (row: T, index: number) => ReactNode
  /** Value used for sorting; defaults to row[key] */
  sort?: (row: T) => number | string | null | undefined
  width?: number | string
  /** Hide on narrow widgets */
  minor?: boolean
}

interface Props<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey?: (row: T, i: number) => string | number
  initialSort?: { key: string; dir: 1 | -1 }
  onRowClick?: (row: T) => void
  rowClassName?: (row: T) => string | undefined
  empty?: ReactNode
}

export function DataTable<T>({ columns, rows, rowKey, initialSort, onRowClick, rowClassName, empty }: Props<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(initialSort ?? null)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col) return rows
    const val = col.sort ?? ((r: T) => (r as Record<string, unknown>)[col.key] as number | string | null | undefined)
    return [...rows].sort((a, b) => {
      const va = val(a)
      const vb = val(b)
      if (va === vb) return 0
      if (va === null || va === undefined || va === '') return 1
      if (vb === null || vb === undefined || vb === '') return -1
      return (va < vb ? -1 : 1) * sort.dir
    })
  }, [rows, sort, columns])

  if (!rows.length) return <div className="empty">{empty ?? 'No rows for this session.'}</div>

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key
              return (
                <th
                  key={c.key}
                  style={{ textAlign: c.align ?? 'left', width: c.width }}
                  className={c.minor ? 'minor' : undefined}
                  aria-sort={active ? (sort!.dir === 1 ? 'ascending' : 'descending') : 'none'}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setSort(active ? (sort!.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 })
                    }
                  >
                    {c.label}
                    {active && (sort!.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr
              key={rowKey ? rowKey(r, i) : i}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={[onRowClick ? 'clickable' : '', rowClassName?.(r) ?? ''].join(' ').trim() || undefined}
            >
              {columns.map((c) => (
                <td key={c.key} style={{ textAlign: c.align ?? 'left' }} className={c.minor ? 'minor' : undefined}>
                  {c.render ? c.render(r, i) : String((r as Record<string, unknown>)[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
