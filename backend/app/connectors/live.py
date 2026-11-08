"""Live catalogue adapters: CDS SIMBAD (sim-script) and NASA/JPL Horizons. Each validates and normalizes its response.
Responses are cached in the repository; failures raise ConnectorError (mapped to HTTP 502 – never crash the scene)."""
from __future__ import annotations

import json
import re
import time
from datetime import date, timedelta

import httpx

from ..ingest.units import LY_PER_PC, comoving_distance_ly

UA = {"User-Agent": "CosmicAtlas/0.1 (educational; contact: local)"}
SIMBAD_URL = "https://simbad.cds.unistra.fr/simbad/sim-script"
SIMBAD_TAP = "https://simbad.cds.unistra.fr/simbad/sim-tap/sync"
HORIZONS_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
HORIZONS_IDS = {"mercury": "199", "venus": "299", "earth": "399", "mars": "499", "jupiter": "599", "saturn": "699", "uranus": "799", "neptune": "899", "moon": "301", "sun": "10"}

DEFAULT_CONNECT_TIMEOUT = 4.0
DEFAULT_READ_TIMEOUT = 7.0
DEFAULT_TIMEOUT = httpx.Timeout(connect=DEFAULT_CONNECT_TIMEOUT, read=DEFAULT_READ_TIMEOUT, write=5.0, pool=5.0)
TAP_TIMEOUT = httpx.Timeout(connect=4.0, read=9.0, write=5.0, pool=5.0)


class ConnectorError(Exception):
    pass


def _get(url: str, params: dict, timeout: httpx.Timeout | float = DEFAULT_TIMEOUT) -> httpx.Response:
    try:
        r = httpx.get(url, params=params, headers=UA, timeout=timeout)
        r.raise_for_status()
        return r
    except httpx.TimeoutException as e:
        raise ConnectorError(f"External astronomy service timed out ({type(e).__name__}). Please check your connection or try again shortly.") from e
    except httpx.HTTPError as e:
        raise ConnectorError(f"{url} unavailable: {type(e).__name__}: {e}") from e


def parse_simbad_tap(payload: dict, query: str) -> dict:
    """Validate/normalize a SIMBAD TAP JSON response row. Pure function (unit-tested offline)."""
    data = payload.get("data") or []
    if not data:
        raise ConnectorError(f"SIMBAD: no object found for '{query}'")
    names = [m["name"] for m in payload.get("metadata", [])]
    row = dict(zip(names, data[0]))

    def f(v):
        try:
            x = float(v)
            return x if x == x else None
        except (TypeError, ValueError):
            return None

    ra_v, dec_v = f(row.get("ra")), f(row.get("dec"))
    if ra_v is None or dec_v is None or not (0 <= ra_v <= 360 and -90 <= dec_v <= 90):
        raise ConnectorError("SIMBAD: invalid or missing coordinates in response")
    plx_v, z_v = f(row.get("plx_value")), f(row.get("rvz_redshift"))
    dist = basis = None
    if plx_v and plx_v > 0:
        dist, basis = 1000.0 / plx_v * LY_PER_PC, f"inverse SIMBAD parallax ({plx_v} mas)"
    elif z_v is not None and z_v >= 0.003:
        dist, basis = comoving_distance_ly(z_v), f"flat LambdaCDM comoving distance from SIMBAD redshift z={z_v} (H0=70, Om=0.3 assumed)"
    return {"main_id": str(row.get("main_id", "")).strip(), "ra_deg": ra_v, "dec_deg": dec_v, "otype": row.get("otype") or None, "plx_mas": plx_v, "z": z_v,
            "distance_ly": dist, "distance_basis": basis}


