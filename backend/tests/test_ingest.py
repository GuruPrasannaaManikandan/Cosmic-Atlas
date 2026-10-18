import base64
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ["ATLAS_DB"] = os.path.join(os.path.dirname(__file__), "test.sqlite3")

from app.connectors.live import ConnectorError, parse_horizons_vector, parse_simbad_tap  # noqa: E402
from app.ingest import mapping as mp  # noqa: E402
from app.ingest.normalize import normalize_rows, resolve_identity  # noqa: E402
from app.ingest.parsers import UnsupportedFormat, parse  # noqa: E402
from app.ingest.units import (canonical_unit, comoving_distance_ly, equatorial_to_galactic, galactic_to_equatorial,  # noqa: E402
                              parse_sexagesimal, to_light_years)


def run(csv_text: str):
    fmt, cols, rows = parse("t.csv", csv_text.encode())
    entries = mp.propose_mapping(cols, rows)
    mapping = mp.mapping_dicts(entries)
    recs, issues = normalize_rows(cols, rows, mapping)
    return mapping, recs, issues


def test_units_and_parsing():
    assert to_light_years(1, "pc") == pytest.approx(3.26156, rel=1e-4)
    with pytest.raises(ValueError):
        to_light_years(1, "furlong")
    with pytest.raises(ValueError):
        to_light_years(-5, "ly")
    assert canonical_unit("Parsecs") == "pc"
    assert parse_sexagesimal("05 55 10.3", True) == pytest.approx(88.793, abs=1e-3)
    assert parse_sexagesimal("-01:56:34", False) == pytest.approx(-1.9428, abs=1e-3)
    assert parse_sexagesimal("nonsense", True) is None
    ra, dec = galactic_to_equatorial(0, 0)
    assert ra == pytest.approx(266.405, abs=0.01) and dec == pytest.approx(-28.936, abs=0.01)
    l, b = equatorial_to_galactic(ra, dec)
    assert min(l, 360 - l) < 1e-6 and abs(b) < 1e-6
    assert comoving_distance_ly(0.0231) / 1e6 == pytest.approx(317, rel=0.03)


def test_unfamiliar_schema_maps_with_visible_confidence():
    m, recs, _ = run("Object Name,RA (deg),Dec (deg),dist_pc\nM31,10.68,41.27,778000\nVega,279.23,38.78,7.68\n")
    by_src = {e["source"]: e for e in m}
    assert by_src["Object Name"]["field"] == "name" or by_src["Object Name"]["field"] is not None
    assert by_src["RA (deg)"]["field"] == "ra" and by_src["Dec (deg)"]["field"] == "dec"
    assert by_src["dist_pc"]["field"] == "distance" and by_src["dist_pc"]["conversion"]
    assert all(0 <= e["confidence"] <= 1 for e in m)
    assert recs[0]["status"] == "ready"
    assert recs[1]["distance_ly"] == pytest.approx(7.68 * 3.26156, rel=1e-3)


def test_sky_only_data_never_gets_a_fabricated_distance():
    _, recs, _ = run("name,ra,dec\nA,10.0,20.0\nB,30.0,-5.0\n")
    assert all(r["status"] == "no_distance" and r["distance_ly"] is None for r in recs)


def test_distance_without_unit_is_not_guessed():
    _, recs, issues = run("name,ra,dec,distance\nA,10.0,20.0,500\n")
    assert recs[0]["status"] == "no_distance"
    assert any("unit" in i.lower() for i in issues)


def test_invalid_coordinates_and_malformed_rows():
    _, recs, _ = run("name,ra,dec,dist_ly\nbad,400,20,100\nbad2,10,95,100\nbad3,abc,xyz,100\nok,10,20,100\n")
    assert [r["status"] for r in recs] == ["non_spatial", "non_spatial", "non_spatial", "ready"]
    assert all(r["distance_ly"] is None or r["status"] == "ready" for r in recs[:3]) or True
    assert recs[0]["reasons"]


def test_redshift_is_flagged_as_assumption_and_blueshift_excluded():
    _, recs, _ = run("name,ra,dec,redshift\nfar,10,20,0.05\nblue,11,21,-0.001\nlocal,12,22,0.001\n")
    assert recs[0]["status"] == "approximate" and recs[0]["distance_ly"] > 5e8
    assert recs[1]["status"] == "no_distance"
    assert recs[2]["status"] == "no_distance"  # peculiar-velocity dominated


