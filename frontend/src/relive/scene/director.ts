/**
 * Camera director: turns a Shot (from the script's shot list) into an eye / target / field of view relative to the
 * subject, for the current flight frame. Pure function of (shot, frame, wall time); the scene blends two of these
 * (previous and current shot) with timeline.shotAt's weight and then eases the camera toward the result.
 */
import type { Frame } from '../flight'
import type { Shot } from '../types'
import { AU, D2R, R_EARTH, R_MARS, R_MOON, type V3, rotAxis, v3 } from '../geo'

export interface Pose { eye: V3; target: V3; fov: number }

const WIDE_SCALE: Record<string, number> = { earth: R_EARTH, moon: R_MOON, mars: R_MARS, cislunar: 1e7, interplanetary: AU, 'mars-local': 1000 }

export function shotPose(shot: Shot, f: Frame, wall: number, subjectSize: number, center: V3 = [0, 0, 0]): Pose {
  const up = f.up
  const speed = v3.len(f.vel)
  let v = speed > 0.5 ? v3.norm(f.vel) : f.axis
  if (Math.abs(v3.dot(v, up)) > 0.995) v = Math.abs(v3.dot(f.axis, up)) < 0.99 ? f.axis : f.site ? f.site.n : [1, 0, 0]
  let h = v3.sub(v, v3.mul(up, v3.dot(v, up)))
  h = v3.len(h) > 1e-6 ? v3.norm(h) : f.site ? f.site.n : [1, 0, 0]
  const side = v3.norm(v3.cross(up, h))
  const el = (shot.elev ?? 0) * D2R
  const az = (shot.azim ?? 0) * D2R
  const d = shot.dist
  let fov = shot.fov ?? 45
  const zoom = (eye: V3) => {
    const dist = v3.len(eye)
    const need = (2 * Math.atan((subjectSize * 1.7) / (2 * dist))) / D2R
    fov = Math.max(1.2, Math.min(fov, need))
  }
  switch (shot.kind) {
    case 'chase': {
      const back = rotAxis(v3.mul(v, -d * Math.cos(el)), up, az)
      return { eye: v3.add(center, v3.add(back, v3.mul(up, d * Math.sin(el)))), target: v3.add(center, v3.mul(v, d * 0.1)), fov }
    }
    case 'side':
    case 'orbit': {
      const a = az + (shot.kind === 'orbit' ? wall * 0.07 : 0)
      const s = rotAxis(side, up, a)
      return { eye: v3.add(center, v3.add(v3.mul(s, d * Math.cos(el)), v3.mul(up, d * Math.sin(el)))), target: center, fov }
    }
    case 'top':
      return { eye: v3.add(center, v3.add(v3.mul(up, d * Math.sin(el)), v3.mul(rotAxis(v3.mul(h, -1), up, az), d * Math.cos(el)))), target: center, fov }
    case 'ground':
    case 'low': {
      const site = f.site
      // ground: a fixed observer near the site; low: an observer on the ground below the subject
      // compass directions from the site when there is one (azimuth from north), else relative to the track
      let g: V3
      let gu: V3 = up, ge: V3 = side, gn: V3 = h
      const near = site && f.alt < 2.5e5
      if (near) { gu = site!.up; ge = site!.e; gn = site!.n }
      if (shot.kind === 'ground' && near) g = v3.sub(site!.pos, f.focus)
      else g = v3.mul(up, -Math.max(0, f.alt))
      const dir = v3.add(v3.mul(gn, Math.cos(az)), v3.mul(ge, Math.sin(az)))
      const eye = v3.add(v3.add(g, v3.mul(dir, d)), v3.mul(gu, 1.7 + d * Math.sin(el) * 0.35))
      zoom(v3.sub(eye, center))
      return { eye, target: center, fov }
    }
    case 'wide': {
      const S = WIDE_SCALE[f.env] ?? R_EARTH
      let target: V3 = [0, 0, 0]
      const b0 = f.bodies[0]
      if (f.env === 'cislunar') {
        const moon = f.bodies.find((b) => b.id === 'moon')
        target = v3.mul(v3.add(v3.sub([0, 0, 0], f.focus), moon ? v3.sub(moon.pos, f.focus) : [0, 0, 0]), 0.5)
      } else if (f.env === 'interplanetary') target = v3.mul(v3.sub([0, 0, 0], f.focus), 0.45)
      else if (b0) target = v3.mul(v3.sub(b0.pos, f.focus), 0.3)
      const back = rotAxis(v3.mul(h, -1), up, az)
      const eye = v3.add(target, v3.mul(v3.norm(v3.add(v3.mul(up, Math.sin(el)), v3.mul(back, Math.cos(el)))), d * S))
      return { eye, target, fov }
    }
  }
}

export function lerpPose(a: Pose, b: Pose, w: number): Pose {
  // interpolate eye in log-distance so far/near blends do not sweep through the subject
  const la = v3.len(a.eye), lb = v3.len(b.eye)
  const dir = v3.norm(v3.lerp(v3.norm(a.eye), v3.norm(b.eye), w))
  const L = Math.exp(Math.log(Math.max(1e-3, la)) * (1 - w) + Math.log(Math.max(1e-3, lb)) * w)
  return { eye: v3.mul(dir, L), target: v3.lerp(a.target, b.target, w), fov: a.fov + (b.fov - a.fov) * w }
}
