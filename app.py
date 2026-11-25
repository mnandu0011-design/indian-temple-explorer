"""Bharat Temple Darshan - Flask backend.

Serves the JSON API (temples, search, states, heritage datasets) and the
single-page frontend. Data comes from data/temples.json, data/gallery_manifest.json
and the original CSV files (read-only, values are never modified).
"""
import csv
import json
import re
from pathlib import Path

from flask import Flask, abort, jsonify, request, send_from_directory

BASE = Path(__file__).resolve().parent
DATA = BASE / "data"
app = Flask(__name__, static_folder="static", static_url_path="/static")
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 60 * 60 * 24 * 30
app.json.ensure_ascii = False


def slugify(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower().replace("&", "and")).strip("-")


def norm_state(text):
    return re.sub(r"\s+", " ", text.lower().replace("&", "and")).strip()


# --------------------------------------------------------------------- loading
def read_csv(name):
    with open(DATA / name, encoding="utf-8-sig", newline="") as fh:
        return [{k.strip(): (v or "").strip() for k, v in row.items()} for row in csv.DictReader(fh)]


TEMPLES = json.load(open(DATA / "temples.json", encoding="utf-8"))
MANIFEST = json.load(open(DATA / "gallery_manifest.json", encoding="utf-8"))
TEMPLE_BY_SLUG = {t["slug"]: t for t in TEMPLES}

DATASETS = {
    "monuments": dict(file="monuments_data.csv", title="Monuments", name="Monument Name", place="Location (Village/City)", type="Type"),
    "heritage": dict(file="cultural_heritage.csv", title="Cultural Heritage", name="Site Name", place="Location (Village/City)", type="Type"),
    "museums": dict(file="museum_data.csv", title="Museums", name="Museum Name", place="Location(City/Town)", type=None),
    "art": dict(file="art_data.csv", title="Art & Artists", name="Art Form", place="Location (Village/City)", type="Type"),
}
ROWS = {k: read_csv(v["file"]) for k, v in DATASETS.items()}
TOURISM = read_csv("tourism_data.csv")

# canonical state names: tourism file first, then temples
STATE_NAMES = {}
for row in TOURISM:
    STATE_NAMES[norm_state(row["State"])] = row["State"]
for t in TEMPLES:
    STATE_NAMES.setdefault(norm_state(t["state"]), t["state"])
# the temple data uses "Jammu and Kashmir"; tourism file uses "Jammu & Kashmir" (same state)


def row_states(raw):
    """Return canonical state keys for a CSV state value (handles 'Punjab/Haryana')."""
    keys = []
    for part in re.split(r"/", raw):
        k = norm_state(part)
        if k in STATE_NAMES:
            keys.append(k)
    return keys or ([norm_state(raw)] if raw else [])


for ds, rows in ROWS.items():
    for r in rows:
        r["_states"] = row_states(r.get("State", ""))
for r in TOURISM:
    r["_states"] = [norm_state(r["State"])]


# --------------------------------------------------------------------- helpers
def img_urls(slug, n, thumb=False):
    return f"/static/img/temples/{slug}/{'t' if thumb else ''}{n:03d}.webp"


def thumb_dims(w, h, limit=480):
    scale = min(1.0, limit / max(w, h))
    return round(w * scale), round(h * scale)


def temple_summary(t):
    m = MANIFEST[t["slug"]]
    return {
        "slug": t["slug"], "name": t["name"], "city": t["city"], "state": t["state"],
        "region": t["region"], "deity": t["deity"], "tagline": t["tagline"],
        "circuits": t["circuits"], "coords": t["coords"],
        "image": img_urls(t["slug"], 1, thumb=True), "hero": img_urls(t["slug"], 1),
        "photo_count": len(m),
    }


def temple_matches(t, q):
    hay = " ".join([t["name"], t["city"], t["district"], t["state"], t["deity"], t["region"], " ".join(t["keywords"]), " ".join(t["circuits"])]).lower()
    tokens = [x for x in re.split(r"\s+", q.lower().strip()) if x]
    return all(tok in hay for tok in tokens)


def score(t, q):
    q = q.lower().strip()
    s = 0
    if q in t["name"].lower(): s += 10
    if q in t["city"].lower(): s += 6
    if q in t["state"].lower(): s += 5
    if any(q in k for k in t["keywords"]): s += 4
    if q in t["deity"].lower(): s += 2
    return s


