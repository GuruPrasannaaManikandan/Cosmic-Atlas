using System;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using UnityEngine;

namespace CosmicAtlas.Rendering.Mars
{
    /// <summary>Who drives the camera. Flythrough = the Stage 2 benchmark path (standalone prototype page).</summary>
    public enum ExplorerMode { Flythrough, Arrival, Explore, Inspect, Replay, Paused }

    /// <summary>
    /// Stage 3: the Victoria scene as an explorable part of Cosmic Atlas (embedded in the React app).
    ///
    /// What is sourced and what is not:
    /// - terrain, the Sun (Mars24) and Opportunity's positions along its recorded traverse are the Stage 2 data;
    /// - gravity 3.73 m/s² is the NSSDCA mean value (the same value the web app's planets.ts uses);
    /// - the expedition rover the user drives is an ILLUSTRATIVE vehicle (not a NASA design), and its speeds,
    ///   acceleration and slope limit are gameplay tuning (Opportunity itself drove at centimetres per second);
    /// - the arrival descent is an ILLUSTRATIVE camera move, not a reconstruction of any real entry, descent and landing.
    ///
    /// Input never comes from Unity's own keyboard handling: the host's input manager publishes the axes (MarsBridge.jslib).
    /// </summary>
    public sealed partial class MarsPrototype
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        [DllImport("__Internal")] static extern void MarsGetInput(float[] buf, int n);
#else
        /// <summary>editor / test stand-in for the host's input: [moveX, moveY, lookX, lookY, sprint, dragX, dragY, zoom]</summary>
        public static readonly float[] EditorInput = new float[8];
        static void MarsGetInput(float[] buf, int n) { for (int i = 0; i < n; i++) buf[i] = i < EditorInput.Length ? EditorInput[i] : 0; }
#endif
        const float G = 3.73f;                    // m/s², NSSDCA Mars fact sheet (mean)
        const float GravityGameplayScale = 0.5f;  // ILLUSTRATIVE: slopes slow the rover by half the real along-slope pull
        const float MaxSlopeDeg = 32f;            // ILLUSTRATIVE slope limit for the expedition rover
        const float OppRadius = 1.35f, PlayerRadius = 1.6f;

        ExplorerMode _mode = ExplorerMode.Flythrough, _modeBeforePause = ExplorerMode.Explore;
        bool _embedded;
        readonly float[] _in = new float[8];

        // route (Stage 2 data, locally registered)
        int[] _routeSol; float[] _routeE, _routeN; float[] _routeU;
        Vector3 _sceneRoverPos; Quaternion _sceneRoverRot; int _sceneRouteIndex;

        // player (expedition rover)
        GameObject _player; Transform[] _wheels; Transform[] _wheelSpin; Transform _body;
        Vector2 _pos, _startPos; float _heading, _startHeading, _speed, _bodyY, _pitch, _roll, _spin;
        readonly float[] _susp = new float[6];
        bool _blocked;
        static readonly Vector2[] WheelXZ = { new Vector2(-0.98f, 1.0f), new Vector2(-0.98f, 0f), new Vector2(-0.98f, -1.0f), new Vector2(0.98f, 1.0f), new Vector2(0.98f, 0f), new Vector2(0.98f, -1.0f) };
        const float WheelR = 0.38f;

        // camera
        float _camYaw, _camYawOffset, _camPitch = 0.24f, _camDist = 7.5f;
        Vector3 _camPos, _camLook; bool _camInit;

        // arrival
        float _arrivalT; const float ArrivalDur = 9f; bool _arrivalDone;

        // inspection
        float _insYaw = 0.6f, _insPitch = 0.35f, _insDist = 5f; string _insAnchor = "whole";
        Vector3 _anchorMast, _anchorBody, _anchorMobility, _anchorSolar;
        Material _solarMat, _mobilityMat; Color _solarCol, _mobilityCol;

        // replay
        float _replaySol, _replayShownSol = -1; int _replaySunSol = -1; bool _replayTrail;
        float _repYaw = 0f;

        // discovery
        bool _discovered;
        const float NoticeM = 45f, InteractM = 7f;

        // traverse overlay (terrain detail map)
        Texture2D _trail; Color32[] _trailPx; int _trailW, _trailH; float _trailApplyTimer; bool _trailDirty; int _trailUpTo = -1; bool _trailVisible = true;

        float _poseTimer;

        // ------------------------------------------------------------------ setup

        void InitExplorer()
        {
            // replay parameter: sol + rank within that sol's drive records (monotonic along the traverse)
            int n = _routeSol.Length;
            _routeU = new float[n];
            for (int i = 0; i < n;)
            {
                int j = i; while (j < n && _routeSol[j] == _routeSol[i]) j++;
                for (int k = i; k < j; k++) _routeU[k] = _routeSol[i] + (k - i) / (float)(j - i);
                i = j;
            }

            // anchors on the NASA model (its own mesh groups): mast head = highest vertices; solar array and mobility
            // system = the model's "SolarArrays" and "LightGrayMetal" (y < 0.31 m) material groups
            if (_merGroups != null) MerAnchors(); else LowPolyAnchors();
            cam.fieldOfView = 50f;

            // expedition landing point: 110 m outward from the crater centre beyond Opportunity, on valid DTM
            InitStart();
        }

