"""Download the 3D models listed in models/catalog.json and models/garden/plants.json from Sketchfab.

The models are other people's work (see each entry's author and licence), so they aren't in the repo.
Downloading needs a free Sketchfab account: copy your API token from https://sketchfab.com/settings/password

    python tools/fetch_models.py YOUR_TOKEN        (or set SKETCHFAB_TOKEN)
"""
import json, os, re, sys, urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "models")
token = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("SKETCHFAB_TOKEN")
if not token:
    sys.exit(__doc__)


def get(url, auth=False):
    return urllib.request.urlopen(urllib.request.Request(url, headers={"Authorization": f"Token {token}"} if auth else {}))


def save(url, path, auth=False):
    with get(url, auth) as r, open(path, "wb") as f:
        f.write(r.read())


entries = json.load(open(os.path.join(ROOT, "catalog.json"), encoding="utf-8"))
entries += json.load(open(os.path.join(ROOT, "garden", "plants.json"), encoding="utf-8"))
for e in entries:
    if e.get("exclude"):
        continue
    uid = re.search(r"([0-9a-f]{32})$", e["url"]).group(1)
    glb = os.path.join(ROOT, e["file"])
    os.makedirs(os.path.dirname(glb), exist_ok=True)
    try:
        if not os.path.exists(glb):
            save(json.load(get(f"https://api.sketchfab.com/v3/models/{uid}/download", True))["glb"]["url"], glb)
        if e.get("thumb") and not os.path.exists(os.path.join(ROOT, e["thumb"])):
            m = json.load(get(f"https://api.sketchfab.com/v3/models/{uid}"))
            img = max((i for i in m["thumbnails"]["images"] if i["width"] <= 720), key=lambda i: i["width"])["url"]
            save(img, os.path.join(ROOT, e["thumb"]))
        print("ok    ", e["file"])
    except Exception as err:  # keep going: one unavailable model shouldn't stop the rest
        print("FAILED", e["file"], err)
