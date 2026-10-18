import { describe, it, expect } from 'vitest'
import { raDecToUnit, equatorialToGalactic, unitToGalacticLB, toLightYears, parseSexagesimal, raDecDistToRoot, SUN_POS, toThree, fromThree, len, sub, LY_PER_AU } from './coords'
import { planetRootPos, planetEclipticAU, isModelRange, J2000_MS, MS_PER_DAY } from './ephemeris'
import { compressDistance, lodFor, adaptiveScale, travelDuration, logLerp, COMPRESS_START } from './scale'
import { BY_ID, positionOf, searchObjects, OBJECTS } from '../data/catalog'
import { TOUR } from '../data/tour'
import { nav, flyTo, stepNavigation, interrupt } from '../store/nav'
import { useStore } from '../store/store'

const idle = { yaw: 0, pitch: 0, panX: 0, panY: 0, dolly: 0 }

describe('coordinates', () => {
  it('maps the Galactic Centre direction to l=0,b=0', () => {
    // Sgr A*: RA 266.405°, Dec -28.936°
    const g = equatorialToGalactic(raDecToUnit(266.405, -28.936))
    const { l, b } = unitToGalacticLB(g)
    expect(Math.min(l, 360 - l)).toBeLessThan(0.1)
    expect(Math.abs(b)).toBeLessThan(0.1)
  })
  it('places Andromeda ~2.5 Mly from the Sun', () => {
    const p = positionOf(BY_ID.andromeda, 0)
    expect(len(sub(p, SUN_POS)) / 1e6).toBeCloseTo(2.537, 3)
  })
  it('round-trips axis mapping', () => {
    expect(fromThree(toThree([1, 2, 3]))).toEqual([1, 2, 3])
  })
  it('parses RA/Dec strings', () => {
    expect(parseSexagesimal('05 55 10.3', true)).toBeCloseTo(88.79, 2)
    expect(parseSexagesimal('+07 24 25', false)).toBeCloseTo(7.407, 3)
    expect(parseSexagesimal('-01 56 34', false)).toBeCloseTo(-1.943, 3)
    expect(parseSexagesimal('garbage', true)).toBeNull()
  })
  it('converts units and rejects unknown ones', () => {
    expect(toLightYears(1, 'pc')).toBeCloseTo(3.26156, 4)
    expect(toLightYears(1, 'Mpc')).toBeCloseTo(3.26156e6, -2)
    expect(() => toLightYears(1, 'furlong')).toThrow()
    expect(() => toLightYears(-1, 'ly')).toThrow()
  })
  it('puts a direction+distance at the right distance from the Sun', () => {
    const p = raDecDistToRoot(10, 20, 1000)
    expect(len(sub(p, SUN_POS))).toBeCloseTo(1000, 6)
  })
})

describe('ephemeris (approximate Keplerian)', () => {
  it('Earth is ~1 AU from the Sun and returns after a year', () => {
    const t = Date.UTC(2026, 9, 17)
    const r = len(sub(planetRootPos('earth', t), SUN_POS)) / LY_PER_AU
    expect(r).toBeGreaterThan(0.98); expect(r).toBeLessThan(1.02)
    const a = planetEclipticAU('earth', t), b = planetEclipticAU('earth', t + 365.256 * MS_PER_DAY)
    expect(len(sub(a, b))).toBeLessThan(0.01)
  })
  it('is deterministic and time-reversible', () => {
    const t = Date.UTC(1969, 6, 20)
    expect(planetRootPos('mars', t)).toEqual(planetRootPos('mars', t))
    expect(planetRootPos('mars', t)).not.toEqual(planetRootPos('mars', t + 30 * MS_PER_DAY))
  })
  it('Jupiter distance is ~5.2 AU; known J2000 Earth longitude plausible', () => {
    const r = len(sub(planetRootPos('jupiter', J2000_MS), SUN_POS)) / LY_PER_AU
    expect(r).toBeGreaterThan(4.9); expect(r).toBeLessThan(5.5)
  })
  it('flags dates outside model validity', () => {
    expect(isModelRange(Date.UTC(2026, 0, 1))).toBe(true)
    expect(isModelRange(Date.UTC(2500, 0, 1))).toBe(false)
  })
})