        void LowPolyAnchors()
        {
            var top = Vector3.zero; int tn = 0; var b = new Bounds(); bool first = true;
            foreach (var mf in _rover.GetComponentsInChildren<MeshFilter>())
            {
                var bb = mf.sharedMesh.bounds;
                if (first) { b = bb; first = false; } else b.Encapsulate(bb);
                var mr = mf.GetComponent<MeshRenderer>();
                if (mf.name == "SolarArrays") { _anchorSolar = bb.center; _solarMat = mr.sharedMaterial; _solarCol = _solarMat.GetColor("_BaseColor"); }
                if (mf.name == "LightGrayMetal") { _anchorMobility = bb.center; _mobilityMat = mr.sharedMaterial; _mobilityCol = _mobilityMat.GetColor("_BaseColor"); }
            }
            foreach (var mf in _rover.GetComponentsInChildren<MeshFilter>())
                foreach (var v in mf.sharedMesh.vertices) if (v.y > b.max.y - 0.12f) { top += v; tn++; }
            _anchorMast = tn > 0 ? top / tn : b.center + Vector3.up * b.extents.y;
            _anchorBody = b.center;
            _anchorArm = _anchorHga = _anchorBody;
        }

        void InitStart()
        {
            var opp = new Vector2(_roverPos.x, _roverPos.z);
            var outward = opp.sqrMagnitude > 1 ? opp.normalized : Vector2.up;
            _startPos = opp + outward * 110f;
            for (int i = 0; i < 40 && !Contact(_startPos, 0, out _, out _, out _); i++) _startPos -= outward * 5f;
            var toOpp = opp - _startPos;
            _startHeading = Mathf.Atan2(toOpp.x, toOpp.y);
            _pos = _startPos; _heading = _startHeading; _camYaw = _heading;

            _player = BuildExpeditionRoverDetailed();
            _player.SetActive(false);
            Contact(_pos, _heading, out _bodyY, out _pitch, out _roll);

            BuildTrail();
        }

        GameObject BuildExpeditionRover()
        {
            var root = new GameObject("Expedition rover (ILLUSTRATIVE vehicle, not a NASA design)");
            root.transform.SetParent(_world, false);
            _body = new GameObject("body").transform; _body.SetParent(root.transform, false);
            Material M(Color c, float metal, float smooth)
            {
                var m = new Material(roverTemplate); m.SetColor("_BaseColor", c); m.SetFloat("_Metallic", metal); m.SetFloat("_Smoothness", smooth); return m;
            }
            var white = M(new Color(0.86f, 0.86f, 0.83f), 0f, 0.35f);
            var dark = M(new Color(0.09f, 0.09f, 0.1f), 0.1f, 0.25f);
            var panel = M(new Color(0.05f, 0.07f, 0.16f), 0.5f, 0.7f);
            var metal = M(new Color(0.6f, 0.61f, 0.63f), 0.85f, 0.5f);
            var accent = M(new Color(0.85f, 0.4f, 0.1f), 0f, 0.4f);
            Part(PrimitiveType.Cube, _body, new Vector3(0, 0.82f, 0), new Vector3(1.55f, 0.42f, 2.5f), Vector3.zero, white);
            Part(PrimitiveType.Cube, _body, new Vector3(0, 1.07f, -0.15f), new Vector3(1.85f, 0.05f, 2.0f), Vector3.zero, panel);
            Part(PrimitiveType.Cube, _body, new Vector3(0, 0.8f, 1.26f), new Vector3(1.45f, 0.16f, 0.04f), Vector3.zero, accent);
            Part(PrimitiveType.Cylinder, _body, new Vector3(0.5f, 1.45f, 1.0f), new Vector3(0.08f, 0.38f, 0.08f), Vector3.zero, metal);
            Part(PrimitiveType.Cube, _body, new Vector3(0.5f, 1.88f, 1.0f), new Vector3(0.42f, 0.15f, 0.16f), Vector3.zero, white);
            Part(PrimitiveType.Cube, _body, new Vector3(0.5f, 1.88f, 1.09f), new Vector3(0.34f, 0.08f, 0.02f), Vector3.zero, dark);
            Part(PrimitiveType.Cylinder, _body, new Vector3(-0.45f, 1.32f, 0.7f), new Vector3(0.55f, 0.015f, 0.55f), new Vector3(20, 0, 0), white);
            _wheels = new Transform[6]; _wheelSpin = new Transform[6];
            for (int i = 0; i < 6; i++)
            {
                var w = new GameObject("wheel" + i).transform; w.SetParent(root.transform, false);
                w.localPosition = new Vector3(WheelXZ[i].x, WheelR, WheelXZ[i].y);
                var spin = new GameObject("spin").transform; spin.SetParent(w, false);
                Part(PrimitiveType.Cylinder, spin, Vector3.zero, new Vector3(WheelR * 2, 0.13f, WheelR * 2), new Vector3(0, 0, 90), dark);
                Part(PrimitiveType.Cube, spin, Vector3.zero, new Vector3(0.27f, 0.08f, WheelR * 1.6f), Vector3.zero, metal); // hub spoke (shows rotation)
                _wheels[i] = w; _wheelSpin[i] = spin;
                // rocker / bogie link from the body side to the wheel (visual)
                Part(PrimitiveType.Cube, _body, new Vector3(WheelXZ[i].x * 0.93f, 0.6f, WheelXZ[i].y * 0.92f), new Vector3(0.06f, 0.5f, 0.06f), Vector3.zero, metal);
            }
            Part(PrimitiveType.Cube, _body, new Vector3(-0.93f, 0.72f, 0), new Vector3(0.07f, 0.07f, 2.1f), Vector3.zero, metal);
            Part(PrimitiveType.Cube, _body, new Vector3(0.93f, 0.72f, 0), new Vector3(0.07f, 0.07f, 2.1f), Vector3.zero, metal);
            return root;
        }

