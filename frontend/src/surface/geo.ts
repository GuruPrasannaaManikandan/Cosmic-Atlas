/**
 * Local surface frame for a landing site (render units = metres).
 *   +x = east, +y = up, +z = south (so north is −z, matching three.js "forward" = −z = north)
 * Positions come from selenographic/areographic lat/lon (east-positive) on a sphere of the body's mean radius.
 * Over a site a few hundred metres across, the equirectangular tangent-plane error is far below the ±0.3–3.7 m
 * uncertainty of the LRO-measured hardware positions.
 */
export interface GeoOrigin {
  latDeg: number
  lonEastDeg: number
  radiusM: number
}

const D2R = Math.PI / 180
const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180

export function toLocal(o: GeoOrigin, latDeg: number, lonEastDeg: number): { x: number; z: number } {
  const north = (latDeg - o.latDeg) * D2R * o.radiusM
  const east = wrap180(lonEastDeg - o.lonEastDeg) * D2R * o.radiusM * Math.cos(o.latDeg * D2R)
  return { x: east, z: -north }
}

export function toLatLon(o: GeoOrigin, x: number, z: number): { latDeg: number; lonEastDeg: number } {
  const latDeg = o.latDeg + -z / o.radiusM / D2R
  const lonEastDeg = o.lonEastDeg + x / (o.radiusM * Math.cos(o.latDeg * D2R)) / D2R
  return { latDeg, lonEastDeg }
}

/** compass bearing (degrees clockwise from north) from a to b in the local frame */
export function bearingDeg(ax: number, az: number, bx: number, bz: number): number {
  const b = Math.atan2(bx - ax, -(bz - az)) / D2R
  return (b + 360) % 360
}
