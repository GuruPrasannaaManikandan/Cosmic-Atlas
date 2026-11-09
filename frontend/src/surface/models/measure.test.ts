import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { measure, calibrationScale, runChecks } from './measure'
import { NASA_MODELS, NASA_MODEL_BY_ID } from './nasaModels'
import { OBJECT_BY_ID, SOURCES } from '../../missions'

const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d))
  m.position.set(x, y + h / 2, z)
  return m
}

describe('model measurement and calibration', () => {
  it('measures width / length / height in metres', () => {
    const g = new THREE.Group()
    g.add(box(2.7, 2.2, 3.0))
    const m = measure(g)
    expect(m.width).toBeCloseTo(2.7, 5)
    expect(m.height).toBeCloseTo(2.2, 5)
    expect(m.length).toBeCloseTo(3.0, 5)
  })

  it('footpad span = distance between the outer edges of opposite low pads', () => {
    const g = new THREE.Group()
    g.add(box(1, 0.1, 1, 0, 0, 0))
    for (const [x, z] of [[4.23, 0], [-4.23, 0], [0, 4.23], [0, -4.23]]) g.add(box(0.94, 0.1, 0.94, x, 0, z))
    g.add(box(4.2, 1.7, 4.2, 0, 1.5, 0)) // stage, well above the pads
    expect(measure(g).lowSpan).toBeCloseTo(2 * Math.hypot(4.23 + 0.47, 0.47), 1)
  })

  it('three-legged calibration recovers the NSSDCA Viking footpad triangle', () => {
    const g = new THREE.Group()
    const side = 10 // arbitrary model units
    const R = side / Math.sqrt(3)
    for (let k = 0; k < 3; k++) g.add(box(0.3, 0.2, 0.3, R * Math.cos((k * 2 * Math.PI) / 3), 0, R * Math.sin((k * 2 * Math.PI) / 3)))
    g.add(box(3, 4, 3, 0, 2, 0))
    const m = measure(g)
    expect(m.footTriangleSide).toBeCloseTo(side, 1)
    const s = calibrationScale(NASA_MODEL_BY_ID['viking-lander'], m)
    expect(side * s).toBeCloseTo(2.21, 2)
  })

  it('checks report measured value, deviation and pass/fail against the tolerance', () => {
    const g = new THREE.Group()
    g.add(box(2.7, 1.85, 3.1))
    const r = runChecks(NASA_MODEL_BY_ID['perseverance'], measure(g))
    const h = r.find((c) => c.measure === 'height')!
    expect(h.pass).toBe(false) // a stowed mast (1.85 m) must not pass NASA's 2.2 m
    expect(h.deviation).toBeCloseTo(-0.159, 2)
    expect(r.find((c) => c.measure === 'width')!.pass).toBe(true)
  })

  it('every registered NASA model has provenance, a sourced check or calibration, and a catalogue object', () => {
    for (const m of NASA_MODELS) {
      expect(m.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(m.repoPath).toContain('github.com/nasa/NASA-3D-Resources')
      if (m.objectId) expect(OBJECT_BY_ID[m.objectId], m.id).toBeTruthy()
      m.checks.forEach((c) => expect(SOURCES[c.source], c.source).toBeTruthy())
      if (m.calibration.kind !== 'native') expect(SOURCES[m.calibration.source]).toBeTruthy()
      // a model without any independent check must say so through its notes
      if (!m.checks.length) expect(m.notes.length).toBeGreaterThan(20)
    }
    expect(NASA_MODEL_BY_ID['huygens'].fidelity).toBe('low')
    expect(OBJECT_BY_ID['huygens-probe'].nasaHardware).toBe(false)
  })
})
