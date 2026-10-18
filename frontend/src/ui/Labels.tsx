import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { labelState } from '../scene/labelState'
import { useStore } from '../store/store'
import { nav } from '../store/nav'
import { OBJECTS } from '../data/catalog'
import { eventState } from '../events/eventState'

function visible(it: (typeof labelState.items)[number], selectedId: string | null): boolean {
  const { o, dLy, rTrue } = it
  if (o.id === selectedId) return true
  const solar = Math.hypot(nav.pos[0] + 26673, nav.pos[1], nav.pos[2])
  switch (o.category) {
    case 'supercluster': case 'cluster': case 'group': case 'sheet':
      return nav.scale > 500 && dLy > rTrue * 0.5 && dLy < 6e9
    case 'galaxy':
      return o.id === 'milky-way'
        ? Math.hypot(...nav.pos) > 70000
        : nav.scale > 20 && dLy > rTrue * 0.4 && dLy < 5e8
    case 'galactic-structure': return dLy < 3e5 && dLy > 800
    case 'nebula': return dLy < 3e6 && dLy > rTrue * 0.5
    case 'star-cluster': return dLy < 2e5
    case 'star': return o.id === 'sun' ? dLy < 20 && dLy > 1e-4 : dLy < 6e4 && dLy > 1e-5
    case 'planet': return solar < 0.004
    case 'moon': return dLy < 5e-6
    default: return dLy < 1e9
  }
}

/** DOM label overlay, updated imperatively from per-frame scene data. */
export function Labels() {
  const wrap = useRef<HTMLDivElement>(null)
  const els = useRef<Record<string, HTMLButtonElement>>({})
  const showLabels = useStore((s) => s.showLabels)
  const selected = useStore((s) => s.selectedId)
  const version = useStore((s) => s.objectsVersion)
  useEffect(() => {
    let raf = 0
    const v = new THREE.Vector3()
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const cam = labelState.camera
      const w = wrap.current
      if (!cam || !w || eventState.activeId) {
        if (eventState.activeId) {
          Object.values(els.current).forEach((el) => {
            if (el) el.style.display = 'none'
          })
        }
        return
      }
      const W = w.clientWidth, H = w.clientHeight
      const shown: { id: string; x: number; y: number; pri: number }[] = []
      for (const it of labelState.items) {
        const el = els.current[it.id]
        if (!el) continue
        let ok = showLabels && visible(it, selected)
        if (ok) {
          v.copy(it.pos).project(cam)
          ok = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05
          if (ok) shown.push({ id: it.id, x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H, pri: it.o.importance + (it.id === selected ? 5 : 0) })
        }
        if (!ok) el.style.display = 'none'
      }
      shown.sort((a, b) => b.pri - a.pri)
      const taken: { x: number; y: number }[] = []
      for (const s of shown) {
        const el = els.current[s.id]
        const clash = taken.some((t) => Math.abs(t.x - s.x) < 110 && Math.abs(t.y - s.y) < 18)
        if (clash && s.id !== selected || taken.length > 22) { el.style.display = 'none'; continue }
        taken.push(s)
        el.style.display = 'block'
        el.style.transform = `translate(${s.x + 10}px, ${s.y - 10}px)`
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [showLabels, selected])
  return (
    <div className="labels" ref={wrap}>
      {OBJECTS.map((o) => (
        <button
          key={o.id + version}
          ref={(el) => { if (el) els.current[o.id] = el }}
          className={'label ' + o.category + (selected === o.id ? ' sel' : '')}
          style={{ display: 'none' }}
          onClick={() => useStore.getState().select(o.id)}
          onDoubleClick={() => useStore.getState().travel(o.id)}
        >{o.name}</button>
      ))}
    </div>
  )
}
