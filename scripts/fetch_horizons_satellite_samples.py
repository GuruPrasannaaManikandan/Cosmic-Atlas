"""
Fetch JPL Horizons satellite state vectors used to fit the mean longitude at epoch and the mean motion of each
moon (see docs/ORBITAL_MECHANICS.md, "Phase refinement"). Output: scripts/data/horizons_satellite_samples.json
Window 2016-01-01 .. 2036-01-01 UT, 40-day step, ICRF, km, target relative to its primary (Pluto's small moons:
relative to the Pluto-system barycentre, Horizons centre @9).
Usage: python scripts/fetch_horizons_satellite_samples.py
"""
import json, os, re, sys, time
import httpx

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "horizons_satellite_samples.json")
U = "https://ssd.jpl.nasa.gov/api/horizons.api"
MOONS = {
    "moon": (301, "500@399"), "phobos": (401, "500@499"), "deimos": (402, "500@499"),
    "io": (501, "500@599"), "europa": (502, "500@599"), "ganymede": (503, "500@599"), "callisto": (504, "500@599"), "amalthea": (505, "500@599"),
    "himalia": (506, "500@599"), "elara": (507, "500@599"), "thebe": (514, "500@599"), "adrastea": (515, "500@599"), "metis": (516, "500@599"),
    "mimas": (601, "500@699"), "enceladus": (602, "500@699"), "tethys": (603, "500@699"), "dione": (604, "500@699"), "rhea": (605, "500@699"),
    "titan": (606, "500@699"), "hyperion": (607, "500@699"), "iapetus": (608, "500@699"), "phoebe": (609, "500@699"), "janus": (610, "500@699"),
    "epimetheus": (611, "500@699"), "helene": (612, "500@699"), "atlas": (615, "500@699"), "prometheus": (616, "500@699"), "pandora": (617, "500@699"), "pan": (618, "500@699"),
    "ariel": (701, "500@799"), "umbriel": (702, "500@799"), "titania": (703, "500@799"), "oberon": (704, "500@799"), "miranda": (705, "500@799"), "puck": (715, "500@799"),
    "triton": (801, "500@899"), "nereid": (802, "500@899"), "despina": (805, "500@899"), "galatea": (806, "500@899"), "larissa": (807, "500@899"), "proteus": (808, "500@899"),
    "charon": (901, "500@999"), "nix": (902, "500@9"), "hydra": (903, "500@9"), "kerberos": (904, "500@9"), "styx": (905, "500@9"),
}
res = {"source": "NASA/JPL Horizons API", "frame": "ICRF, km, geometric", "time_type": "UT", "start": "2016-01-01", "stop": "2036-01-01", "step": "40d",
       "retrieved": time.strftime("%Y-%m-%dT%H:%MZ", time.gmtime()), "bodies": {}}
for name, (naif, center) in MOONS.items():
    p = {"format": "json", "COMMAND": f"'{naif}'", "OBJ_DATA": "'NO'", "MAKE_EPHEM": "'YES'", "EPHEM_TYPE": "'VECTORS'", "CENTER": f"'{center}'",
         "START_TIME": "'2016-01-01'", "STOP_TIME": "'2036-01-01'", "STEP_SIZE": "'40d'", "VEC_TABLE": "'1'", "CSV_FORMAT": "'YES'",
         "REF_PLANE": "'FRAME'", "REF_SYSTEM": "'ICRF'", "OUT_UNITS": "'KM-S'", "TIME_TYPE": "'UT'", "VEC_CORR": "'NONE'"}
    t = ""
    for k in range(4):
        try:
            t = httpx.get(U, params=p, timeout=180).json().get("result", "")
            break
        except Exception as e:  # noqa: BLE001
            time.sleep(3 + 3 * k)
    m = re.search(r"\$\$SOE\s*(.*?)\s*\$\$EOE", t, re.S)
    if not m:
        print("FAIL", name, t[:300].replace("\n", " "))
        continue
    rows = []
    for line in m.group(1).splitlines():
        c = [x.strip() for x in line.split(",")]
        if len(c) >= 5:
            rows.append([float(c[0]), round(float(c[2]), 3), round(float(c[3]), 3), round(float(c[4]), 3)])
    res["bodies"][name] = {"naif": naif, "center": center, "jd_ut_xyz_km": rows}
    print(name, len(rows))
    time.sleep(0.3)
with open(OUT, "w") as f:
    json.dump(res, f, separators=(",", ":"))
print("wrote", OUT)
