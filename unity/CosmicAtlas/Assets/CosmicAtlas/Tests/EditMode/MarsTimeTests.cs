using System;
using CosmicAtlas.Rendering.Mars;
using NUnit.Framework;

namespace CosmicAtlas.Rendering.Tests
{
    /// <summary>NASA GISS Mars24 worked examples (values as printed on the algorithm page, read 2026-11-10).</summary>
    public class MarsTimeTests
    {
        [Test]
        public void Example1_2000_01_06()
        {
            var t = new MarsTime(new DateTime(2000, 1, 6, 0, 0, 0, DateTimeKind.Utc));
            Assert.AreEqual(2451549.50074, t.JdTT, 1e-5);
            Assert.AreEqual(21.74558, t.M, 1e-4);
            Assert.AreEqual(272.74566, t.AlphaFMS, 1e-4);
            Assert.AreEqual(277.18758, t.Ls, 1e-4);
            Assert.AreEqual(-5.18774, t.EotDeg, 1e-4);
            Assert.AreEqual(23.99425, t.MstH, 1e-4);
            Assert.AreEqual(23.64840, t.LtstHours(0), 1e-4);
            Assert.AreEqual(-25.22825, t.Declination, 1e-4);
            t.Sun(0, 0, out var z, out var az, out _, out _, out _);
            Assert.AreEqual(154.26182, z, 1e-3);
            Assert.AreEqual(191.03905, az, 1e-3);
        }

        [Test]
        public void Example2_SpiritLandingTarget()
        {
            var t = new MarsTime(new DateTime(2004, 1, 3, 13, 46, 31, DateTimeKind.Utc));
            Assert.AreEqual(327.32416, t.Ls, 1e-4);
            Assert.AreEqual(13.16537, t.MstH, 1e-4);
            Assert.AreEqual(0.85190, t.LmstHours(-184.702), 1e-4);
            Assert.AreEqual(0.00025, t.LtstHours(-184.702), 1e-3);
            t.Sun(-14.640, -184.702, out var z, out var az, out _, out _, out var up);
            Assert.AreEqual(151.93895, z, 1e-2); // 0.00065 deg from print; see marsTime.test.ts note
            Assert.AreEqual(179.99383, az, 1e-2);
            Assert.Less(up, 0);
        }

        [Test]
        public void LtstSearchFindsRequestedLocalTime()
        {
            var utc = MarsTime.UtcForLtst(new DateTime(2007, 9, 11), 354.504, 14.0);
            Assert.AreEqual(14.0, new MarsTime(utc).LtstHours(354.504), 0.05);
        }
    }
}