def state_stats(key):
    out = {"temples": [t["slug"] for t in TEMPLES if norm_state(t["state"]) == key]}
    for ds, rows in ROWS.items():
        out[ds] = sum(1 for r in rows if key in r["_states"])
    return out


def tourism_row(key):
    for r in TOURISM:
        if norm_state(r["State"]) == key:
            return {
                "domestic_millions": r["Domestic Tourist Arrivals (Millions)"],
                "foreign_2023": r["Foreign Tourist Arrivals (2023)"],
                "highlights": r["Top Tourism Highlights"],
            }
    return None


def public_row(r):
    return {k: v for k, v in r.items() if not k.startswith("_")}


# ------------------------------------------------------------------------ API
@app.get("/api/stats")
def api_stats():
    return jsonify({
        "temples": len(TEMPLES),
        "photos": sum(len(v) for v in MANIFEST.values()),
        "states_with_temples": len({norm_state(t["state"]) for t in TEMPLES}),
        "states_total": len(STATE_NAMES),
        "monuments": len(ROWS["monuments"]), "heritage": len(ROWS["heritage"]),
        "museums": len(ROWS["museums"]), "art": len(ROWS["art"]), "tourism": len(TOURISM),
    })


@app.get("/api/temples")
def api_temples():
    q = request.args.get("q", "").strip()
    state = request.args.get("state", "").strip()
    items = TEMPLES
    if state:
        items = [t for t in items if slugify(norm_state(t["state"])) == slugify(state) or norm_state(t["state"]) == norm_state(state)]
    if q:
        items = sorted([t for t in items if temple_matches(t, q)], key=lambda t: -score(t, q))
    return jsonify({"count": len(items), "temples": [temple_summary(t) for t in items]})


@app.get("/api/temples/<slug>")
def api_temple(slug):
    t = TEMPLE_BY_SLUG.get(slug)
    if not t:
        return jsonify({"error": "Temple not found", "slug": slug}), 404
    gallery = []
    for item in MANIFEST[slug]:
        tw, th = thumb_dims(item["w"], item["h"])
        gallery.append({
            "n": item["n"], "src": img_urls(slug, item["n"]), "thumb": img_urls(slug, item["n"], True),
            "w": item["w"], "h": item["h"], "tw": tw, "th": th,
            "alt": f"{t['name']} - photograph {item['n']}",
        })
    data = {k: v for k, v in t.items() if k not in ("image_folder", "related")}
    data["hero"] = img_urls(slug, 1)
    data["gallery"] = gallery
    data["related"] = [dict(temple_summary(TEMPLE_BY_SLUG[r["slug"]]), why=r["why"]) for r in t["related"]]
    # nearby dataset records from the user's CSV files
    key = norm_state(t["state"])
    data["state_key"] = slugify(key)
    data["state_stats"] = state_stats(key)
    data["state_stats"].pop("temples", None)
    return jsonify(data)


@app.get("/api/search")
def api_search():
    q = request.args.get("q", "").strip()
    if len(q) < 1:
        return jsonify({"query": q, "count": 0, "results": []})
    hits = sorted([t for t in TEMPLES if temple_matches(t, q)], key=lambda t: -score(t, q))
    return jsonify({"query": q, "count": len(hits), "results": [temple_summary(t) for t in hits]})


@app.get("/api/states")
def api_states():
    out = []
    for key, name in sorted(STATE_NAMES.items(), key=lambda kv: kv[1]):
        st = state_stats(key)
        tr = tourism_row(key)
        out.append({"name": name, "slug": slugify(key), "temple_count": len(st["temples"]), "temples": st["temples"],
                    "monuments": st["monuments"], "heritage": st["heritage"], "museums": st["museums"], "art": st["art"],
                    "tourism": tr})
    return jsonify({"count": len(out), "states": out})


@app.get("/api/states/<slug>")
def api_state(slug):
    key = next((k for k in STATE_NAMES if slugify(k) == slug), None)
    if not key:
        return jsonify({"error": "State not found", "slug": slug}), 404
    st = state_stats(key)
    return jsonify({
        "name": STATE_NAMES[key], "slug": slug,
        "temples": [temple_summary(TEMPLE_BY_SLUG[s]) for s in st["temples"]],
        "tourism": tourism_row(key),
        "monuments": [public_row(r) for r in ROWS["monuments"] if key in r["_states"]],
        "heritage": [public_row(r) for r in ROWS["heritage"] if key in r["_states"]],
        "museums": [public_row(r) for r in ROWS["museums"] if key in r["_states"]],
        "art": [public_row(r) for r in ROWS["art"] if key in r["_states"]],
    })


