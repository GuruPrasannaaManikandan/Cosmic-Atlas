"""Unit conversions and coordinate helpers. Unknown units raise -- they are never guessed."""
from __future__ import annotations

import math
import re

LY_PER_PC = 3.2615637771674337
LY_PER_AU = 1.5812507409819728e-5

TO_LY = {
    "ly": 1.0, "kly": 1e3, "mly": 1e6, "gly": 1e9,
    "pc": LY_PER_PC, "kpc": LY_PER_PC * 1e3, "mpc": LY_PER_PC * 1e6, "gpc": LY_PER_PC * 1e9,
    "au": LY_PER_AU,
}
UNIT_ALIASES = {
    "lightyear": "ly", "lightyears": "ly", "light-year": "ly", "light-years": "ly", "lyr": "ly", "ly": "ly",
    "parsec": "pc", "parsecs": "pc", "pc": "pc", "kpc": "kpc", "mpc": "mpc", "gpc": "gpc",
    "kly": "kly", "mly": "mly", "gly": "gly", "au": "au",
}

# Galactic (l,b) <-> equatorial J2000 rotation matrix (Hipparcos documentation).
EQ_TO_GAL = [
    [-0.0548755604, -0.8734370902, -0.4838350155],
    [0.4941094279, -0.4448296300, 0.7469822445],
    [-0.8676661490, -0.1980763734, 0.4559837762],
]


def canonical_unit(u: str | None) -> str | None:
    if u is None:
        return None
    return UNIT_ALIASES.get(u.strip().lower())


def to_light_years(value: float, unit: str) -> float:
    cu = canonical_unit(unit)
    if cu is None:
        raise ValueError(f"unknown distance unit: {unit!r}")
    if not math.isfinite(value) or value < 0:
        raise ValueError(f"invalid distance: {value}")
    return value * TO_LY[cu]


def parse_sexagesimal(text: str, is_ra: bool) -> float | None:
    """Parse '05 55 10.3', '05:55:10.3', '5h55m10.3s', '+07 24 25' -> degrees (RA hours are multiplied by 15).
    Returns None if the text is not sexagesimal. Plain decimals are returned as-is (caller decides the unit)."""
    s = str(text).strip()
    if not s:
        return None
    if re.fullmatch(r"[+-]?\d+(\.\d+)?", s):
        return float(s)
    cleaned = re.sub(r"[hdms°:'\"′″]", " ", s, flags=re.I).strip()
    parts = cleaned.split()
    try:
        nums = [float(p) for p in parts]
    except ValueError:
        return None
    if not 2 <= len(nums) <= 3:
        return None
    sign = -1.0 if s.startswith("-") else 1.0
    v = abs(nums[0]) + nums[1] / 60 + (nums[2] / 3600 if len(nums) == 3 else 0)
    return v * 15 if is_ra else sign * v


def looks_sexagesimal(text: str) -> bool:
    s = str(text).strip()
    return bool(re.search(r"[:hms°'\"]| \d", s)) and not re.fullmatch(r"[+-]?\d+(\.\d+)?", s)


def galactic_to_equatorial(l_deg: float, b_deg: float) -> tuple[float, float]:
    l, b = math.radians(l_deg), math.radians(b_deg)
    g = [math.cos(b) * math.cos(l), math.cos(b) * math.sin(l), math.sin(b)]
    # inverse of an orthonormal matrix is its transpose
    e = [sum(EQ_TO_GAL[r][c] * g[r] for r in range(3)) for c in range(3)]
    ra = math.degrees(math.atan2(e[1], e[0])) % 360
    dec = math.degrees(math.asin(max(-1, min(1, e[2]))))
    return ra, dec


def equatorial_to_galactic(ra_deg: float, dec_deg: float) -> tuple[float, float]:
    a, d = math.radians(ra_deg), math.radians(dec_deg)
    v = [math.cos(d) * math.cos(a), math.cos(d) * math.sin(a), math.sin(d)]
    g = [sum(EQ_TO_GAL[r][c] * v[c] for c in range(3)) for r in range(3)]
    return math.degrees(math.atan2(g[1], g[0])) % 360, math.degrees(math.asin(max(-1, min(1, g[2]))))


def comoving_distance_ly(z: float, h0: float = 70.0, om: float = 0.3) -> float:
    """Flat LambdaCDM comoving distance in light-years (numerical integration)."""
    if z < 0:
        raise ValueError("negative redshift")
    c = 299792.458
    n = 400
    dz = z / n
    total = 0.0
    for i in range(n + 1):
        zi = i * dz
        e = math.sqrt(om * (1 + zi) ** 3 + (1 - om))
        w = 1 if i in (0, n) else (4 if i % 2 else 2)
        total += w / e
    dc_mpc = (c / h0) * total * dz / 3
    return dc_mpc * LY_PER_PC * 1e6


def cartesian_to_radec_dist(x: float, y: float, z: float) -> tuple[float, float, float]:
    """Heliocentric Galactic cartesian (X toward GC) -> (ra, dec, distance)."""
    d = math.sqrt(x * x + y * y + z * z)
    if d == 0:
        raise ValueError("zero-length position")
    l = math.degrees(math.atan2(y, x)) % 360
    b = math.degrees(math.asin(z / d))
    ra, dec = galactic_to_equatorial(l, b)
    return ra, dec, d