        static Mesh _cube, _cylinder;

        /// <summary>
        /// A visual-only part from Unity's built-in primitive meshes. Not CreatePrimitive: that adds colliders, and the
        /// physics module is stripped from this player (it logged "CapsuleCollider doesn't exist" for every cylinder).
        /// </summary>
        static void Part(PrimitiveType t, Transform parent, Vector3 pos, Vector3 scale, Vector3 euler, Material m)
        {
            if (!_cube) _cube = Resources.GetBuiltinResource<Mesh>("Cube.fbx");
            if (!_cylinder) _cylinder = Resources.GetBuiltinResource<Mesh>("Cylinder.fbx");
            var go = new GameObject(t.ToString());
            go.AddComponent<MeshFilter>().sharedMesh = t == PrimitiveType.Cylinder ? _cylinder : _cube;
            go.AddComponent<MeshRenderer>();
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos; go.transform.localScale = scale; go.transform.localRotation = Quaternion.Euler(euler);
            var r = go.GetComponent<MeshRenderer>(); r.sharedMaterial = m; r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.On;
        }

        // ------------------------------------------------------------------ terrain contact

        /// <summary>
        /// Six wheel contacts on the DTM for a pose. False when any wheel would leave the measured terrain (no-data
        /// cells are never driven on). Outputs the body height and the pitch / roll of the plane through the wheels.
        /// </summary>
        bool Contact(Vector2 p, float heading, out float bodyY, out float pitch, out float roll)
        {
            float c = Mathf.Cos(heading), s = Mathf.Sin(heading);
            float sum = 0, front = 0, rear = 0, left = 0, right = 0;
            bodyY = pitch = roll = 0;
            for (int i = 0; i < 6; i++)
            {
                var w = WheelXZ[i];
                float x = p.x + w.x * c + w.y * s, z = p.y - w.x * s + w.y * c;
                float h = _terrain.Sample(x, z);
                if (float.IsNaN(h)) return false;
                _wheelH[i] = h;
                sum += h;
                if (w.y > 0.5f) front += h; else if (w.y < -0.5f) rear += h;
                if (w.x < 0) left += h; else right += h;
            }
            bodyY = sum / 6f;
            pitch = Mathf.Atan2(front / 2 - rear / 2, 2.0f);
            roll = Mathf.Atan2(left / 3 - right / 3, 1.96f);
            return true;
        }
        readonly float[] _wheelH = new float[6];

        static float WrapPi(float a) { while (a > Mathf.PI) a -= 2 * Mathf.PI; while (a < -Mathf.PI) a += 2 * Mathf.PI; return a; }

        void StepVehicle(float dt, float mx, float my, bool sprint)
        {
            float vmax = sprint ? 5f : 3f, vrev = 1.5f, accel = 1.6f, brake = 4f, drag = 1.2f;
            if (my > 0.01f) _speed += (_speed < -0.05f ? brake : accel) * my * dt;
            else if (my < -0.01f) _speed += (_speed > 0.05f ? brake : accel) * my * dt;
            else _speed = Mathf.MoveTowards(_speed, 0, drag * dt);
            if (Mathf.Abs(my) > 0.01f || Mathf.Abs(_speed) > 0.05f) _speed -= GravityGameplayScale * G * Mathf.Sin(_pitch) * dt;
            _speed = Mathf.Clamp(_speed, -vrev, vmax);

            // skid steering: the rover can pivot slowly in place; turning reverses with the direction of travel
            float dir = _speed < -0.05f ? -1f : 1f;
            float yawRate = mx * 0.85f * dir * Mathf.Lerp(0.6f, 1f, Mathf.Clamp01(Mathf.Abs(_speed) / 1.5f));
            float nh = _heading + yawRate * dt;
            var np = _pos + new Vector2(Mathf.Sin(nh), Mathf.Cos(nh)) * (_speed * dt);
            _blocked = false;
            if (!Contact(np, nh, out var by, out var bp, out var br) || TooSteep(bp, br) || HitsOpportunity(np))
            {
                _blocked = Mathf.Abs(_speed) > 0.05f;
                _speed = 0;
                // still allow turning on the spot when that pose is valid
                if (Contact(_pos, nh, out by, out bp, out br) && !TooSteep(bp, br)) { _heading = nh; Settle(by, bp, br, dt); }
                else Contact(_pos, _heading, out by, out bp, out br);
                Settle(by, bp, br, dt);
                return;
            }
            _pos = np; _heading = WrapPi(nh);
            _spin += _speed * dt / WheelR;
            Settle(by, bp, br, dt);
        }

        bool TooSteep(float pitch, float roll)
        {
            float lim = MaxSlopeDeg * Mathf.Deg2Rad;
            // a slope beyond the limit only blocks a move that makes it steeper (the rover can always drive out)
            return (Mathf.Abs(pitch) > lim && Mathf.Abs(pitch) > Mathf.Abs(_pitch) + 1e-4f) || (Mathf.Abs(roll) > lim && Mathf.Abs(roll) > Mathf.Abs(_roll) + 1e-4f);
        }

        bool HitsOpportunity(Vector2 p)
        {
            if (_siteMode) return HitsHardware(p, PlayerRadius);
            var o = new Vector2(_rover.transform.localPosition.x, _rover.transform.localPosition.z);
            float d = (p - o).magnitude, d0 = (_pos - o).magnitude;
            return d < OppRadius + PlayerRadius && d < d0;
        }

