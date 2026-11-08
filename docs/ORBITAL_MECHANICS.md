# COSMIC ATLAS — Orbital Mechanics & Planetary Ephemeris Engine

This document provides the mathematical formulation, reference frame transformations, secular perturbation models, and numerical algorithms powering the deterministic Keplerian ephemeris engine in `frontend/src/astro/kepler.ts` and `frontend/src/astro/time.ts`.

---

## 1. Keplerian Two-Body Formulation

### 1.1 Mean Motion and Anomaly Propagation
Given semi-major axis $a$, gravitational parameter $\mu = GM$, and orbital period $P$, the mean motion $n$ is defined as:
$$n = \frac{360^\circ}{P} \quad [\text{deg/day}]$$

At any time $t$ relative to epoch $t_0$, the mean anomaly $M(t)$ propagates linearly:
$$M(t) = M_0 + n \cdot (t - t_0) \pmod{360^\circ}$$

### 1.2 Kepler's Equation and Numerically Stable Solving
The eccentric anomaly $E$ satisfies Kepler's equation:
$$M = E - e \sin E$$

Because standard Newton–Raphson iteration can diverge or loop near parabolic boundaries ($e \to 1$) or when $M \approx 0$, our engine implements a hybrid two-stage solver:
1. **Newton–Raphson Phase** (up to 12 iterations):
   $$E_{k+1} = E_k - \frac{E_k - e \sin E_k - M}{1 - e \cos E_k}$$
   Iteration terminates when $|\Delta E| < 10^{-14}\text{ rad}$.
2. **Guaranteed Bisection Fallback**:
   If Newton–Raphson does not converge within 12 iterations, the root is strictly bounded in $[-\pi, \pi]$ and bracketed using bisection for up to 200 iterations, guaranteeing machine precision ($\epsilon < 10^{-15}$).

### 1.3 Orbital Plane Coordinates
Using eccentric anomaly $E$, the unperturbed position in the orbital plane (with periapsis along the $+x$ axis) is:
$$x_{\text{orb}} = a (\cos E - e)$$
$$y_{\text{orb}} = a \sqrt{1 - e^2} \sin E$$
$$z_{\text{orb}} = 0$$

The instantaneous radius $r$ satisfies:
$$r = \sqrt{x_{\text{orb}}^2 + y_{\text{orb}}^2} = a (1 - e \cos E)$$

---

## 2. Reference Frames and Coordinate Transformations

The simulation represents positions in the **Galactic Root Frame** (centered on the Galactic Centre, units of light-years). All satellite elements are published with respect to specialized local reference planes (e.g., Laplace planes, planet equator, or ecliptic).

### 2.1 Supported Reference Frames
1. **Ecliptic J2000 (`ecliptic`)**: Standard heliocentric plane defined by Earth's mean orbit at J2000.0 ($t = 2451545.0\text{ JD}$). Obliquity $\epsilon_0 = 23.4392911^\circ$.
2. **Body Equator / Laplace Plane (`pole`)**: Defined by right ascension $\alpha_p$ and declination $\delta_p$ of the primary's rotational pole or Laplace plane.
   The unit normal of the plane is:
   $$\hat{p} = \begin{bmatrix} \cos\delta_p \cos\alpha_p \\ \cos\delta_p \sin\alpha_p \\ \sin\delta_p \end{bmatrix}$$
   The ascending node vector on the ICRF equator is:
   $$\hat{n} = \begin{bmatrix} -\sin\alpha_p \\ \cos\alpha_p \\ 0 \end{bmatrix}$$
   The orthogonal in-plane axis is:
   $$\hat{y} = \hat{p} \times \hat{n}$$

### 2.2 Rotation into Galactic Root Coordinates
The transformation from orbital plane to the element frame uses Euler rotations $(\Omega, i, \omega)$:
$$\mathbf{r}_{\text{frame}} = R_z(-\Omega) \, R_x(-i) \, R_z(-\omega) \, \begin{bmatrix} x_{\text{orb}} \\ y_{\text{orb}} \\ 0 \end{bmatrix}$$
Expanded algebraically:
$$x_{\text{ref}} = (\cos\omega \cos\Omega - \sin\omega \sin\Omega \cos i) x_{\text{orb}} + (-\sin\omega \cos\Omega - \cos\omega \sin\Omega \cos i) y_{\text{orb}}$$
$$y_{\text{ref}} = (\cos\omega \sin\Omega + \sin\omega \cos\Omega \cos i) x_{\text{orb}} + (-\sin\omega \sin\Omega + \cos\omega \cos\Omega \cos i) y_{\text{orb}}$$
$$z_{\text{ref}} = (\sin\omega \sin i) x_{\text{orb}} + (\cos\omega \sin i) y_{\text{orb}}$$