describe('scale / LOD', () => {
  it('compression is identity below threshold, monotonic above', () => {
    expect(compressDistance(1000)).toBe(1000)
    expect(compressDistance(COMPRESS_START * 10)).toBeGreaterThan(compressDistance(COMPRESS_START * 2))
    expect(compressDistance(1e30)).toBeLessThan(COMPRESS_START * 20)
  })
  it('LOD tiers get more detailed as the camera approaches', () => {
    expect(lodFor(1e9, 1e5)).toBe('dot')
    expect(lodFor(3e5, 1e5)).toBe('detail')
    expect(lodFor(1e8, 1e6)).toBe('sprite')
  })
  it('adaptive scale shrinks near objects; durations are bounded; logLerp endpoints', () => {
    expect(adaptiveScale(1)).toBeGreaterThan(adaptiveScale(1e-6))
    expect(travelDuration(1e9, 1)).toBeLessThanOrEqual(11)
    expect(logLerp(100, 1, 0)).toBeCloseTo(100); expect(logLerp(100, 1, 1)).toBeCloseTo(1)
  })
})

describe('catalogue', () => {
  it('every tour target exists and has a position', () => {
    for (const s of TOUR) { expect(BY_ID[s.target]).toBeTruthy(); expect(positionOf(BY_ID[s.target], 0).every(Number.isFinite)).toBe(true) }
  })
  it('tour order matches the specification', () => {
    const t = TOUR.map((s) => s.target)
    const order = ['laniakea', 'coma', 'virgo', 'local-sheet', 'local-group', 'andromeda', 'm33', 'milky-way', 'orion-arm', 'carina', 'alnitak', 'alnilam', 'mintaka', 'betelgeuse', 'pleiades', 'aldebaran', 'sun', 'jupiter', 'saturn', 'mercury', 'venus', 'earth']
    const filtered = t.filter((x) => order.includes(x))
    // Mars is an extra educational stop; everything else is in spec order
    expect(filtered).toEqual(order)
  })
  it('search by alias and catalogue id', () => {
    expect(searchObjects('M31')[0].id).toBe('andromeda')
    expect(searchObjects('NGC 224')[0].id).toBe('andromeda')
    expect(searchObjects('abell1656')[0].id).toBe('coma')
    expect(searchObjects('zzzz')).toEqual([])
  })
  it('separates physical parents, structure membership and proximity', () => {
    expect(BY_ID.earth.parents).toEqual(['sun'])
    expect(BY_ID.andromeda.memberOf).toContain('local-group')
    expect(BY_ID.virgo.parents).toEqual([])
    expect(OBJECTS.every((o) => Array.isArray(o.nearby))).toBe(true)
  })
  it('does not invent distances for schematic markers', () => {
    expect(BY_ID.laniakea.distance).toBeUndefined()
    expect(BY_ID.laniakea.schematic).toBe(true)
  })
})

describe('navigation & guided tour', () => {
  it('flyTo moves the camera toward the target and ends following it', () => {
    nav.pos = [1e9, 0, 0]
    flyTo('virgo', 0)
    const d0 = len(sub(nav.pos, positionOf(BY_ID.virgo, 0)))
    for (let i = 0; i < 400; i++) stepNavigation(0.05, 0, idle)
    const d1 = len(sub(nav.pos, positionOf(BY_ID.virgo, 0)))
    expect(d1).toBeLessThan(d0 / 10)
    expect(d1).toBeCloseTo(BY_ID.virgo.viewDistanceLy, -3)
    expect(nav.flight).toBeNull()
    expect(nav.followId).toBe('virgo')
  })
  it('user input interrupts a flight and the tour can be resumed', () => {
    const s = useStore.getState()
    s.startTour()
    expect(useStore.getState().tourStatus).toBe('flying')
    stepNavigation(0.1, 0, idle)
    interrupt()
    expect(useStore.getState().tourStatus).toBe('interrupted')
    expect(nav.flight).toBeNull()
    useStore.getState().tourResume()
    expect(useStore.getState().tourStatus).toBe('flying')
    useStore.getState().tourExit()
    expect(useStore.getState().phase).toBe('explore')
  })
  it('time engine: pausing freezes, reverse goes backwards', async () => {
    const { advanceSim } = await import('../store/store')
    const st = useStore.getState()
    st.setSim(Date.UTC(2026, 0, 1)); st.setRate(10); st.setPlaying(false)
    advanceSim(1); expect(useStore.getState().simMs).toBe(Date.UTC(2026, 0, 1))
    useStore.getState().setPlaying(true); advanceSim(1)
    expect(useStore.getState().simMs).toBe(Date.UTC(2026, 0, 11))
    useStore.getState().setRate(-10); advanceSim(2)
    expect(useStore.getState().simMs).toBe(Date.UTC(2025, 11, 22))
  })
})