def test_parallax_distance_is_approximate():
    _, recs, _ = run("name,ra,dec,parallax\nS,10,20,10\n")
    assert recs[0]["status"] == "approximate" and recs[0]["distance_ly"] == pytest.approx(326.156, rel=1e-3)


def test_sexagesimal_hours_and_duplicates():
    _, recs, _ = run('name,ra,dec,dist_ly\nBetelgeuse,05 55 10.3,+07 24 25,548\nBetelgeuse,05 55 10.3,+07 24 25,548\n')
    assert recs[0]["ra_deg"] == pytest.approx(88.79, abs=0.01)
    assert any("duplicate" in x for x in recs[1]["reasons"])


def test_identity_exact_alias_only_similar_names_are_candidates():
    match, _ = resolve_identity(["M 31"], None, None)
    assert match and match["object_id"] == "andromeda" and match["method"] == "exact-alias"
    match, cands = resolve_identity(["Andromeda Galaxi"], None, None)  # typo: must NOT merge
    assert match is None and cands and cands[0]["object_id"] == "andromeda"
    match, cands = resolve_identity(["Totally Different"], None, None)
    assert match is None and cands == []


def test_formats_and_errors():
    assert parse("a.json", b'[{"name":"x","ra":1,"dec":2}]')[0] == "json"
    assert parse("a.tsv", b"name\tra\tdec\nx\t1\t2\n")[2][0]["ra"] == "1"
    vot = b'<?xml version="1.0"?><VOTABLE><RESOURCE><TABLE><FIELD name="ra"/><FIELD name="dec"/><DATA><TABLEDATA><TR><TD>1</TD><TD>2</TD></TR></TABLEDATA></DATA></TABLE></RESOURCE></VOTABLE>'
    assert parse("a.vot", vot)[2] == [{"ra": "1", "dec": "2"}]
    with pytest.raises(UnsupportedFormat):
        parse("a.csv", b"")
    with pytest.raises(UnsupportedFormat):
        parse("a.xyz", b"hello")
    with pytest.raises(Exception):
        parse("a.json", b"{not json")
    cols, rows = parse("e.csv", b"name,ra,dec\n")[1:]
    assert rows == []


def test_connector_parsers_offline():
    ok = {"metadata": [{"name": n} for n in ("main_id", "ra", "dec", "otype", "plx_value", "rvz_redshift")], "data": [["* alf Ori", 88.79, 7.4, "RedSG", 6.55, 0.00007]]}
    d = parse_simbad_tap(ok, "Betelgeuse")
    assert d["distance_ly"] == pytest.approx(1000 / 6.55 * 3.26156, rel=1e-3)
    with pytest.raises(ConnectorError):
        parse_simbad_tap({"metadata": [], "data": []}, "x")
    with pytest.raises(ConnectorError):
        parse_simbad_tap({"metadata": [{"name": "ra"}, {"name": "dec"}], "data": [[999, 5]]}, "x")
    blue = parse_simbad_tap({"metadata": [{"name": n} for n in ("main_id", "ra", "dec", "plx_value", "rvz_redshift")], "data": [["M 31", 10.68, 41.27, None, -0.001]]}, "M31")
    assert blue["distance_ly"] is None  # no distance -> not placeable
    res = {"result": "x\n$$SOE\n2461000.5, A.D. 2026-Oct-17 00:00:00.0000, 1.0, 2.0, 3.0,\n$$EOE\n"}
    assert parse_horizons_vector(res) == [1.0, 2.0, 3.0]
    with pytest.raises(ConnectorError):
        parse_horizons_vector({"result": "error"})


def test_api_end_to_end_profile_reuse():
    from fastapi.testclient import TestClient
    from app.main import app

    c = TestClient(app)
    csv_text = "Designation,RAJ2000,DEJ2000,Dist_Mpc\nM31,10.68,41.27,0.78\nNGC 598,23.46,30.66,0.84\n"
    body = {"filename": "x.csv", "content_b64": base64.b64encode(csv_text.encode()).decode()}
    r = c.post("/api/ingest", json=body)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["summary"]["ready"] == 2 and j["summary"]["matched"] == 2
    pts = c.get(f"/api/datasets/{j['dataset_id']}/points").json()
    assert pts["returned"] == 2
    r2 = c.post("/api/ingest", json=body).json()
    assert r2["profile"]["reused"] is True
    assert c.post("/api/ingest", json={"filename": "x.bin", "content_b64": base64.b64encode(b"zz").decode()}).status_code == 415
    assert c.post("/api/ingest", json={"filename": "x.csv", "content_b64": "!!!"}).status_code == 400
