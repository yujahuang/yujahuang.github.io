"""
Recreate a publication-style market/structure network figure from the instrument list.

NOTE: Without historical returns we cannot recover the original *correlation* matrix.
This rebuilds a trading-pair adjacency network styled like the lost EPS
(hub-and-spoke / core-periphery), which is the natural market-structure counterpart
used in crypto graph papers when only the instrument universe is available.
"""
from pathlib import Path
from collections import Counter
import math

import networkx as nx
import matplotlib.pyplot as plt
from matplotlib.patches import Circle
from matplotlib.collections import LineCollection

QUOTES = sorted(
    [
        "USDT", "USDC", "FDUSD", "BTC", "ETH", "BNB", "BUSD", "TRY", "EUR", "BRL",
        "JPY", "BIDR", "DAI", "TUSD", "AEUR", "EURI", "BFUSD",
    ],
    key=len,
    reverse=True,
)

# Pin major hubs to mimic the original core-periphery look (BTC near center).
HUB_PINS = {
    "BTC": (0.0, 0.0),
    "ETH": (-0.42, 0.12),
    "SOL": (0.38, 0.28),
    "USDT": (0.48, -0.18),
    "USDC": (0.22, -0.42),
    "BNB": (-0.18, 0.45),
    "XRP": (-0.48, -0.28),
    "DOGE": (0.12, 0.48),
    "ADA": (-0.35, 0.38),
    "TRX": (0.40, 0.05),
}


def parse_edges(list_path: Path):
    edges = []
    for raw in list_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        inst = raw.strip()
        if not inst or inst.startswith("#") or inst.lower().startswith("instrument"):
            continue
        for q in QUOTES:
            if inst.endswith(q) and len(inst) > len(q):
                edges.append((inst[: -len(q)], q))
                break
    return edges


def layout(G: nx.Graph):
    # seed spring layout, then snap hubs to pins and lightly relax the rest
    pos = nx.spring_layout(G, seed=7, k=1.8 / math.sqrt(max(G.number_of_nodes(), 1)), iterations=60)
    for h, xy in HUB_PINS.items():
        if h in pos:
            pos[h] = xy

    # one more constrained pass: keep hubs fixed
    fixed = [h for h in HUB_PINS if h in G]
    if fixed:
        pos = nx.spring_layout(
            G,
            pos=pos,
            fixed=fixed,
            seed=7,
            k=1.6 / math.sqrt(max(G.number_of_nodes(), 1)),
            iterations=40,
        )
        for h, xy in HUB_PINS.items():
            if h in pos:
                pos[h] = xy
    return pos


def draw_figure(G, pos, out_path: Path):
    deg = dict(G.degree())
    hubs = set(HUB_PINS) & set(G.nodes)

    fig, ax = plt.subplots(figsize=(11, 9), dpi=180)
    ax.set_aspect("equal")
    ax.axis("off")
    ax.set_facecolor("white")
    fig.patch.set_facecolor("white")

    # edges as thin gray lines
    segs = [[pos[u], pos[v]] for u, v in G.edges()]
    lc = LineCollection(segs, colors=(0.55, 0.55, 0.55, 0.18), linewidths=0.35, zorder=1)
    ax.add_collection(lc)

    xs = [pos[n][0] for n in G.nodes]
    ys = [pos[n][1] for n in G.nodes]
    pad = 0.08
    ax.set_xlim(min(xs) - pad, max(xs) + pad)
    ax.set_ylim(min(ys) - pad, max(ys) + pad)

    # peripheral nodes: small unlabeled dots for clarity at web scale
    for n in G.nodes:
        if n in hubs:
            continue
        x, y = pos[n]
        r = 0.012 + 0.0008 * min(deg[n], 20)
        ax.add_patch(Circle((x, y), r, facecolor="white", edgecolor="#222", linewidth=0.35, zorder=2))

    # hubs: larger labeled discs
    for n in hubs:
        x, y = pos[n]
        r = 0.038 + 0.00015 * min(deg[n], 400)
        ax.add_patch(Circle((x, y), r, facecolor="white", edgecolor="#111", linewidth=1.1, zorder=3))
        ax.text(
            x,
            y,
            n,
            ha="center",
            va="center",
            fontsize=8,
            fontweight="bold",
            color="#111",
            zorder=4,
        )

    ax.set_title(
        "Crypto trading-pair network (instrument universe)\n"
        "Recreated from exchange symbols; hub-and-spoke layout inspired by the paper figure",
        fontsize=10,
        pad=10,
        color="#222",
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, bbox_inches="tight", facecolor="white", pad_inches=0.15)
    plt.close(fig)
    print("saved", out_path, "nodes", G.number_of_nodes(), "edges", G.number_of_edges())