        void Settle(float bodyY, float pitch, float roll, float dt)
        {
            // suspension: the body follows the wheel plane through a damped spring; each wheel keeps ground contact
            float k = 1 - Mathf.Exp(-dt * 9f);
            _bodyY += (bodyY - _bodyY) * k; _pitch += (pitch - _pitch) * k; _roll += (roll - _roll) * k;
            float c = Mathf.Cos(_heading), s = Mathf.Sin(_heading);
            for (int i = 0; i < 6; i++)
            {
                var w = WheelXZ[i];
                float plane = _bodyY + Mathf.Tan(_pitch) * w.y + Mathf.Tan(_roll) * -w.x;
                float x = _pos.x + w.x * c + w.y * s, z = _pos.y - w.x * s + w.y * c;
                float h = _terrain.Sample(x, z);
                _susp[i] = float.IsNaN(h) ? 0 : Mathf.Clamp(h - plane, -0.22f, 0.22f);
            }
        }

        void PlacePlayer()
        {
            var t = _player.transform;
            t.localPosition = new Vector3(_pos.x, _bodyY, _pos.y);
            t.localRotation = Quaternion.Euler(-_pitch * Mathf.Rad2Deg, _heading * Mathf.Rad2Deg, -_roll * Mathf.Rad2Deg);
            for (int i = 0; i < 6; i++)
            {
                _wheels[i].localPosition = new Vector3(WheelXZ[i].x, WheelR + _susp[i], WheelXZ[i].y);
                _wheelSpin[i].localRotation = Quaternion.Euler(_spin * Mathf.Rad2Deg, 0, 0);
            }
        }

        // ------------------------------------------------------------------ per frame

        void ExplorerUpdate(float dt)
        {
            MarsGetInput(_in, _in.Length);
            float mx = _in[0], my = _in[1];
            bool sprint = _in[4] > 0.5f;
            switch (_mode)
            {
                case ExplorerMode.Arrival:
                    _arrivalT += dt;
                    if (_arrivalT >= ArrivalDur && !_arrivalDone) FinishArrival();
                    break;
                case ExplorerMode.Explore:
                    StepVehicle(dt, mx, my, sprint);
                    LookExplore(dt);
                    CheckDiscovery();
                    break;
                case ExplorerMode.Inspect:
                    _insYaw += _in[2] * 1.8f * dt + _in[5] * 0.006f;
                    _insPitch = Mathf.Clamp(_insPitch - (_in[3] * 1.2f) * dt - _in[6] * 0.005f, -0.1f, 1.35f);
                    _insDist = Mathf.Clamp(_insDist * (1 + _in[7] * 0.1f), 1.6f, 14f);
                    PulseHighlight();
                    break;
                case ExplorerMode.Replay:
                    _repYaw += (_in[2] * 1.8f) * dt + _in[5] * 0.006f;
                    _camPitch = Mathf.Clamp(_camPitch - _in[3] * 1.2f * dt - _in[6] * 0.005f, -0.15f, 1.3f);
                    _camDist = Mathf.Clamp(_camDist * (1 + _in[7] * 0.1f), 3f, 40f);
                    break;
            }
            if (_player.activeSelf) PlacePlayer();
            UpdateTrail(dt);
            _poseTimer += dt;
            if (_poseTimer >= 0.1f) { _poseTimer = 0; Report("pose", PoseJson()); }
        }

        void LookExplore(float dt)
        {
            // arrows (and mouse drag) turn the camera ONLY; the chase camera follows the rover's heading plus this offset
            _camYawOffset = WrapPi(_camYawOffset + _in[2] * 1.8f * dt + _in[5] * 0.006f);
            _camPitch = Mathf.Clamp(_camPitch - _in[3] * 1.2f * dt - _in[6] * 0.005f, -0.15f, 1.25f);
            _camDist = Mathf.Clamp(_camDist * (1 + _in[7] * 0.1f), 4f, 30f);
        }

        void CheckDiscovery()
        {
            float d = DistToOpp();
            if (!_discovered && d < NoticeM) { _discovered = true; Report("discovered", "{\"id\":\"opportunity-rover\"}"); }
        }

        float DistToOpp() => (new Vector2(_rover.transform.localPosition.x, _rover.transform.localPosition.z) - _pos).magnitude;

        Vector3 Orbit(Vector3 pivot, float yaw, float pitch, float dist)
        {
            var fwd = new Vector3(Mathf.Sin(yaw) * Mathf.Cos(pitch), -Mathf.Sin(pitch), Mathf.Cos(yaw) * Mathf.Cos(pitch));
            var p = pivot - fwd * dist;
            float g = _terrain.Sample(p.x, p.z);
            if (!float.IsNaN(g) && p.y < g + 0.7f) p.y = g + 0.7f; // never below the ground
            return p;
        }

