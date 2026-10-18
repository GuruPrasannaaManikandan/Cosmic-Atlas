"""Hybrid schema mapping: (1) deterministic aliases, (2) statistical/semantic profiling, (3) optional LLM, then validation."""
from __future__ import annotations

import difflib
import json
import os
import re
from dataclasses import dataclass, asdict

CANONICAL = [
    "id", "name", "alt_names", "object_type", "parent", "ra", "dec", "distance", "distance_unit", "distance_err",
    "redshift", "parallax_mas", "glon", "glat", "x", "y", "z", "magnitude", "angular_size", "epoch", "source_catalogue",
]

ALIASES: dict[str, list[str]] = {
    "id": ["id", "objid", "objectid", "catalogid", "sourceid", "hip", "hd", "recno", "designation"],
    "name": ["name", "objectname", "objname", "object", "mainid", "mainidentifier", "starname", "target", "plname", "hostname", "identifier", "title"],
    "alt_names": ["altnames", "aliases", "alias", "othernames", "otherid", "crossid", "altname"],
    "object_type": ["type", "otype", "objecttype", "objtype", "class", "category", "kind", "morphology"],
    "parent": ["parent", "system", "host", "group", "cluster", "parentstructure"],
    "ra": ["ra", "raj2000", "radeg", "rade", "raicrs", "rightascension", "raj2000deg", "ra2000", "alpha"],
    "dec": ["dec", "dej2000", "decdeg", "dedeg", "deicrs", "decicrs", "declination", "decj2000", "dec2000", "delta"],
    "distance": ["distance", "dist", "distly", "distpc", "distkpc", "distmpc", "distancepc", "distancely", "distancemly", "sydist", "dlum", "dpc", "dly"],
    "distance_unit": ["distanceunit", "distunit", "unit", "units", "dunit"],
    "distance_err": ["disterr", "distanceerr", "edist", "distuncertainty", "distanceerror", "ediststat", "disterror"],
    "redshift": ["z", "redshift", "zspec", "zphot", "zhelio", "zhel", "rvzredshift"],
    "parallax_mas": ["parallax", "plx", "plxmas", "parallaxmas", "plxvalue"],
    "glon": ["l", "glon", "lii", "gal_lon", "gallon", "galacticlongitude", "lgal"],
    "glat": ["b", "glat", "bii", "gal_lat", "gallat", "galacticlatitude", "bgal"],
    "x": ["x", "xpc", "xly", "xkpc", "xmpc"], "y": ["y", "ypc", "yly", "ykpc", "ympc"], "z_cart": ["zpc", "zly", "zkpc", "zmpc"],
    "magnitude": ["mag", "vmag", "gmag", "magnitude", "photgmeanmag", "bmag", "appmag"],
    "angular_size": ["angularsize", "majordiam", "diameter", "size", "diam", "sizearcmin"],
    "epoch": ["epoch", "refepoch", "equinox"],
    "source_catalogue": ["catalog", "catalogue", "source", "survey", "cat", "reference", "ref"],
}

UNIT_IN_HEADER = [
    (r"(^|[^a-z])(gly|glyr)([^a-z]|$)", "gly"), (r"(^|[^a-z])mly([^a-z]|$)", "mly"), (r"(^|[^a-z])kly([^a-z]|$)", "kly"),
    (r"light.?years?|(^|[^a-z])ly([^a-z]|$)", "ly"), (r"(^|[^a-z])gpc([^a-z]|$)", "gpc"), (r"(^|[^a-z])mpc([^a-z]|$)", "mpc"),
    (r"(^|[^a-z])kpc([^a-z]|$)", "kpc"), (r"parsecs?|(^|[^a-z])pc([^a-z]|$)", "pc"), (r"(^|[^a-z])au([^a-z]|$)", "au"),
]


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def unit_hint(col: str) -> str | None:
    c = col.lower()
    for pat, u in UNIT_IN_HEADER:
        if re.search(pat, c):
            return u
    if re.search(r"hour|hms|\(h\)|_h$", c):
        return "hourangle"
    if re.search(r"deg", c):
        return "deg"
    return None


def _num(v) -> float | None:
    try:
        f = float(str(v).strip())
        return f if f == f and abs(f) != float("inf") else None
    except (TypeError, ValueError):
        return None


@dataclass
class MapEntry:
    source: str
    field: str | None
    confidence: float
    method: str
    conversion: str | None = None


