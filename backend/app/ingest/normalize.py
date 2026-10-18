"""Normalize rows to the canonical schema and classify what can honestly be visualized. Never fabricates positions."""
from __future__ import annotations

import difflib
import math
import re

from .mapping import norm, unit_hint, _num
from .units import (canonical_unit, cartesian_to_radec_dist, comoving_distance_ly, galactic_to_equatorial,
                    looks_sexagesimal, parse_sexagesimal, to_light_years, LY_PER_PC)

# Bundled starter catalogue identities (id -> names, RA/Dec) used for identity resolution.
STARTER = {
    "andromeda": (["Andromeda Galaxy", "M31", "NGC 224", "Andromeda"], 10.6847, 41.2687),
    "m33": (["Triangulum Galaxy", "M33", "NGC 598", "Triangulum"], 23.4621, 30.6602),
    "coma": (["Coma Cluster", "Abell 1656", "A1656"], 194.9531, 27.9806),
    "virgo": (["Virgo Cluster"], 186.6333, 12.7233),
    "carina": (["Carina Nebula", "NGC 3372", "Eta Carinae Nebula"], 161.2658, -59.6844),
    "alnitak": (["Alnitak", "Zeta Orionis", "Zeta Ori", "HD 37742"], 85.1897, -1.9426),
    "alnilam": (["Alnilam", "Epsilon Orionis", "Eps Ori", "HD 37128"], 84.0534, -1.2019),
    "mintaka": (["Mintaka", "Delta Orionis", "Del Ori", "HD 36486"], 83.0017, -0.2991),
    "betelgeuse": (["Betelgeuse", "Alpha Orionis", "Alpha Ori", "HD 39801"], 88.7929, 7.4071),
    "pleiades": (["Pleiades", "M45", "Messier 45", "Seven Sisters"], 56.75, 24.1167),
    "aldebaran": (["Aldebaran", "Alpha Tauri", "Alpha Tau", "HD 29139"], 68.98, 16.5093),
}
ALIAS_INDEX: dict[str, str] = {}
for _id, (_names, _, _) in STARTER.items():
    for _n in _names:
        ALIAS_INDEX[norm(_n)] = _id


def resolve_identity(names: list[str], ra: float | None, dec: float | None) -> tuple[dict | None, list[dict]]:
    """Exact normalised-alias match only. Similar names/positions become *candidates for review*, never merges."""
    for n in names:
        k = norm(n)
        if k and k in ALIAS_INDEX:
            return {"object_id": ALIAS_INDEX[k], "method": "exact-alias", "confidence": 1.0}, []
    cands = []
    for oid, (nms, ora, odec) in STARTER.items():
        best = max((difflib.SequenceMatcher(None, norm(n), norm(m)).ratio() for n in names if n for m in nms), default=0)
        if best >= 0.86:
            cands.append({"object_id": oid, "ratio": round(best, 2), "basis": "similar-name"})
        elif ra is not None and dec is not None and abs(ra - ora) < 0.02 and abs(dec - odec) < 0.02:
            cands.append({"object_id": oid, "ratio": 0.0, "basis": "positional(<0.02°)"})
    return None, sorted(cands, key=lambda c: -c["ratio"])


def _get(row: dict, col: str | None):
    if col is None:
        return None
    v = row.get(col)
    return None if v is None or (isinstance(v, str) and v.strip() == "") else v