        void ExplorerLateUpdate()
        {
            float dt = Mathf.Min(Time.deltaTime, 0.1f);
            Vector3 pos, look;
            var pivot = new Vector3(_pos.x, _bodyY + 1.3f, _pos.y);
            switch (_mode)
            {
                case ExplorerMode.Arrival:
                {
                    float u = Mathf.Clamp01(_arrivalT / ArrivalDur);
                    float e = 1 - Mathf.Pow(1 - u, 3);
                    float dist = Mathf.Exp(Mathf.Lerp(Mathf.Log(700f), Mathf.Log(_camDist), e));
                    float pitch = Mathf.Lerp(1.52f, _camPitch, Mathf.SmoothStep(0, 1, u));
                    float yaw = _heading + Mathf.Lerp(1.4f, 0f, e);
                    // the rover is lowered for the last third (ILLUSTRATIVE): it settles onto the terrain at touchdown
                    float drop = Mathf.SmoothStep(30f, 0f, Mathf.InverseLerp(0.45f, 0.82f, u));
                    _player.transform.localPosition = new Vector3(_pos.x, _bodyY + drop, _pos.y);
                    pos = Orbit(pivot, yaw, pitch, dist); look = pivot;
                    _camYaw = yaw;
                    SetCamera(pos, look, 1f);
                    return;
                }
                case ExplorerMode.Inspect:
                {
                    var anchor = _rover.transform.TransformPoint(AnchorLocal()) - _world.position; // world-frame (site) point
                    look = anchor;
                    pos = Orbit(anchor, _rover.transform.localEulerAngles.y * Mathf.Deg2Rad + _insYaw, _insPitch, _insDist);
                    SetCamera(pos, look, 1 - Mathf.Exp(-dt * 5f));
                    return;
                }
                case ExplorerMode.Replay:
                {
                    var rp = _rover.transform.localPosition;
                    var rpivot = rp + Vector3.up * 1.0f;
                    float ry = _rover.transform.localEulerAngles.y * Mathf.Deg2Rad + Mathf.PI / 2; // model +X is its long axis
                    float k = 1 - Mathf.Exp(-dt * 2f);
                    _camYaw = _camYaw + WrapPi(ry + _repYaw - _camYaw) * k;
                    pos = Orbit(rpivot, _camYaw, _camPitch, _camDist); look = rpivot;
                    // the rover can cover tens of metres a second at high replay rates: always look straight at it
                    SetCamera(pos, look, 1 - Mathf.Exp(-dt * 10f), 1f);
                    return;
                }
                default:
                {
                    float k = 1 - Mathf.Exp(-dt * 4f);
                    _camYaw = _camYaw + WrapPi(_heading + _camYawOffset - _camYaw) * k;
                    pos = Orbit(pivot, _camYaw, _camPitch, _camDist); look = pivot;
                    SetCamera(pos, look, _mode == ExplorerMode.Paused ? 0 : 1 - Mathf.Exp(-dt * 12f));
                    return;
                }
            }
        }

        void SetCamera(Vector3 pos, Vector3 look, float blend, float lookBlend = -1)
        {
            if (!_camInit) { _camPos = pos; _camLook = look; _camInit = true; }
            _camPos = Vector3.Lerp(_camPos, pos, blend); _camLook = Vector3.Lerp(_camLook, look, lookBlend < 0 ? blend : lookBlend);
            var flat = new Vector3(_camPos.x - _origin.x, 0, _camPos.z - _origin.z);
            if (flat.magnitude > 1000f) { _origin = new Vector3(_camPos.x, 0, _camPos.z); _rebases++; }
            _world.position = -_origin;
            cam.transform.position = _camPos - _origin;
            var d = _camLook - _camPos;
            if (d.sqrMagnitude > 1e-6f) cam.transform.rotation = Quaternion.LookRotation(d.normalized);
            _rocks?.Draw(_camPos, _origin, true, cam.transform.forward);
        }

        Vector3 AnchorLocal()
        {
            switch (_insAnchor)
            {
                case "mast": return _anchorMast;
                case "solar": return _anchorSolar;
                case "mobility": return _anchorMobility;
                case "arm": return _anchorArm;
                case "hga": return _anchorHga;
                case "body": return _anchorBody;
                default: return _anchorBody;
            }
        }

        void PulseHighlight()
        {
            float p = 0.5f + 0.5f * Mathf.Sin(Time.time * 4f);
            if (_merGroups != null) { MerHighlight(_insAnchor, p); return; }
            var hi = new Color(0.35f, 0.85f, 1f);
            if (_solarMat) _solarMat.SetColor("_BaseColor", _insAnchor == "solar" ? Color.Lerp(_solarCol, hi, 0.25f + 0.45f * p) : _solarCol);
            if (_mobilityMat) _mobilityMat.SetColor("_BaseColor", _insAnchor == "mobility" ? Color.Lerp(_mobilityCol, hi, 0.25f + 0.45f * p) : _mobilityCol);
        }

        void ClearHighlight()
        {
            if (_merGroups != null) { MerHighlight(null, -1); return; }
            if (_solarMat) _solarMat.SetColor("_BaseColor", _solarCol);
            if (_mobilityMat) _mobilityMat.SetColor("_BaseColor", _mobilityCol);
        }

        // ------------------------------------------------------------------ replay along the recorded traverse

        void SetRoverAtSol(float sol)
        {
            int n = _routeU.Length;
            int i = Array.BinarySearch(_routeU, sol);
            if (i < 0) i = ~i - 1;
            i = Mathf.Clamp(i, 0, n - 1);
            int j = Mathf.Min(i + 1, n - 1);
            float t = j == i ? 0 : Mathf.Clamp01((sol - _routeU[i]) / Mathf.Max(1e-4f, _routeU[j] - _routeU[i]));
            // hold the end-of-sol position for the rest of a sol (records are drives, not the rover's whole day)
            if (j > i && _routeSol[j] != _routeSol[i]) t = 0;
            float e = Mathf.Lerp(_routeE[i], _routeE[j], t), nn = Mathf.Lerp(_routeN[i], _routeN[j], t);
            var p = new Vector3(e, SafeHeight(e, nn), nn);
            _rover.transform.localPosition = p;
            SpinMerWheels(p);
            int a = Mathf.Max(0, i - 1), b = Mathf.Min(n - 1, i + 2);
            var dir = new Vector3(_routeE[b] - _routeE[a], 0, _routeN[b] - _routeN[a]);
            if (dir.sqrMagnitude > 0.04f) _rover.transform.localRotation = Quaternion.Slerp(_rover.transform.localRotation, Quaternion.LookRotation(Vector3.Cross(dir.normalized, Vector3.up)), 0.25f);
            _trailUpTo = i;
            int s = Mathf.FloorToInt(sol);
            if (s != _replaySunSol) { _replaySunSol = s; _utc = UtcForSol(s); _sol = s; ApplySun(); }
        }

