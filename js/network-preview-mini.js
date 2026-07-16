(function () {
  const canvas = document.getElementById("paper-network");
  if (!canvas || !window.NETWORK_DATA) return;

  const data = window.NETWORK_DATA;
  const ctx = canvas.getContext("2d");
  const nodes = data.nodes;
  const nodeMap = {};
  nodes.forEach(function (n) { nodeMap[n.id] = n; });
  const links = data.links.map(function (L) {
    return { s: nodeMap[L.source], t: nodeMap[L.target] };
  }).filter(function (L) { return L.s && L.t; });

  // Unified blue for all hubs
  const HUB_RGB = [47, 111, 181];

  function colorFor(_id, alpha) {
    return "rgba(" + HUB_RGB[0] + "," + HUB_RGB[1] + "," + HUB_RGB[2] + "," + alpha + ")";
  }

  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  nodes.forEach(function (n) {
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.y < minY) minY = n.y;
    if (n.y > maxY) maxY = n.y;
  });
  const worldCX = (minX + maxX) / 2;
  const worldCY = (minY + maxY) / 2;
  const worldSpan = Math.max(maxX - minX, maxY - minY) * 1.08;
  const foci = ["USDT", "BTC", "ETH", "SOL", "BNB"].map(function (id) {
    return nodeMap[id] || { x: worldCX, y: worldCY, id: id };
  });

  let css = 152;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const t0 = performance.now();

  function resize() {
    var w = Math.round(canvas.getBoundingClientRect().width) || 152;
    if (w === css && canvas.width) return;
    css = w;
    canvas.width = css * dpr;
    canvas.height = css * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function ease(u) {
    u = Math.max(0, Math.min(1, u));
    return u * u * (3 - 2 * u);
  }

  function camera(t) {
    var overview = 3.2;
    var zoomIn = 2.6;
    var hold = 1.5;
    var zoomOut = 1.7;
    var slot = zoomIn + hold + zoomOut;
    var cycle = overview + foci.length * slot;
    var tc = t % cycle;
    if (tc < overview) {
      return { cx: worldCX, cy: worldCY, span: worldSpan, label: null };
    }
    var rem = tc - overview;
    var idx = Math.min(foci.length - 1, Math.floor(rem / slot));
    var local = rem - idx * slot;
    var focus = foci[idx];
    var close = worldSpan * 0.22;
    if (local < zoomIn) {
      var u = ease(local / zoomIn);
      return {
        cx: worldCX + (focus.x - worldCX) * u,
        cy: worldCY + (focus.y - worldCY) * u,
        span: worldSpan + (close - worldSpan) * u,
        label: focus.id
      };
    }
    if (local < zoomIn + hold) {
      return { cx: focus.x, cy: focus.y, span: close, label: focus.id };
    }
    var v = ease((local - zoomIn - hold) / zoomOut);
    return {
      cx: focus.x + (worldCX - focus.x) * v,
      cy: focus.y + (worldCY - focus.y) * v,
      span: close + (worldSpan - close) * v,
      label: v < 0.45 ? focus.id : null
    };
  }

  function draw(now) {
    resize();
    var W = css;
    var H = css;
    var t = (now - t0) / 1000;
    var cam = camera(t);
    var scale = Math.min(W, H) / cam.span;
    var zoom = worldSpan / cam.span;

    function toScreen(x, y) {
      return { x: W / 2 + (x - cam.cx) * scale, y: H / 2 + (y - cam.cy) * scale };
    }

    // soft paper gradient background
    var bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#f7f4ef");
    bg.addColorStop(0.55, "#f3f0f8");
    bg.addColorStop(1, "#eef5f3");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // faint rim
    ctx.strokeStyle = "rgba(0,0,0,0.06)";
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

    // edges: colored if incident to focused hub, else soft taupe
    for (var i = 0; i < links.length; i++) {
      var L = links[i];
      var a = toScreen(L.s.x, L.s.y);
      var b = toScreen(L.t.x, L.t.y);
      if ((a.x < -24 && b.x < -24) || (a.x > W + 24 && b.x > W + 24)) continue;
      if ((a.y < -24 && b.y < -24) || (a.y > H + 24 && b.y > H + 24)) continue;

      var focused =
        cam.label && (L.s.id === cam.label || L.t.id === cam.label);
      ctx.beginPath();
      if (focused) {
        ctx.strokeStyle = colorFor(cam.label, 0.45);
        ctx.lineWidth = 1.05;
      } else {
        ctx.strokeStyle = zoom > 1.8 ? "rgba(90,85,80,0.16)" : "rgba(90,85,80,0.09)";
        ctx.lineWidth = 0.35;
      }
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // nodes
    for (i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var p = toScreen(n.x, n.y);
      if (p.x < -10 || p.y < -10 || p.x > W + 10 || p.y > H + 10) continue;
      var isFocus = cam.label === n.id;
      var isMajor = !!n.major;
      var r = isMajor ? (isFocus ? 5.2 : 3.6) : (zoom > 2 ? 1.5 : 0.85);

      if (isMajor) {
        ctx.beginPath();
        ctx.fillStyle = colorFor(n.id, isFocus ? 0.22 : 0.12);
        ctx.arc(p.x, p.y, r + 4.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.beginPath();
      ctx.fillStyle = isMajor ? colorFor(n.id, 1) : "rgba(100,95,90,0.7)";
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      if (isMajor) {
        ctx.beginPath();
        ctx.fillStyle = "#fff";
        ctx.arc(p.x, p.y, Math.max(1.1, r * 0.38), 0, Math.PI * 2);
        ctx.fill();
      }

      if (isMajor && (zoom > 1.25 || isFocus)) {
        ctx.fillStyle = "#1f1a17";
        ctx.font = (isFocus ? "700 9px" : "600 8px") + " Georgia, 'Times New Roman', serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(n.id, p.x, p.y - r - 2);
      }
    }

    requestAnimationFrame(draw);
  }

  requestAnimationFrame(draw);
})();
