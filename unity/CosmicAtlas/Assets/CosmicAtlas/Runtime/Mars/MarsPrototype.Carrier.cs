using System;
using System.Collections.Generic;
using System.Text;
using UnityEngine;
using UnityEngine.Rendering;

namespace CosmicAtlas.Rendering.Mars
{
    /// <summary>
    /// E3 — the THEIA carrier: one CONCEPTUAL transport spacecraft (not a historical or NASA design) that lands at every
    /// Mars destination, opens its rear ramp and lets THEIA (the conceptual expedition rover) drive out. The same code
    /// serves the Victoria scene and the seven landing-site packages; only the terrain and the hardware to stay clear of
    /// differ.
    ///
    /// Landing spot: chosen automatically around the scene's start point — flat ground (measured terrain under the
    /// footpads and along the ramp and exit), clear of every historical object, the ramp facing the main hardware so THEIA
    /// drives out toward it. ILLUSTRATIVE rocks are cleared from the pad; the measured terrain is not changed.
    ///
    /// Carrier frame: +z nose, -z rear (ramp), x right, y up, origin on the ground at the hull centre.
    /// </summary>
    public partial class MarsPrototype
    {
        GameObject _carrier;
        Transform _carrierRamp;
        readonly List<Transform> _plumes = new List<Transform>();
        Vector2 _cPos;
        float _cHeading, _cGround, _rampAlpha, _zEnd;
        string _arrivalPhase = "", _carrierPick = "";

        const float CFloor = 0.85f, CRampLen = 2.3f, CHingeZ = -2.15f, CRadius = 3.0f, CDescentAlt = 300f, CBayZ = 0.2f;
        const float TDescent = 12f, TSettle = 1.5f, TDoor = 3.2f, TDrive = 8f;
        float CarrierArrivalTotal => TDescent + TSettle + TDoor + TDrive;

        // ------------------------------------------------------------------ frames

        static Vector2 LocalToSite(Vector2 c, float heading, float x, float z) =>
            c + new Vector2(Mathf.Cos(heading), -Mathf.Sin(heading)) * x + new Vector2(Mathf.Sin(heading), Mathf.Cos(heading)) * z;
        Vector2 CL(float x, float z) => LocalToSite(_cPos, _cHeading, x, z);

        // ------------------------------------------------------------------ landing spot

        /// <summary>
        /// Rings around <paramref name="near"/>: for each candidate, the ramp faces <paramref name="face"/>; the footprint
        /// (6 x 6 m) and the ramp + exit lane (3.2 x 6 m behind the hull) must lie on measured terrain; flatter is better,
        /// closer to the start point is better; <paramref name="clear"/> rejects spots too close to historical hardware.
        /// </summary>
        void PickLanding(Vector2 near, Vector2 face, Func<Vector2, bool> clear)
        {
            float[] rings = { 0, 5, 10, 15, 20, 26, 32, 40, 50, 62, 75 };
            float best = float.MaxValue; Vector2 bp = near; float bh = 0, bRough = 0, bLane = 0; int tested = 0, valid = 0;
            foreach (float r in rings)
            {
                int n = r == 0 ? 1 : Mathf.Max(10, Mathf.RoundToInt(r * 0.9f));
                for (int k = 0; k < n; k++)
                {
                    float a = k * 2 * Mathf.PI / n;
                    var p = near + new Vector2(Mathf.Cos(a), Mathf.Sin(a)) * r;
                    tested++;
                    if (!clear(p)) continue;
                    var tf = face - p;
                    float h = tf.sqrMagnitude > 1 ? Mathf.Atan2(-tf.x, -tf.y) : 0; // local +z points AWAY from the face point
                    if (!Flatness(p, h, out float rough, out float lane)) continue;
                    valid++;
                    float score = rough * 4f + lane + 0.015f * r + (rough > 0.55f ? 100f : 0) + (lane > 1.4f ? 60f : 0);
                    if (score < best) { best = score; bp = p; bh = h; bRough = rough; bLane = lane; }
                }
            }
            _cPos = bp; _cHeading = bh;
            _carrierPick = $"{{\"tested\":{tested},\"valid\":{valid},\"distFromStart\":{MiniJson.N((bp - near).magnitude)},\"footprintReliefM\":{MiniJson.N(bRough)},\"laneReliefM\":{MiniJson.N(bLane)}}}";
        }