        /// <summary>UTC of an illustrative 14:00 local true solar time on a mission sol (same convention as the scene).</summary>
        DateTime UtcForSol(int sol)
        {
            var d = Landing.AddDays((sol - 1) * 1.0274912517).Date;
            var utc = MarsTime.UtcForLtst(d, _siteLon, SceneLtst);
            for (int k = 0; k < 4; k++)
            {
                int m = MissionSol(utc);
                if (m == sol) break;
                utc = MarsTime.UtcForLtst(utc.AddDays(sol > m ? 1 : -1).Date, _siteLon, SceneLtst);
            }
            return utc;
        }

        // ------------------------------------------------------------------ traverse overlay

        // Traverse overlay at 2 m per texel (a navigation aid): painted INCREMENTALLY — the replay only stamps the drive
        // segments it has newly reached; a full repaint happens only when the replay seeks backwards or returns to the
        // present — and uploaded at most twice a second (the first version repainted 2.2 Mpx ~30x a second: 37 fps).
        const int TrailCell = 2;
        int _paintedUpTo = -1;
        bool _paintFade = true;

        void BuildTrail()
        {
            _trailW = (_terrain.Width + TrailCell - 1) / TrailCell; _trailH = (_terrain.Height + TrailCell - 1) / TrailCell;
            _trail = new Texture2D(_trailW, _trailH, TextureFormat.RGB24, true, true) { name = "Traverse overlay", wrapMode = TextureWrapMode.Clamp, anisoLevel = 4 };
            _trailPx = new Color32[_trailW * _trailH];
            terrainMaterial.SetTexture("_DetailAlbedoMap", _trail);
            terrainMaterial.SetFloat("_DetailAlbedoMapScale", 3f);
            _trailUpTo = _routeE.Length - 1;
            PaintTrail(present: true);
        }

        /// <summary>present = the full traverse with the fade toward today's rover position; otherwise the replay's progress</summary>
        void PaintTrail(bool present)
        {
            bool full = present || _trailUpTo < _paintedUpTo || _paintFade != present;
            if (full)
            {
                var neutral = new Color32(128, 128, 128, 255);
                for (int i = 0; i < _trailPx.Length; i++) _trailPx[i] = neutral;
                _paintedUpTo = 0; _paintFade = present;
            }
            if (_trailVisible)
            {
                var opp = new Vector2(_rover.transform.localPosition.x, _rover.transform.localPosition.z);
                for (int i = Mathf.Max(1, _paintedUpTo + 1); i <= _trailUpTo && i < _routeE.Length; i++)
                {
                    var a = new Vector2(_routeE[i - 1], _routeN[i - 1]); var b = new Vector2(_routeE[i], _routeN[i]);
                    float len = (b - a).magnitude; if (len > 60f) continue; // a gap in the records, not a drive
                    int steps = Mathf.Max(1, Mathf.CeilToInt(len / 0.8f));
                    for (int k = 0; k <= steps; k++)
                    {
                        var q = Vector2.Lerp(a, b, k / (float)steps);
                        // present: tracks fade out in the last 12 m to the rover, so the overlay never covers the close-up
                        Stamp(q, present ? Mathf.Clamp01(((q - opp).magnitude - 4f) / 12f) : 1f);
                    }
                }
            }
            _paintedUpTo = Mathf.Max(_paintedUpTo, _trailUpTo);
            _trailDirty = true;
        }

        void Stamp(Vector2 p, float w)
        {
            if (w <= 0) return;
            float fc = (p.x - _terrain.East0) / (_terrain.SpacingE * TrailCell), fr = (_terrain.North0 - p.y) / (_terrain.SpacingN * TrailCell);
            int c0 = Mathf.FloorToInt(fc), r0 = Mathf.FloorToInt(fr);
            for (int r = r0 - 1; r <= r0 + 1; r++)
                for (int c = c0 - 1; c <= c0 + 1; c++)
                {
                    if (c < 0 || r < 0 || c >= _trailW || r >= _trailH) continue;
                    float d = Mathf.Sqrt((c + 0.5f - fc) * (c + 0.5f - fc) + (r + 0.5f - fr) * (r + 0.5f - fr));
                    float a = Mathf.Clamp01(1.1f - d) * w; if (a <= 0) continue;
                    int idx = (_trailH - 1 - r) * _trailW + c; // texture rows run south to north
                    var cur = _trailPx[idx];
                    // a subtle navigation aid: about x(1.45, 1.25, 0.85) at the centre of the track
                    byte R = (byte)Mathf.Max(cur.r, Mathf.Lerp(128, 148, a)), Gc = (byte)Mathf.Max(cur.g, Mathf.Lerp(128, 138, a)), B = (byte)Mathf.Min(cur.b, Mathf.Lerp(128, 119, a));
                    _trailPx[idx] = new Color32(R, Gc, B, 255);
                }
        }

        void UpdateTrail(float dt)
        {
            if (_mode == ExplorerMode.Replay && _replayTrail && _trailUpTo != _paintedUpTo) PaintTrail(present: false);
            _trailApplyTimer -= dt;
            if (_trailDirty && _trailApplyTimer <= 0)
            {
                _trail.SetPixels32(_trailPx); _trail.Apply(true, false);
                _trailDirty = false; _trailApplyTimer = 0.5f;
            }
        }