def simbad_lookup(repo, query: str) -> dict:
    q = query.strip()
    if not q or len(q) > 100 or "\n" in q or "'" in q:
        raise ConnectorError("invalid query")
    key = "simbad:" + q.lower()
    hit = repo.cache_get(key, 86400)
    if hit:
        d = json.loads(hit); d["cached"] = True
        return d
    # 1) SIMBAD's name resolver (flexible spelling) -> exact main_id; 2) TAP for the validated record
    script = 'output console=off script=off\nformat object "%MAIN_ID"\nquery id ' + q
    text = ""
    for _attempt in range(2):  # the script resolver occasionally returns a transient error
        try:
            text = _get(SIMBAD_URL, {"script": script}, timeout=DEFAULT_TIMEOUT).text.strip()
            if text and not text.startswith("::error"):
                break
        except ConnectorError:
            if _attempt == 1:
                raise
        time.sleep(0.3)
    if text.startswith("::error") or not text:
        raise ConnectorError(f"SIMBAD: no object found for '{q}'")
    main_id = text.splitlines()[0].strip().replace("'", "''")
    adql = f"SELECT TOP 1 main_id, ra, dec, otype, plx_value, rvz_redshift FROM basic WHERE main_id = '{main_id}'"
    try:
        r = httpx.post(SIMBAD_TAP, data={"request": "doQuery", "lang": "adql", "format": "json", "query": adql}, headers=UA, timeout=TAP_TIMEOUT)
        r.raise_for_status()
        payload = r.json()
    except httpx.TimeoutException as e:
        raise ConnectorError(f"SIMBAD TAP service timed out for '{q}'. The database may be temporarily overloaded.") from e
    except (httpx.HTTPError, ValueError) as e:
        raise ConnectorError(f"SIMBAD TAP unavailable: {type(e).__name__}: {e}") from e
    d = parse_simbad_tap(payload, q)
    d["aliases"] = []
    try:
        ids = httpx.post(SIMBAD_TAP, data={"request": "doQuery", "lang": "adql", "format": "json", "query": f"SELECT id FROM ident JOIN basic ON oidref = oid WHERE main_id = '{main_id}'"}, headers=UA, timeout=TAP_TIMEOUT).json()
        d["aliases"] = [x[0] for x in ids.get("data", [])][:15]
    except (httpx.HTTPError, ValueError, KeyError):
        pass  # aliases are optional
    d.update(source="CDS SIMBAD TAP (simbad.cds.unistra.fr/simbad/sim-tap)", query=q, retrieved=time.strftime("%Y-%m-%dT%H:%MZ", time.gmtime()), cached=False)
    repo.cache_put(key, json.dumps(d))
    return d


def parse_horizons_vector(payload: dict) -> list[float] | None:
    res = payload.get("result", "")
    m = re.search(r"\$\$SOE\s*(.*?)\s*\$\$EOE", res, re.S)
    if not m:
        raise ConnectorError("Horizons: no ephemeris block in response: " + res[:200].replace("\n", " "))
    cols = [c.strip() for c in m.group(1).splitlines()[0].split(",")]
    try:
        return [float(cols[2]), float(cols[3]), float(cols[4])]
    except (IndexError, ValueError) as e:
        raise ConnectorError("Horizons: could not parse vector row") from e


def horizons_vector(repo, body: str, day: str) -> dict:
    bid = HORIZONS_IDS.get(body.lower())
    if not bid:
        raise ConnectorError(f"unsupported body '{body}'")
    try:
        d0 = date.fromisoformat(day)
    except ValueError as e:
        raise ConnectorError("date must be YYYY-MM-DD") from e
    key = f"horizons:{bid}:{day}"
    hit = repo.cache_get(key, 7 * 86400)
    if hit:
        d = json.loads(hit); d["cached"] = True
        return d
    center = "500@399" if body.lower() == "moon" else "500@10"
    params = {"format": "json", "COMMAND": f"'{bid}'", "OBJ_DATA": "'NO'", "MAKE_EPHEM": "'YES'", "EPHEM_TYPE": "'VECTORS'", "CENTER": f"'{center}'",
              "START_TIME": f"'{d0.isoformat()}'", "STOP_TIME": f"'{(d0 + timedelta(days=1)).isoformat()}'", "STEP_SIZE": "'1d'", "VEC_TABLE": "'1'", "CSV_FORMAT": "'YES'", "REF_PLANE": "'ECLIPTIC'", "OUT_UNITS": "'AU-D'"}
    payload = _get(HORIZONS_URL, params, timeout=TAP_TIMEOUT).json()
    vec = parse_horizons_vector(payload)
    d = {"source": "NASA/JPL Horizons API (ssd.jpl.nasa.gov/api/horizons.api)", "body": body, "date": day, "frame": f"heliocentric ecliptic J2000, centre {center}", "vector_au": vec,
         "raw_excerpt": payload.get("result", "")[:0], "retrieved": time.strftime("%Y-%m-%dT%H:%MZ", time.gmtime()), "cached": False}
    repo.cache_put(key, json.dumps(d))
    return d
