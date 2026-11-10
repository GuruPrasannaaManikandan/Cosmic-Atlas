import { describe, it, expect, beforeAll } from 'vitest'
import { SOURCES } from '../missions/sources'
import { OBJECTS, MISSIONS } from '../missions'
import {
  validateFrames, validateRoutes, validateEvents, validateComponents, validateProfiles, frameUsable,
  type FrameRecord, type RouteRecord, type MissionEventRecord, type ComponentRecord, type QualityProfile,
} from './records'

/**
 * The canonical mission data in /mission-data is checked twice:
 *  1. structurally, against its JSON Schemas (the contract Unity and authoring tools read), by the small
 *     draft-2020-12 subset validator below — no new dependency;
 *  2. semantically, by the rules in records.ts (sources exist, documented views, usable frames, …).
 */

type Json = any
let schemas: Record<string, Json> = {}
let read: (rel: string) => Json

/** subset of JSON Schema 2020-12: type, enum, required, properties, additionalProperties:false, items,
 *  minItems/maxItems, minimum/maximum, minLength, pattern, $ref (local and cross-file "#/$defs/…") */
function check(schema: Json, value: Json, path: string, file: string, errs: string[]) {
  if (schema.$ref) {
    const [f, ptr] = schema.$ref.split('#')
    const target = f ? f : file
    let s = schemas[target]
    for (const k of ptr.split('/').filter(Boolean)) s = s?.[k]
    if (!s) { errs.push(`${path}: unresolved $ref ${schema.$ref}`); return }
    check(s, value, path, target, errs)
    const rest = { ...schema }
    delete rest.$ref
    if (Object.keys(rest).length) check(rest, value, path, file, errs)
    return
  }
  const typeOf = (v: Json) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v)
  if (schema.type) {
    const types: string[] = Array.isArray(schema.type) ? schema.type : [schema.type]
    const t = typeOf(value)
    if (!types.some((x) => x === t || (x === 'number' && t === 'integer'))) { errs.push(`${path}: expected ${types.join('|')}, got ${t}`); return }
  }
  if (schema.enum && !schema.enum.some((e: Json) => e === value)) errs.push(`${path}: ${JSON.stringify(value)} not in enum`)
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errs.push(`${path}: below minimum`)
    if (schema.maximum !== undefined && value > schema.maximum) errs.push(`${path}: above maximum`)
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errs.push(`${path}: too short`)
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errs.push(`${path}: "${value}" does not match ${schema.pattern}`)
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errs.push(`${path}: fewer than ${schema.minItems} items`)
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errs.push(`${path}: more than ${schema.maxItems} items`)
    if (schema.items) value.forEach((v, i) => check(schema.items, v, `${path}[${i}]`, file, errs))
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const k of schema.required ?? []) if (!(k in value)) errs.push(`${path}: missing "${k}"`)
    for (const [k, v] of Object.entries(value)) {
      const sub = schema.properties?.[k]
      if (sub) check(sub, v, `${path}.${k}`, file, errs)
      else if (schema.additionalProperties === false) errs.push(`${path}: unexpected "${k}"`)
    }
  }
}

function validateFile(schemaFile: string, data: Json): string[] {
  const errs: string[] = []
  check(schemas[schemaFile], data, '$', schemaFile, errs)
  return errs
}

const known = (s: string) => s in SOURCES
const OPP = 'missions/mer-opportunity/'

beforeAll(async () => {
  // node's fs, loaded untyped so the browser-only tsconfig needs no @types/node
  const fs: { readFileSync(p: URL, enc: string): string; readdirSync(p: URL): string[] } = await import(/* @vite-ignore */ 'node:' + 'fs')
  const root = new URL('../../../mission-data/', import.meta.url)
  read = (rel) => JSON.parse(fs.readFileSync(new URL(rel, root), 'utf8'))
  for (const f of fs.readdirSync(new URL('schemas/', root))) schemas[f] = read('schemas/' + f)
})

