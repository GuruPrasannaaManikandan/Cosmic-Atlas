/**
 * Discovery progress (E1): per site, per item, one of five levels. Levels only ever go up. Kept for the browser session
 * (sessionStorage): leaving a site and landing there again in the same session restores it; a new session starts fresh.
 *
 * Item keys: a vehicle is its catalogue object id; a part is "<objectId>/<componentId>"; a landmark is "landmark:<id>".
 *
 * What moves an item up (nothing is marked just because it is listed):
 *   vehicle   discovered = it came into view range (the scene reports it); approached = within inspection range;
 *             inspected = its record was opened; completed = every section of its record was viewed
 *   part      discovered = its vehicle was approached; approached = its vehicle was inspected (framed up close);
 *             inspected = the part was selected (the camera frames it); completed = its record stayed open >= 5 s
 *   landmark  discovered = within 60 m; approached = within its radius; inspected = its record was opened;
 *             completed = its record stayed open >= 5 s
 */
import { create } from 'zustand'

export const LEVELS = ['Not discovered', 'Discovered', 'Approached', 'Inspected', 'Completed'] as const
export type Level = 0 | 1 | 2 | 3 | 4

const KEY = 'cosmic-atlas.discovery.v1'
const load = (): Record<string, Record<string, Level>> => {
  try { return JSON.parse(window.sessionStorage.getItem(KEY) ?? '{}') ?? {} } catch { return {} }
}
const save = (v: Record<string, Record<string, Level>>) => {
  try { window.sessionStorage.setItem(KEY, JSON.stringify(v)) } catch { /* private mode: progress lasts until reload */ }
}

interface Progress {
  bySite: Record<string, Record<string, Level>>
  /** raise an item to at least `level` (never lowers it) */
  mark: (siteId: string, key: string, level: Level) => void
  level: (siteId: string, key: string) => Level
  reset: (siteId?: string) => void
}

export const useDiscovery = create<Progress>((set, get) => ({
  bySite: typeof window === 'undefined' ? {} : load(),
  mark: (siteId, key, level) => {
    const cur = get().bySite[siteId]?.[key] ?? 0
    if (level <= cur) return
    const bySite = { ...get().bySite, [siteId]: { ...(get().bySite[siteId] ?? {}), [key]: level } }
    set({ bySite })
    save(bySite)
  },
  level: (siteId, key) => get().bySite[siteId]?.[key] ?? 0,
  reset: (siteId) => {
    const bySite = siteId ? { ...get().bySite, [siteId]: {} } : {}
    set({ bySite })
    save(bySite)
  },
}))

export const partKey = (objectId: string, componentId: string) => `${objectId}/${componentId}`
export const landmarkKey = (id: string) => `landmark:${id}`

if (typeof window !== 'undefined') (window as unknown as { __discovery?: unknown }).__discovery = { state: () => useDiscovery.getState().bySite, reset: (s?: string) => useDiscovery.getState().reset(s) }
