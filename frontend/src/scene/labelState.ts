import type * as THREE from 'three'
import type { CosmicObject } from '../data/catalog'

/** Per-frame data published by the 3D scene for the DOM label overlay and HUD. */
export const labelState = {
  items: [] as { id: string; pos: THREE.Vector3; dLy: number; rTrue: number; o: CosmicObject }[],
  camera: null as THREE.Camera | null,
  fps: 0,
  calls: 0,
  triangles: 0,
}
