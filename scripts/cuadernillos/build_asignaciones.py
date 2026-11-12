#!/usr/bin/env python3
"""Build the cleaned school-supervisor-cabecera assignment list (Consejo General).

Run with:  python3 -I scripts/cuadernillos/build_asignaciones.py \
               --consejo consejo.csv --sheets "CUE (1)" --escuelas escuelas.json \
               --padron ../natalidad/escuelas-2026-padron.json \
               --out data/cuadernillos/asignaciones-consejo.csv \
               --readme data/cuadernillos/asignaciones-consejo.README.md

Inputs:
  --consejo   CSV with columns cue_anexo,nombre,departamento,localidad (prod DB export).
  --sheets    Directory whose sub-folders are supervisors (folder name = supervisor)
              and whose .xlsx files hold the supervisor's school sheets.
  --escuelas  Map-data JSON. Used only as secondary evidence (advisory counts in the
              README); it never assigns a supervisor or a cabecera.
  --padron    Optional padron JSON (field nivel, key cue_anexo). Decides Nivel Inicial for
              the department inference; without it the name fallback is used.

Rules:
  * A CUE found in a supervisor's sheets is evidence for that supervisor. A CUE found
    under two supervisors is status conflicto_supervisor.
  * Cabecera is resolved only from explicit evidence inside the sheets:
      - the row itself is marked CABECERA (relationship cabecera, cabecera_cue = own CUE);
      - a block title ("... Cabecera N° 87 ...", optionally with an explicit CUE) that
        precedes dependent rows in the same sheet;
      - a "Dependiente de <N>" column value.
    A school number N is mapped to a CUE only through the N° column of the same
    supervisor's sheets, and only when that mapping is unique.
  * Schools found in sheets but absent from consejo.csv are excluded (counted, printed).
  * A CUE written with 8 or 7 digits (the trailing zeros lost in the sheet) is read as
    the 9-digit CUE only when that CUE is in consejo.csv AND the row names the same
    school number (N°) as the Consejo name. Otherwise it stays unread and is reported.
  * Department inference: when the direct evidence of a departamento names exactly one
    supervisor, the sin_supervisor schools of that departamento get that supervisor with
    status inferido_departamento, except Nivel Inicial schools. Departments with two or
    more supervisors are never inferred; they are listed in the README.
"""

import argparse
import collections
import csv
import json
import os
import re
import sys
import unicodedata

try:
    import openpyxl
except ImportError:  # openpyxl lives in the user site when running with -I
    import site

    sys.path.append(site.getusersitepackages())
    import openpyxl

CUE_RE = re.compile(r"(?<!\d)(18\d{5})(?:\s*[-.]?\s*(\d{2}))?(?!\d)")
# "CABECERA" as a row marker; "designada por cabecera" describes a dependent, not a cabecera.
CABECERA_WORD_RE = re.compile(r"(?<!por )(?<!de )\bcabecera\b(?!\s*n\s*[°º.o]?\s*\d)", re.IGNORECASE)
CABECERA_NUM_RE = re.compile(r"\bcabecera\b\s*(?:n\s*[°º.o]?\s*)?(\d{1,4})\b", re.IGNORECASE)
N_HEADER_RE = re.compile(r"^\s*(?:escuela\s*)?n\s*[°º.o]?\s*(?:$|\s|de\b|y\b)", re.IGNORECASE)
N_VALUE_RE = re.compile(r"^\s*(?:n\s*[°º.]?\s*)?(\d{1,4})\b", re.IGNORECASE)
# School number written in text: "Escuela N° 15", "Esc. Nº 81", "Cabecera N° 648".
N_MENTION_RE = re.compile(r"\bN\s*[°º.o]\s*(\d{1,4})\b", re.IGNORECASE)
CUE9_STRIPPED_RE = re.compile(r"(?<!\d)(18\d{7})(?!\d)")
PAD_RE = re.compile(r"(?<!\d)(18\d{5,6})(?!\d)")
NIVEL_INICIAL_NAME_RE = re.compile(r"\bJARDIN\b|\bNIVEL INICIAL\b")
STATUSES = ("ok", "sin_supervisor", "conflicto_supervisor", "sin_cabecera", "inferido_departamento")


