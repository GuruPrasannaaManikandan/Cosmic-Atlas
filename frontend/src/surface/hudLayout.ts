/**
 * The HUD registers its layout regions here so floating elements (the guide's speech bubble) can stay inside the
 * viewport's safe area — below the header/status rows and above the prompt/bottom controls — without hard-coded
 * offsets. Measured from the real DOM, so it follows wrapping headers, breakpoints and open panels.
 */
export const hudEls: { header: HTMLElement | null; status: HTMLElement | null; banner: HTMLElement | null; bottom: HTMLElement | null; prompt: HTMLElement | null } = {
  header: null,
  status: null,
  banner: null,
  bottom: null,
  prompt: null,
}

export interface SafeArea {
  /** px from the viewport top that is free (below header, status row and any DISCOVERED banner) */
  top: number
  /** px from the viewport bottom that is free (above prompt + bottom row) */
  bottom: number
}

export function measureSafeArea(viewport: DOMRect): SafeArea {
  let top = 0
  for (const el of [hudEls.header, hudEls.status, hudEls.banner]) {
    if (!el) continue
    const r = el.getBoundingClientRect()
    if (r.height > 1) top = Math.max(top, r.bottom - viewport.top)
  }
  let bottomEdge = viewport.bottom
  for (const el of [hudEls.bottom, hudEls.prompt]) {
    if (!el) continue
    const r = el.getBoundingClientRect()
    if (r.height > 1) bottomEdge = Math.min(bottomEdge, r.top)
  }
  return { top, bottom: viewport.bottom - bottomEdge }
}

/** place a box (w×h) whose bottom-centre wants to sit at (ax, ay) inside the safe area; dock bottom-centre if it can't */
export function placeBubble(ax: number, ay: number, w: number, h: number, vw: number, vh: number, safe: SafeArea, pinned: boolean) {
  const pad = 8
  if (pinned) {
    const x = Math.min(Math.max(ax - w / 2, pad), vw - w - pad)
    const y = ay - h - 12
    if (y >= safe.top + pad && y + h <= vh - safe.bottom - pad) return { x, y, docked: false }
  }
  return { x: Math.max(pad, (vw - w) / 2), y: Math.max(safe.top + pad, vh - safe.bottom - h - pad), docked: true }
}