describe('JSON Schemas', () => {
  it('every schema has an $id equal to its file name and resolves its references', () => {
    expect(Object.keys(schemas).sort()).toEqual(
      ['common.schema.json', 'components.schema.json', 'events.schema.json', 'frames.schema.json', 'quality-profiles.schema.json', 'routes.schema.json'],
    )
    for (const [f, s] of Object.entries(schemas)) expect(s.$id).toBe(f)
  })
  it('the validator rejects bad records (self-test)', () => {
    expect(validateFile('events.schema.json', [{ id: 'x' }]).length).toBeGreaterThan(0)
    expect(validateFile('events.schema.json', [{ id: 'Bad Id', missionId: 'm', kind: 'nope', title: 't', description: 'd', time: { utc: null, basis: 'sol-only', sol: 1 }, status: 'verified', sources: ['a'] }]))
      .toEqual(expect.arrayContaining([expect.stringContaining('does not match'), expect.stringContaining('not in enum')]))
    expect(validateFile('frames.schema.json', [{ id: 'f', bodyId: 'mars', kind: 'unknown', description: 'x', sources: [], extra: 1 }]))
      .toEqual([expect.stringContaining('unexpected "extra"')])
  })
})

describe('quality profiles', () => {
  it('match the schema and the ordering rules; Balanced carries the reference gate', () => {
    const ps = read('quality-profiles.json') as QualityProfile[]
    expect(validateFile('quality-profiles.schema.json', ps)).toEqual([])
    expect(validateProfiles(ps)).toEqual([])
    expect(ps.find((p) => p.id === 'balanced')!.gate).toEqual({ fpsP50: 30, fpsP5: 24, width: 1366, height: 768 })
  })
  it('a profile list that gets more expensive as quality drops is rejected', () => {
    const ps = read('quality-profiles.json') as QualityProfile[]
    const bad = ps.map((p) => ({ ...p }))
    bad[3] = { ...bad[3], renderScale: 1.5 }
    expect(validateProfiles(bad).map((i) => i.problem)).toContain('render scale must not increase as quality drops')
  })
  it('the Unity prototype reads the same profiles (its copy is identical to mission-data)', async () => {
    const fs: { readFileSync(p: URL, enc: string): string } = await import(/* @vite-ignore */ 'node:' + 'fs')
    const unityCopy = new URL('../../../unity/CosmicAtlas/Assets/CosmicAtlas/Mars/Data/quality-profiles.json', import.meta.url)
    expect(JSON.parse(fs.readFileSync(unityCopy, 'utf8'))).toEqual(read('quality-profiles.json'))
  })
})

