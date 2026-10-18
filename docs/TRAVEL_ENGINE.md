# COSMIC ATLAS — High-Precision Astronomical Travel Engine

## 1. Executive Summary

The **Astronomical Travel Engine** is a high-precision camera navigation and spaceflight control system engineered specifically to solve the mathematical challenges of traveling across 15 orders of magnitude in an interactive 3D universe.

In a physical scale spanning from planetary radii ($10^{-10}\text{ ly}$) to the cosmic web ($10^8\text{ ly}$), linear interpolation ($slerp$/$lerp$) fails catastrophically: it either crawls imperceptibly slowly across millions of light-years or snaps violently past planets in a single frame. The COSMIC ATLAS Travel Engine solves this through:
1. An 8-stage formal state machine (`idle` $\rightarrow$ `resolving_destination` $\rightarrow$ `preparing_scene` $\rightarrow$ `traveling` $\rightarrow$ `arriving` $\rightarrow$ `inspecting`).
2. Logarithmic-space distance interpolation ($\log\text{-lerp}$) combined with cubic smoothstep ($S$-curve) easing.
3. Intelligent, category-specific framing orientation (sunlit phase angles, galactic disk elevations, stellar coronal offsets).
4. Uninterrupted user control: instant cancelation and mid-flight retargeting with zero camera snapping.
5. Real-time floating telemetry HUD with countdown ETA, progress bar, and speed readouts.

---

## 2. State Machine Architecture

```
                          ┌────────────────────────┐
                          │         IDLE           │
                          └───────────┬────────────┘
                                      │ initiateTravel(id)
                                      ▼
                          ┌────────────────────────┐
                          │ RESOLVING_DESTINATION  │
                          └───────────┬────────────┘
                                      │ Object validated in BY_ID
                                      ▼
                          ┌────────────────────────┐
                          │    PREPARING_SCENE     │
                          │ Compute intelligent    │
                          │ framing & duration     │
                          └───────────┬────────────┘
                                      │
                                      ▼
        ┌────────────────────────────────────────────────────────────┐
        │                         TRAVELING                          │
        │ - Log-space position stepping                              │
        │ - Orientation interpolation towards destination target     │
        │ - Progress & countdown ETA updates (TravelProgressHUD)     │
        └───────┬────────────────────────────────────────────┬───────┘
                │ User interrupts (WASD/Drag/Cancel button)  │
                ▼                                            ▼ t >= 1.0
  ┌────────────────────────┐                       ┌────────────────────────┐
  │       CANCELLED        │                       │        ARRIVING        │
  │ Hold position, reset   │                       │ Play audio chime, lock │
  │ flight, return to IDLE │                       │ orbital tracking       │
  └────────────────────────┘                       └───────────┬────────────┘
                                                               │ 400ms delay
                                                               ▼
                                                   ┌────────────────────────┐
                                                   │       INSPECTING       │
                                                   │ Open data panel, focus │
                                                   │ selected celestial obj │
                                                   └───────────┬────────────┘
                                                               │ 2500ms auto
                                                               ▼
                                                   ┌────────────────────────┐
                                                   │          IDLE          │
                                                   └────────────────────────┘
```

---

## 3. Mathematical Foundations

### 3.1 Logarithmic Distance Interpolation ($\log\text{-lerp}$)
Given initial distance $d_0$ and final target approach distance $d_1$:
$$d(e) = \exp\left((1 - e) \ln(d_0) + e \ln(d_1)\right)$$
where $e \in [0, 1]$ is the eased time parameter:
$$e(t) = t^2 (3 - 2t) \quad \text{or} \quad t^3 (6t^2 - 15t + 10)$$
This guarantees that relative scale changes at a constant geometric rate per unit time, preventing both near-field snapping and far-field stalling.

### 3.2 Adaptive Travel Duration
Travel duration is computed dynamically as a function of the log-ratio of distances:
$$\Delta \text{dex} = |\log_{10}(d_0) - \log_{10}(d_1)|$$
$$\text{duration}(d_0, d_1) = \text{clamp}\left(1.8 + 0.85 \cdot \Delta \text{dex}, \; 1.5\text{ s}, \; 8.5\text{ s}\right)$$
Trips within the Solar System complete in $1.8 - 2.5\text{ s}$, while interstellar voyages from Earth to Betelgeuse or Andromeda smoothly transition over $4.5 - 6.5\text{ s}$.

### 3.3 Direction Vector Spherical Interpolation
The direction vector from target to camera transitions smoothly along the great circle:
$$\mathbf{dir}(e) = \text{normalize}\left((1 - e)\mathbf{dir}_0 + e \mathbf{dir}_1\right)$$
$$\mathbf{pos}_{\text{camera}}(e) = \mathbf{P}_{\text{target}}(t) + d(e) \cdot \mathbf{dir}(e)$$

---

## 4. Intelligent Category-Specific Framing

Camera framing cannot use a generic offset; each celestial type requires unique scientific staging:

1. **Terrestrial & Jovian Planets (`category: 'planet'`)**:
   - Computes the vector from the target planet to the Sun: $\mathbf{u}_{\odot} = \text{normalize}(\mathbf{P}_{\odot} - \mathbf{P}_{\text{planet}})$.
   - Offsets the camera by $35^\circ$ azimuth and $15^\circ$ elevation relative to the solar vector.
   - Result: Approaching spacecraft always views the illuminated sunlit hemisphere with a dramatic day/night terminator line.
   - Approach distance: $\max(d_{\text{view}}, 3.2 \times r_{\text{true}})$.

2. **Moons (`category: 'moon'`)**:
   - Offsets toward the illuminated face while maintaining a collision-free corridor avoiding parent planet occlusion.
   - Approach distance: $\max(d_{\text{view}}, 2.8 \times r_{\text{true}})$.

3. **Stars (`category: 'star'`, e.g. Betelgeuse, Alpha Centauri)**:
   - Offsets $20^\circ$ above the stellar equatorial plane to reveal convection cells and coronal flares.
   - Approach distance: framed at $40 - 90\text{ AU}$ ($6 \times 10^{-4}\text{ ly}$), ensuring the stellar disk fills the viewport without blinding the camera.

4. **Galaxies (`category: 'galaxy'`, e.g. Andromeda, Milky Way)**:
   - Approached at an elevation angle of $35^\circ$ to $45^\circ$ above the galactic plane: $\mathbf{dir}_1 = (0.2, 0.72, 0.65)$.
   - Framing distance: $1.35 \times r_{\text{galactic}}$, ensuring both the central galactic bulge and outermost spiral starburst arms are completely framed.

---

## 5. Telemetry & User Feedback

1. **Travel Progress HUD (`TravelProgressHUD.tsx`)**:
   - Floating glass HUD centered at the top of the viewport.
   - Target name, category badge, and animated linear progress bar.
   - Numerical countdown ETA ($\text{s}$) and live speed in $\text{ly/s}$ or $c$.
   - Dedicated `✕ Cancel` button for keyboard-free abort.
2. **Multi-Scale Breadcrumbs (`ScaleBreadcrumbs.tsx`)**:
   - Hierarchical ladder: `Cosmic Web › Laniakea › Milky Way › Solar System › [Object]`.
   - Each crumb is an active navigation trigger.
   - Monospace telemetry pills display current reference frame and spatial scale.