def cell_text(value):
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).replace("\n", " ").replace("\r", " ")


def strip_separators(text):
    """Drop dots, dashes, slashes and underscores: 180.000-100 -> 180000100."""
    return re.sub(r"[.\-/_]", "", text)


def extract_cues(value):
    """Return CUE (9-digit) candidates found in one cell."""
    text = cell_text(value)
    found = []
    for m in CUE_RE.finditer(text):
        base, suffix = m.group(1), m.group(2) or "00"
        found.append(base + suffix)
    for m in CUE9_STRIPPED_RE.finditer(strip_separators(text)):
        if m.group(1) not in found:
            found.append(m.group(1))
    return found


def pad_candidates(value):
    """CUE candidates written with 8 or 7 digits: the lost trailing zeros are restored."""
    out = []
    for m in PAD_RE.finditer(strip_separators(cell_text(value))):
        digits = m.group(1)
        if len(digits) == 9:
            continue
        cand = digits + ("0" if len(digits) == 8 else "00")
        if cand not in out:
            out.append(cand)
    return out


def row_number_mentions(values, n_col):
    """School numbers named in one row (N° text and the N° column)."""
    nums = set()
    for v in values:
        nums.update(int(m.group(1)) for m in N_MENTION_RE.finditer(cell_text(v)))
    if n_col is not None and n_col < len(values):
        n = school_number(values[n_col])
        if n is not None:
            nums.add(n)
    return nums


def consejo_number(nombre):
    m = N_MENTION_RE.search(nombre or "")
    return int(m.group(1)) if m else None


def cue_from_number(value):
    cues = extract_cues(value)
    return cues[0] if len(cues) == 1 else None


def school_number(value):
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return int(value) if float(value).is_integer() else None
    m = N_VALUE_RE.match(cell_text(value))
    return int(m.group(1)) if m else None


