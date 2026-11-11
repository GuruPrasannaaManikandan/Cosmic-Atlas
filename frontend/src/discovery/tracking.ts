/**
 * Moves discovery progress from what the user actually does in a Mars scene (rules: progress.ts). One hook for every
 * site: it reads the shared surface state (discovered / nearby / open record / selected part) and the explorer pose.
 */
import { useEffect } from 'react'
import { OBJECT_BY_ID } from '../missions'
import { useSurface } from '../surface/surfaceState'
import { useDiscovery, partKey, landmarkKey, type Level } from './progress'
import { SITE_DISCOVERIES, objectIdFor } from './siteDiscoveries'

const LANDMARK_NOTICE_M = 60

/** the catalogue object for a scene id (scene hardware id, or already a catalogue id) */
export function resolveObject(siteId: string, id: string | null): string | null {
  if (!id) return null
  return objectIdFor(siteId, id) ?? (OBJECT_BY_ID[id] ? id : null)
}

function markParts(siteId: string, objectId: string, level: Level) {
  const o = OBJECT_BY_ID[objectId]
  if (!o) return
  const mark = useDiscovery.getState().mark
  for (const c of o.components) mark(siteId, partKey(objectId, c.id), level)
}

export function useDiscoveryTracking(siteId: string | null, pose: { x: number; z: number } | null) {
  const discovered = useSurface((s) => s.discovered)
  const nearbyId = useSurface((s) => s.nearbyId)
  const panelObject = useSurface((s) => s.panel?.objectId ?? null)

  useEffect(() => {
    if (!siteId) return
    for (const id of discovered) {
      const o = resolveObject(siteId, id)
      if (o) useDiscovery.getState().mark(siteId, o, 1)
    }
  }, [siteId, discovered])

  useEffect(() => {
    if (!siteId) return
    const o = resolveObject(siteId, nearbyId)
    if (!o) return
    useDiscovery.getState().mark(siteId, o, 2)
    markParts(siteId, o, 1)
  }, [siteId, nearbyId])

  useEffect(() => {
    if (!siteId) return
    const o = resolveObject(siteId, panelObject)
    if (!o) return
    useDiscovery.getState().mark(siteId, o, 3)
    markParts(siteId, o, 2)
  }, [siteId, panelObject])

  // landmarks: by distance from the explorer (whole metres are enough; checked when the rounded position changes)
  const px = pose ? Math.round(pose.x) : null
  const pz = pose ? Math.round(pose.z) : null
  useEffect(() => {
    if (!siteId || px === null || pz === null) return
    for (const l of SITE_DISCOVERIES[siteId]?.landmarks ?? []) {
      const d = Math.hypot(px - l.x, pz - l.z)
      if (d < l.radius) useDiscovery.getState().mark(siteId, landmarkKey(l.id), 2)
      else if (d < l.radius + LANDMARK_NOTICE_M) useDiscovery.getState().mark(siteId, landmarkKey(l.id), 1)
    }
  }, [siteId, px, pz])
}

/** record sections viewed, per object (completion = all of them) */
const tabsSeen = new Map<string, Set<string>>()
export function noteRecordTab(siteId: string | null, objectId: string | null, tab: string, allTabs: readonly string[]) {
  if (!siteId || !objectId) return
  const k = `${siteId}|${objectId}`
  const s = tabsSeen.get(k) ?? new Set<string>()
  s.add(tab)
  tabsSeen.set(k, s)
  if (allTabs.every((t) => s.has(t))) useDiscovery.getState().mark(siteId, objectId, 4)
}
