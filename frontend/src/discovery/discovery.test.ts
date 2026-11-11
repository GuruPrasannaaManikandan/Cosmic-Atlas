import { describe, it, expect, beforeEach } from 'vitest'
import { OBJECT_BY_ID, MISSION_BY_ID, SOURCES } from '../missions'
import { SITE_DISCOVERIES } from './siteDiscoveries'
import { useDiscovery, partKey } from './progress'
import { UNITY_SITE_BY_ID } from '../surface/sites'

const SITE_FILES = import.meta.glob('../../public/mars-sites/*/site.json', { eager: true, import: 'default' }) as Record<string, { hardware: { id: string; components: { id: string }[] }[] }>
const siteDef = (pkg: string) => SITE_FILES[`../../public/mars-sites/${pkg}/site.json`]

describe('universal discovery data', () => {
  it('covers all eight Mars sites, each mapped to catalogue objects of that mission', () => {
    const marsSites = Object.values(UNITY_SITE_BY_ID).filter((s) => s.bodyId === 'mars')
    expect(marsSites.length).toBe(8)
    for (const s of marsSites) {
      const cfg = SITE_DISCOVERIES[s.id]
      expect(cfg, s.id).toBeTruthy()
      for (const oid of Object.values(cfg.objects)) {
        const o = OBJECT_BY_ID[oid]
        expect(o, `${s.id}: ${oid}`).toBeTruthy()
        expect(s.missionIds).toContain(o.missionId)
        expect(MISSION_BY_ID[o.missionId].objectIds).toContain(oid)
      }
    }
  })

  it('every part record cites registered sources and has a category', () => {
    for (const cfg of Object.values(SITE_DISCOVERIES)) {
      for (const oid of Object.values(cfg.objects)) {
        for (const c of OBJECT_BY_ID[oid].components) {
          const ids = [...c.sources, ...(c.location?.sources ?? []), ...(c.specs ?? []).flatMap((s) => s.sources), ...(c.findings ?? []).flatMap((f) => f.sources)]
          for (const id of ids) expect(SOURCES[id], `${oid}/${c.id}: ${id}`).toBeTruthy()
          expect(c.sources.length, `${oid}/${c.id} has no source`).toBeGreaterThan(0)
          for (const s of c.specs ?? []) expect(s.sources.length, `${oid}/${c.id} ${s.label}`).toBeGreaterThan(0)
          expect(c.category, `${oid}/${c.id} category`).toBeTruthy()
        }
      }
      for (const l of cfg.landmarks) for (const id of [...l.description.sources, ...l.placement.sources]) expect(SOURCES[id], l.id).toBeTruthy()
    }
  })

  it('a part that claims a separate 3-D piece names a component group the site package really has', () => {
    for (const s of Object.values(UNITY_SITE_BY_ID).filter((x) => x.site)) {
      const def = siteDef(s.site!)
      expect(def, s.site).toBeTruthy()
      const cfg = SITE_DISCOVERIES[s.id]
      for (const [hw, oid] of Object.entries(cfg.objects)) {
        const groups = new Set<string>((def.hardware.find((h) => h.id === hw)?.components ?? []).map((c) => c.id))
        expect(def.hardware.some((h) => h.id === hw), `${s.id}: scene hardware ${hw}`).toBe(true)
        for (const c of OBJECT_BY_ID[oid].components) {
          if (c.placement === 'model-part' || c.placement === 'model-region') expect(groups.has(c.part!), `${oid}/${c.id} -> ${c.part}`).toBe(true)
        }
      }
    }
  })
})

describe('discovery progress', () => {
  beforeEach(() => useDiscovery.getState().reset())
  it('only ever rises, per site', () => {
    const d = useDiscovery.getState()
    d.mark('mars-curiosity', 'curiosity-rover', 2)
    d.mark('mars-curiosity', 'curiosity-rover', 1)
    expect(useDiscovery.getState().level('mars-curiosity', 'curiosity-rover')).toBe(2)
    d.mark('mars-curiosity', partKey('curiosity-rover', 'msl-mastcam'), 3)
    expect(useDiscovery.getState().level('mars-curiosity', partKey('curiosity-rover', 'msl-mastcam'))).toBe(3)
    expect(useDiscovery.getState().level('mars-spirit', 'curiosity-rover')).toBe(0)
  })
  it('a listed item starts undiscovered', () => {
    expect(useDiscovery.getState().level('mars-phoenix', 'phoenix-lander')).toBe(0)
  })
})