        bool Flatness(Vector2 p, float h, out float rough, out float lane)
        {
            float lo = float.MaxValue, hi = float.MinValue, lo2 = float.MaxValue, hi2 = float.MinValue;
            rough = lane = 0;
            for (float x = -3f; x <= 3.01f; x += 0.75f)
                for (float z = -3f; z <= 3.01f; z += 0.75f)
                {
                    var q = LocalToSite(p, h, x, z);
                    float g = _terrain.Sample(q.x, q.y);
                    if (float.IsNaN(g)) return false;
                    lo = Mathf.Min(lo, g); hi = Mathf.Max(hi, g);
                }
            for (float x = -1.6f; x <= 1.61f; x += 0.8f)
                for (float z = -9.5f; z <= -3.2f; z += 0.7f)
                {
                    var q = LocalToSite(p, h, x, z);
                    float g = _terrain.Sample(q.x, q.y);
                    if (float.IsNaN(g)) return false;
                    lo2 = Mathf.Min(lo2, g); hi2 = Mathf.Max(hi2, g);
                }
            rough = hi - lo; lane = hi2 - lo2;
            return true;
        }

        // ------------------------------------------------------------------ setup

        /// <summary>pick the spot, build the carrier (once), place it landed with the ramp open and THEIA out on the ground</summary>
        void SetupCarrier(Vector2 near, Vector2 face, Func<Vector2, bool> clear)
        {
            PickLanding(near, face, clear);
            // the hull rests on its lowest footpad (feet touch the ground; the others carry the small remaining relief)
            _cGround = float.MaxValue;
            foreach (var f in new[] { new Vector2(-2.35f, -2.6f), new Vector2(2.35f, -2.6f), new Vector2(-2.35f, 2.1f), new Vector2(2.35f, 2.1f) })
            {
                var q = CL(f.x, f.y); float g = _terrain.Sample(q.x, q.y);
                if (!float.IsNaN(g)) _cGround = Mathf.Min(_cGround, g);
            }
            if (_cGround == float.MaxValue) _cGround = SafeHeight(_cPos.x, _cPos.y);
            // ramp angle: its end meets the measured ground behind the hull
            _rampAlpha = 22f * Mathf.Deg2Rad;
            for (int i = 0; i < 3; i++)
            {
                float ze = CHingeZ - CRampLen * Mathf.Cos(_rampAlpha);
                var q = CL(0, ze); float g = _terrain.Sample(q.x, q.y);
                float rel = float.IsNaN(g) ? 0 : g - _cGround;
                _rampAlpha = Mathf.Asin(Mathf.Clamp((CFloor - rel) / CRampLen, 0.12f, 0.75f));
            }
            _zEnd = CHingeZ - CRampLen * Mathf.Cos(_rampAlpha) - 4.2f;
            if (_carrier == null) BuildCarrier();
            _rocks?.ClearDisc(CL(0, -3.2f), 9.5f);
            CarrierFinal();
        }

        // ------------------------------------------------------------------ the arrival timeline

        /// <summary>everything in its end state: landed, engines off, ramp open, THEIA at the foot of the ramp</summary>
        void CarrierFinal()
        {
            if (_carrier == null) return;
            PlaceCarrier(0f);
            SetRamp(-_rampAlpha * Mathf.Rad2Deg);
            SetPlumes(0f);
            DeployPose(_zEnd);
            if (Contact(_pos, _heading, out var by, out var bp, out var br)) { _bodyY = by; _pitch = bp; _roll = br; }
            for (int i = 0; i < 6; i++) _susp[i] = 0;
            _camYaw = _heading; _camYawOffset = 0;
            _arrivalPhase = "";
            if (_player) PlacePlayer();
        }

