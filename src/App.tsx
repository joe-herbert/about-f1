import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { BookOpen, Moon, RefreshCw, Settings, Sun } from 'lucide-react'
import { onQueueChange } from './api/client'
import { DashboardGrid } from './components/DashboardGrid'
import { DashboardTabs } from './components/DashboardTabs'
import { DriverFilterBar } from './components/DriverFilterBar'
import { PrefsDialog } from './components/PrefsDialog'
import { SessionBanner } from './components/SessionBanner'
import { SessionPicker } from './components/SessionPicker'
import { WidgetFrame } from './components/WidgetFrame'
import { WidgetLibrary } from './components/WidgetLibrary'
import { WidgetSettings } from './components/WidgetSettings'
import { useTokens } from './lib/theme'
import { useActiveDashboard, useStore } from './store'

function useApplyTheme() {
  const t = useTokens()
  const density = useStore((s) => s.prefs.density)
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = t.mode
    root.dataset.density = density
    root.style.colorScheme = t.mode
  }, [t.mode, density])
  return t
}

function useInflight() {
  const [n, setN] = useState(0)
  useEffect(() => {
    const off = onQueueChange(setN)
    return () => void off()
  }, [])
  return n
}

export default function App() {
  const t = useApplyTheme()
  const qc = useQueryClient()
  const year = useStore((s) => s.year)
  const sessionKey = useStore((s) => s.sessionKey)
  const setYear = useStore((s) => s.setYear)
  const setSession = useStore((s) => s.setSession)
  const setPrefs = useStore((s) => s.setPrefs)
  const dash = useActiveDashboard()
  const inflight = useInflight()

  const [libOpen, setLibOpen] = useState(false)
  const [prefsOpen, setPrefsOpen] = useState(false)
  const [settingsId, setSettingsId] = useState<string | null>(null)
  const [maxId, setMaxId] = useState<string | null>(null)
  const maxInstance = maxId ? dash.widgets[maxId] : undefined

  useEffect(() => {
    if (!maxId) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !settingsId && setMaxId(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [maxId, settingsId])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand" aria-label="About F1">
          <svg viewBox="0 0 28 16" width="28" height="16" aria-hidden>
            <path d="M1 15 L9 1 H27 L25 5 H12 L10.5 8 H22 L20 12 H8.5 L7 15 Z" fill="currentColor" />
          </svg>
          <span>About F1</span>
        </div>
        <SessionPicker year={year} sessionKey={sessionKey} onYear={setYear} onSession={setSession} />
        <div className="topbar-tools">
          <span className={`activity${inflight ? ' busy' : ''}`} role="status" aria-live="polite">
            {inflight ? `Fetching ${inflight}` : ''}
          </span>
          <a className="nav-link" href="/guide/" title="Rules and regulations explained">
            <BookOpen size={15} />
            <span>Guide</span>
          </a>
          <button type="button" className="icon-btn" title="Refresh data" aria-label="Refresh data" onClick={() => qc.invalidateQueries()}>
            <RefreshCw size={16} />
          </button>
          <button
            type="button"
            className="icon-btn"
            title={t.mode === 'dark' ? 'Switch to light' : 'Switch to dark'}
            aria-label="Toggle theme"
            onClick={() => setPrefs({ theme: t.mode === 'dark' ? 'light' : 'dark' })}
          >
            {t.mode === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button type="button" className="icon-btn" title="Preferences" aria-label="Preferences" onClick={() => setPrefsOpen(true)}>
            <Settings size={16} />
          </button>
        </div>
      </header>

      <main className="main">
        <SessionBanner />
        <div className="controls">
          <DashboardTabs onAdd={() => setLibOpen(true)} />
          <DriverFilterBar />
        </div>
        <DashboardGrid onSettings={setSettingsId} onMaximize={setMaxId} onAdd={() => setLibOpen(true)} />
      </main>

      {maxInstance && (
        <div className="maximized" role="dialog" aria-modal="true" aria-label={maxInstance.title ?? maxInstance.type}>
          <WidgetFrame instance={maxInstance} maximized onSettings={() => setSettingsId(maxInstance.id)} onMaximize={() => setMaxId(null)} />
        </div>
      )}

      <WidgetLibrary open={libOpen} onClose={() => setLibOpen(false)} />
      <WidgetSettings id={settingsId} onClose={() => setSettingsId(null)} />
      <PrefsDialog open={prefsOpen} onClose={() => setPrefsOpen(false)} />
    </div>
  )
}
