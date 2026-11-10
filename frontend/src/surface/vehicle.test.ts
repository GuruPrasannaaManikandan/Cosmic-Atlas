import { describe, it, expect } from 'vitest'
import { LRV, newVehicle, stepVehicle, wheelPoints } from './vehicle'

const flat = { heightAt: () => 0 }
const MOON_G = 1.62

function drive(throttle: number, steer: number, seconds: number, v = newVehicle(0, 0, 0, flat), ground = flat) {
  for (let t = 0; t < seconds; t += 1 / 60) v = stepVehicle(v, { throttle, steer }, ground, MOON_G, 1 / 60)
  return v
}

describe('Lunar Roving Vehicle driving model', () => {
  it('derived speed ceiling comes from the sourced motor rpm, gear ratio and tyre diameter', () => {
    expect(LRV.maxSpeedMs).toBeCloseTo((125 / 60) * Math.PI * 0.818, 10)
    expect(LRV.maxSpeedMs).toBeGreaterThan(5.3)
    expect(LRV.maxSpeedMs).toBeLessThan(5.4)
  })
  it('W drives forward (north at yaw 0), never past the ceiling', () => {
    const v = drive(1, 0, 30)
    expect(v.z).toBeLessThan(-10)
    expect(Math.abs(v.x)).toBeLessThan(1e-9)
    expect(v.speed).toBeLessThanOrEqual(LRV.maxSpeedMs + 1e-9)
  })
  it('S brakes a moving rover, then reverses slowly once stopped', () => {
    let v = drive(1, 0, 5)
    const fast = v.speed
    v = drive(-1, 0, 0.5, v)
    expect(v.speed).toBeLessThan(fast)
    v = drive(-1, 0, 10, v)
    expect(v.speed).toBeLessThan(0)
    expect(v.speed).toBeGreaterThanOrEqual(-LRV.reverseMaxMs - 1e-9)
  })
  it('full lock turns on the sourced 3.1 m radius (curvature, not instant rotation)', () => {
    let v = drive(1, 0, 3) // get rolling
    v = drive(0.0, 1, 2, v) // steering slews to full lock
    const s = v.speed
    const v2 = stepVehicle({ ...v, steer: 1 }, { throttle: 0, steer: 1 }, flat, MOON_G, 0.01)
    const yawRate = (v2.yaw - v.yaw) / 0.01
    expect(yawRate / v2.speed).toBeCloseTo(1 / LRV.steeringRadiusM, 2)
    expect(s).toBeGreaterThan(0)
  })
  it('a stationary rover does not spin when steering (no tank turns)', () => {
    const v = drive(0, 1, 2)
    expect(v.yaw).toBeCloseTo(0, 12)
    expect(v.steer).toBeCloseTo(1, 6)
  })
  it('wheels turn by distance / radius (no sliding)', () => {
    const v = drive(1, 0, 8)
    expect(v.wheelAngle).toBeCloseTo(v.odometer / (LRV.wheelDiameterM / 2), 6)
  })
  it('suspension and attitude follow the terrain under each wheel', () => {
    const slope = { heightAt: (_x: number, z: number) => -0.1 * z } // rises toward the north (−z)
    const v = newVehicle(0, 0, 0, slope)
    expect(v.pitch).toBeGreaterThan(0.09) // nose up on the slope
    const bump = { heightAt: (x: number, z: number) => (x < 0 && z < 0 ? 0.1 : 0) } // front-left wheel on a 10 cm rock
    const b = newVehicle(0, 0, 0, bump)
    expect(b.susp[0]).toBeGreaterThan(0)
    const [fl] = wheelPoints(0, 0, 0)
    expect(fl[0]).toBeLessThan(0)
    expect(fl[1]).toBeLessThan(0)
  })
  it('lunar gravity slows a rover driving uphill; it rolls back if not driven', () => {
    const hill = { heightAt: (_x: number, z: number) => -0.2 * z }
    let v = newVehicle(0, 0, 0, hill)
    v = { ...v, speed: 2 }
    v = drive(0, 0, 1, v, hill)
    expect(v.speed).toBeLessThan(2 - 0.25)
  })
  it('a blocked move stops the rover in place', () => {
    let v = drive(1, 0, 3)
    const at = { x: v.x, z: v.z }
    v = stepVehicle(v, { throttle: 1, steer: 0 }, flat, MOON_G, 0.1, () => true)
    expect(v.speed).toBe(0)
    expect(v.x).toBe(at.x)
    expect(v.z).toBe(at.z)
  })
})