def load_consejo(path):
    schools = {}
    with open(path, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            cue = cue_from_number(row["cue_anexo"])
            if cue is None:
                raise SystemExit(f"consejo.csv: unparseable cue_anexo {row['cue_anexo']!r}")
            schools[cue] = row
    return schools


def load_escuelas_hints(path, consejo):
    """Secondary evidence only: escuelas.json cabecera text per Consejo CUE."""
    hints = {}
    if not path or not os.path.exists(path):
        return hints
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    for item in data:
        cue = cue_from_number(item.get("cue"))
        if cue in consejo:
            text = (item.get("cabecera") or "").strip()
            is_ref = re.search(r"cabecera|dependiente", text, re.IGNORECASE) or re.fullmatch(r"\d{1,3}", text)
            if is_ref and not re.match(r"no\b", text, re.IGNORECASE):
                hints[cue] = text
    return hints


def header_columns(row_values):
    """Return (n_col, dependiente_col) indexes from a header row, or (None, None)."""
    n_col = dep_col = None
    for idx, value in enumerate(row_values):
        text = cell_text(value).strip()
        if n_col is None and N_HEADER_RE.match(text):
            n_col = idx
        if dep_col is None and re.search(r"dependiente", text, re.IGNORECASE):
            dep_col = idx
    return n_col, dep_col


def scan_sheet(rows, supervisor, file_name, sheet_name):
    """Yield per-row evidence for one sheet.

    Each record: dict(cue, supervisor, source, n, rel, cab_cue, cab_num, dep_num).
    """
    n_col = dep_col = None
    block = {"num": None, "cue": None}
    records = []
    cue_header_seen = False
    for row_idx, row in enumerate(rows, 1):
        values = list(row)
        texts = [cell_text(v) for v in values]
        if not cue_header_seen and any(re.match(r"^\s*cue\b", t, re.IGNORECASE) for t in texts):
            cue_header_seen = True
            n_col, dep_col = header_columns(values)
            continue
        cues_here = []
        for v in values:
            for cue in extract_cues(v):
                if cue not in cues_here:
                    cues_here.append(cue)
        # Padded CUEs (8 or 7 digits) are read only when the row has no exact CUE.
        pads_here = []
        if not cues_here:
            for v in values:
                for cue in pad_candidates(v):
                    if cue not in pads_here:
                        pads_here.append(cue)
        row_cues = cues_here or pads_here
        is_pad = not cues_here
        block_title = None
        for t in texts:
            m = CABECERA_NUM_RE.search(t)
            if m:
                block_title = m
                break
        row_is_cabecera = any(CABECERA_WORD_RE.search(t) for t in texts) and bool(row_cues)
        if block_title and not row_cues:
            block["num"] = int(block_title.group(1))
            block["cue"] = None
            continue
        if block_title and row_cues:
            # Title row carrying the cabecera's explicit CUE (exact CUEs only).
            block["num"] = int(block_title.group(1))
            block["cue"] = cues_here[0] if cues_here else None
        row_nums = row_number_mentions(values, n_col)
        for cue in row_cues:
            records.append(
                {
                    "cue": cue,
                    "pad": is_pad,
                    "row_nums": row_nums,
                    "supervisor": supervisor,
                    "source": f"{file_name}:{sheet_name}:{row_idx}",
                    "n": school_number(values[n_col]) if n_col is not None and n_col < len(values) else None,
                    "self_cabecera": row_is_cabecera,
                    "dep_num": school_number(values[dep_col]) if dep_col is not None and dep_col < len(values) and cell_text(values[dep_col]).strip() else None,
                    "block_num": block["num"],
                    "block_cue": block["cue"],
                    "in_block": block["num"] is not None,
                }
            )
    return records


def collect(sheets_dir):
    """Return (records, supervisors) for every supervisor folder and xlsx file."""
    records = []
    supervisors = []
    for sup in sorted(os.listdir(sheets_dir)):
        sup_path = os.path.join(sheets_dir, sup)
        if not os.path.isdir(sup_path):
            continue
        supervisors.append(sup)
        for file_name in sorted(os.listdir(sup_path)):
            if not file_name.lower().endswith(".xlsx") or file_name.startswith("~"):
                continue
            wb = openpyxl.load_workbook(os.path.join(sup_path, file_name), read_only=True, data_only=True)
            for ws in wb.worksheets:
                for rec in scan_sheet(ws.iter_rows(values_only=True), sup, file_name, ws.title):
                    rec["file"] = file_name
                    records.append(rec)
            wb.close()
    return records, supervisors


def resolve_pads(records, consejo):
    """Keep a padded CUE only when it is a Consejo school and the row names its N°."""
    kept = []
    for rec in records:
        if not rec.get("pad"):
            kept.append(rec)
        elif rec["cue"] in consejo and consejo_number(consejo[rec["cue"]]["nombre"]) in rec["row_nums"]:
            kept.append(rec)
    return kept


def build(records, consejo, hints):
    records = resolve_pads(records, consejo)
    by_cue = collections.defaultdict(lambda: collections.OrderedDict())
    for rec in records:
        if rec["cue"] not in consejo:
            continue
        by_cue[rec["cue"]].setdefault(rec["supervisor"], rec)

    # Per supervisor: school number -> CUE, unique only.
    number_map = collections.defaultdict(lambda: collections.defaultdict(set))
    for rec in records:
        if rec["n"] is not None and rec["cue"] in consejo:
            number_map[rec["supervisor"]][rec["n"]].add(rec["cue"])

    def resolve_number(supervisor, number):
        cues = number_map[supervisor].get(number, set())
        return next(iter(cues)) if len(cues) == 1 else None

    rows = []
    for cue in sorted(consejo):
        school = consejo[cue]
        sup_hits = by_cue.get(cue, {})
        out = {
            "cue_anexo": cue,
            "nombre": school["nombre"],
            "departamento": school["departamento"],
            "supervisor": "",
            "relationship": "",
            "cabecera_cue": "",
            "source": "",
            "status": "",
        }
        if not sup_hits:
            out["status"] = "sin_supervisor"
            rows.append(out)
            continue
        names = sorted(sup_hits)
        out["supervisor"] = " | ".join(names)
        out["source"] = " | ".join(sup_hits[s]["source"] for s in names)
        if len(names) > 1:
            out["status"] = "conflicto_supervisor"
            rows.append(out)
            continue

        sup = names[0]
        rec = sup_hits[sup]
        relationship, cab_cue = "", ""
        if rec["self_cabecera"]:
            relationship, cab_cue = "cabecera", cue
        elif rec["dep_num"] is not None:
            relationship = "dependiente"
            cab_cue = resolve_number(sup, rec["dep_num"]) or ""
        elif rec["in_block"]:
            relationship = "dependiente"
            if rec["block_cue"] and rec["block_cue"] in consejo:
                cab_cue = rec["block_cue"]
            elif rec["block_num"] is not None:
                cab_cue = resolve_number(sup, rec["block_num"]) or ""
        if cab_cue and relationship == "dependiente" and cab_cue == cue:
            relationship = "cabecera"
        out["relationship"] = relationship
        out["cabecera_cue"] = cab_cue
        out["status"] = "ok" if cab_cue else "sin_cabecera"
        rows.append(out)
    return rows


def write_csv(path, rows):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    fields = ["cue_anexo", "nombre", "departamento", "supervisor", "relationship", "cabecera_cue", "source", "status"]
    with open(path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row[k] for k in fields})


