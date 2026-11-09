import { useEffect, useRef, useState } from 'react'
import { AudioPlayer } from './AudioPlayer'

/**
 * Top navigation with priority collapse (styles: "Top navigation" section of styles.css).
 *
 * Every control has exactly one inline element and one menu item; CSS breakpoints decide which of the two is visible,
 * so no control is ever clipped or unreachable:
 *   > 1760px   everything inline
 *   ≤ 1760px   quick jumps (Earth / Milky Way / Solar System) move into "More"
 *   ≤ 1440px   tools (Data Intelligence / Help / Notes) move into "More"; audio shows its icon only
 *   ≤ 860px    primary actions (Find Home / Travel / Events / Academy) move into "More" (tablet & phone)
 * The "More" button itself only appears when at least one group is collapsed.
 */
export interface TopNavActions {
  startTour(): void
  enterTravel(): void
  openEvents(): void
  startAcademy(): void
  goEarth(): void
  goMilkyWay(): void
  goSolarSystem(): void
  toggleData(): void
  openHelp(): void
  openAbout(): void
  dataOpen: boolean
}

type Item = { key: string; label: string; icon: string; title: string; run: () => void; className?: string; pressed?: boolean }

export function TopNav(a: TopNavActions) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const primary: Item[] = [
    { key: 'find', icon: '✦', label: 'Find Home', title: 'Guided journey from ~1 billion light-years to Earth', run: a.startTour, className: 'find' },
    { key: 'travel', icon: '🚀', label: 'Travel Mode', title: 'Pilot a spacecraft through the Solar System', run: a.enterTravel, className: 'travel-btn' },
    { key: 'events', icon: '🌌', label: 'Cosmic Events', title: 'Simulations of supernovae, pulsars, black holes and nebulae', run: a.openEvents, className: 'events-btn' },
    { key: 'academy', icon: '🎓', label: 'Academy', title: 'Cosmic Academy: interactive training missions', run: a.startAcademy, className: 'academy-btn' },
  ]
  const jumps: Item[] = [
    { key: 'earth', icon: '◉', label: 'Earth', title: 'Fly to Earth', run: a.goEarth },
    { key: 'mw', icon: '◎', label: 'Milky Way', title: 'Fly to the Milky Way Galaxy', run: a.goMilkyWay },
    { key: 'solar', icon: '☀', label: 'Solar System', title: 'Fly to the Solar System', run: a.goSolarSystem },
  ]
  const tools: Item[] = [
    { key: 'data', icon: '⌬', label: 'Data Intelligence', title: 'Ingest and map unfamiliar astronomy datasets', run: a.toggleData, pressed: a.dataOpen },
    { key: 'help', icon: '?', label: 'Help', title: 'Keyboard & navigation controls', run: a.openHelp },
    { key: 'notes', icon: 'ⓘ', label: 'Notes', title: 'Scientific notes & data integrity', run: a.openAbout },
  ]

  // close on outside click / Escape; focus the first item on open and return focus to the button on close
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
        btnRef.current?.focus()
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not([hidden])') ?? []).filter((b) => b.offsetParent !== null)
        if (!items.length) return
        e.preventDefault()
        const i = items.indexOf(document.activeElement as HTMLButtonElement)
        const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length
        items[next].focus()
      }
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey, true)
    requestAnimationFrame(() => {
      const first = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []).find((b) => b.offsetParent !== null)
      first?.focus()
    })
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  const run = (it: Item) => {
    setOpen(false)
    it.run()
  }

  const inline = (it: Item, ghost: boolean) => (
    <button
      key={it.key}
      className={'btn ' + (ghost ? 'ghost ' : '') + (it.className ?? '') + (it.pressed ? ' on' : '')}
      onClick={it.run}
      title={it.title}
      aria-pressed={it.pressed === undefined ? undefined : it.pressed}
    >
      <span aria-hidden>{it.icon}</span>
      <span className="nav-label">{it.label}</span>
    </button>
  )
  const menuItem = (it: Item) => (
    <button key={it.key} role="menuitem" className={'nav-menu-item' + (it.pressed ? ' on' : '')} onClick={() => run(it)} title={it.title}>
      <span aria-hidden className="nav-menu-ic">{it.icon}</span>
      {it.label}
    </button>
  )

  return (
    <nav className="topnav" aria-label="Main navigation">
      <div className="nav-group nav-primary">{primary.map((it) => inline(it, false))}</div>
      <AudioPlayer />
      <span className="divider nav-jumps" />
      <div className="nav-group nav-jumps">{jumps.map((it) => inline(it, true))}</div>
      <span className="divider nav-tools" />
      <div className="nav-group nav-tools">{tools.map((it) => inline(it, true))}</div>

      <div className="nav-more" ref={wrapRef}>
        <button
          ref={btnRef}
          className={'btn ghost nav-more-btn' + (open ? ' on' : '')}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls="nav-more-menu"
          onClick={() => setOpen((o) => !o)}
          title="More navigation"
        >
          <span aria-hidden>☰</span>
          <span className="nav-label">More</span>
        </button>
        {open && (
          <div id="nav-more-menu" className="nav-menu glass" role="menu" aria-label="More navigation" ref={menuRef}>
            <div className="nav-menu-sec menu-primary" role="group" aria-label="Explore">
              <div className="nav-menu-h">Explore</div>
              {primary.map(menuItem)}
            </div>
            <div className="nav-menu-sec menu-jumps" role="group" aria-label="Fly to">
              <div className="nav-menu-h">Fly to</div>
              {jumps.map(menuItem)}
            </div>
            <div className="nav-menu-sec menu-tools" role="group" aria-label="Tools">
              <div className="nav-menu-h">Tools</div>
              {tools.map(menuItem)}
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
