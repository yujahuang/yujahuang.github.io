from pathlib import Path
import json
from collections import Counter

import networkx as nx

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
    for q in quotes:
        if inst.endswith(q) and len(inst) > len(q):
            edges.append((inst[: -len(q)], q))
            break

G = nx.Graph()
G.add_edges_from(edges)

deg = dict(G.degree())
major = {"BTC", "ETH", "USDT", "USDC", "SOL", "BNB", "XRP", "TRX", "DOGE", "ADA"}
hubs = set(major) & set(G.nodes)
# also include high-degree nodes as hubs for zoom targets
for n, d in sorted(deg.items(), key=lambda x: -x[1])[:10]:
    hubs.add(n)

# Layout in [-1, 1] box
pos = nx.spring_layout(G, seed=42, k=None, iterations=80, weight=None)

nodes = []
for n, (x, y) in pos.items():
    nodes.append(
        {
            "id": n,
            "x": float(x),
            "y": float(y),
            "hub": n in hubs,
            "major": n in major,
            "deg": int(deg[n]),
        }
    )

links = [{"source": a, "target": b} for a, b in G.edges()]

out = Path(r"c:\Users\黄雨佳\my_project\personal-site-chris-style\assets\data\network_full.json")
out.parent.mkdir(parents=True, exist_ok=True)
payload = {"nodes": nodes, "links": links, "hubs": sorted(hubs)}
out.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"nodes={len(nodes)} links={len(links)} hubs={sorted(hubs)} bytes={out.stat().st_size}")