        void PlaceCarrier(float alt, float drift = 0)
        {
            var p = CL(0, drift);
            _carrier.transform.localPosition = new Vector3(p.x, _cGround + alt, p.y);
            _carrier.transform.localRotation = Quaternion.Euler(0, _cHeading * Mathf.Rad2Deg, 0);
        }

        void SetRamp(float deg) => _carrierRamp.localRotation = Quaternion.Euler(deg, 0, 0);

        void SetPlumes(float len)
        {
            foreach (var t in _plumes)
            {
                t.gameObject.SetActive(len > 0.05f);
                t.localScale = new Vector3(0.42f, Mathf.Max(0.01f, len), 0.42f);
            }
        }

        /// <summary>height of what THEIA's wheels stand on at carrier-local z (bay floor, ramp, then the measured ground)</summary>
        float SurfaceAtLocal(float zl)
        {
            if (zl >= CHingeZ) return _cGround + CFloor;
            float ze = CHingeZ - CRampLen * Mathf.Cos(_rampAlpha);
            if (zl >= ze) return _cGround + CFloor - (CHingeZ - zl) * Mathf.Tan(_rampAlpha);
            var q = CL(0, zl); float g = _terrain.Sample(q.x, q.y);
            return float.IsNaN(g) ? _cGround : g;
        }

        /// <summary>THEIA on the carrier's centre line at local z, facing out of the ramp (local -z)</summary>
        void DeployPose(float zl)
        {
            _heading = WrapPi(_cHeading + Mathf.PI);
            _pos = CL(0, zl);
            float hf = SurfaceAtLocal(zl - 1.0f), hr = SurfaceAtLocal(zl + 1.0f);
            _bodyY = (hf + hr) * 0.5f; _pitch = Mathf.Atan2(hf - hr, 2f); _roll = 0;
            float ze = CHingeZ - CRampLen * Mathf.Cos(_rampAlpha);
            if (zl + 1.2f < ze && Contact(_pos, _heading, out var by, out var bp, out var br)) { _bodyY = by; _pitch = bp; _roll = br; }
            for (int i = 0; i < 6; i++) _susp[i] = 0;
        }

        /// <summary>per frame during Arrival (late update): carrier, ramp, plumes, THEIA and the camera</summary>
        void CarrierArrivalLate(float dt)
        {
            float t = _arrivalT;
            float t1 = TDescent, t2 = t1 + TSettle, t3 = t2 + TDoor;
            Vector3 pivot; float yaw, pitch, dist;
            float camSide = _cHeading + 0.75f; // a three-quarter view of the ramp side
            if (t < t2)
            {
                float u = Mathf.Clamp01(t / TDescent);
                float alt = t < t1 ? CDescentAlt * Mathf.Pow(1 - u, 2.6f) : 0f;
                float drift = t < t1 ? 40f * Mathf.Pow(1 - u, 2f) : 0f;
                PlaceCarrier(alt, drift);
                float throttle = t < t1 ? (0.55f + 0.45f * u) * (1.6f + 3.6f * u) : Mathf.Lerp(2.5f, 0f, (t - t1) / 0.6f);
                SetPlumes(throttle);
                SetRamp(90f);
                _arrivalPhase = t < t1 ? "descent" : "touchdown";
                InsideBay();
                var cp = _carrier.transform.localPosition;
                pivot = cp + Vector3.up * 2.2f;
                float e = Mathf.SmoothStep(0, 1, u);
                yaw = camSide; pitch = Mathf.Lerp(0.55f, 0.22f, e); dist = Mathf.Lerp(80f, 19f, e);
            }
            else if (t < t3)
            {
                PlaceCarrier(0f); SetPlumes(0f);
                float s = Mathf.SmoothStep(0, 1, (t - t2) / TDoor);
                SetRamp(Mathf.Lerp(90f, -_rampAlpha * Mathf.Rad2Deg, s));
                _arrivalPhase = "door";
                InsideBay();
                var rear = CL(0, CHingeZ - 1.2f);
                pivot = new Vector3(rear.x, _cGround + 1.6f, rear.y);
                yaw = camSide; pitch = 0.22f; dist = 17f;
            }
            else
            {
                PlaceCarrier(0f); SetPlumes(0f); SetRamp(-_rampAlpha * Mathf.Rad2Deg);
                float s = Mathf.Clamp01((t - t3) / TDrive);
                float e = s * s * (3 - 2 * s);
                float z = Mathf.Lerp(CBayZ, _zEnd, e);
                _spin += Mathf.Abs(z - _deployZPrev) / WheelR; _deployZPrev = z;
                DeployPose(z);
                PlacePlayer();
                _arrivalPhase = "deploy";
                var rp = new Vector3(_pos.x, _bodyY + 1.3f, _pos.y);
                var rear = CL(0, CHingeZ - 1.2f);
                pivot = Vector3.Lerp(new Vector3(rear.x, _cGround + 1.6f, rear.y), rp, e);
                yaw = camSide + WrapPi(_heading - camSide) * e; pitch = Mathf.Lerp(0.22f, _camPitch, e); dist = Mathf.Lerp(17f, _camDist, e);
            }
            _camYaw = yaw;
            SetCamera(Orbit(pivot, yaw, pitch, dist), pivot, 1f);
        }