        // ------------------------------------------------------------------ reports

        string ExplorerReadyJson()
        {
            var o = _sceneRoverPos;
            return $"\"objects\":[{{\"id\":\"opportunity-rover\",\"x\":{MiniJson.N(o.x)},\"z\":{MiniJson.N(o.z)},\"noticeM\":{MiniJson.N(NoticeM)},\"interactM\":{MiniJson.N(InteractM)},\"routeIndex\":{_sceneRouteIndex},\"sol\":{_routeSol[_sceneRouteIndex]}}}]," +
                   $"\"start\":{{\"x\":{MiniJson.N(_startPos.x)},\"z\":{MiniJson.N(_startPos.y)},\"heading\":{MiniJson.N(_startHeading)}}}," +
                   $"\"route\":{{\"points\":{_routeE.Length},\"firstSol\":{_routeSol[0]},\"lastSol\":{_routeSol[_routeSol.Length - 1]}}}," +
                   $"\"site\":{{\"latDeg\":{MiniJson.N(_siteLat)},\"lonEastDeg\":{MiniJson.N(_siteLon)},\"extentEastM\":[{MiniJson.N(_terrain.East0)},{MiniJson.N(_terrain.East0 + (_terrain.Width - 1) * _terrain.SpacingE)}],\"extentNorthM\":[{MiniJson.N(_terrain.North0 - (_terrain.Height - 1) * _terrain.SpacingN)},{MiniJson.N(_terrain.North0)}]}}," +
                   $"\"trail\":{{\"scaled\":{(terrainMaterial.IsKeywordEnabled("_DETAIL_SCALED") ? "true" : "false")},\"mulx2\":{(terrainMaterial.IsKeywordEnabled("_DETAIL_MULX2") ? "true" : "false")},\"texture\":{MiniJson.Q(terrainMaterial.GetTexture("_DetailAlbedoMap") ? terrainMaterial.GetTexture("_DetailAlbedoMap").name : null)},\"visible\":{(_trailVisible ? "true" : "false")}}}," +
                   $"\"mode\":{MiniJson.Q(_mode.ToString())},\"embedded\":{(_embedded ? "true" : "false")}";
        }

