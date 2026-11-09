using System;

namespace CosmicAtlas.Astro
{
    /// <summary>Double-precision 3-vector. Operator evaluation order mirrors the TypeScript helpers (add/sub/scale).</summary>
    public readonly struct Vec3d : IEquatable<Vec3d>
    {
        public readonly double X, Y, Z;

        public Vec3d(double x, double y, double z) { X = x; Y = y; Z = z; }

        public static readonly Vec3d Zero = new Vec3d(0, 0, 0);

        public static Vec3d operator +(Vec3d a, Vec3d b) => new Vec3d(a.X + b.X, a.Y + b.Y, a.Z + b.Z);
        public static Vec3d operator -(Vec3d a, Vec3d b) => new Vec3d(a.X - b.X, a.Y - b.Y, a.Z - b.Z);
        public static Vec3d operator -(Vec3d a) => new Vec3d(-a.X, -a.Y, -a.Z);
        public static Vec3d operator *(Vec3d a, double k) => new Vec3d(a.X * k, a.Y * k, a.Z * k);

        public double Length => Math.Sqrt(X * X + Y * Y + Z * Z);

        public static double Dot(Vec3d a, Vec3d b) => a.X * b.X + a.Y * b.Y + a.Z * b.Z;

        public static Vec3d Cross(Vec3d a, Vec3d b) =>
            new Vec3d(a.Y * b.Z - a.Z * b.Y, a.Z * b.X - a.X * b.Z, a.X * b.Y - a.Y * b.X);

        public static Vec3d FromArray(double[] v)
        {
            if (v == null || v.Length != 3) throw new ArgumentException("expected a 3-element array");
            return new Vec3d(v[0], v[1], v[2]);
        }

        public double[] ToArray() => new[] { X, Y, Z };

        public bool Equals(Vec3d o) => X.Equals(o.X) && Y.Equals(o.Y) && Z.Equals(o.Z);
        public override bool Equals(object obj) => obj is Vec3d v && Equals(v);
        public override int GetHashCode() => (X, Y, Z).GetHashCode();
        public override string ToString() => FormattableString.Invariant($"({X:R}, {Y:R}, {Z:R})");
    }

    /// <summary>Row-major 3×3 matrix. <see cref="Mul"/> uses the same summation order as coords.ts mulMat.</summary>
    public readonly struct Mat3d
    {
        public readonly double M00, M01, M02, M10, M11, M12, M20, M21, M22;

        public Mat3d(double m00, double m01, double m02, double m10, double m11, double m12, double m20, double m21, double m22)
        {
            M00 = m00; M01 = m01; M02 = m02;
            M10 = m10; M11 = m11; M12 = m12;
            M20 = m20; M21 = m21; M22 = m22;
        }

        public double this[int r, int c]
        {
            get
            {
                switch (r * 3 + c)
                {
                    case 0: return M00; case 1: return M01; case 2: return M02;
                    case 3: return M10; case 4: return M11; case 5: return M12;
                    case 6: return M20; case 7: return M21; case 8: return M22;
                    default: throw new IndexOutOfRangeException();
                }
            }
        }

        public Vec3d Mul(Vec3d v) => new Vec3d(
            M00 * v.X + M01 * v.Y + M02 * v.Z,
            M10 * v.X + M11 * v.Y + M12 * v.Z,
            M20 * v.X + M21 * v.Y + M22 * v.Z);
    }

    /// <summary>Double-precision quaternion (x, y, z, w). Used only for axis-convention conversions and tests.</summary>
    public readonly struct QuaternionD
    {
        public readonly double X, Y, Z, W;

        public QuaternionD(double x, double y, double z, double w) { X = x; Y = y; Z = z; W = w; }

        public static QuaternionD FromAxisAngle(Vec3d axis, double angleRad)
        {
            double len = axis.Length;
            double s = Math.Sin(angleRad / 2) / len;
            return new QuaternionD(axis.X * s, axis.Y * s, axis.Z * s, Math.Cos(angleRad / 2));
        }

        /// <summary>v' = q v q* (algebraic; independent of handedness).</summary>
        public Vec3d Rotate(Vec3d v)
        {
            var u = new Vec3d(X, Y, Z);
            var t = Vec3d.Cross(u, v) * 2.0;
            return v + t * W + Vec3d.Cross(u, t);
        }
    }
}