Finally, multiplication by the J2000-to-Galactic rotation matrix $\mathbf{R}_{\text{ICRF}\to\text{Gal}}$ maps the vector directly into galactic axes:
$$\mathbf{R}_{\text{ICRF}\to\text{Gal}} = \begin{bmatrix}
-0.0548755604 & -0.8734370902 & -0.4838350155 \\
+0.4941094279 & -0.4448296299 & +0.7469822445 \\
-0.8676661490 & -0.1980763734 & +0.4559837762
\end{bmatrix}$$

---

## 3. Secular Precession and Satellite Rate Derivations

Planetary oblateness ($J_2$) and solar/planetary tidal perturbations induce secular precession of the orbital node ($\Omega$) and argument of periapsis ($\omega$).

### 3.1 JPL SSD Planetary Satellite Element Conventions
NASA/JPL SSD tables publish:
- Sidereal orbital period $P_{\text{sidereal}}$ (days)
- Periapsis precession period $P_{\text{apsis}}$ (years)
- Nodal precession period $P_{\text{node}}$ (years)

The rate of apsidal advance is:
$$\dot{\omega} = \frac{360^\circ}{P_{\text{apsis}} \cdot 365.25} \quad [\text{deg/day}]$$

The magnitude of nodal precession is:
$$|\dot{\Omega}| = \frac{360^\circ}{P_{\text{node}} \cdot 365.25} \quad [\text{deg/day}]$$

### 3.2 Prograde vs. Retrograde Sign Conventions
- **Prograde orbits ($i < 90^\circ$)**: The ascending node regresses ($\dot{\Omega} = -|\dot{\Omega}|$).
- **Retrograde orbits ($i > 90^\circ$, e.g., Triton, Phoebe)**: The ascending node advances ($\dot{\Omega} = +|\dot{\Omega}|$).

Because published mean longitude $\lambda$ rates include precession ($\lambda = \Omega \pm (\omega + M)$), the true rate of mean anomaly advancement $\dot{M}$ is derived as:
$$\dot{M} = \frac{360^\circ}{P_{\text{sidereal}}} - \dot{\omega} + |\dot{\Omega}|$$

---

## 4. Pluto–Charon Barycentric Mechanics

Pluto and Charon form a true binary system with a mass ratio:
$$q = \frac{M_{\text{Charon}}}{M_{\text{Pluto}}} = \frac{105.88\text{ km}^3/\text{s}^2}{869.61\text{ km}^3/\text{s}^2} \approx 0.121755$$

The center of mass (barycentre) lies $\sim 960\text{ km}$ outside Pluto's surface ($\sim 2,132\text{ km}$ from Pluto's center).

### 4.1 Heliocentric Barycentre Motion
The Pluto–Charon barycentre follows the heliocentric Keplerian orbit defined by JPL PLU060:
$$\mathbf{r}_{\text{bary}}(t) = \mathbf{r}_{\text{Sun}} + \mathbf{r}_{\text{orbit}}(t; \, a = 39.482\text{ AU}, \, e = 0.2488, \, i = 17.16^\circ)$$

### 4.2 Mutual Orbit Formulation
Let $\mathbf{r}_{\text{rel}}(t)$ be the vector from Pluto to Charon ($a = 19,591.4\text{ km}$, $P = 6.38723\text{ d}$, $i = 0^\circ$ in the Pluto equator frame).
The positions of Pluto and Charon relative to the barycentre are:
$$\mathbf{r}_{\text{Pluto}}(t) = \mathbf{r}_{\text{bary}}(t) - \frac{q}{1 + q} \, \mathbf{r}_{\text{rel}}(t)$$
$$\mathbf{r}_{\text{Charon}}(t) = \mathbf{r}_{\text{bary}}(t) + \frac{1}{1 + q} \, \mathbf{r}_{\text{rel}}(t)$$

### 4.3 Outer Small Moons (Styx, Nix, Kerberos, Hydra)
The four small circumbinary moons orbit the Pluto–Charon barycentre in near-circular, coplanar orbits:
$$\mathbf{r}_{\text{moon}}(t) = \mathbf{r}_{\text{bary}}(t) + \mathbf{r}_{\text{circumbinary}}(t)$$

---

## 5. Deterministic Time Architecture

1. **Epoch Conversion**: Time is stored internally as a UTC millisecond timestamp $T_{\text{ms}}$ from Unix epoch (1970-01-01T00:00:00Z).
2. **Julian Date Conversion**:
   $$\text{JD}_{\text{UTC}} = 2440587.5 + \frac{T_{\text{ms}}}{86,400,000}$$
3. **Barycentric Dynamical Time (TDB)**: For all orbital propagation, $\text{JD}_{\text{TDB}} \approx \text{JD}_{\text{UTC}} + \frac{\Delta T}{86400}$. Across the model interval (1900–2050), $\Delta T \approx 69\text{ seconds}$.
4. **Time Inversion & Determinism**: Because all functions are pure analytic functions of $t$, scrubbing time backwards or forwards at arbitrary simulation rates ($\pm 365\text{ d/s}$) preserves exact reversibility without numerical damping or drift.
