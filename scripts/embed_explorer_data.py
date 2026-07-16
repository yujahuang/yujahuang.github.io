from pathlib import Path

root = Path(r"c:\Users\黄雨佳\my_project\personal-site-chris-style")
data = (root / "assets" / "data" / "network_full.json").read_text(encoding="utf-8")
js_path = root / "js" / "network-explorer.js"
text = js_path.read_text(encoding="utf-8")

marker = "  fetch(\"assets/data/network_full.json\")"
idx = text.find(marker)
if idx < 0:
    raise SystemExit("fetch block not found")

end = text.rfind("})();")
if end < 0:
    raise SystemExit("end not found")

boot = f'''  const DATA = {data};
  (function boot(data) {{
    nodes = data.nodes;
    nodeMap = {{}};
    nodes.forEach(function (n) {{ nodeMap[n.id] = n; }});
    links = data.links.map(function (L) {{
      return {{ s: nodeMap[L.source], t: nodeMap[L.target], symbol: L.symbol }};
    }}).filter(function (L) {{ return L.s && L.t; }});

    computeWorld(nodes);
    metaEl.textContent =
      (data.meta && data.meta.note ? data.meta.note + " · " : "") +
      nodes.length + " assets · " +
      (data.meta ? data.meta.instruments : links.length) + " instruments · " +
      links.length + " unique pairs";
    buildHubButtons();
    bind();
    resize();
  }})(DATA);
}})();
'''

js_path.write_text(text[:idx] + boot, encoding="utf-8")
print("embedded ok", js_path.stat().st_size)
