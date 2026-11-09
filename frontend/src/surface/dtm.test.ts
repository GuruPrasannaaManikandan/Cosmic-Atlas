import { describe, it, expect } from 'vitest'
import { decodeDtm, DtmTerrain, DtmMeta } from './terrain'
import { SURFACE_SITES } from './sites'
import { OBJECT_BY_ID } from '../missions'

const meta = (w: number, h: number, over: Partial<DtmMeta> = {}): DtmMeta => ({
  site: 't', apollo: 0, width: w, height: h, cellM: 2, x0: -((w - 1) / 2) * 2, z0: -((h - 1) / 2) * 2, hMin: -100, hMax: 100,
  lmHeightDtm: 0, lmElevationLroc: 0, lmDeltaM: 0, validFraction: 1,
  source: { product: 'x', productPage: '', file: '', crs: '', postSpacingM: 2, bytesRead: 0, accuracy: '' }, ...over,
})
const enc = (h: number, m: DtmMeta) => 1 + Math.round(((h - m.hMin) / (m.hMax - m.hMin)) * 65534)

describe('LROC DTM terrain', () => {
  it('decodes uint16 heights relative to the LM and fills no-data gaps from neighbours', () => {
    const m = meta(3, 3, { lmHeightDtm: 10 })
    const q = new Uint16Array(9)
    ;[20, 20, 20, 20, 0, 20, 20, 20, 20].forEach((h, i) => (q[i] = h === 0 ? 0 : enc(h, m)))
    const h = decodeDtm(m, q.buffer)
    expect(h[0]).toBeCloseTo(10, 1) // 20 m − LM 10 m
    expect(h[4]).toBeCloseTo(10, 1) // the gap is filled from its neighbours
  })

  it('samples bilinearly and puts hardware on a small flat pad at the measured height', () => {
    const m = meta(5, 5)
    const q = new Uint16Array(25)
    for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) q[j * 5 + i] = enc(i * 2, m) // slope: +1 m per metre east
    const t = new DtmTerrain(m, decodeDtm(m, q.buffer), { seed: 1, halfExtentM: 4, anchors: [] })
    expect(t.heightAt(0, 0)).toBeCloseTo(4, 2)
    expect(t.heightAt(1, 0)).toBeCloseTo(5, 2)
    expect(t.heightAt(100, 0)).toBeCloseTo(8, 1) // clamped at the data edge
    const pad = new DtmTerrain(m, decodeDtm(m, q.buffer), { seed: 1, halfExtentM: 4, anchors: [{ x: 0, z: 0, flatR: 2 }] })
    expect(pad.heightAt(0.5, 0)).toBeCloseTo(4, 2) // flat inside the pad
  })

  it('every committed site heightmap matches LROC\'s published LM elevation (independent check)', async () => {
    // node's fs, loaded untyped so the browser-only tsconfig needs no @types/node
    const fs: { readFileSync(p: URL, enc?: string): any } = await import(/* @vite-ignore */ 'node:' + 'fs')
    const pub = (f: string) => new URL('../../public/' + f, import.meta.url)
    for (const s of SURFACE_SITES) {
      if (s.terrain.kind !== 'dtm') continue
      const m = JSON.parse(fs.readFileSync(pub(s.terrain.file.slice(1)), 'utf8')) as DtmMeta
      const bin = fs.readFileSync(pub(s.terrain.file.slice(1).replace('.json', '.bin')))
      expect(bin.byteLength, s.id).toBe(m.width * m.height * 2)
      expect(m.cellM, s.id).toBeCloseTo(s.terrain.postSpacingM, 6)
      const lm = OBJECT_BY_ID[s.objects[0].objectId].location.value!
      expect(m.lmElevationLroc, s.id).toBe(lm.elevationM)
      // DTM (tied to LOLA) vs LROC GLD100 elevation of the LM: within 10 m everywhere, within 2 m except Hadley
      expect(Math.abs(m.lmDeltaM!), s.id).toBeLessThan(s.id === 'apollo-15' ? 10 : 2)
      expect(m.validFraction, s.id).toBeGreaterThan(0.8)
      // the walkable area lies inside the extracted window
      expect(s.halfExtentM, s.id).toBeLessThanOrEqual(Math.min(-m.x0, -m.z0))
    }
  })
})
