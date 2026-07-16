"""Build bigquant_desk.json + js/bigquant-data.js from export_for_site/."""
import csv
import json
from pathlib import Path

root = Path(r"c:\Users\黄雨佳\my_project\CV\code sample draft\export_for_site")
out = Path(r"c:\Users\黄雨佳\my_project\personal-site-chris-style\assets\data")
out.mkdir(parents=True, exist_ok=True)
js_path = Path(r"c:\Users\黄雨佳\my_project\personal-site-chris-style\js\bigquant-data.js")


def read_csv(name):
    with (root / name).open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


fi = read_csv("feature_importance.csv")
for r in fi:
    r["gain"] = float(r["gain"])

pos = read_csv("daily_positions.csv")
for r in pos:
    r["rank"] = int(r["rank"])
    r["pred"] = float(r["pred"])
    r["weight"] = float(r["weight"])

nav = read_csv("backtest_nav.csv")
placeholder = any(r.get("note") == "PLACEHOLDER" for r in nav) or all(
    float(r["strategy_nav"]) == 1.0 for r in nav[:50]
)

shap = json.loads((root / "shap_lite.json").read_text(encoding="utf-8"))
features = shap["meta"]["features"]


def short(f, n=22):
    f = f.strip('"')
    return f if len(f) <= n else f[: n - 1] + "…"


payload = {
    "meta": {
        "title": "BigQuant GBDT ranker — SHAP desk",
        "n_features": len(features),
        "n_position_rows": len(pos),
        "n_dates": len({r["date"] for r in pos}),
        "stock_count": 3,
        "hold_days": 5,
        "objective": "rank:pairwise",
        "pred_range": [pos[0]["date"], pos[-1]["date"]] if pos else [],
        "nav_placeholder": placeholder,
        "note": (
            "Daily top-3 holdings by model score. "
            "NAV is a placeholder until a BigTrader export replaces it. "
            "SHAP interactions use mean absolute values over 100k samples."
        ),
    },
    "features": features,
    "feature_short": [short(f) for f in features],
    "importance": [{"feature": r["feature"].strip('"'), "gain": r["gain"]} for r in fi],
    "interaction_mean_abs": shap["interaction_mean_abs"],
    "top_interactions": shap.get("top_interactions", []),
    "main_effect_mean_abs": shap.get("main_effect_mean_abs", []),
    "positions": pos,
    "nav": [
        {
            "date": r["date"],
            "strategy_nav": float(r["strategy_nav"]),
            "benchmark_nav": float(r["benchmark_nav"]),
        }
        for r in nav
    ],
}

json_path = out / "bigquant_desk.json"
text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
json_path.write_text(text, encoding="utf-8")
js_path.write_text("window.BIGQUANT_DATA = " + text + ";\n", encoding="utf-8")
print("json", json_path.stat().st_size, "js", js_path.stat().st_size)
print("dates", payload["meta"]["n_dates"], "pos", len(pos), "placeholder", placeholder)