def propose_mapping(columns: list[str], rows: list[dict]) -> list[MapEntry]:
    used: set[str] = set()
    out: dict[str, MapEntry] = {}
    alias_lookup = {}
    for f, names in ALIASES.items():
        for n in names:
            alias_lookup.setdefault(norm(n), f)

    # (1) deterministic aliases
    for c in columns:
        n = norm(c)
        f = alias_lookup.get(n)
        if f is None:  # strip trailing unit tokens (dist_pc -> distpc already aliased; ra_deg -> ra)
            base = re.sub(r"(deg|pc|kpc|mpc|ly|mly|gly|au|mas|hours|hour|hms|dms)$", "", n)
            f = alias_lookup.get(base) if base and base != n else None
            conf = 0.85
        else:
            conf = 0.97 if n not in ("d", "l", "b", "x", "y", "z", "unit", "size", "source", "type") else 0.7
        if f == "z_cart":
            f = "z"
        if f and f not in used:
            hint = unit_hint(c)
            conv = None
            if f == "distance" and hint in ("ly", "kly", "mly", "gly", "pc", "kpc", "mpc", "gpc", "au"):
                conv = f"unit from header: {hint} -> light-years"
            if f in ("ra",) and hint == "hourangle":
                conv = "hours -> degrees (x15)"
            out[c] = MapEntry(c, f, conf, "deterministic-alias", conv)
            used.add(f)
    # ambiguous bare 'z': could be redshift or cartesian z
    if "z" in used:
        for c, e in out.items():
            if e.field == "z":
                others = {x.field for x in out.values()}
                if {"x", "y"} <= others:
                    pass  # genuine cartesian z
                else:
                    e.field = "redshift"; e.confidence = 0.6; e.conversion = "ambiguous 'z' read as redshift (no x/y columns)"; used.discard("z"); used.add("redshift")

    # (2) statistical + semantic profiling for the rest
    for c in columns:
        if c in out:
            continue
        n = norm(c)
        vals = [_num(r.get(c)) for r in rows[:300]]
        nums = [v for v in vals if v is not None]
        numeric = len(nums) >= max(1, 0.8 * len([r for r in rows[:300] if r.get(c) not in (None, "")]))
        lo, hi = (min(nums), max(nums)) if nums else (None, None)
        guess: tuple[str, float, str] | None = None
        if "ra" not in used and numeric and nums and 0 <= lo and hi <= 360 and any(t in n for t in ("rasc", "rightasc", "alpha", "lon")):
            guess = ("ra", 0.55, "statistical: range 0–360 and name hints at longitude/RA")
        elif "dec" not in used and numeric and nums and -90 <= lo and hi <= 90 and any(t in n for t in ("decl", "delta", "lat")):
            guess = ("dec", 0.55, "statistical: range −90–90 and name hints at latitude/Dec")
        elif "distance" not in used and any(t in n for t in ("distance", "dist", "range")) and numeric:
            guess = ("distance", 0.6, "semantic: name contains 'distance'")
        elif "redshift" not in used and "redshift" in n:
            guess = ("redshift", 0.7, "semantic: name contains 'redshift'")
        elif "parallax_mas" not in used and "parallax" in n:
            guess = ("parallax_mas", 0.6, "semantic: name contains 'parallax' (assumed milliarcseconds)")
        elif "name" not in used and any(t in n for t in ("name", "designation", "ident")):
            guess = ("name", 0.6, "semantic: name-like column")
        else:
            m = difflib.get_close_matches(n, list(alias_lookup), n=1, cutoff=0.82)
            if m:
                f = alias_lookup[m[0]]
                f = "z" if f == "z_cart" else f
                if f not in used:
                    guess = (f, round(0.7 * difflib.SequenceMatcher(None, n, m[0]).ratio(), 2), f"fuzzy match to alias '{m[0]}'")
        if guess:
            out[c] = MapEntry(c, guess[0], guess[1], "statistical" if guess[2].startswith("statistical") else "semantic", guess[2])
            used.add(guess[0])
    for c in columns:
        out.setdefault(c, MapEntry(c, None, 0.0, "unmapped", None))

    # (3) optional LLM for leftovers
    entries = [out[c] for c in columns]
    return entries


def llm_refine(entries: list[MapEntry], rows: list[dict]) -> tuple[list[MapEntry], dict]:
    """Optional: ask an LLM about UNMAPPED columns only. Output is validated against CANONICAL; never required."""
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        return entries, {"used": False, "note": "No ANTHROPIC_API_KEY set – deterministic/statistical mapping only."}
    unmapped = [e for e in entries if e.field is None]
    if not unmapped:
        return entries, {"used": False, "note": "LLM available but every column was already mapped deterministically."}
    try:
        import httpx

        sample = {e.source: [str(r.get(e.source)) for r in rows[:5]] for e in unmapped}
        prompt = (
            "Map each astronomy-table column to one canonical field or null. Fields: " + ", ".join(CANONICAL)
            + ". Reply with JSON object {column: field_or_null}. Columns and samples: " + json.dumps(sample)
        )
        r = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={"model": os.environ.get("ANTHROPIC_MODEL", "claude-haiku-5-5"), "max_tokens": 500, "messages": [{"role": "user", "content": prompt}]},
            timeout=30,
        )
        r.raise_for_status()
        text = r.json()["content"][0]["text"]
        data = json.loads(text[text.index("{"): text.rindex("}") + 1])
        taken = {e.field for e in entries if e.field}
        for e in unmapped:
            f = data.get(e.source)
            if f in CANONICAL and f not in taken:
                e.field, e.confidence, e.method, e.conversion = f, 0.5, "llm", "LLM suggestion – review before trusting"
                taken.add(f)
        return entries, {"used": True, "note": "LLM suggestions applied to unmapped columns only (unverified – review)."}
    except Exception as exc:  # noqa: BLE001 - surfaced to the user, mapping continues deterministically
        return entries, {"used": False, "note": f"LLM mapping failed ({type(exc).__name__}: {exc}); deterministic mapping used."}


def mapping_dicts(entries: list[MapEntry]) -> list[dict]:
    return [asdict(e) for e in entries]