        /// <summary>THEIA parked in the bay, riding with the carrier</summary>
        void InsideBay()
        {
            var ct = _carrier.transform;
            var t = _player.transform;
            t.localPosition = ct.localPosition + ct.localRotation * new Vector3(0, CFloor, CBayZ);
            t.localRotation = ct.localRotation * Quaternion.Euler(0, 180f, 0);
            for (int i = 0; i < 6; i++) _wheels[i].localPosition = new Vector3(WheelXZ[i].x, WheelR, WheelXZ[i].y);
            _deployZPrev = CBayZ;
        }
        float _deployZPrev;

        // ------------------------------------------------------------------ obstacle and reports

        /// <summary>the landed carrier blocks THEIA like the historical hardware does (only moves that get closer)</summary>
        bool CarrierBlocks(Vector2 p, float r)
        {
            if (_carrier == null || _mode == ExplorerMode.Arrival) return false;
            float d = (p - _cPos).magnitude, d0 = (_pos - _cPos).magnitude;
            return d < CRadius + r && d < d0;
        }

        string CarrierJson()
        {
            if (_carrier == null) return "null";
            var sb = new StringBuilder();
            sb.Append("{\"label\":\"THEIA carrier (CONCEPTUAL spacecraft)\",\"x\":").Append(MiniJson.N(_cPos.x)).Append(",\"z\":").Append(MiniJson.N(_cPos.y))
              .Append(",\"heading\":").Append(MiniJson.N(_cHeading)).Append(",\"radius\":").Append(MiniJson.N(CRadius))
              .Append(",\"rampDeg\":").Append(MiniJson.N(_rampAlpha * Mathf.Rad2Deg)).Append(",\"arrivalSec\":").Append(MiniJson.N(CarrierArrivalTotal))
              .Append(",\"pick\":").Append(string.IsNullOrEmpty(_carrierPick) ? "null" : _carrierPick).Append('}');
            return sb.ToString();
        }

        // ------------------------------------------------------------------ geometry (CONCEPTUAL)

        Material CarrierMat(Color c, float metal, float smooth)
        {
            var m = new Material(roverTemplate) { name = "carrier" };
            m.SetColor("_BaseColor", c); m.SetFloat("_Metallic", metal); m.SetFloat("_Smoothness", smooth);
            if (_siteMode) _siteOwned.Add(m);
            return m;
        }

