import { describe, it, expect } from 'vitest'
import { stepCharacter, newCharacter, paramsForGravity, gaitPose, CharacterInput, LEG_LENGTH } from './controller'
import { Terrain } from './terrain'

const flat = { heightAt: () => 0 }
const idle: CharacterInput = { forward: 0, right: 0, run: false, jump: false, camYaw: 0 }
const run = (s: ReturnType<typeof newCharacter>, inp: CharacterInput, p: ReturnType<typeof paramsForGravity>, sec: number, ground = flat, cols: any[] = []) => {
  for (let i = 0; i < sec * 60; i++) s = stepCharacter(s, inp, p, ground, cols, 1 / 60)
  return s
}

describe('astronaut controller', () => {
  const moon = paramsForGravity(1.62, 300)
  const mars = paramsForGravity(3.73, 300)

  it('W moves toward where the camera looks, and the astronaut turns to face it', () => {
    const s = run(newCharacter(0, 0, flat), { ...idle, forward: 1, camYaw: -Math.PI / 2 }, moon, 3) // camera facing east
    expect(s.pos[0]).toBeGreaterThan(2) // east
    expect(Math.abs(s.pos[2])).toBeLessThan(0.05)
    expect(Math.abs(s.yaw + Math.PI / 2)).toBeLessThan(0.05)
  })

  it('accelerates and stops smoothly, then does not drift (no sliding)', () => {
    let s = run(newCharacter(0, 0, flat), { ...idle, forward: 1 }, moon, 3)
    expect(Math.hypot(s.vel[0], s.vel[2])).toBeCloseTo(moon.walkSpeed, 2)
    const after1 = stepCharacter(s, idle, moon, flat, [], 1 / 60)
    expect(Math.hypot(after1.vel[0], after1.vel[2])).toBeGreaterThan(0.9) // not an instant stop
    s = run(s, idle, moon, 2)
    expect(Math.hypot(s.vel[0], s.vel[2])).toBe(0)
    const z = s.pos[2]
    s = run(s, idle, moon, 2)
    expect(s.pos[2]).toBe(z)
  })

  it('jump height follows the body\'s gravity (Moon ≈ v²/2g, about 2.3× Mars)', () => {
    const apex = (p: typeof moon) => {
      let s = newCharacter(0, 0, flat)
      s = stepCharacter(s, { ...idle, jump: true }, p, flat, [], 1 / 240)
      let top = 0
      for (let i = 0; i < 2400 && !s.grounded; i++) {
        s = stepCharacter(s, idle, p, flat, [], 1 / 240)
        top = Math.max(top, s.pos[1])
      }
      return top
    }
    const hm = apex(moon), hr = apex(mars)
    expect(hm).toBeCloseTo((1.5 * 1.5) / (2 * 1.62), 1)
    expect(hm / hr).toBeCloseTo(3.73 / 1.62, 0)
  })

  it('cannot walk through hardware or rocks', () => {
    const lm = [{ x: 0, z: -5, r: 2.4, h: 3 }]
    const s = run(newCharacter(0, 0, flat), { ...idle, forward: 1 }, moon, 8, flat, lm)
    expect(Math.hypot(s.pos[0], s.pos[2] + 5)).toBeGreaterThanOrEqual(2.4 + moon.radius - 1e-6)
  })

  it('stays on uneven terrain and inside the site bounds', () => {
    const t = new Terrain({ seed: 7, halfExtentM: 60, anchors: [] })
    const p = paramsForGravity(1.62, 60)
    let s = newCharacter(0, 0, t)
    for (let i = 0; i < 60 * 90; i++) {
      s = stepCharacter(s, { ...idle, forward: 1, right: Math.sin(i / 200), run: true }, p, t, [], 1 / 60)
      expect(s.pos[1]).toBeGreaterThanOrEqual(t.heightAt(s.pos[0], s.pos[2]) - 1e-9)
    }
    expect(Math.abs(s.pos[0])).toBeLessThanOrEqual(60)
    expect(Math.abs(s.pos[2])).toBeLessThanOrEqual(60)
  })

  it('gait stride matches distance travelled (planted foot moves one step per half cycle)', () => {
    for (const v of [0.6, 1.1, 2.2]) {
      const g = gaitPose(0, v, 1.62, false)
      expect(g.hipL).toBeCloseTo(0)
      const step = 0.42 + 0.3 * v
      const quarter = gaitPose(step / 2, v, 1.62, false) // quarter cycle: leg at full swing
      const footTravel = 2 * LEG_LENGTH * Math.sin(Math.abs(quarter.hipL))
      expect(footTravel).toBeCloseTo(step, 1)
    }
    expect(Math.abs(gaitPose(3, 0, 1.62, false).hipL)).toBe(0) // standing still: no leg swing
  })
})