def main():
    root = Path(r"c:\Users\黄雨佳\my_project")
    edges = parse_edges(root / "CV" / "project图片" / "原list")
    G = nx.Graph()
    G.add_edges_from(edges)
    # drop extreme FX quote hubs from visual focus if desired — keep all for fidelity to instruments
    pos = layout(G)
    out = root / "personal-site-chris-style" / "assets" / "images" / "research" / "network_recreated.png"
    draw_figure(G, pos, out)

    # also a cleaner hub-only schematic for tiny thumbnails
    hubs = [h for h in HUB_PINS if h in G]
    H = G.subgraph(hubs).copy()
    # ensure hub-hub edges if they trade against each other; else connect via shared neighbors conceptually
    for a in hubs:
        for b in hubs:
            if a < b and not H.has_edge(a, b):
                # soft edge if they co-appear with many shared neighbors
                if len(set(G.neighbors(a)) & set(G.neighbors(b))) >= 8:
                    H.add_edge(a, b)

    fig, ax = plt.subplots(figsize=(4.2, 4.2), dpi=200)
    ax.set_aspect("equal")
    ax.axis("off")
    ax.set_facecolor("#faf9f7")
    fig.patch.set_facecolor("#faf9f7")

    # regular polygon positions for schematic
    schematic = {}
    for i, h in enumerate(["BTC", "ETH", "USDT", "SOL", "BNB", "USDC", "XRP"]):
        if h not in HUB_PINS:
            continue
        ang = -math.pi / 2 + i * 2 * math.pi / 7
        schematic[h] = (0.55 * math.cos(ang), 0.55 * math.sin(ang))
    schematic["BTC"] = (0.0, 0.0)

    # cycle highlight (path-optimization intuition)
    cycle = ["USDT", "BTC", "ETH", "USDT"]
    for a, b in zip(cycle, cycle[1:]):
        if a in schematic and b in schematic:
            ax.plot(
                [schematic[a][0], schematic[b][0]],
                [schematic[a][1], schematic[b][1]],
                color="#0645ad",
                lw=2.0,
                zorder=2,
                solid_capstyle="round",
            )

    for a, b in H.edges():
        if a in schematic and b in schematic:
            ax.plot(
                [schematic[a][0], schematic[b][0]],
                [schematic[a][1], schematic[b][1]],
                color=(0.5, 0.5, 0.5, 0.35),
                lw=0.8,
                zorder=1,
            )

    for h, (x, y) in schematic.items():
        ax.add_patch(Circle((x, y), 0.12 if h == "BTC" else 0.1, facecolor="white", edgecolor="#111", lw=1.2, zorder=3))
        ax.text(x, y, h, ha="center", va="center", fontsize=8, fontweight="bold", zorder=4)

    ax.set_xlim(-1.05, 1.05)
    ax.set_ylim(-1.05, 1.05)
    thumb = root / "personal-site-chris-style" / "assets" / "images" / "research" / "network_schematic.png"
    fig.savefig(thumb, bbox_inches="tight", facecolor="#faf9f7", pad_inches=0.08)
    plt.close(fig)
    print("saved", thumb)


if __name__ == "__main__":
    main()