def load_padron_inicial(path):
    """cue -> True when every padron row of that CUE is Nivel Inicial."""
    if not path:
        return {}
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    levels = collections.defaultdict(set)
    for item in data:
        cue = cue_from_number(item.get("cue_anexo"))
        if cue:
            levels[cue].add((item.get("nivel") or "").strip().lower())
    return {cue: lv == {"inicial"} for cue, lv in levels.items()}


def is_nivel_inicial(cue, nombre, padron_inicial):
    """Return (is_inicial, decided_by) where decided_by is 'padron' or 'name'."""
    if cue in padron_inicial:
        return padron_inicial[cue], "padron"
    name = unicodedata.normalize("NFKD", nombre or "").encode("ascii", "ignore").decode().upper()
    return bool(NIVEL_INICIAL_NAME_RE.search(name)), "name"


# Departments whose remaining schools the user assigned explicitly to one supervisor
# despite a few cross-listed conflict rows (user, 2026-11-11: Esquina).
DEPARTMENT_OVERRIDES = {"ESQUINA": "EDITH SANCHEZ"}


def infer_departments(rows, consejo, padron_inicial):
    """Assign the single supervisor of a departamento to its sin_supervisor schools.

    Only direct evidence (not inferred rows) counts. Returns a dict with the inferred
    departments and the departments with two or more supervisors.
    """
    direct = collections.defaultdict(collections.Counter)
    for r in rows:
        if r["status"] == "sin_supervisor" or not r["supervisor"]:
            continue
        for sup in r["supervisor"].split(" | "):
            direct[r["departamento"]][sup] += 1
    multi = {dep: dict(c) for dep, c in direct.items() if len(c) > 1}
    inferred = {}
    inicial_kept = collections.Counter()
    inicial_source = collections.Counter()
    for r in rows:
        if r["status"] != "sin_supervisor":
            continue
        counts = direct.get(r["departamento"], {})
        if r["departamento"] in DEPARTMENT_OVERRIDES:
            sup = DEPARTMENT_OVERRIDES[r["departamento"]]
        elif len(counts) != 1:
            continue
        else:
            (sup,) = counts
        inicial, decided_by = is_nivel_inicial(r["cue_anexo"], r["nombre"], padron_inicial)
        inicial_source[decided_by] += 1
        if inicial:
            inicial_kept[r["departamento"]] += 1
            continue
        r["supervisor"] = sup
        r["status"] = "inferido_departamento"
        r["source"] = f"inferred:{r['departamento']}"
        inferred.setdefault(r["departamento"], [sup, 0])[1] += 1
    return {
        "inferred": inferred,
        "multi": multi,
        "inicial_kept": inicial_kept,
        "inicial_source": inicial_source,
    }