describe('Opportunity seed data', () => {
  let frames: FrameRecord[]
  let routes: RouteRecord[]
  let events: MissionEventRecord[]
  let comps: { plannedObjects: { id: string; missionId: string; sources: string[] }[]; components: ComponentRecord[] }
  beforeAll(() => {
    frames = read(OPP + 'frames.json')
    routes = read(OPP + 'routes.json')
    events = read(OPP + 'events.json')
    comps = read(OPP + 'components.json')
  })

  it('passes the JSON Schemas', () => {
    expect(validateFile('frames.schema.json', frames)).toEqual([])
    expect(validateFile('routes.schema.json', routes)).toEqual([])
    expect(validateFile('events.schema.json', events)).toEqual([])
    expect(validateFile('components.schema.json', comps)).toEqual([])
  })

  it('passes the semantic rules (sources exist, frames, documented views)', () => {
    expect(validateFrames(frames, known)).toEqual([])
    expect(validateRoutes(routes, frames, known)).toEqual([])
    expect(validateEvents(events, frames, known)).toEqual([])
    expect(validateComponents(comps.components, known)).toEqual([])
    for (const o of comps.plannedObjects) for (const s of o.sources) expect(known(s)).toBe(true)
  })

  it('every record belongs to a catalogue mission and object (or a declared planned object)', () => {
    const missionIds = new Set(MISSIONS.map((m) => m.id))
    const objectIds = new Set([...OBJECTS.map((o) => o.id), ...comps.plannedObjects.map((o) => o.id)])
    for (const e of events) expect(missionIds.has(e.missionId)).toBe(true)
    for (const r of routes) { expect(missionIds.has(r.missionId)).toBe(true); expect(objectIds.has(r.objectId)).toBe(true) }
    for (const c of comps.components) expect(objectIds.has(c.objectId)).toBe(true)
    for (const o of comps.plannedObjects) expect(OBJECTS.some((x) => x.id === o.id)).toBe(false)
  })

  it('agrees with the mission catalogue where both hold the same fact', () => {
    const m = MISSIONS.find((x) => x.id === 'mer-opportunity')!
    const ev = (id: string) => events.find((e) => e.id === id)!
    expect(ev('merb-landing').time.utc).toBe(m.landing?.value)
    expect(ev('merb-launch').time.utc).toBe(m.launch.value)
    expect(ev('merb-end').time.utc).toBe(m.end?.value)
  })

  it('is honest about what cannot be drawn yet', () => {
    // Stage 2 established the traverse frame LOCALLY (east/north metres from the landing site) but not absolutely:
    // the route is partial, carries no points, and its frame is not usable for absolute placement
    const r = routes.find((x) => x.id === 'merb-traverse')!
    expect(r.status).toBe('partial')
    expect(frames.find((f) => f.id === r.frameId)!.origin!.status).toBe('conflicting')
    expect(r.points).toEqual([])
    expect(frameUsable(frames.find((f) => f.id === r.frameId)).ok).toBe(false)
    // no NASA model exists for the EDL hardware: nothing about it may claim a visible representation
    for (const c of comps.components.filter((x) => x.objectId === 'opportunity-edl-system')) {
      expect(c.representation).toBe('none')
      expect(c.views.exterior).toBe('unavailable')
    }
    // the rover's mass is a recorded conflict, not a silently chosen number
    expect(comps.components.find((c) => c.id === 'merb-rover')!.massKg!.status).toBe('conflicting')
  })
})

describe('semantic rules reject invented content', () => {
  const base: ComponentRecord = {
    id: 'p', objectId: 'o', name: 'P', parentId: null, category: 'structure',
    function: { text: 'x', sources: ['pds-mer-insthost'] }, representation: 'none',
    views: { exterior: 'unavailable', exploded: 'unavailable', cutaway: 'unavailable', operation: 'unavailable' }, sources: [],
  }
  it('a cutaway without a cited document', () => {
    const issues = validateComponents([{ ...base, views: { ...base.views, cutaway: 'planned' } }], known)
    expect(issues.map((i) => i.problem).join()).toContain('cutaway view is "planned" but no document is cited')
  })
  it('a dimension with no source, or an unknown source id', () => {
    expect(validateComponents([{ ...base, dimensions: { value: { heightM: 1 }, status: 'verified', sources: [] } }], known).length).toBeGreaterThan(0)
    expect(validateComponents([{ ...base, function: { text: 'x', sources: ['made-up'] } }], known).length).toBeGreaterThan(0)
  })
  it('a route marked implemented in an unknown frame', () => {
    const f: FrameRecord = { id: 'u', bodyId: 'mars', kind: 'unknown', description: 'x', sources: [] }
    const r: RouteRecord = {
      id: 'r', missionId: 'm', objectId: 'o', frameId: 'u', status: 'implemented', notes: '', sources: [],
      product: { name: 'n', url: 'https://x', producer: 'p', pdsArchived: false, solRange: [1, 2] },
      uncertaintyM: { value: null, status: 'unverified', sources: [] }, points: [{ sol: 1, x: 0, y: 0 }, { sol: 2, x: 1, y: 1 }],
    }
    expect(validateRoutes([r], [f], known).map((i) => i.problem).join()).toContain('not stated by its product')
  })
  it('an event time that hides its basis', () => {
    const e: MissionEventRecord = {
      id: 'e', missionId: 'm', kind: 'other', title: 't', description: 'd', status: 'verified', sources: ['nasa-opportunity'],
      time: { utc: '2004-01-25', basis: 'spacecraft-utc', sol: 3 },
    }
    const p = validateEvents([e], [], known).map((i) => i.problem).join()
    expect(p).toContain('date-only')
    expect(p).toContain('published sol needs solSources')
  })
})
