import { useEffect, useState } from 'react'

/* ────────────────────────────────────────────────────────────────
   Window controls

   The Electron window is frameless (no OS title bar, no menu bar), so
   minimise / maximise / close live here and get docked into the app's
   own title bar next to Export.
   ──────────────────────────────────────────────────────────────── */

function MinimizeGlyph() {
  return (
    <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1">
      <line x1="0" y1="5" x2="10" y2="5" />
    </svg>
  )
}

function MaximizeGlyph() {
  return (
    <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1">
      <rect x="0.5" y="0.5" width="9" height="9" />
    </svg>
  )
}

function RestoreGlyph() {
  return (
    <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1">
      <rect x="0.5" y="2.5" width="7" height="7" />
      <polyline points="2.5,2.5 2.5,0.5 9.5,0.5 9.5,7.5 7.5,7.5" />
    </svg>
  )
}

function CloseGlyph() {
  return (
    <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1">
      <line x1="0.5" y1="0.5" x2="9.5" y2="9.5" />
      <line x1="9.5" y1="0.5" x2="0.5" y2="9.5" />
    </svg>
  )
}

export function WindowControls({ className = '' }: { className?: string }) {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    const api = window.electronAPI
    if (!api) return
    let cancelled = false
    api.windowIsMaximized().then(value => {
      if (!cancelled) setIsMaximized(value)
    }).catch(() => {})
    // Maximising can also happen outside these buttons (double-click on the
    // drag strip, Win+Up, snapping), so track the window's own events.
    const off = api.on('window:maximize-changed', payload => setIsMaximized(payload.isMaximized))
    return () => {
      cancelled = true
      off?.()
    }
  }, [])

  if (typeof window === 'undefined' || !window.electronAPI) return null

  return (
    <div className={`app-no-drag flex items-center ${className}`}>
      <button
        onClick={() => window.electronAPI.windowMinimize()}
        title="Minimize"
        aria-label="Minimize"
        className="flex h-[26px] w-[38px] items-center justify-center text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
      >
        <MinimizeGlyph />
      </button>
      <button
        onClick={() => window.electronAPI.windowToggleMaximize().then(setIsMaximized).catch(() => {})}
        title={isMaximized ? 'Restore' : 'Maximize'}
        aria-label={isMaximized ? 'Restore' : 'Maximize'}
        className="flex h-[26px] w-[38px] items-center justify-center text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
      >
        {isMaximized ? <RestoreGlyph /> : <MaximizeGlyph />}
      </button>
      <button
        onClick={() => {
          window.dispatchEvent(new Event('beforeunload'))
          window.electronAPI.windowClose()
        }}
        title="Close"
        aria-label="Close"
        className="flex h-[26px] w-[38px] items-center justify-center text-zinc-400 transition-colors hover:bg-[#e81123] hover:text-white"
      >
        <CloseGlyph />
      </button>
    </div>
  )
}

/**
 * A bare drag strip with the window controls pinned to its right, for screens
 * that have no title bar of their own (home, migration and error screens).
 * Fixed and transparent, so it overlays whatever is underneath rather than
 * pushing the layout around.
 */
export function FramelessTopBar() {
  if (typeof window === 'undefined' || !window.electronAPI) return null

  return (
    <div className="app-drag fixed inset-x-0 top-0 z-[200] flex h-[34px] items-start justify-end">
      {/* Home's hero video runs right up under this strip, so the buttons need
          their own backdrop to stay readable against a bright frame. */}
      <div className="rounded-bl-md bg-zinc-950/70 backdrop-blur-sm">
        <WindowControls />
      </div>
    </div>
  )
}
