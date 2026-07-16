from pathlib import Path
import json
from collections import Counter

quotes = sorted(
    [
        "USDT", "USDC", "FDUSD", "BTC", "ETH", "BNB", "BUSD", "TRY", "EUR", "BRL",
        "JPY", "BIDR", "DAI", "TUSD", "AEUR", "EURI", "BFUSD",
    ],
    key=len,
    reverse=True,
)

path = Path(r"c:\Users\黄雨佳\my_project\CV\project图片\原list")
edges = []
for raw in path.read_text(encoding="utf-8", errors="ignore").splitlines():
    inst = raw.strip()
    if not inst or inst.startswith("#") or inst.lower().startswith("instrument"):
        continue
    base = quote = None
    for q in quotes:
        if inst.endswith(q) and len(inst) > len(q):
            base, quote = inst[: -len(q)], q
            break
    if base:
        edges.append((base, quote))

deg = Counter()
for a, b in edges:
    deg[a] += 1
    deg[b] += 1

hubs = {n for n, _ in deg.most_common(12)}
for n in ["BTC", "ETH", "USDT", "USDC", "SOL", "BNB", "XRP", "TRX", "DOGE", "ADA"]:
    if n in deg:
        hubs.add(n)

hub_edges = [(a, b) for a, b in edges if a in hubs and b in hubs]
spoke = [(a, b) for a, b in edges if (a in hubs) ^ (b in hubs)]
spoke_scored = []
for a, b in spoke:
    peri = b if a in hubs else a
    spoke_scored.append((deg[peri], a, b))
spoke_scored.sort(reverse=True)

kept_nodes = set(hubs)
kept_edges = set()
for a, b in hub_edges:
    kept_edges.add(tuple(sorted((a, b))))
for _, a, b in spoke_scored[:90]:
    kept_nodes.add(a)
    kept_nodes.add(b)
    kept_edges.add(tuple(sorted((a, b))))

nodes = [{"id": n, "hub": n in hubs, "deg": deg[n]} for n in kept_nodes]
links = [{"source": a, "target": b} for a, b in kept_edges]

out = Path(r"c:\Users\黄雨佳\my_project\personal-site-chris-style\assets\data\network_preview.json")
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps({"nodes": nodes, "links": links}, ensure_ascii=False), encoding="utf-8")
print(f"nodes={len(nodes)} links={len(links)} hubs={sorted(hubs)}")
