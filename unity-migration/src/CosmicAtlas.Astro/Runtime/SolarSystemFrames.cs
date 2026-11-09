using System;
using System.Collections.Generic;

namespace CosmicAtlas.Astro
{
    /// <summary>A position expressed locally in a frame node (km, galactic axes). Blueprint §6.3 rule 2.</summary>
    public readonly struct FramePos
    {
        public readonly string NodeId;
        public readonly Vec3d LocalKm;
        public FramePos(string nodeId, Vec3d localKm) { NodeId = nodeId; LocalKm = localKm; }
        public static FramePos At(string nodeId) => new FramePos(nodeId, Vec3d.Zero);
    }

    /// <summary>
    /// Hierarchical Solar-System frames (blueprint §6.3). Every node shares galactic axis orientation and km units;
    /// nodes differ only by origin, so changing frame is "add the origin offset" — never a rotation.
    ///
    ///   sun ─┬─ &lt;planet&gt; ── &lt;moon of that planet&gt;
    ///        ├─ pluto-barycentre ─┬─ pluto (offset −q/(1+q)·r_Charon)
    ///        │                    ├─ charon (offset 1/(1+q)·r_Charon)
    ///        │                    └─ styx, nix, kerberos, hydra
    ///        └─ heliocentric small bodies (ceres, vesta, eris, …)
    ///
    /// Relative positions are computed in the lowest common ancestor frame, so two nearby objects are never
    /// differenced through a large shared origin. This removes the ~34 km quantisation of the TS root frame (D1).
    /// </summary>
    public sealed class SolarSystemFrames
    {
        public const string Sun = "sun";
        public const string PlutoBarycentre = "pluto-barycentre";

        readonly AstroCatalog _cat;
        readonly Dictionary<string, string> _parent = new Dictionary<string, string>();

        internal SolarSystemFrames(AstroCatalog cat)
        {
            _cat = cat;
            _parent[Sun] = null;
            foreach (var p in cat.Data.PlanetElements.Keys) _parent[p] = Sun;
            _parent[PlutoBarycentre] = Sun;
            foreach (var b in cat.Data.SolarBodies)
            {
                if (b.Id == "pluto") _parent[b.Id] = PlutoBarycentre;
                else if (b.Parent == "pluto") _parent[b.Id] = PlutoBarycentre;
                else if (b.Parent == "sun") _parent[b.Id] = Sun;
                else if (cat.IsPlanet(b.Parent)) _parent[b.Id] = b.Parent;
                else throw new InvalidOperationException("no frame parent for " + b.Id + " (parent " + b.Parent + ")");
            }
        }

        public bool Contains(string nodeId) => _parent.ContainsKey(nodeId);

        public string ParentOf(string nodeId)
        {
            if (!_parent.TryGetValue(nodeId, out var p)) throw new KeyNotFoundException("unknown frame node " + nodeId);
            return p;
        }

        /// <summary>Origin of <paramref name="nodeId"/> expressed in its parent frame (km).</summary>
        public Vec3d OffsetInParentKm(string nodeId, double ms)
        {
            if (nodeId == Sun) return Vec3d.Zero;
            if (_cat.IsPlanet(nodeId)) return PlanetEphemeris.PlanetHeliocentricKm(_cat.PlanetElements(nodeId), ms);
            double q = _cat.CharonPlutoMassRatio;
            if (nodeId == PlutoBarycentre) return Kepler.PositionAtMs(_cat.SolarById["pluto"].Orbit.Elements, ms);
            if (nodeId == "pluto") return Kepler.PositionAtMs(_cat.SolarById["charon"].Orbit.Elements, ms) * (-q / (1 + q));
            if (nodeId == "charon") return Kepler.PositionAtMs(_cat.SolarById["charon"].Orbit.Elements, ms) * (1 / (1 + q));
            return Kepler.PositionAtMs(_cat.SolarById[nodeId].Orbit.Elements, ms);
        }

        /// <summary>Chain from the node up to (and including) the root: [node, parent, …, sun].</summary>
        public List<string> Ancestry(string nodeId)
        {
            var chain = new List<string>();
            for (var n = nodeId; n != null; n = ParentOf(n)) chain.Add(n);
            return chain;
        }

        /// <summary>
        /// Position of <paramref name="p"/> expressed in ancestor frame <paramref name="ancestorId"/> (km).
        /// Offsets are summed from the ancestor downward (outermost first), matching how the TS app composes positions.
        /// </summary>
        public Vec3d PositionInAncestorKm(FramePos p, string ancestorId, double ms)
        {
            var chain = Ancestry(p.NodeId);
            int stop = chain.IndexOf(ancestorId);
            if (stop < 0) throw new ArgumentException(ancestorId + " is not an ancestor of " + p.NodeId);
            var sum = Vec3d.Zero;
            bool first = true;
            for (int i = stop - 1; i >= 0; i--)
            {
                var off = OffsetInParentKm(chain[i], ms);
                sum = first ? off : sum + off;
                first = false;
            }
            return first ? p.LocalKm : (IsZero(p.LocalKm) ? sum : sum + p.LocalKm);
        }

        static bool IsZero(Vec3d v) => v.X == 0 && v.Y == 0 && v.Z == 0;

        public Vec3d HeliocentricKm(string nodeId, double ms) => PositionInAncestorKm(FramePos.At(nodeId), Sun, ms);

        public string LowestCommonAncestor(string a, string b)
        {
            var set = new HashSet<string>(Ancestry(a));
            for (var n = b; n != null; n = ParentOf(n))
                if (set.Contains(n)) return n;
            throw new InvalidOperationException("frames share no ancestor");
        }

        /// <summary>a − b (km), computed in the lowest common ancestor frame (blueprint §6.3 rule 3).</summary>
        public Vec3d RelativeKm(FramePos a, FramePos b, double ms)
        {
            string lca = LowestCommonAncestor(a.NodeId, b.NodeId);
            return PositionInAncestorKm(a, lca, ms) - PositionInAncestorKm(b, lca, ms);
        }

        /// <summary>Root-frame (galactic ly) position, for objects whose lowest common ancestor is the Galaxy.</summary>
        public Vec3d RootLy(FramePos p, double ms) => AstroConstants.SUN_POS + HeliocentricKm(p.NodeId, ms) * AstroConstants.KM_TO_LY
                                                       + p.LocalKm * AstroConstants.KM_TO_LY;
    }
}
