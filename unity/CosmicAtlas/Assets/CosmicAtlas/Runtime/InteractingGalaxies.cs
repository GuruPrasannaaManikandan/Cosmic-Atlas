using System.Collections.Generic;
using UnityEngine;

namespace CosmicAtlas.Rendering
{
    /// <summary>
    /// Interacting galaxy pair by the restricted three-body method of Toomre &amp; Toomre (1972, ApJ 178, 623):
    /// two softened point masses on a bound/parabolic encounter, each surrounded by massless test-particle disks in
    /// circular orbits. Tidal tails and bridges then form from the gravity alone (leapfrog integration).
    /// Units: kpc, Myr-like scaled time, G·M = 1 per unit mass. Visual model, not a self-consistent N-body simulation
    /// (no self-gravity of the disks, no dark halo, no gas).
    /// </summary>
    public static class InteractingGalaxies
    {
        public struct Result { public List<Particle> stars; public Vector3 centre1, centre2; }

        /// <summary>
        /// Start separation 4 r_p: by Barker's equation the time to pericentre is √(2 r_p³/μ)·(D + D³/3) with
        /// D = tan(f0/2) = −√3 → ≈ 24 time units for r_p = 3.5, μ = 1.8. 2,200 steps × 0.02 = 44 units covers the
        /// approach plus ~20 units after pericentre for the tails to develop.
        /// </summary>
        public const int DefaultSteps = 2200;

        public static Result Simulate(int particlesPerGalaxy, int steps, int seed, float massRatio = 1f, float pericentre = 4f, float incl2Deg = 60f)
        {
            var r = new Rng(seed);
            float m1 = 1f, m2 = massRatio, eps2 = 0.3f * 0.3f;
            // parabolic relative orbit starting well before pericentre
            float rp = pericentre, mu = m1 + m2;
            float startR = rp * 4f;
            // parabola: r = 2 rp / (1 + cos f); speed v = sqrt(2 mu / r)
            float f0 = -Mathf.Acos(2 * rp / startR - 1);
            var rel = new Vector3(startR * Mathf.Cos(f0), 0, startR * Mathf.Sin(f0));
            float v = Mathf.Sqrt(2 * mu / startR);
            // velocity direction for a parabola: angle between radius and velocity: tan(psi) = (1+cos f)/sin f
            var tangent = new Vector3(-Mathf.Sin(f0), 0, 1 + Mathf.Cos(f0)).normalized;
            var relV = tangent * v;
            Vector3 p1 = -rel * (m2 / mu), p2 = rel * (m1 / mu);
            Vector3 v1 = -relV * (m2 / mu), v2 = relV * (m1 / mu);

            var pos = new List<Vector3>(); var vel = new List<Vector3>(); var owner = new List<int>(); var cols = new List<Color>();
            AddDisk(r, particlesPerGalaxy, p1, v1, m1, Quaternion.identity, 0, pos, vel, owner, cols);
            AddDisk(r, particlesPerGalaxy, p2, v2, m2, Quaternion.Euler(incl2Deg, 0, 25f), 1, pos, vel, owner, cols);

            float dt = 0.02f;
            for (int s = 0; s < steps; s++)
            {
                // leapfrog (kick-drift-kick) for the two masses
                Vector3 d = p2 - p1; float r2 = d.sqrMagnitude + eps2; float inv = 1f / (r2 * Mathf.Sqrt(r2));
                Vector3 a1 = d * (m2 * inv), a2 = -d * (m1 * inv);
                v1 += a1 * (0.5f * dt); v2 += a2 * (0.5f * dt);
                for (int i = 0; i < pos.Count; i++) vel[i] += Accel(pos[i], p1, p2, m1, m2, eps2) * (0.5f * dt);
                p1 += v1 * dt; p2 += v2 * dt;
                for (int i = 0; i < pos.Count; i++) pos[i] += vel[i] * dt;
                d = p2 - p1; r2 = d.sqrMagnitude + eps2; inv = 1f / (r2 * Mathf.Sqrt(r2));
                a1 = d * (m2 * inv); a2 = -d * (m1 * inv);
                v1 += a1 * (0.5f * dt); v2 += a2 * (0.5f * dt);
                for (int i = 0; i < pos.Count; i++) vel[i] += Accel(pos[i], p1, p2, m1, m2, eps2) * (0.5f * dt);
            }
            var com = (p1 * m1 + p2 * m2) / mu;
            var stars = new List<Particle>(pos.Count + 2);
            for (int i = 0; i < pos.Count; i++) stars.Add(new Particle(pos[i] - com, cols[i], 0.06f, 1f));
            // bright nuclei
            for (int k = 0; k < 40; k++)
            {
                stars.Add(new Particle(p1 - com + r.OnSphere() * Mathf.Abs(r.Gauss(0.15f)), Blackbody.LinearColor(4500), 0.08f, 2f));
                stars.Add(new Particle(p2 - com + r.OnSphere() * Mathf.Abs(r.Gauss(0.15f)), Blackbody.LinearColor(4500), 0.08f, 2f));
            }
            return new Result { stars = stars, centre1 = p1 - com, centre2 = p2 - com };
        }

        static Vector3 Accel(Vector3 p, Vector3 p1, Vector3 p2, float m1, float m2, float eps2)
        {
            Vector3 d1 = p1 - p, d2 = p2 - p;
            float r1 = d1.sqrMagnitude + eps2, r2 = d2.sqrMagnitude + eps2;
            return d1 * (m1 / (r1 * Mathf.Sqrt(r1))) + d2 * (m2 / (r2 * Mathf.Sqrt(r2)));
        }

        static void AddDisk(Rng r, int n, Vector3 centre, Vector3 cvel, float mass, Quaternion tilt, int id,
            List<Vector3> pos, List<Vector3> vel, List<int> owner, List<Color> cols)
        {
            for (int i = 0; i < n; i++)
            {
                float R = Mathf.Lerp(0.6f, 3.2f, Mathf.Sqrt(r.U()));
                float th = r.Range(0, 2 * Mathf.PI);
                var local = new Vector3(R * Mathf.Cos(th), r.Gauss(0.05f), R * Mathf.Sin(th));
                float vc = Mathf.Sqrt(mass * R * R / Mathf.Pow(R * R + 0.09f, 1.5f)); // circular speed in the softened potential
                var lv = new Vector3(-Mathf.Sin(th), 0, Mathf.Cos(th)) * vc;
                pos.Add(centre + tilt * local); vel.Add(cvel + tilt * lv); owner.Add(id);
                cols.Add(Blackbody.LinearColor(R > 2.2f ? r.Range(8000, 20000) : r.Range(4500, 7000)));
            }
        }
    }
}
