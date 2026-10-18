"""Format detection and parsing. Plugin-style registry: add a parser with @register(name)."""
from __future__ import annotations

import csv
import io
import json
import xml.etree.ElementTree as ET
from typing import Callable

Rows = list[dict]
PARSERS: dict[str, Callable[[bytes], tuple[list[str], Rows]]] = {}


class UnsupportedFormat(ValueError):
    pass


def register(name: str):
    def deco(fn):
        PARSERS[name] = fn
        return fn
    return deco


def _text(data: bytes) -> str:
    for enc in ("utf-8-sig", "latin-1"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    raise UnsupportedFormat("cannot decode text")


@register("csv")
def parse_csv(data: bytes, delimiter: str | None = None):
    text = _text(data)
    lines = [l for l in text.splitlines() if l.strip() and not l.lstrip().startswith("#")]
    if not lines:
        return [], []
    if delimiter is None:
        try:
            delimiter = csv.Sniffer().sniff(lines[0], delimiters=",;\t|").delimiter
        except csv.Error:
            delimiter = ","
    reader = csv.DictReader(io.StringIO("\n".join(lines)), delimiter=delimiter)
    cols = [c.strip() for c in (reader.fieldnames or [])]
    rows = []
    for r in reader:
        rows.append({(k or "").strip(): (v.strip() if isinstance(v, str) else v) for k, v in r.items() if k is not None})
    return cols, rows


@register("tsv")
def parse_tsv(data: bytes):
    return parse_csv(data, "\t")


@register("json")
def parse_json(data: bytes):
    obj = json.loads(_text(data))
    if isinstance(obj, dict):
        for key in ("data", "records", "rows", "objects", "results"):
            if isinstance(obj.get(key), list):
                obj = obj[key]
                break
        else:
            raise UnsupportedFormat("JSON object has no recognisable list of records")
    if not isinstance(obj, list):
        raise UnsupportedFormat("JSON must be a list of records")
    if obj and isinstance(obj[0], list):  # [header, row, row...]
        cols = [str(c) for c in obj[0]]
        rows = [dict(zip(cols, r)) for r in obj[1:]]
        return cols, rows
    rows = [r for r in obj if isinstance(r, dict)]
    cols: list[str] = []
    for r in rows:
        for k in r:
            if k not in cols:
                cols.append(k)
    return cols, rows


@register("votable")
def parse_votable(data: bytes):
    root = ET.fromstring(data)
    ns = ""
    if root.tag.startswith("{"):
        ns = root.tag.split("}")[0] + "}"
    table = root.find(f".//{ns}TABLE")
    if table is None:
        raise UnsupportedFormat("VOTable contains no TABLE")
    fields = table.findall(f"{ns}FIELD")
    cols = [f.get("name") or f.get("ID") or f"col{i}" for i, f in enumerate(fields)]
    rows: Rows = []
    for tr in table.findall(f".//{ns}TR"):
        vals = [(td.text or "").strip() for td in tr.findall(f"{ns}TD")]
        rows.append(dict(zip(cols, vals)))
    return cols, rows


@register("fits")
def parse_fits(data: bytes):
    try:
        from astropy.table import Table  # type: ignore
    except ImportError as e:
        raise UnsupportedFormat("FITS tables need the optional 'astropy' package (pip install astropy)") from e
    t = Table.read(io.BytesIO(data), format="fits")
    cols = list(t.colnames)
    return cols, [{c: (None if hasattr(row[c], "mask") and row[c].mask else row[c].item() if hasattr(row[c], "item") else row[c]) for c in cols} for row in t]


@register("parquet")
def parse_parquet(data: bytes):
    try:
        import pyarrow.parquet as pq  # type: ignore
    except ImportError as e:
        raise UnsupportedFormat("Parquet needs the optional 'pyarrow' package (pip install pyarrow)") from e
    t = pq.read_table(io.BytesIO(data))
    return t.column_names, t.to_pylist()


def detect_format(filename: str, data: bytes) -> str:
    name = filename.lower()
    head = data[:2048].lstrip()
    if data[:6] == b"SIMPLE":
        return "fits"
    if data[:4] == b"PAR1":
        return "parquet"
    if name.endswith((".vot", ".votable")) or head.startswith(b"<?xml") or b"<VOTABLE" in head:
        return "votable"
    if name.endswith(".json") or head[:1] in (b"{", b"["):
        return "json"
    if name.endswith(".tsv") or (b"\t" in head.split(b"\n")[0] and name.endswith(".txt")):
        return "tsv"
    if name.endswith((".csv", ".txt", ".dat")):
        return "csv"
    raise UnsupportedFormat(f"unsupported or unrecognised file type: {filename}")


def parse(filename: str, data: bytes) -> tuple[str, list[str], Rows]:
    if not data:
        raise UnsupportedFormat("empty file")
    fmt = detect_format(filename, data)
    cols, rows = PARSERS[fmt](data)
    if not cols:
        raise UnsupportedFormat("no columns found")
    return fmt, cols, rows