def normalize_rows(columns: list[str], rows: list[dict], mapping: list[dict]) -> tuple[list[dict], list[str]]:
    m = {e["field"]: e["source"] for e in mapping if e.get("field")}
    issues: list[str] = []
    ra_col, dec_col = m.get("ra"), m.get("dec")
    ra_hint = unit_hint(ra_col) if ra_col else None
    dist_col = m.get("distance")
    dist_hint = unit_hint(dist_col) if dist_col else None
    if ra_col and not dec_col or dec_col and not ra_col:
        issues.append("Only one of RA/Dec is mapped – sky position is incomplete.")
    if "distance" in m and "distance_unit" not in m and canonical_unit(dist_hint) is None:
        issues.append(f"Distance column '{dist_col}' has no unit in its header or a unit column – distances will NOT be used (units are never guessed).")
    if "redshift" in m and "distance" not in m:
        issues.append("No distance column; redshift-derived distances (flat ΛCDM, H0=70, Ωm=0.3) are assumptions.")
    if ra_col:
        sample = [_num(r.get(ra_col)) for r in rows[:200]]
        sample = [s for s in sample if s is not None]
        if sample and max(sample) <= 24 and ra_hint != "hourangle" and not any(looks_sexagesimal(str(r.get(ra_col))) for r in rows[:20]):
            issues.append(f"All RA values in '{ra_col}' are ≤ 24: if they are hours, mark the column as hours. They are treated as degrees.")

    recs: list[dict] = []
    seen_names: dict[str, int] = {}
    seen_pos: dict[tuple, int] = {}
    for i, row in enumerate(rows):
        reasons: list[str] = []
        name = _get(row, m.get("name")) or _get(row, m.get("id"))
        name = str(name) if name is not None else None
        alts = [a.strip() for a in re.split(r"[;|]", str(_get(row, m.get("alt_names")) or "")) if a.strip()]
        ra = dec = None
        # --- sky position ---
        raw_ra, raw_dec = _get(row, ra_col), _get(row, dec_col)
        if raw_ra is not None and raw_dec is not None:
            sx = isinstance(raw_ra, str) and looks_sexagesimal(raw_ra)
            ra_v = parse_sexagesimal(str(raw_ra), True) if sx else _num(raw_ra)
            dec_v = parse_sexagesimal(str(raw_dec), False) if isinstance(raw_dec, str) and looks_sexagesimal(raw_dec) else _num(raw_dec)
            if ra_v is not None and not sx and ra_hint == "hourangle":
                ra_v *= 15
            if ra_v is None or dec_v is None:
                reasons.append("RA/Dec could not be parsed")
            elif not (0 <= ra_v < 360.0001) or not (-90 <= dec_v <= 90):
                reasons.append(f"RA/Dec out of range (RA={ra_v}, Dec={dec_v})")
            else:
                ra, dec = ra_v % 360, dec_v
        elif _get(row, m.get("glon")) is not None and _get(row, m.get("glat")) is not None:
            l, b = _num(_get(row, m["glon"])), _num(_get(row, m["glat"]))
            if l is not None and b is not None and 0 <= l <= 360 and -90 <= b <= 90:
                ra, dec = galactic_to_equatorial(l, b)
            else:
                reasons.append("galactic l/b invalid")
        # --- distance ---
        dist_ly: float | None = None
        basis = None
        status = None
        raw_d = _get(row, dist_col)
        if raw_d is not None:
            dv = _num(raw_d)
            unit = row.get(m["distance_unit"]) if "distance_unit" in m else None
            unit = canonical_unit(str(unit)) if unit else canonical_unit(dist_hint)
            if dv is None:
                reasons.append(f"distance '{raw_d}' is not numeric")
            elif dv < 0:
                reasons.append("negative distance")
            elif unit is None:
                reasons.append("distance unit unknown (not guessed)")
            else:
                dist_ly = to_light_years(dv, unit)
                basis = f"catalogue distance ({unit})"
                if dv == 0:
                    dist_ly = None
                    reasons.append("zero distance")
        if dist_ly is None and "x" in m and "y" in m and "z" in m:
            xs = [_num(_get(row, m[k])) for k in "xyz"]
            xu = canonical_unit(unit_hint(m["x"]))
            if None not in xs and xu:
                try:
                    cx = [to_light_years(abs(v), xu) * (1 if v >= 0 else -1) for v in xs]  # sign-preserving
                except ValueError:
                    cx = None
                if cx:
                    ra, dec, dist_ly = cartesian_to_radec_dist(*cx)
                    basis = "cartesian coordinates assumed heliocentric Galactic (X→GC)"
                    status = "approximate"
        if dist_ly is None and _get(row, m.get("parallax_mas")) is not None:
            plx = _num(_get(row, m["parallax_mas"]))
            if plx and plx > 0:
                dist_ly = 1000.0 / plx * LY_PER_PC
                basis = "inverse parallax (unreliable for low S/N)"
                status = "approximate"
            else:
                reasons.append("non-positive parallax")
        if dist_ly is None and _get(row, m.get("redshift")) is not None:
            z = _num(_get(row, m["redshift"]))
            if z is None or z < 0:
                reasons.append("invalid/negative redshift (blueshift) – no cosmological distance")
            elif z < 0.003:
                reasons.append("redshift dominated by peculiar velocity – distance not derivable")
            elif z > 6:
                reasons.append("redshift too high for this simple model")
            else:
                dist_ly = comoving_distance_ly(z)
                basis = f"flat ΛCDM comoving distance, z={z} (H0=70, Ωm=0.3 assumed)"
                status = "approximate"
        # --- classify ---
        if ra is None or dec is None:
            status = "non_spatial"
            if not reasons:
                reasons.append("no sky position (RA/Dec) available")
        elif dist_ly is None:
            status = "no_distance"
            reasons.append("direction on the sky only – a 3D position needs a distance or an explicit assumption")
        elif status is None:
            status = "ready"
        elif status == "approximate":
            reasons.append(f"distance is an assumption: {basis}")
        # --- duplicates (flagged, never merged) ---
        if name:
            k = norm(name)
            if k in seen_names:
                reasons.append(f"possible duplicate of row {seen_names[k]} (same name)")
            else:
                seen_names[k] = i
        if ra is not None and dec is not None:
            pk = (round(ra, 3), round(dec, 3))
            if pk in seen_pos:
                reasons.append(f"same sky position as row {seen_pos[pk]}")
            else:
                seen_pos[pk] = i
        match, cands = resolve_identity([n for n in [name, *alts] if n], ra, dec)
        quality = (0.4 if ra is not None else 0) + (0.4 if dist_ly is not None and status == "ready" else 0.2 if dist_ly is not None else 0) + (0.1 if name else 0) + (0.1 if _get(row, m.get("distance_err")) is not None else 0)
        recs.append({
            "row": i, "name": name, "ra_deg": ra, "dec_deg": dec, "distance_ly": dist_ly, "status": status, "reasons": reasons,
            "quality": round(quality, 2), "match": match, "candidates": cands,
            "original": {k: (v if isinstance(v, (int, float, str, type(None))) else str(v)) for k, v in row.items()},
            "normalized": {"name": name, "ra_deg": ra, "dec_deg": dec, "distance_ly": dist_ly, "distance_basis": basis,
                           "object_type": _get(row, m.get("object_type")), "frame": "ICRS/J2000", "alt_names": alts},
        })
    return recs, issues


def summarize(recs: list[dict], issues: list[str]) -> dict:
    s = {"total": len(recs), "ready": 0, "approximate": 0, "no_distance": 0, "non_spatial": 0, "duplicates": 0, "matched": 0, "issues": issues}
    for r in recs:
        s[r["status"]] += 1
        if any("duplicate" in x or "same sky position" in x for x in r["reasons"]):
            s["duplicates"] += 1
        if r["match"]:
            s["matched"] += 1
    return s