def summarize(rows, hints):
    status_counts = collections.Counter(r["status"] for r in rows)
    sup_counts = collections.Counter(r["supervisor"] for r in rows if r["supervisor"])
    rel_counts = collections.Counter(r["relationship"] or "empty" for r in rows)
    disagreements = [r["cue_anexo"] for r in rows if r["cue_anexo"] in hints and r["status"] != "ok"]
    return status_counts, sup_counts, rel_counts, len(disagreements)


def write_readme(path, rows, hints, excluded_cues, excluded_records, inference, padded_rows):
    status_counts, sup_counts, rel_counts, hint_unresolved = summarize(rows, hints)
    inicial_source = inference["inicial_source"]
    lines = [
        "# Cuadernillos: Consejo General assignment list",
        "",
        "Generated by `scripts/cuadernillos/build_asignaciones.py` (run with `python3 -I`).",
        "",
        "## Sources",
        "",
        "- School universe: `consejo.csv` (prod DB, `ge_escuela_nivel_jur` with level 9 joined to `ge_localizacion`), one row per school.",
        "- Supervisor evidence: every `.xlsx` sheet under `CUE (1)/<SUPERVISOR>/`. A CUE found in any cell of a sheet is evidence for that folder's supervisor. Source is `file:sheet:row` of the first hit.",
        "- CUE reading: separators (dots, dashes, spaces) are ignored. A CUE written with 8 or 7 digits is read as the 9-digit CUE only when it is a Consejo school and the row names that school's N° (" + f"{padded_rows} rows read this way" + ").",
        "- Cabecera evidence (explicit only): CABECERA marker on the school's own row, block titles with a cabecera number or explicit CUE, and `Dependiente de` columns. Numbers map to a CUE only through the same supervisor's N° columns and only when unique.",
        "- Department inference: a departamento whose direct evidence names exactly one supervisor gives that supervisor to its remaining sin_supervisor schools (status `inferido_departamento`, source `inferred:<departamento>`), except Nivel Inicial schools. Nivel Inicial comes from `escuelas-2026-padron.json` (a CUE is inicial when all its rows are Inicial; " + f"{inicial_source['padron']} schools decided by padron, {inicial_source['name']} by name fallback" + ").",
        "- `escuelas.json`: secondary evidence only, not used to assign anything.",
        "",
        "## Counts",
        "",
        f"- Consejo schools: {len(rows)}",
        f"- Excluded CUEs found in sheets but not in consejo.csv: {len(excluded_cues)} CUEs, {excluded_records} evidence rows",
        f"- Nivel Inicial schools left without supervisor by the department rule: {sum(inference['inicial_kept'].values())}",
        "",
        "| status | schools |",
        "| --- | ---: |",
    ]
    for status in STATUSES:
        lines.append(f"| {status} | {status_counts.get(status, 0)} |")
    lines += ["", "| relationship | schools |", "| --- | ---: |"]
    for rel in ("cabecera", "dependiente", "empty"):
        lines.append(f"| {rel} | {rel_counts.get(rel, 0)} |")
    lines += ["", "## Schools per supervisor (direct evidence and inferred)", "", "| supervisor | schools |", "| --- | ---: |"]
    for sup, count in sorted(sup_counts.items(), key=lambda kv: (-kv[1], kv[0])):
        lines.append(f"| {sup} | {count} |")
    lines += ["", "## Departments inferred from a single supervisor", "", "| departamento | supervisor | schools |", "| --- | --- | ---: |"]
    for dep, (sup, count) in sorted(inference["inferred"].items()):
        lines.append(f"| {dep} | {sup} | {count} |")
    lines += ["", "## Departments with two or more supervisors (not inferred)", ""]
    for dep, counts in sorted(inference["multi"].items()):
        detail = ", ".join(f"{sup}: {n}" for sup, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])))
        remaining = sum(1 for r in rows if r["departamento"] == dep and r["status"] == "sin_supervisor")
        lines.append(f"- {dep} ({remaining} schools without supervisor): {detail}")
    lines += [
        "",
        "Counts are schools with direct evidence per supervisor; a school named under two supervisors counts for both.",
        "",
        "## Known limitations",
        "",
        "- Cabecera is resolved only where the sheet itself says so. Many dependent schools are listed without a cabecera reference; they stay `sin_cabecera`.",
        "- `Dependiente de` numbers that point to a cabecera outside the same supervisor's sheets are not resolved (for example cabecera 65/66 in the Goya Sur sheet).",
        f"- {hint_unresolved} schools that escuelas.json describes with a cabecera reference are still unresolved here; escuelas.json is not used for assignment.",
        "- A CUE that appears in another supervisor's sheet (for example as a cabecera reference) counts as supervisor evidence and can produce `conflicto_supervisor`.",
        "- Conflicting rows keep relationship and cabecera empty; the supervisor list shows both names joined by ` | `.",
        "- Values are not verified against the schools' real assignments. Review conflicts and `sin_cabecera` rows before loading.",
        "- Department inference assumes the sheets' supervisor covers the whole departamento. Departments with two or more supervisors are listed above and left unassigned.",
        "- A malformed CUE that does not match a Consejo school (for example 8 digits with no Consejo school behind them) is not read and does not assign anything.",
        "",
    ]
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--consejo", required=True)
    parser.add_argument("--sheets", required=True)
    parser.add_argument("--escuelas", required=True)
    parser.add_argument("--padron", help="optional padron JSON for Nivel Inicial")
    parser.add_argument("--out", required=True)
    parser.add_argument("--readme", help="optional path for the generated README")
    args = parser.parse_args(argv)

    consejo = load_consejo(args.consejo)
    hints = load_escuelas_hints(args.escuelas, consejo)
    padron_inicial = load_padron_inicial(args.padron)
    records, supervisors = collect(args.sheets)

    outside = [r for r in records if not r.get("pad") and r["cue"] not in consejo]
    excluded_cues = sorted({r["cue"] for r in outside})
    padded = [r for r in resolve_pads(records, consejo) if r.get("pad")]
    padded_rows = len({r["source"] for r in padded})
    rows = build(records, consejo, hints)
    inference = infer_departments(rows, consejo, padron_inicial)
    write_csv(args.out, rows)
    if args.readme:
        write_readme(args.readme, rows, hints, excluded_cues, len(outside), inference, padded_rows)

    status_counts, sup_counts, rel_counts, _ = summarize(rows, hints)
    print(f"supervisors: {len(supervisors)}")
    print(f"consejo schools: {len(rows)}")
    print(f"excluded CUEs (sheets, not in consejo): {len(excluded_cues)} CUEs, {len(outside)} evidence rows")
    print(f"padded CUE rows read: {padded_rows}")
    for status in STATUSES:
        print(f"status {status}: {status_counts.get(status, 0)}")
    print(f"relationship: {dict(rel_counts)}")
    print(f"inferred departments: {dict((d, v) for d, v in inference['inferred'].items())}")
    print(f"multi-supervisor departments: {sorted(inference['multi'])}")
    print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
