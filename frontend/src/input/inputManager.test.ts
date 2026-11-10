import { describe, it, expect } from 'vitest'
import { createInputManager, DEFAULT_BINDINGS, type InputMode, type Action } from './inputManager'

const key = (code: string, extra: Partial<KeyboardEvent> = {}) =>
  ({ code, repeat: false, ctrlKey: false, metaKey: false, altKey: false, target: { tagName: 'CANVAS' }, preventDefault() {}, ...extra }) as unknown as KeyboardEvent

function setup(start: InputMode = 'PLANETARY_EXPLORATION') {
  let mode = start
  const im = createInputManager(() => mode)
  return { im, setMode: (m: InputMode) => (mode = m) }
}

describe('the control rule: WASD move, arrows look', () => {
  it('no mode binds an arrow key to movement or a WASD key to the camera', () => {
    for (const [mode, bs] of Object.entries(DEFAULT_BINDINGS)) {
      for (const b of bs) {
        if (b.action.startsWith('move')) expect(b.codes.every((c) => /^Key[WASD]$/.test(c)), `${mode} ${b.action}`).toBe(true)
        if (b.action.startsWith('look')) expect(b.codes.every((c) => c.startsWith('Arrow')), `${mode} ${b.action}`).toBe(true)
        if (/^Key[WASD]$/.test(b.codes.join())) expect(b.action.startsWith('move'), `${mode} ${b.codes}`).toBe(true)
        if (b.codes.some((c) => c.startsWith('Arrow'))) expect(b.action.startsWith('look'), `${mode} ${b.codes}`).toBe(true)
      }
    }
  })
  it('W, S, A, D give movement only; arrows give look only', () => {
    const { im } = setup()
    im.handleKeyDown(key('KeyW'))
    expect(im.move()).toEqual({ x: 0, y: 1 })
    expect(im.look()).toEqual({ x: 0, y: 0 })
    im.handleKeyUp(key('KeyW'))
    for (const [c, x, y] of [['ArrowLeft', -1, 0], ['ArrowRight', 1, 0], ['ArrowUp', 0, 1], ['ArrowDown', 0, -1]] as const) {
      im.handleKeyDown(key(c))
      expect(im.look()).toEqual({ x, y })
      expect(im.move()).toEqual({ x: 0, y: 0 })
      im.handleKeyUp(key(c))
    }
  })
  it('diagonals are never faster (|move| ≤ 1)', () => {
    const { im } = setup()
    im.handleKeyDown(key('KeyW'))
    im.handleKeyDown(key('KeyA'))
    const m = im.move()
    expect(Math.hypot(m.x, m.y)).toBeCloseTo(1, 12)
    expect(m.x).toBeLessThan(0)
    expect(m.y).toBeGreaterThan(0)
  })
  it('releasing one of an opposing pair keeps the other', () => {
    const { im } = setup()
    im.handleKeyDown(key('KeyW'))
    im.handleKeyDown(key('KeyS'))
    expect(im.move().y).toBe(0)
    im.handleKeyUp(key('KeyS'))
    expect(im.move().y).toBe(1)
  })
  it('invert Y applies to look only', () => {
    const { im } = setup()
    im.setSettings({ invertY: true })
    im.handleKeyDown(key('ArrowUp'))
    expect(im.look().y).toBe(-1)
  })
})

describe('context: modes own their keys', () => {
  it('opening the inspection record stops movement and drops held keys (no stale input)', () => {
    const { im, setMode } = setup()
    im.handleKeyDown(key('KeyW'))
    expect(im.move().y).toBe(1)
    setMode('HARDWARE_INSPECTION')
    expect(im.move()).toEqual({ x: 0, y: 0 })
    expect(im.heldCodes()).toEqual([])
    setMode('PLANETARY_EXPLORATION')
    expect(im.move()).toEqual({ x: 0, y: 0 }) // W was released while the panel was open: nothing carries over
  })
  it('dialogs and text fields never reach gameplay', () => {
    const { im, setMode } = setup()
    im.handleKeyDown(key('KeyW', { target: { tagName: 'INPUT' } as unknown as EventTarget }))
    expect(im.move().y).toBe(0)
    setMode('UI_INTERACTION')
    im.handleKeyDown(key('KeyW'))
    expect(im.heldCodes()).toEqual([])
  })
  it('press actions fire once, only in their mode; held keys do not re-fire on auto-repeat', () => {
    const { im, setMode } = setup()
    const got: Action[] = []
    im.on('interact', (a) => got.push(a), 'PLANETARY_EXPLORATION')
    im.handleKeyDown(key('KeyE'))
    im.handleKeyDown(key('KeyE', { repeat: true }))
    setMode('SPACECRAFT_FLIGHT')
    im.handleKeyDown(key('KeyE')) // E is "roll right" in flight, not interact
    expect(got).toEqual(['interact']) // the auto-repeat did not fire a second time
    expect(im.axis('rollRight', 'rollLeft')).toBe(1)
  })
  it('a key never has two simultaneous actions within one mode', () => {
    for (const [mode, bs] of Object.entries(DEFAULT_BINDINGS)) {
      const seen = new Map<string, string>()
      for (const b of bs) for (const c of b.codes) {
        expect(seen.has(c), `${mode}: ${c} is bound to ${seen.get(c)} and ${b.action}`).toBe(false)
        seen.set(c, b.action)
      }
    }
  })
  it('keyup is processed even from a text field, so nothing sticks', () => {
    const { im } = setup()
    im.handleKeyDown(key('KeyD'))
    im.handleKeyUp(key('KeyD', { target: { tagName: 'TEXTAREA' } as unknown as EventTarget }))
    expect(im.move().x).toBe(0)
  })
})
