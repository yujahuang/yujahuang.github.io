from pathlib import Path

data = Path(r"c:\Users\黄雨佳\my_project\personal-site-chris-style\assets\data\network_full.json").read_text(encoding="utf-8")

js = r'''(function () {
  const canvas = document.getElementById("paper-network");
  if (!canvas) return;

  const DATA = ''' + data + r''';

  const MAJOR = { BTC: 1, ETH: 1, USDT: 1, USDC: 1, SOL: 1, BNB: 1, XRP: 1 };
  const ZOOM_TARGETS = ["USDT", "BTC", "ETH", "SOL", "BNB", "USDC"];

  const ctx = canvas.getContext("2d");
  let cssSize = 152;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    const w = Math.round(canvas.getBoundingClientRect().width) || 152;
    if (w === cssSize && canvas.width) return;
    cssSize = w;
    canvas.width = cssSize * dpr;
    canvas.height = cssSize * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize);

  const nodes = DATA.nodes;
  const nodeMap = {};
  for (var i = 0; i < nodes.length; i++) nodeMap[nodes[i].id] = nodes[i];

  const links = [];
  for (var j = 0; j < DATA.links.length; j++) {
    var L = DATA.links[j];
    var s = nodeMap[L.source];
    var t = nodeMap[L.target];
    if (s && t) links.push({ s: s, t: t });
  }

  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
  }
  var worldCX = (minX + maxX) / 2;
  var worldCY = (minY + maxY) / 2;
  var worldSpan = Math.max(maxX - minX, maxY - minY) * 1.08;

  function hubFocus(id) {
    var h = nodeMap[id];
    if (!h) return { x: worldCX, y: worldCY };
    return { x: h.x, y: h.y };
  }

  function ease(u) {
    u = Math.max(0, Math.min(1, u));
    return u * u * (3 - 2 * u);
  }

  function lerp(a, b, u) {
    return a + (b - a) * u;
  }

  var t0 = performance.now();
  var PHASE_OVERVIEW = 4.5;
  var PHASE_ZOOM = 3.5;
  var PHASE_HOLD = 2.0;
  var PHASE_OUT = 2.2;

  function camera(now) {
    var t = (now - t0) / 1000;
    var cycleLen = PHASE_OVERVIEW + ZOOM_TARGETS.length * (PHASE_ZOOM + PHASE_HOLD + PHASE_OUT);
    var tc = t % cycleLen;

    if (tc < PHASE_OVERVIEW) {
      return { cx: worldCX, cy: worldCY, span: worldSpan, overview: true, focusId: null };
    }

    var rem = tc - PHASE_OVERVIEW;
    var slot = PHASE_ZOOM + PHASE_HOLD + PHASE_OUT;
    var idx = Math.min(ZOOM_TARGETS.length - 1, Math.floor(rem / slot));
    var local = rem - idx * slot;
    var focus = hubFocus(ZOOM_TARGETS[idx]);
    var closeSpan = worldSpan * 0.26;

    if (local < PHASE_ZOOM) {
      var u = ease(local / PHASE_ZOOM);
      return {
        cx: lerp(worldCX, focus.x, u),
        cy: lerp(worldCY, focus.y, u),
        span: lerp(worldSpan, closeSpan, u),
        overview: false,
        focusId: ZOOM_TARGETS[idx]
      };
    }
    local -= PHASE_ZOOM;
    if (local < PHASE_HOLD) {
      return { cx: focus.x, cy: focus.y, span: closeSpan, overview: false, focusId: ZOOM_TARGETS[idx] };
    }
    local -= PHASE_HOLD;
    var v = ease(local / PHASE_OUT);
    return {
      cx: lerp(focus.x, worldCX, v),
      cy: lerp(focus.y, worldCY, v),
      span: lerp(closeSpan, worldSpan, v),
      overview: v > 0.55,
      focusId: ZOOM_TARGETS[idx]
    };
  }

  function worldToScreen(x, y, cam, W, H) {
    var scale = Math.min(W, H) / cam.span;
    return {
      x: W / 2 + (x - cam.cx) * scale,
      y: H / 2 + (y - cam.cy) * scale
    };
  }

  function frame(now) {
    resize();
    var W = cssSize;
    var H = cssSize;
    var cam = camera(now);

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#faf9f7";
    ctx.fillRect(0, 0, W, H);

    ctx.lineWidth = cam.overview ? 0.3 : 0.65;
    ctx.strokeStyle = cam.overview ? "rgba(60,60,60,0.11)" : "rgba(60,60,60,0.26)";
    ctx.beginPath();
    for (var e = 0; e < links.length; e++) {
      var a = worldToScreen(links[e].s.x, links[e].s.y, cam, W, H);
      var b = worldToScreen(links[e].t.x, links[e].t.y, cam, W, H);
      if ((a.x < -30 && b.x < -30) || (a.x > W + 30 && b.x > W + 30)) continue;
      if ((a.y < -30 && b.y < -30) || (a.y > H + 30 && b.y > H + 30)) continue;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();

    if (!cam.overview && cam.focusId) {
      var drawn = 0;
      for (e = 0; e < links.length && drawn < 16; e++) {
        var ls = links[e].s;
        var lt = links[e].t;
        if (ls.id !== cam.focusId && lt.id !== cam.focusId) continue;
        var u = ((now / 1000) * 0.42 + drawn * 0.1) % 1;
        var px = ls.x + (lt.x - ls.x) * u;
        var py = ls.y + (lt.y - ls.y) * u;
        var p = worldToScreen(px, py, cam, W, H);
        ctx.beginPath();
        ctx.fillStyle = "rgba(6,69,173,0.9)";
        ctx.arc(p.x, p.y, 2.1, 0, Math.PI * 2);
        ctx.fill();
        drawn++;
      }
    }

    for (i = 0; i < nodes.length; i++) {
      n = nodes[i];
      var p = worldToScreen(n.x, n.y, cam, W, H);
      if (p.x < -10 || p.y < -10 || p.x > W + 10 || p.y > H + 10) continue;

      var isMajor = !!MAJOR[n.id];
      var isFocus = cam.focusId === n.id;
      var r = isMajor ? (isFocus ? 5.6 : 3.6) : (cam.overview ? 0.85 : 1.5);

      ctx.beginPath();
      ctx.fillStyle = isMajor ? "#111" : (cam.overview ? "rgba(70,70,70,0.5)" : "#666");
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();

      if (isMajor && (!cam.overview || isFocus)) {
        ctx.fillStyle = "#111";
        ctx.font = (isFocus ? "700 10px" : "600 8px") + " Georgia, 'Times New Roman', serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(n.id, p.x, p.y - r - 2);
      }
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
'''

out = Path(r"c:\Users\黄雨佳\my_project\personal-site-chris-style\js\network-preview.js")
out.write_text(js, encoding="utf-8")
print("wrote", out, "bytes", out.stat().st_size)