@app.get("/api/datasets/<name>")
def api_dataset(name):
    cfg = DATASETS.get(name)
    if not cfg:
        return jsonify({"error": "Unknown dataset", "available": list(DATASETS)}), 404
    rows = ROWS[name]
    q = request.args.get("q", "").strip().lower()
    state = request.args.get("state", "").strip()
    typ = request.args.get("type", "").strip()
    facets_states = sorted({STATE_NAMES.get(s, s) for r in rows for s in r["_states"]})
    type_col = cfg["type"]
    facets_types = sorted({r[type_col] for r in rows if type_col and r.get(type_col)})
    out = []
    for r in rows:
        if state and slugify(state) not in [slugify(s) for s in r["_states"]]:
            continue
        if typ and type_col and r.get(type_col) != typ:
            continue
        if q and q not in " ".join(v for k, v in r.items() if not k.startswith("_")).lower():
            continue
        out.append(public_row(r))
    try:
        page = max(1, int(request.args.get("page", 1)))
        per = min(100, max(1, int(request.args.get("per", 24))))
    except ValueError:
        return jsonify({"error": "page and per must be integers"}), 400
    start = (page - 1) * per
    return jsonify({
        "dataset": name, "title": cfg["title"], "total": len(out), "page": page, "per": per,
        "columns": list(rows[0].keys())[:-1] if rows else [],
        "rows": out[start:start + per], "states": facets_states, "types": facets_types,
        "name_col": cfg["name"], "place_col": cfg["place"], "type_col": type_col,
    })


@app.get("/api/tourism")
def api_tourism():
    rows = []
    for r in TOURISM:
        key = r["_states"][0]
        try:
            dom = float(r["Domestic Tourist Arrivals (Millions)"])
        except ValueError:
            dom = None
        try:
            frn = int(r["Foreign Tourist Arrivals (2023)"])
        except ValueError:
            frn = None
        rows.append({"state": r["State"], "slug": slugify(key), "domestic_millions": dom, "foreign_2023": frn,
                     "highlights": r["Top Tourism Highlights"], "has_temples": any(norm_state(t["state"]) == key for t in TEMPLES)})
    return jsonify({
        "rows": rows,
        "note": "Values are shown exactly as supplied in tourism_data.csv. The file does not state a year for the domestic figures. "
                "Some values (for example Goa's domestic figure) look inconsistent with other published statistics, so verify against official sources before citing.",
    })


@app.get("/api/map")
def api_map():
    points = []
    for r in ROWS["heritage"]:
        try:
            lat, lon = float(r["Latitude"]), float(r["Longitude"])
        except ValueError:
            continue
        if not (6 <= lat <= 38 and 67 <= lon <= 98):
            continue
        points.append({"name": r["Site Name"], "place": r["Location (Village/City)"], "state": r["State"], "type": r["Type"], "lat": lat, "lon": lon})
    return jsonify({"heritage": points, "temples": [{"slug": t["slug"], "name": t["name"], "lat": t["coords"][0], "lon": t["coords"][1], "state": t["state"]} for t in TEMPLES]})


@app.errorhandler(404)
def not_found(err):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Not found"}), 404
    return send_from_directory(BASE / "templates", "index.html"), 404


# ------------------------------------------------------------ client routes
PAGE_RE = re.compile(r"^(/|/india|/states|/temples|/about)$")


@app.get("/")
@app.get("/india")
@app.get("/states")
@app.get("/temples")
@app.get("/about")
def page():
    return send_from_directory(BASE / "templates", "index.html")


@app.get("/states/<slug>")
def state_page(slug):
    if not any(slugify(k) == slug for k in STATE_NAMES):
        abort(404)
    return send_from_directory(BASE / "templates", "index.html")


@app.get("/temple/<slug>")
def temple_page(slug):
    if slug not in TEMPLE_BY_SLUG:
        abort(404)
    return send_from_directory(BASE / "templates", "index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
