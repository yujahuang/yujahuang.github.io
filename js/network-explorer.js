(function () {
  const canvas = document.getElementById("network-explorer");
  const metaEl = document.getElementById("explorer-meta");
  const hubBar = document.getElementById("hub-buttons");
  const paramsBody = document.getElementById("params-body");
  const paramsSelected = document.getElementById("params-selected");
  if (!canvas || !window.NETWORK_DATA) return;

  const data = window.NETWORK_DATA;
  const ctx = canvas.getContext("2d");
  const HUB_ORDER = ["BTC", "ETH", "USDT", "USDC", "SOL", "BNB", "XRP", "DOGE", "ADA", "TRX"];

  let nodes = data.nodes.slice();
  let nodeMap = {};
  nodes.forEach(function (n) { nodeMap[n.id] = n; });

  let neighborCount = {};
  nodes.forEach(function (n) { neighborCount[n.id] = {}; });

  let links = data.links.map(function (L) {
    var s = nodeMap[L.source];
    var t = nodeMap[L.target];
    if (!s || !t) return null;
    neighborCount[s.id][t.id] = (neighborCount[s.id][t.id] || 0) + 1;
    neighborCount[t.id][s.id] = (neighborCount[t.id][s.id] || 0) + 1;
    return { s: s, t: t, symbol: L.symbol };
  }).filter(Boolean);

  var totalInstruments = (data.meta && data.meta.instruments) || links.length;

  // enrich stats
  nodes.forEach(function (n) {
    var tops = Object.keys(neighborCount[n.id] || {})
      .sort(function (a, b) { return neighborCount[n.id][b] - neighborCount[n.id][a]; })
      .slice(0, 3);
    n.topLinks = tops;
    n.share = n.deg / totalInstruments;
  });
  nodes.sort(function (a, b) { return b.deg - a.deg; });
  nodes.forEach(function (n, i) { n.rank = i + 1; });
  // restore spatial array separate for drawing order
  var drawNodes = data.nodes;

  let world = { cx: 0, cy: 0, span: 2 };
  let cam = { cx: 0, cy: 0, span: 2 };
  let selectedId = null;
  let dragging = false;
  let moved = false;
  let lastX = 0;
  let lastY = 0;
  let cssW = 0;
  let cssH = 0;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  function computeWorld(ns) {
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (var i = 0; i < ns.length; i++) {
      var n = ns[i];
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }
    world = {
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      span: Math.max(maxX - minX, maxY - minY) * 1.12
    };
    cam = { cx: world.cx, cy: world.cy, span: world.span };
  }

  function worldToScreen(x, y) {
    var scale = Math.min(cssW, cssH) / cam.span;
    return { x: cssW / 2 + (x - cam.cx) * scale, y: cssH / 2 + (y - cam.cy) * scale, scale: scale };
  }

  function screenToWorld(sx, sy) {
    var scale = Math.min(cssW, cssH) / cam.span;
    return { x: cam.cx + (sx - cssW / 2) / scale, y: cam.cy + (sy - cssH / 2) / scale };
  }

  function resize() {
    var rect = canvas.getBoundingClientRect();
    cssW = Math.max(1, Math.floor(rect.width));
    cssH = Math.max(1, Math.floor(rect.height));
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function zoomAt(sx, sy, factor) {
    var before = screenToWorld(sx, sy);
    cam.span = Math.max(0.05, Math.min(world.span * 1.4, cam.span * factor));
    var after = screenToWorld(sx, sy);
    cam.cx += before.x - after.x;
    cam.cy += before.y - after.y;
    draw();
  }

  function focusHub(id, select) {
    var n = nodeMap[id];
    if (!n) return;
    if (select !== false) selectAsset(id);
    var targetSpan = world.span * 0.22;
    var from = { cx: cam.cx, cy: cam.cy, span: cam.span };
    var i = 0, steps = 28;
    function step() {
      i += 1;
      var u = i / steps;
      var e = u * u * (3 - 2 * u);
      cam.cx = from.cx + (n.x - from.cx) * e;
      cam.cy = from.cy + (n.y - from.cy) * e;
      cam.span = from.span + (targetSpan - from.span) * e;
      draw();
      if (i < steps) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function nearestNode(sx, sy) {
    var best = null, bestD = 14;
    for (var i = 0; i < drawNodes.length; i++) {
      var n = drawNodes[i];
      var p = worldToScreen(n.x, n.y);
      var dx = p.x - sx, dy = p.y - sy;
      var d = Math.sqrt(dx * dx + dy * dy);
      var thresh = n.major ? 16 : (n.hub ? 12 : 8);
      if (d < thresh && d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  function selectAsset(id) {
    selectedId = id;
    var n = nodeMap[id];
    if (!n) return;
    paramsSelected.innerHTML =
      "<strong>" + n.id + "</strong><br>" +
      "Degree: " + n.deg + " pairs · Rank: #" + n.rank +
      " · Share: " + (100 * n.share).toFixed(1) + "% of instruments<br>" +
      "Top counterparties: " + (n.topLinks.length ? n.topLinks.join(", ") : "—");
    Array.prototype.forEach.call(paramsBody.querySelectorAll("tr"), function (tr) {
      tr.classList.toggle("selected", tr.getAttribute("data-id") === id);
    });
    var row = paramsBody.querySelector('tr[data-id="' + id + '"]');
    if (row) row.scrollIntoView({ block: "nearest" });
    draw();
  }

  function buildTable() {
    paramsBody.innerHTML = "";
    // show top 80 by degree for Asterank-like scannable table
    nodes.slice(0, 80).forEach(function (n) {
      var tr = document.createElement("tr");
      tr.setAttribute("data-id", n.id);
      tr.innerHTML =
        "<td>" + n.id + "</td>" +
        "<td>" + n.deg + "</td>" +
        "<td>#" + n.rank + "</td>" +
        "<td>" + (100 * n.share).toFixed(1) + "%</td>" +
        "<td>" + n.topLinks.join(", ") + "</td>";
      tr.addEventListener("click", function () { focusHub(n.id, true); });
      paramsBody.appendChild(tr);
    });
  }

  function draw() {
    if (!cssW) return;
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = "#faf9f7";
    ctx.fillRect(0, 0, cssW, cssH);

    var zoomLevel = world.span / cam.span;
    var showMinorLabels = zoomLevel > 4.5;
    var showMediumLabels = zoomLevel > 2.2;

    ctx.lineWidth = zoomLevel > 2 ? 0.7 : 0.35;
    ctx.strokeStyle = zoomLevel > 2 ? "rgba(60,60,60,0.28)" : "rgba(60,60,60,0.14)";
    ctx.beginPath();
    for (var i = 0; i < links.length; i++) {
      var L = links[i];
      var highlight = selectedId && (L.s.id === selectedId || L.t.id === selectedId);
      if (highlight) continue;
      var a = worldToScreen(L.s.x, L.s.y);
      var b = worldToScreen(L.t.x, L.t.y);
      if ((a.x < -40 && b.x < -40) || (a.x > cssW + 40 && b.x > cssW + 40)) continue;
      if ((a.y < -40 && b.y < -40) || (a.y > cssH + 40 && b.y > cssH + 40)) continue;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();

    if (selectedId) {
      ctx.strokeStyle = "rgba(6,69,173,0.55)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (i = 0; i < links.length; i++) {
        L = links[i];
        if (L.s.id !== selectedId && L.t.id !== selectedId) continue;
        a = worldToScreen(L.s.x, L.s.y);
        b = worldToScreen(L.t.x, L.t.y);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
    }

    for (i = 0; i < drawNodes.length; i++) {
      var n = drawNodes[i];
      var p = worldToScreen(n.x, n.y);
      if (p.x < -12 || p.y < -12 || p.x > cssW + 12 || p.y > cssH + 12) continue;
      var isSel = n.id === selectedId;
      var r = n.major ? 4.2 : (n.hub ? 3.0 : (zoomLevel > 3 ? 2.0 : 1.2));
      if (isSel) r += 1.4;
      ctx.beginPath();
      ctx.fillStyle = isSel ? "#0645ad" : (n.major ? "#111" : (n.hub ? "#333" : "#777"));
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();

      var label = n.major || (n.hub && showMediumLabels) || (showMinorLabels && n.deg >= 3) || isSel;
      if (label) {
        ctx.fillStyle = isSel ? "#0645ad" : "#111";
        ctx.font = (n.major || isSel ? "700 11px" : "600 9px") + " Georgia, 'Times New Roman', serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(n.id, p.x, p.y - r - 2);
      }
    }

    ctx.fillStyle = "rgba(17,17,17,0.65)";
    ctx.font = "12px Georgia, 'Times New Roman', serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("zoom ×" + zoomLevel.toFixed(1), 10, 10);
  }

  function buildHubButtons() {
    hubBar.innerHTML = "";
    var reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "Fit all";
    reset.addEventListener("click", function () {
      cam = { cx: world.cx, cy: world.cy, span: world.span };
      draw();
    });
    hubBar.appendChild(reset);
    HUB_ORDER.forEach(function (id) {
      if (!nodeMap[id]) return;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = id;
      btn.addEventListener("click", function () { focusHub(id, true); });
      hubBar.appendChild(btn);
    });
  }

  function bind() {
    canvas.addEventListener("wheel", function (e) {
      e.preventDefault();
      var rect = canvas.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 0.88 : 1.12);
    }, { passive: false });

    canvas.addEventListener("pointerdown", function (e) {
      dragging = true;
      moved = false;
      canvas.classList.add("dragging");
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var dxp = e.clientX - lastX;
      var dyp = e.clientY - lastY;
      if (Math.abs(dxp) + Math.abs(dyp) > 3) moved = true;
      var scale = Math.min(cssW, cssH) / cam.span;
      cam.cx -= dxp / scale;
      cam.cy -= dyp / scale;
      lastX = e.clientX;
      lastY = e.clientY;
      draw();
    });
    function endDrag(e) {
      if (dragging && !moved) {
        var rect = canvas.getBoundingClientRect();
        var hit = nearestNode(e.clientX - rect.left, e.clientY - rect.top);
        if (hit) selectAsset(hit.id);
      }
      dragging = false;
      canvas.classList.remove("dragging");
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    }
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    window.addEventListener("resize", resize);
  }

  computeWorld(drawNodes);
  metaEl.textContent =
    (data.meta && data.meta.note ? data.meta.note + " · " : "") +
    drawNodes.length + " assets · " +
    totalInstruments + " instruments · " +
    links.length + " unique pairs";
  buildTable();
  buildHubButtons();
  bind();
  resize();
})();
