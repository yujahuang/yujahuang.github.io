"""Build full trading-pair network layout for interactive zoom explorer."""
from pathlib import Path
import json
import math
from collections import Counter

import networkx as nx

QUOTES = sorted(
    [
        "USDT", "USDC", "FDUSD", "BTC", "ETH", "BNB", "BUSD", "TRY", "EUR", "BRL",
        "JPY", "BIDR", "DAI", "TUSD", "AEUR", "EURI", "BFUSD",
    ],
    key=len,
    reverse=True,
)

HUB_PINS = {
    "BTC": (0.0, 0.0),
    "ETH": (-0.38, 0.10),
    "SOL": (0.34, 0.26),
    "USDT": (0.46, -0.16),
    "USDC": (0.20, -0.40),
    "BNB": (-0.16, 0.42),
    "XRP": (-0.44, -0.26),
    "DOGE": (0.10, 0.46),
    "ADA": (-0.32, 0.36),
    "TRX": (0.38, 0.04),
}

MAJOR = ["BTC", "ETH", "USDT", "USDC", "SOL", "BNB", "XRP", "TRX", "DOGE", "ADA"]


def parse_edges(list_path: Path):
    edges = []
    for raw in list_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        inst = raw.strip()
        if not inst or inst.startswith("#") or inst.lower().startswith("instrument"):
            continue
        for q in QUOTES:
            if inst.endswith(q) and len(inst) > len(q):
                edges.append((inst[: -len(q)], q, inst))
                break
    return edges


def main():
    root = Path(r"c:\Users\黄雨佳\my_project")
    edges_raw = parse_edges(root / "CV" / "project图片" / "原list")
    G = nx.Graph()
    instruments = []
    for a, b, inst in edges_raw:
        G.add_edge(a, b)
        instruments.append(inst)

    deg = dict(G.degree())
    k = 1.7 / math.sqrt(max(G.number_of_nodes(), 1))
    pos = nx.spring_layout(G, seed=7, k=k, iterations=70)
    for h, xy in HUB_PINS.items():
        if h in pos:
            pos[h] = xy
    fixed = [h for h in HUB_PINS if h in G]
    if fixed:
        pos = nx.spring_layout(G, pos=pos, fixed=fixed, seed=7, k=k, iterations=45)
        for h, xy in HUB_PINS.items():
            if h in pos:
                pos[h] = xy

    nodes = []
    for n, (x, y) in pos.items():
        nodes.append(
            {
                "id": n,
                "x": round(float(x), 5),
                "y": round(float(y), 5),
                "deg": int(deg[n]),
                "hub": n in HUB_PINS,
                "major": n in MAJOR,
            }
        )

    # dedupe undirected edges
    seen = set()
    links = []
    for a, b, inst in edges_raw:
        key = tuple(sorted((a, b)))
        if key in seen:
            continue
        seen.add(key)
        links.append({"source": a, "target": b, "symbol": inst})

    payload = {
        "meta": {
            "instruments": len(instruments),
            "nodes": len(nodes),
            "edges": len(links),
            "note": "Trading-pair network from the 2025 instrument universe. Zoom to inspect hubs.",
        },
        "nodes": nodes,
        "links": links,
    }

    out = root / "personal-site-chris-style" / "assets" / "data" / "network_full.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps(payload["meta"], ensure_ascii=False), "bytes", out.stat().st_size)


if __name__ == "__main__":
    main()