        string PoseJson()
        {
            var r = _rover.transform.localPosition;
            var sb = new StringBuilder("{");
            sb.Append("\"mode\":").Append(MiniJson.Q(_mode.ToString()))
              .Append(",\"x\":").Append(MiniJson.N(_pos.x)).Append(",\"z\":").Append(MiniJson.N(_pos.y))
              .Append(",\"y\":").Append(MiniJson.N(_bodyY))
              .Append(",\"heading\":").Append(MiniJson.N(_heading)).Append(",\"speed\":").Append(MiniJson.N(_speed))
              .Append(",\"pitchDeg\":").Append(MiniJson.N(_pitch * Mathf.Rad2Deg)).Append(",\"rollDeg\":").Append(MiniJson.N(_roll * Mathf.Rad2Deg))
              .Append(",\"blocked\":").Append(_blocked ? "true" : "false")
              .Append(",\"camYaw\":").Append(MiniJson.N(_camYaw)).Append(",\"camYawOffset\":").Append(MiniJson.N(_camYawOffset))
              .Append(",\"camPitch\":").Append(MiniJson.N(_camPitch)).Append(",\"camDist\":").Append(MiniJson.N(_camDist))
              .Append(",\"oppX\":").Append(MiniJson.N(r.x)).Append(",\"oppZ\":").Append(MiniJson.N(r.z))
              .Append(",\"oppDist\":").Append(MiniJson.N(DistToOpp()))
              .Append(",\"near\":").Append(_mode == ExplorerMode.Explore && DistToOpp() < InteractM + PlayerRadius ? "\"opportunity-rover\"" : "null")
              .Append(",\"arrivalT\":").Append(MiniJson.N(_mode == ExplorerMode.Arrival ? _arrivalT / ArrivalDur : 1))
              .Append(",\"sol\":").Append(_sol).Append(",\"replaySol\":").Append(MiniJson.N(_replaySol))
              .Append(",\"utc\":").Append(MiniJson.Q(_utc.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture)))
              .Append(",\"sunElevation\":").Append(MiniJson.N(_sunEl)).Append(",\"sunAzimuth\":").Append(MiniJson.N(_sunAz))
              .Append(",\"camX\":").Append(MiniJson.N(_camPos.x)).Append(",\"camZ\":").Append(MiniJson.N(_camPos.z)).Append(",\"camY\":").Append(MiniJson.N(_camPos.y))
              .Append(",\"rebases\":").Append(_rebases).Append('}');
            return sb.ToString();
        }

        void SetMode(ExplorerMode m)
        {
            if (m == _mode) return;
            var prev = _mode;
            _mode = m;
            if (prev == ExplorerMode.Inspect) { if (_siteMode) SiteHighlight(-1); else ClearHighlight(); }
            if (m != ExplorerMode.Explore) _speed = 0;
            Report("mode", $"{{\"mode\":{MiniJson.Q(m.ToString())},\"prev\":{MiniJson.Q(prev.ToString())}}}");
            Report("pose", _siteMode ? SitePoseJson() : PoseJson());
        }

        void FinishArrival()
        {
            _arrivalDone = true;
            if (!_siteMode || _siteKind == "rover") _player.transform.localPosition = new Vector3(_pos.x, _bodyY, _pos.y);
            SetMode(ExplorerMode.Explore);
            Report("arrived", "{}");
        }

        // ------------------------------------------------------------------ JS -> Unity

        /// <summary>The host app takes over: '{"arrival":true}' plays the arrival descent first.</summary>
        public void Embed(string json)
        {
            if (_siteMode) { if (_siteReady) SiteEmbed(json); else _pendingEmbed = json; return; }
            _embedded = true;
            bool arrival = json != null && json.Contains("\"arrival\":true");
            _player.SetActive(true);
            _camInit = false;
            _arrivalT = 0; _arrivalDone = false;
            SetMode(arrival ? ExplorerMode.Arrival : ExplorerMode.Explore);
            if (!arrival) _arrivalDone = true;
            Report("ready", ReadyJson());
        }

        string _pendingEmbed;

        public void SkipArrival() { if (_mode == ExplorerMode.Arrival) FinishArrival(); }

        /// <summary>'explore' | 'paused' (dialogs, maps, pause menu): paused freezes the rover where it is.</summary>
        public void SetExplorerMode(string m)
        {
            switch ((m ?? "").Trim().ToLowerInvariant())
            {
                case "explore": if (_mode == ExplorerMode.Paused || _mode == ExplorerMode.Inspect) SetMode(_arrivalDone ? ExplorerMode.Explore : ExplorerMode.Arrival); break;
                case "paused": if (_mode == ExplorerMode.Explore || _mode == ExplorerMode.Arrival) { _modeBeforePause = _mode; SetMode(ExplorerMode.Paused); } break;
                case "resume": if (_mode == ExplorerMode.Paused) SetMode(_modeBeforePause); break;
            }
        }

        /// <summary>Inspect Opportunity: anchor = whole | mast | solar | mobility (camera framing; solar and mobility also highlight the model's own part).</summary>
        public void Inspect(string anchor)
        {
            if (_siteMode) { if (_siteReady) SiteInspect(anchor); return; }
            _insAnchor = string.IsNullOrEmpty(anchor) ? "whole" : anchor.Trim().ToLowerInvariant();
            _insDist = _insAnchor == "whole" ? 5f : 2.6f;
            if (_mode != ExplorerMode.Inspect) { _insYaw = 0.6f; _insPitch = 0.35f; SetMode(ExplorerMode.Inspect); }
        }

        /// <summary>Relive Opportunity's Victoria campaign: the rover moves along its recorded drives; the player rover is hidden.</summary>
        public void ReplayStart(string sol)
        {
            if (_siteMode) { Debug.LogWarning("[Mars] no recorded traverse replay for this site"); return; }
            _player.SetActive(false);
            _replayTrail = true; _replayShownSol = -1;
            _repYaw = 0.5f; _camPitch = 0.42f; _camDist = 9f;
            ReplaySol(sol);
            SetMode(ExplorerMode.Replay);
        }

        public void ReplaySol(string sol)
        {
            if (_siteMode) return;
            if (!float.TryParse(sol, NumberStyles.Float, CultureInfo.InvariantCulture, out var s)) return;
            _replaySol = Mathf.Clamp(s, _routeU[0], _routeU[_routeU.Length - 1] + 0.999f);
            SetRoverAtSol(_replaySol);
        }

        /// <summary>Back to the present: Opportunity, the Sun and the full traverse as in the exploration scene.</summary>
        public void ReplayEnd()
        {
            if (_siteMode) { SetMode(ExplorerMode.Explore); return; }
            _rover.transform.localPosition = _sceneRoverPos; _rover.transform.localRotation = _sceneRoverRot;
            _utc = MarsTime.UtcForLtst(SceneDate, _siteLon, SceneLtst); _sol = MissionSol(_utc); _replaySunSol = -1; ApplySun();
            _replayTrail = false; _trailUpTo = _routeE.Length - 1; PaintTrail(present: true); _hasReplayPos = false;
            _player.SetActive(true);
            SetMode(ExplorerMode.Explore);
        }

        /// <summary>
        /// Restore a saved exploration state exactly: {"x","z","heading","camYawOffset","camPitch","camDist","mode"}.
        /// The rover is placed on the terrain at that pose, at rest; the camera snaps (no glide from the replay view).
        /// </summary>
        public void RestoreState(string json)
        {
            if (_siteMode) { if (_siteReady) SiteRestore(json); return; }
            try
            {
                var o = MiniJson.O(MiniJson.Parse(json));
                var p = new Vector2(MiniJson.F(o["x"]), MiniJson.F(o["z"]));
                float h = MiniJson.F(o["heading"]);
                if (!Contact(p, h, out var by, out var bp, out var br)) { Debug.LogWarning("[Mars] restore pose is off the terrain"); return; }
                _pos = p; _heading = h; _speed = 0; _bodyY = by; _pitch = bp; _roll = br;
                Settle(by, bp, br, 1f);
                if (o.TryGetValue("camYawOffset", out var cy)) _camYawOffset = MiniJson.F(cy);
                if (o.TryGetValue("camPitch", out var cp)) _camPitch = MiniJson.F(cp);
                if (o.TryGetValue("camDist", out var cd)) _camDist = MiniJson.F(cd);
                _camYaw = _heading + _camYawOffset;
                _camInit = false;
                _player.SetActive(true);
                PlacePlayer();
                SetMode(ExplorerMode.Explore);
                Report("restored", PoseJson());
            }
            catch (Exception e) { Debug.LogWarning("[Mars] bad restore state: " + e.Message); }
        }

        public void SetTraverse(string on)
        {
            if (_siteMode) return;
            _trailVisible = on != "0";
            PaintTrail(present: _mode != ExplorerMode.Replay);
        }
    }
}