        /// <summary>
        /// A boxy lander with a drive-through cargo bay sized for THEIA (bay 2.6 m wide, 2.3 m high, 3.8 m deep; THEIA is
        /// about 2.3 x 2.9 x 1.9 m), four splayed legs, four descent engines and a rear ramp that is also the bay door.
        /// Proportions are ILLUSTRATIVE: this vehicle is a concept, not a historical or NASA design.
        /// </summary>
        void BuildCarrier()
        {
            _carrier = new GameObject("THEIA carrier (CONCEPTUAL spacecraft)");
            _carrier.transform.SetParent(_world, false);
            var root = _carrier.transform;
            var hull = CarrierMat(new Color(0.86f, 0.86f, 0.84f), 0.1f, 0.35f);
            var panel = CarrierMat(new Color(0.62f, 0.64f, 0.67f), 0.6f, 0.4f);
            var dark = CarrierMat(new Color(0.16f, 0.17f, 0.19f), 0.5f, 0.35f);
            var foil = CarrierMat(new Color(0.78f, 0.6f, 0.26f), 0.7f, 0.38f);
            var accent = CarrierMat(new Color(0.85f, 0.4f, 0.1f), 0f, 0.4f);
            float top = CFloor + 2.45f;
            // bay floor, walls, roof, nose bulkhead
            Part(PrimitiveType.Cube, root, new Vector3(0, CFloor - 0.07f, -0.25f), new Vector3(3.0f, 0.14f, 3.85f), Vector3.zero, panel);
            Part(PrimitiveType.Cube, root, new Vector3(-1.48f, CFloor + 1.2f, -0.25f), new Vector3(0.18f, 2.4f, 3.85f), Vector3.zero, hull);
            Part(PrimitiveType.Cube, root, new Vector3(1.48f, CFloor + 1.2f, -0.25f), new Vector3(0.18f, 2.4f, 3.85f), Vector3.zero, hull);
            Part(PrimitiveType.Cube, root, new Vector3(0, top, -0.25f), new Vector3(3.2f, 0.16f, 4.0f), Vector3.zero, hull);
            Part(PrimitiveType.Cube, root, new Vector3(0, CFloor + 1.2f, 1.62f), new Vector3(3.14f, 2.4f, 0.16f), Vector3.zero, hull);
            // insulation blankets on the side walls, an accent band along the roof edge
            Part(PrimitiveType.Cube, root, new Vector3(-1.58f, CFloor + 1.1f, -0.25f), new Vector3(0.02f, 1.7f, 3.4f), Vector3.zero, foil);
            Part(PrimitiveType.Cube, root, new Vector3(1.58f, CFloor + 1.1f, -0.25f), new Vector3(0.02f, 1.7f, 3.4f), Vector3.zero, foil);
            Part(PrimitiveType.Cube, root, new Vector3(0, top - 0.12f, -2.27f), new Vector3(3.2f, 0.1f, 0.06f), Vector3.zero, accent);
            // nose: avionics block and a propellant tank pair on the roof; a high-gain dish
            Part(PrimitiveType.Cube, root, new Vector3(0, CFloor + 1.0f, 2.05f), new Vector3(2.4f, 1.6f, 0.7f), Vector3.zero, panel);
            Part(PrimitiveType.Cylinder, root, new Vector3(-0.75f, top + 0.42f, -0.25f), new Vector3(0.7f, 1.6f, 0.7f), new Vector3(90, 0, 0), panel);
            Part(PrimitiveType.Cylinder, root, new Vector3(0.75f, top + 0.42f, -0.25f), new Vector3(0.7f, 1.6f, 0.7f), new Vector3(90, 0, 0), panel);
            Part(PrimitiveType.Cylinder, root, new Vector3(0.9f, top + 0.35f, 1.55f), new Vector3(0.06f, 0.3f, 0.06f), Vector3.zero, dark);
            var dish = new Material(hull); dish.SetFloat("_Cull", 0f); if (_siteMode) _siteOwned.Add(dish);
            MeshPart(DishMesh(0.45f, 0.12f), root, new Vector3(0.9f, top + 0.68f, 1.55f), new Vector3(-30, 0, 0), Vector3.one, dish);
            // legs: main strut from the upper hull corner and a lower brace, both to a round footpad
            foreach (float sx in new[] { -1f, 1f })
                foreach (float sz in new[] { -1f, 1f })
                {
                    var pad = new Vector3(sx * 2.35f, 0.07f, sz * 2.35f - 0.25f);
                    Bar(root, new Vector3(sx * 1.55f, CFloor + 0.9f, sz * 1.7f - 0.25f), pad + Vector3.up * 0.05f, 0.14f, panel);
                    Bar(root, new Vector3(sx * 1.5f, CFloor - 0.05f, sz * 0.9f - 0.25f), pad + Vector3.up * 0.05f, 0.09f, dark);
                    Part(PrimitiveType.Cylinder, root, pad, new Vector3(0.62f, 0.05f, 0.62f), Vector3.zero, panel);
                }
            // descent engines under the floor, with plumes (unlit, ILLUSTRATIVE)
            var plumeMat = new Material(lineMaterial) { name = "plume" }; plumeMat.SetColor("_BaseColor", new Color(1f, 0.62f, 0.28f));
            if (_siteMode) _siteOwned.Add(plumeMat);
            var cone = ConeMesh(14);
            if (_siteMode) _siteOwned.Add(cone);
            _plumes.Clear();
            foreach (float sx in new[] { -0.85f, 0.85f })
                foreach (float sz in new[] { -1.2f, 0.7f })
                {
                    Part(PrimitiveType.Cylinder, root, new Vector3(sx, CFloor - 0.32f, sz), new Vector3(0.36f, 0.18f, 0.36f), Vector3.zero, dark);
                    var pl = MeshPart(cone, root, new Vector3(sx, CFloor - 0.5f, sz), Vector3.zero, new Vector3(0.42f, 1f, 0.42f), plumeMat);
                    pl.GetComponent<MeshRenderer>().shadowCastingMode = ShadowCastingMode.Off;
                    _plumes.Add(pl.transform);
                }
            // the ramp = the bay door, hinged at the rear edge of the floor
            _carrierRamp = new GameObject("ramp (bay door)").transform;
            _carrierRamp.SetParent(root, false);
            _carrierRamp.localPosition = new Vector3(0, CFloor, CHingeZ);
            Part(PrimitiveType.Cube, _carrierRamp, new Vector3(0, 0.04f, -CRampLen / 2), new Vector3(2.75f, 0.1f, CRampLen), Vector3.zero, panel);
            Part(PrimitiveType.Cube, _carrierRamp, new Vector3(-1.32f, 0.12f, -CRampLen / 2), new Vector3(0.1f, 0.14f, CRampLen), Vector3.zero, dark);
            Part(PrimitiveType.Cube, _carrierRamp, new Vector3(1.32f, 0.12f, -CRampLen / 2), new Vector3(0.1f, 0.14f, CRampLen), Vector3.zero, dark);
            for (int i = 1; i <= 5; i++)
                Part(PrimitiveType.Cube, _carrierRamp, new Vector3(0, 0.1f, -i * CRampLen / 6f), new Vector3(2.5f, 0.03f, 0.06f), Vector3.zero, dark);
            Part(PrimitiveType.Cube, _carrierRamp, new Vector3(0, 0.1f, -CRampLen + 0.08f), new Vector3(2.75f, 0.05f, 0.16f), Vector3.zero, accent);
        }

        /// <summary>unit cone: base radius 1 at y = 0, apex at y = -1 (scaled per frame into a plume)</summary>
        static Mesh ConeMesh(int seg)
        {
            var v = new List<Vector3> { new Vector3(0, -1, 0) };
            var tri = new List<int>();
            for (int i = 0; i <= seg; i++) { float a = i * 2 * Mathf.PI / seg; v.Add(new Vector3(Mathf.Cos(a), 0, Mathf.Sin(a))); }
            for (int i = 1; i <= seg; i++) { tri.Add(0); tri.Add(i); tri.Add(i + 1); tri.Add(0); tri.Add(i + 1); tri.Add(i); }
            var m = new Mesh { name = "plume cone" };
            m.SetVertices(v); m.SetTriangles(tri, 0); m.RecalculateNormals(); m.RecalculateBounds();
            return m;
        }
    }
}
