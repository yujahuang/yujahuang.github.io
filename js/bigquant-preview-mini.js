(function () {
  // Homepage thumb: SHAP summary beeswarm drawn from interactive JSON (not notebook PNG)
  const canvas = document.getElementById("bigquant-preview");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  let css = 152;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const t0 = performance.now();
  let data = null;

  function loadBeeswarm() {
    if (window.BQ_SHAP && window.BQ_SHAP["02_beeswarm_preview"]) {
      return Promise.resolve(window.BQ_SHAP["02_beeswarm_preview"]);
    }
    return new Promise(function (resolve, reject) {
      const s = document.createElement("script");
      s.src = "assets/data/bigquant-interactive/02_beeswarm_preview.js";
      s.async = true;
      s.onload = function () {
        s.remove();
        if (window.BQ_SHAP && window.BQ_SHAP["02_beeswarm_preview"]) {
          resolve(window.BQ_SHAP["02_beeswarm_preview"]);
        } else {
          reject(new Error("missing beeswarm preview"));
        }
      };
      s.onerror = function () {
        s.remove();
        reject(new Error("script load failed"));
      };
      document.head.appendChild(s);
    });
  }

  function resize() {
    var w = Math.round(canvas.getBoundingClientRect().width) || 152;
    if (w === css && canvas.width) return;
    css = w;
    canvas.width = Math.floor(css * dpr);
    canvas.height = Math.floor(css * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function colorLowHigh(t) {
    t = Math.max(0, Math.min(1, t));
    var r = Math.round(70 + (220 - 70) * t);
    var g = Math.round(120 + (70 - 120) * t);
    var b = Math.round(220 + (70 - 220) * t);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function shortOf(name) {
    return name.length > 14 ? name.slice(0, 13) + "…" : name;
  }

  function drawBeeswarm(W, H, t) {
    var feats = data.features;
    var n = data.shap.length;
    var meanAbs = feats.map(function (_, j) {
      var s = 0;
      for (var i = 0; i < n; i++) s += Math.abs(data.shap[i][j]);
      return s / n;
    });
    var order = feats.map(function (_, i) { return i; })
      .sort(function (a, b) { return meanAbs[b] - meanAbs[a]; });

    var maxAbs = 0;
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < feats.length; j++) {
        var a = Math.abs(data.shap[i][j]);
        if (a > maxAbs) maxAbs = a;
      }
    }
    maxAbs = Math.max(maxAbs, 1e-6);

    var pad = { l: 52, r: 10, t: 10, b: 22 };
    var rowH = (H - pad.t - pad.b) / order.length;
    var xMid = (pad.l + W - pad.r) / 2;
    // gentle pulse so the thumb feels alive
    var breathe = 1 + 0.03 * Math.sin(t * 0.9);
    var xScale = ((W - pad.l - pad.r) * 0.46 / maxAbs) * breathe;

    ctx.fillStyle = "#0b1018";
    ctx.fillRect(0, 0, W, H);

    order.forEach(function (fi, row) {
      var cy = pad.t + row * rowH + rowH * 0.5;
      ctx.fillStyle = "rgba(213,219,230,0.85)";
      ctx.font = "7px Georgia, serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(shortOf(feats[fi]), pad.l - 3, cy);

      var vmin = Infinity;
      var vmax = -Infinity;
      for (var i = 0; i < n; i++) {
        var vv = data.values[i][fi];
        if (vv < vmin) vmin = vv;
        if (vv > vmax) vmax = vv;
      }
      var span = vmax - vmin || 1;

      for (var i = 0; i < n; i++) {
        var sv = data.shap[i][fi];
        var xv = data.values[i][fi];
        var jitter = ((Math.sin(i * 12.9898 + fi * 78.233) * 43758.5453) % 1) - 0.5;
        var x = xMid + sv * xScale;
        var y = cy + jitter * rowH * 0.36;
        ctx.fillStyle = colorLowHigh((xv - vmin) / span);
        ctx.beginPath();
        ctx.arc(x, y, 1.15, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.beginPath();
    ctx.moveTo(xMid, pad.t);
    ctx.lineTo(xMid, H - pad.b);
    ctx.stroke();

    ctx.fillStyle = "rgba(8,12,20,0.72)";
    ctx.fillRect(5, H - 18, 72, 12);
    ctx.fillStyle = "rgba(242,242,242,0.92)";
    ctx.font = "600 7px Georgia, 'Times New Roman', serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("SHAP summary", 9, H - 11);

    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  }

  function drawFallback(W, H) {
    var g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#0b1018");
    g.addColorStop(1, "#141a28");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#9aa3b2";
    ctx.font = "9px Georgia, serif";
    ctx.fillText("Loading SHAP…", 10, H / 2);
  }

  function draw(now) {
    resize();
    var W = css;
    var H = css;
    var t = (now - t0) / 1000;
    if (!data) drawFallback(W, H);
    else drawBeeswarm(W, H, t);
    requestAnimationFrame(draw);
  }

  loadBeeswarm().then(function (d) {
    data = d;
  }).catch(function (err) {
    console.error(err);
  });

  requestAnimationFrame(draw);
})();
