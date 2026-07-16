(function () {
  const data = window.BIGQUANT_DATA;
  if (!data) return;

  const DATA_BASE = "assets/data/bigquant-interactive/";
  const cache = {};
  let features = (data.features || []).slice();
  const shorts = data.feature_short || features.map(function (f) {
    return f.length > 22 ? f.slice(0, 21) + "…" : f;
  });
  let M = data.interaction_mean_abs;
  let F = features.length;
  const gainMap = {};
  (data.importance || []).forEach(function (r) { gainMap[r.feature] = r.gain; });
  const shapMap = {};
  (data.main_effect_mean_abs || []).forEach(function (r) { shapMap[r.feature] = r.mean_abs; });
  features.forEach(function (f, i) {
    if (shapMap[f] == null && M && M[i]) shapMap[f] = M[i][i];
  });
  let ranked = features.slice().sort(function (a, b) {
    return (shapMap[b] || 0) - (shapMap[a] || 0);
  });

  const VIEWS = [
    { id: "summary", option: "SHAP summary", title: "SHAP summary (beeswarm)", blurb: "Each point is one factor’s contribution in one prediction. Left/right = pushes the score down/up; color = how high or low the factor value is. A global read on what matters and whether the directions make sense.", mode: "json", file: "02_beeswarm.json", draw: "beeswarm" },
    { id: "heatmap", option: "instance heatmap", title: "Instance heatmap", blurb: "Many stocks across columns, factors down the rows, color is SHAP. Check whether the same factors keep being used, and whether patterns look consistent across names.", mode: "json", file: "03_heatmap.json", draw: "heatmap" },
    { id: "waterfall", option: "waterfall", title: "Waterfall", blurb: "Start from the model’s average score, then add or subtract one factor at a time until you reach this prediction. Clearest view of why one name got today’s score.", mode: "json", file: "04_waterfall.json", draw: "waterfall" },
    { id: "decision", option: "decision path", title: "Decision path", blurb: "Same idea as the waterfall, drawn as a path: how the score walks step by step to the final value.", mode: "json", file: "05_decision_single.json", draw: "decision1" },
    { id: "decision-multi", option: "decision (multi)", title: "Decision (multi)", blurb: "Many stocks start from the same base and fan out on different paths. See where their explanations diverge.", mode: "json", file: "06_decision_multi.json", draw: "decisionN" },
    { id: "scatter", option: "scatter · return_5", title: "Scatter · return_5", blurb: "x is the return_5 value; y is its SHAP. Shows when recent performance sits in a range that adds to or subtracts from the score.", mode: "json", file: "07_scatter_return5.json", draw: "scatter" },
    { id: "dependence", option: "dependence · pe_ttm", title: "Dependence · pe_ttm", blurb: "Same idea for valuation (pe_ttm). Color often carries another factor such as return_10, hinting that valuation’s effect may be nudged by momentum.", mode: "json", file: "08_dependence_pe_ttm.json", draw: "scatter" },
    { id: "interaction", option: "interaction matrix", title: "Interaction matrix", blurb: "How strongly two factors jointly move the score. Brighter = those two often act together, not only on their own.", mode: "json", file: "09_interaction_matrix.json", draw: "matrix" },
    { id: "importance", option: "mean |SHAP| bars", title: "Mean |SHAP| bars", blurb: "Average absolute contribution per factor. A simple leaderboard of what mattered most globally.", mode: "json", file: "01_importance.json", draw: "bars" }
  ];

  const viewSelect = document.getElementById("view-select");
  const jumpSelect = document.getElementById("jump-select");
  const blurbEl = document.getElementById("view-blurb");
  const titleEl = document.getElementById("view-title");
  const canvas = document.getElementById("viz-canvas");
  const ctx = canvas.getContext("2d");
  const statusEl = document.getElementById("viz-status");
  const tipEl = document.getElementById("viz-tip");
  const stage = document.getElementById("stage");
  const searchEl = document.getElementById("factor-search");
  const insName = document.getElementById("ins-name");
  const insPlain = document.getElementById("ins-plain");
  const insGain = document.getElementById("ins-gain");
  const insShap = document.getElementById("ins-shap");
  const insPartners = document.getElementById("ins-partners");

  let viewIdx = 0;
  let hitRegions = [];
  let drawToken = 0;
  let hoverFeature = null;
  let hoverDetail = null;

  VIEWS.forEach(function (v, i) {
    const o1 = document.createElement("option");
    o1.value = String(i);
    o1.textContent = v.option;
    viewSelect.appendChild(o1);
    const o2 = document.createElement("option");
    o2.value = String(i);
    o2.textContent = v.option;
    jumpSelect.appendChild(o2);
  });

  function shortOf(name) {
    const i = features.indexOf(name);
    if (i >= 0 && shorts[i]) return shorts[i];
    return name.length > 22 ? name.slice(0, 21) + "…" : name;
  }

  function partnersOf(name) {
    const i = features.indexOf(name);
    if (i < 0 || !M) return [];
    const rows = [];
    for (let j = 0; j < F; j++) {
      if (j === i) continue;
      rows.push({ other: features[j], v: M[i][j] });
    }
    rows.sort(function (a, b) { return b.v - a.v; });
    return rows.slice(0, 5);
  }

  function selectFeature(name, detail) {
    if (!name || features.indexOf(name) < 0) return;
    const d = detail || null;
    if (name === hoverFeature && d === hoverDetail) return;
    const featureChanged = name !== hoverFeature;
    hoverFeature = name;
    hoverDetail = d;
    const shap = shapMap[name];
    const gain = gainMap[name];
    insName.textContent = name;
    let plain =
      "#" + (ranked.indexOf(name) + 1) + " by mean |SHAP| · avg |shift| ≈ " +
      (shap != null ? shap.toFixed(4) : "—") +
      (gain != null ? " · gain " + gain.toFixed(1) : "");
    if (d) plain += " · " + d;
    insPlain.textContent = plain;
    insGain.textContent = gain != null ? gain.toFixed(2) : "—";
    insShap.textContent = shap != null ? shap.toFixed(5) : "—";
    if (!featureChanged) return;
    const parts = partnersOf(name);
    insPartners.innerHTML = parts.map(function (p) {
      return "<li><button type='button' data-f=\"" + p.other.replace(/"/g, "&quot;") + "\">" +
        shortOf(p.other) + "</button> · " + p.v.toFixed(4) + "</li>";
    }).join("") || "<li style='color:#9aa3b2'>No interaction table</li>";
    insPartners.querySelectorAll("button").forEach(function (b) {
      b.addEventListener("click", function () {
        selectFeature(b.getAttribute("data-f"));
        searchEl.value = b.getAttribute("data-f");
      });
    });
  }

  function resolveFactorQuery(q) {
    const s = (q || "").trim().toLowerCase();
    if (!s) return null;
    let hit = features.find(function (f) { return f.toLowerCase() === s; });
    if (hit) return hit;
    hit = features.find(function (f) { return f.toLowerCase().indexOf(s) >= 0; });
    if (hit) return hit;
    hit = features.find(function (f, i) {
      return (shorts[i] || "").toLowerCase().indexOf(s) >= 0;
    });
    return hit || null;
  }

  searchEl.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    const hit = resolveFactorQuery(searchEl.value);
    if (hit) {
      selectFeature(hit);
      searchEl.value = hit;
    }
  });
  searchEl.addEventListener("input", function () {
    const hit = resolveFactorQuery(searchEl.value);
    if (hit && searchEl.value.trim().length >= 2) selectFeature(hit);
  });

  function loadJSON(file) {
    if (cache[file]) return Promise.resolve(cache[file]);
    // Prefer script tags so file:// local preview works (fetch is blocked there).
    const stem = file.replace(/\.json$/i, "");
    const key = stem;
    if (window.BQ_SHAP && window.BQ_SHAP[key]) {
      cache[file] = window.BQ_SHAP[key];
      return Promise.resolve(cache[file]);
    }
    return new Promise(function (resolve, reject) {
      const s = document.createElement("script");
      s.src = DATA_BASE + stem + ".js";
      s.async = true;
      s.onload = function () {
        s.remove();
        if (window.BQ_SHAP && window.BQ_SHAP[key]) {
          cache[file] = window.BQ_SHAP[key];
          resolve(cache[file]);
        } else {
          reject(new Error("missing payload " + key));
        }
      };
      s.onerror = function () {
        s.remove();
        // Fallback for http(s) hosts that only have .json checked in.
        fetch(DATA_BASE + file).then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.json();
        }).then(function (j) {
          cache[file] = j;
          resolve(j);
        }).catch(reject);
      };
      document.head.appendChild(s);
    });
  }

  function syncFeaturesFromExport(d) {
    if (!d || !d.features) return;
    features = d.features.slice();
    F = features.length;
    if (d.mean_abs_shap) {
      d.features.forEach(function (f, i) { shapMap[f] = d.mean_abs_shap[i]; });
      ranked = features.slice().sort(function (a, b) {
        return (shapMap[b] || 0) - (shapMap[a] || 0);
      });
    }
    if (d.mean_abs) {
      M = d.mean_abs;
    }
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function percentile(arr, p) {
    if (!arr.length) return 0;
    const s = arr.slice().sort(function (a, b) { return a - b; });
    const i = (s.length - 1) * p;
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    if (lo === hi) return s[lo];
    return s[lo] + (s[hi] - s[lo]) * (i - lo);
  }
  function colorLowHigh(t) {
    t = clamp(t, 0, 1);
    const r = Math.round(lerp(70, 220, t));
    const g = Math.round(lerp(120, 70, t));
    const b = Math.round(lerp(220, 70, t));
    return "rgb(" + r + "," + g + "," + b + ")";
  }
  function colorShap(v, maxAbs) {
    const t = clamp(0.5 + 0.5 * (v / (maxAbs || 1e-9)), 0, 1);
    return colorLowHigh(t);
  }

  function fitCanvas() {
    const rect = stage.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width));
    const h = Math.max(280, Math.floor(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: w, h: h };
  }

  function clear(w, h) {
    ctx.fillStyle = "#0b1018";
    ctx.fillRect(0, 0, w, h);
    hitRegions = [];
  }

  function drawAxesFrame(pad, w, h, x0, x1, yLabel) {
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t);
    ctx.lineTo(pad.l, h - pad.b);
    ctx.lineTo(w - pad.r, h - pad.b);
    ctx.stroke();
    ctx.fillStyle = "#9aa3b2";
    ctx.font = "12px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText(x0.toFixed(3), pad.l, h - pad.b + 16);
    ctx.fillText(x1.toFixed(3), w - pad.r, h - pad.b + 16);
    if (yLabel) {
      ctx.textAlign = "left";
      ctx.fillText(yLabel, pad.l + 4, pad.t - 8);
    }
  }

  function drawBars(d, size) {
    const w = size.w;
    const h = size.h;
    clear(w, h);
    const feats = d.features.slice();
    const vals = d.mean_abs_shap.slice();
    const order = feats.map(function (_, i) { return i; })
      .sort(function (a, b) { return vals[b] - vals[a]; });
    const pad = { l: 150, r: 28, t: 28, b: 36 };
    const maxV = vals[order[0]] || 1;
    const rowH = (h - pad.t - pad.b) / order.length;
    order.forEach(function (fi, row) {
      const y = pad.t + row * rowH + rowH * 0.15;
      const bh = rowH * 0.7;
      const bw = ((w - pad.l - pad.r) * vals[fi]) / maxV;
      ctx.fillStyle = "#c9a227";
      ctx.fillRect(pad.l, y, bw, bh);
      ctx.fillStyle = "#d5dbe6";
      ctx.font = "12px Georgia, serif";
      ctx.textAlign = "right";
      ctx.fillText(shortOf(feats[fi]), pad.l - 8, y + bh * 0.72);
      hitRegions.push({
        x: pad.l, y: y, w: Math.max(bw, 4), h: bh,
        tip: feats[fi] + "\nmean |SHAP| = " + vals[fi].toFixed(5),
        feature: feats[fi]
      });
    });
    ctx.fillStyle = "#9aa3b2";
    ctx.textAlign = "center";
    ctx.fillText("mean |SHAP|", (pad.l + w - pad.r) / 2, h - 12);
  }

  function drawBeeswarm(d, size) {
    const w = size.w;
    const h = size.h;
    clear(w, h);
    const feats = d.features;
    const n = d.shap.length;
    const meanAbs = feats.map(function (_, j) {
      let s = 0;
      for (let i = 0; i < n; i++) s += Math.abs(d.shap[i][j]);
      return s / n;
    });
    const order = feats.map(function (_, i) { return i; })
      .sort(function (a, b) { return meanAbs[b] - meanAbs[a]; });
    let maxAbs = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < feats.length; j++) {
        const a = Math.abs(d.shap[i][j]);
        if (a > maxAbs) maxAbs = a;
      }
    }
    maxAbs = Math.max(maxAbs, 1e-6);
    const pad = { l: 150, r: 70, t: 24, b: 36 };
    const rowH = (h - pad.t - pad.b) / order.length;
    const xMid = (pad.l + w - pad.r) / 2;
    const xScale = (w - pad.l - pad.r) * 0.48 / maxAbs;

    // color legend
    for (let k = 0; k < 40; k++) {
      ctx.fillStyle = colorLowHigh(k / 39);
      ctx.fillRect(w - pad.r + 18, pad.t + k * 3, 10, 3.2);
    }
    ctx.fillStyle = "#9aa3b2";
    ctx.font = "10px Georgia, serif";
    ctx.textAlign = "left";
    ctx.fillText("High", w - pad.r + 32, pad.t + 10);
    ctx.fillText("Low", w - pad.r + 32, pad.t + 120);

    const step = Math.max(1, Math.floor(n / 900));
    order.forEach(function (fi, row) {
      const cy = pad.t + row * rowH + rowH * 0.5;
      ctx.fillStyle = "#d5dbe6";
      ctx.font = "12px Georgia, serif";
      ctx.textAlign = "right";
      ctx.fillText(shortOf(feats[fi]), pad.l - 8, cy + 4);

      // feature value range for coloring
      let vmin = Infinity;
      let vmax = -Infinity;
      for (let i = 0; i < n; i += step) {
        const vv = d.values[i][fi];
        if (vv < vmin) vmin = vv;
        if (vv > vmax) vmax = vv;
      }
      const span = vmax - vmin || 1;

      for (let i = 0; i < n; i += step) {
        const sv = d.shap[i][fi];
        const xv = d.values[i][fi];
        const x = xMid + sv * xScale;
        const jitter = ((Math.sin(i * 12.9898 + fi * 78.233) * 43758.5453) % 1) - 0.5;
        const y = cy + jitter * rowH * 0.38;
        ctx.fillStyle = colorLowHigh((xv - vmin) / span);
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      hitRegions.push({
        x: pad.l, y: cy - rowH * 0.4, w: w - pad.l - pad.r, h: rowH * 0.8,
        tip: feats[fi] + "\nmean |SHAP| = " + meanAbs[fi].toFixed(5),
        feature: feats[fi],
        detail: "beeswarm mean |SHAP| " + meanAbs[fi].toFixed(5)
      });
    });

    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.beginPath();
    ctx.moveTo(xMid, pad.t);
    ctx.lineTo(xMid, h - pad.b);
    ctx.stroke();
    ctx.fillStyle = "#9aa3b2";
    ctx.textAlign = "center";
    ctx.fillText("← lowers score          SHAP value          raises score →", xMid, h - 12);
  }

  function drawHeatmap(d, size) {
    const w = size.w;
    const h = size.h;
    clear(w, h);
    const feats = d.features;
    const order = feats.map(function (_, i) { return i; }).sort(function (a, b) {
      let sa = 0;
      let sb = 0;
      for (let r = 0; r < d.shap.length; r++) {
        sa += Math.abs(d.shap[r][a]);
        sb += Math.abs(d.shap[r][b]);
      }
      return sb - sa;
    });
    let maxAbs = 0;
    d.shap.forEach(function (row) {
      row.forEach(function (v) {
        const a = Math.abs(v);
        if (a > maxAbs) maxAbs = a;
      });
    });
    const pad = { l: 150, r: 24, t: 28, b: 40 };
    const cw = (w - pad.l - pad.r) / d.shap.length;
    const ch = (h - pad.t - pad.b) / order.length;
    order.forEach(function (fi, row) {
      const y = pad.t + row * ch;
      ctx.fillStyle = "#d5dbe6";
      ctx.font = "11px Georgia, serif";
      ctx.textAlign = "right";
      ctx.fillText(shortOf(feats[fi]), pad.l - 6, y + ch * 0.72);
      for (let c = 0; c < d.shap.length; c++) {
        const v = d.shap[c][fi];
        ctx.fillStyle = colorShap(v, maxAbs);
        ctx.fillRect(pad.l + c * cw, y, Math.max(cw, 1), ch - 0.5);
      }
      hitRegions.push({
        x: pad.l, y: y, w: w - pad.l - pad.r, h: ch,
        tip: feats[fi],
        feature: feats[fi],
        detail: "row mean |SHAP| across instances"
      });
    });
    ctx.fillStyle = "#9aa3b2";
    ctx.textAlign = "center";
    ctx.fillText("instances →", (pad.l + w - pad.r) / 2, h - 14);
  }

  function drawWaterfall(d, size) {
    const w = size.w;
    const h = size.h;
    clear(w, h);
    const order = d.features.map(function (_, i) { return i; })
      .sort(function (a, b) { return Math.abs(d.shap[b]) - Math.abs(d.shap[a]); });
    const pad = { l: 160, r: 40, t: 36, b: 40 };
    const vals = [d.base_value];
    let run = d.base_value;
    order.forEach(function (i) {
      run += d.shap[i];
      vals.push(run);
    });
    const mn = Math.min.apply(null, vals.concat([d.f_x]));
    const mx = Math.max.apply(null, vals.concat([d.f_x]));
    const span = mx - mn || 1;
    const xOf = function (v) { return pad.l + ((v - mn) / span) * (w - pad.l - pad.r); };
    const rows = order.length + 1;
    const rowH = (h - pad.t - pad.b) / rows;

    ctx.fillStyle = "#9aa3b2";
    ctx.font = "12px Georgia, serif";
    ctx.textAlign = "left";
    ctx.fillText("base → f(x) = " + d.f_x.toFixed(4), pad.l, 18);

    let cur = d.base_value;
    ctx.fillStyle = "#d5dbe6";
    ctx.textAlign = "right";
    ctx.fillText("E[f(x)]", pad.l - 8, pad.t + rowH * 0.55);
    ctx.fillStyle = "#8eb6ff";
    ctx.fillRect(Math.min(xOf(0), xOf(cur)), pad.t + rowH * 0.2, Math.abs(xOf(cur) - xOf(Math.min(0, cur))) || 2, rowH * 0.55);

    order.forEach(function (fi, row) {
      const y = pad.t + (row + 1) * rowH;
      const next = cur + d.shap[fi];
      const x0 = xOf(cur);
      const x1 = xOf(next);
      ctx.fillStyle = d.shap[fi] >= 0 ? "#c45c5c" : "#5b8fd9";
      ctx.fillRect(Math.min(x0, x1), y + rowH * 0.15, Math.max(Math.abs(x1 - x0), 2), rowH * 0.55);
      ctx.fillStyle = "#d5dbe6";
      ctx.textAlign = "right";
      ctx.fillText(shortOf(d.features[fi]), pad.l - 8, y + rowH * 0.55);
      hitRegions.push({
        x: Math.min(x0, x1), y: y + rowH * 0.15, w: Math.max(Math.abs(x1 - x0), 2), h: rowH * 0.55,
        tip: d.features[fi] + " = " + Number(d.feature_values[fi]).toPrecision(4) +
          "\nSHAP " + (d.shap[fi] >= 0 ? "+" : "") + d.shap[fi].toFixed(5),
        feature: d.features[fi]
      });
      cur = next;
    });
    ctx.strokeStyle = "rgba(240,211,90,0.7)";
    ctx.beginPath();
    ctx.moveTo(xOf(d.f_x), pad.t);
    ctx.lineTo(xOf(d.f_x), h - pad.b);
    ctx.stroke();
  }

  function drawDecision1(d, size) {
    const w = size.w;
    const h = size.h;
    clear(w, h);
    const order = d.features.map(function (_, i) { return i; })
      .sort(function (a, b) { return Math.abs(d.shap[b]) - Math.abs(d.shap[a]); });
    const pad = { l: 40, r: 40, t: 36, b: 50 };
    const xs = [d.base_value];
    let run = d.base_value;
    order.forEach(function (i) {
      run += d.shap[i];
      xs.push(run);
    });
    const mn = Math.min.apply(null, xs);
    const mx = Math.max.apply(null, xs);
    const span = mx - mn || 1;
    const xOf = function (v) { return pad.l + ((v - mn) / span) * (w - pad.l - pad.r); };
    const yStep = (h - pad.t - pad.b) / order.length;

    ctx.fillStyle = "#9aa3b2";
    ctx.font = "12px Georgia, serif";
    ctx.fillText("decision path · f(x)=" + d.f_x.toFixed(4), pad.l, 18);

    ctx.strokeStyle = "#f0d35a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xOf(d.base_value), pad.t);
    let cur = d.base_value;
    order.forEach(function (fi, i) {
      cur += d.shap[fi];
      const y = pad.t + (i + 1) * yStep;
      ctx.lineTo(xOf(cur), y);
    });
    ctx.stroke();
    ctx.lineWidth = 1;

    cur = d.base_value;
    order.forEach(function (fi, i) {
      cur += d.shap[fi];
      const y = pad.t + (i + 1) * yStep;
      ctx.fillStyle = "#d5dbe6";
      ctx.beginPath();
      ctx.arc(xOf(cur), y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.textAlign = "left";
      ctx.fillText(shortOf(d.features[fi]), xOf(cur) + 8, y + 4);
      hitRegions.push({
        x: pad.l, y: y - yStep * 0.45, w: w - pad.l - pad.r, h: yStep * 0.9,
        tip: d.features[fi] + "\nSHAP " + (d.shap[fi] >= 0 ? "+" : "") + d.shap[fi].toFixed(5),
        feature: d.features[fi],
        detail: "path Δ " + (d.shap[fi] >= 0 ? "+" : "") + d.shap[fi].toFixed(5)
      });
    });
  }

  function drawDecisionN(d, size) {
    const w = size.w;
    const h = size.h;
    clear(w, h);
    const pad = { l: 40, r: 40, t: 36, b: 40 };
    const feats = d.features;
    const order = feats.map(function (_, i) { return i; }).sort(function (a, b) {
      let sa = 0;
      let sb = 0;
      d.paths.forEach(function (p) {
        sa += Math.abs(p.shap[a]);
        sb += Math.abs(p.shap[b]);
      });
      return sb - sa;
    });
    let mn = d.base_value;
    let mx = d.base_value;
    d.paths.forEach(function (p) {
      let run = d.base_value;
      order.forEach(function (fi) {
        run += p.shap[fi];
        if (run < mn) mn = run;
        if (run > mx) mx = run;
      });
    });
    const span = mx - mn || 1;
    const xOf = function (v) { return pad.l + ((v - mn) / span) * (w - pad.l - pad.r); };
    const yStep = (h - pad.t - pad.b) / order.length;

    ctx.fillStyle = "#9aa3b2";
    ctx.font = "12px Georgia, serif";
    ctx.fillText(d.paths.length + " decision paths", pad.l, 18);

    d.paths.forEach(function (p, pi) {
      ctx.strokeStyle = "hsla(" + (200 + pi * 12) + ",70%,65%,0.55)";
      ctx.beginPath();
      ctx.moveTo(xOf(d.base_value), pad.t);
      let cur = d.base_value;
      order.forEach(function (fi, i) {
        cur += p.shap[fi];
        ctx.lineTo(xOf(cur), pad.t + (i + 1) * yStep);
      });
      ctx.stroke();
    });

    order.forEach(function (fi, i) {
      const y = pad.t + (i + 1) * yStep;
      ctx.fillStyle = "rgba(213,219,230,0.85)";
      ctx.textAlign = "left";
      ctx.fillText(shortOf(feats[fi]), pad.l, y - 2);
      hitRegions.push({
        x: pad.l, y: y - yStep * 0.45, w: w - pad.l - pad.r, h: yStep * 0.9,
        tip: feats[fi],
        feature: feats[fi]
      });
    });
  }

  function drawScatter(d, size) {
    const w = size.w;
    const h = size.h;
    clear(w, h);
    const pad = { l: 56, r: 70, t: 36, b: 44 };
    const n = d.x.length;
    const step = Math.max(1, Math.floor(n / 3500));
    const xs = [];
    const ys = [];
    for (let i = 0; i < n; i += step) {
      xs.push(d.x[i]);
      ys.push(d.shap[i]);
    }
    const x0 = percentile(xs, 0.02);
    const x1 = percentile(xs, 0.98);
    const y0 = percentile(ys, 0.02);
    const y1 = percentile(ys, 0.98);
    const xOf = function (v) {
      return pad.l + (clamp((v - x0) / (x1 - x0 || 1), -0.05, 1.05) * (w - pad.l - pad.r));
    };
    const yOf = function (v) {
      return h - pad.b - (clamp((v - y0) / (y1 - y0 || 1), -0.05, 1.05) * (h - pad.t - pad.b));
    };

    let c0 = 0;
    let c1 = 1;
    if (d.color) {
      const cs = [];
      for (let i = 0; i < n; i += step) cs.push(d.color[i]);
      c0 = percentile(cs, 0.05);
      c1 = percentile(cs, 0.95);
    }

    ctx.fillStyle = "#9aa3b2";
    ctx.font = "12px Georgia, serif";
    ctx.textAlign = "left";
    ctx.fillText((d.feature || "feature") + " → SHAP" +
      (d.color_feature ? " · color = " + d.color_feature : ""), pad.l, 18);

    for (let i = 0; i < n; i += step) {
      const xv = d.x[i];
      const yv = d.shap[i];
      if (d.color) {
        ctx.fillStyle = colorLowHigh(clamp((d.color[i] - c0) / (c1 - c0 || 1), 0, 1));
      } else {
        ctx.fillStyle = "rgba(142,182,255,0.55)";
      }
      ctx.beginPath();
      ctx.arc(xOf(xv), yOf(yv), 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t);
    ctx.lineTo(pad.l, h - pad.b);
    ctx.lineTo(w - pad.r, h - pad.b);
    ctx.stroke();
    ctx.fillStyle = "#9aa3b2";
    ctx.textAlign = "center";
    ctx.fillText(d.feature || "x", (pad.l + w - pad.r) / 2, h - 12);
    ctx.save();
    ctx.translate(16, (pad.t + h - pad.b) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("SHAP", 0, 0);
    ctx.restore();

    if (d.color) {
      for (let k = 0; k < 40; k++) {
        ctx.fillStyle = colorLowHigh(k / 39);
        ctx.fillRect(w - pad.r + 18, pad.t + k * 3, 10, 3.2);
      }
      ctx.fillStyle = "#9aa3b2";
      ctx.font = "10px Georgia, serif";
      ctx.textAlign = "left";
      ctx.fillText("High", w - pad.r + 32, pad.t + 10);
      ctx.fillText("Low", w - pad.r + 32, pad.t + 120);
    }

    // One hit region for the plotted feature; nearest-point tip on move handled via scatterPick
    hitRegions.push({
      x: pad.l, y: pad.t, w: w - pad.l - pad.r, h: h - pad.t - pad.b,
      tip: d.feature,
      feature: d.feature,
      scatter: { x: d.x, shap: d.shap, color: d.color, color_feature: d.color_feature, xOf: xOf, yOf: yOf, step: step }
    });
  }

  function drawMatrix(d, size) {
    const w = size.w;
    const h = size.h;
    clear(w, h);
    const feats = d.features;
    const mat = d.mean_abs;
    let maxV = 0;
    mat.forEach(function (row) {
      row.forEach(function (v) { if (v > maxV) maxV = v; });
    });
    const n = feats.length;
    const labelW = 118;
    const topH = 48;
    const margin = 16;
    const cell = Math.min(
      (w - labelW - margin * 2) / n,
      (h - topH - margin * 2) / n
    );
    const grid = n * cell;
    const blockW = labelW + grid;
    const blockH = topH + grid;
    const ox0 = (w - blockW) / 2;
    const oy0 = (h - blockH) / 2;
    const ox = ox0 + labelW;
    const oy = oy0 + topH;

    ctx.fillStyle = "#9aa3b2";
    ctx.font = "12px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText("mean |SHAP interaction|", ox + grid / 2, oy0 + 16);

    for (let i = 0; i < n; i++) {
      ctx.fillStyle = "#d5dbe6";
      ctx.font = "10px Georgia, serif";
      ctx.textAlign = "right";
      ctx.fillText(shortOf(feats[i]), ox - 6, oy + (i + 0.7) * cell);
      ctx.save();
      ctx.translate(ox + (i + 0.5) * cell, oy - 6);
      ctx.rotate(-Math.PI / 4);
      ctx.textAlign = "left";
      ctx.fillText(shortOf(feats[i]), 0, 0);
      ctx.restore();
      for (let j = 0; j < n; j++) {
        const t = mat[i][j] / (maxV || 1);
        ctx.fillStyle = "rgba(240,211,90," + (0.12 + 0.88 * t) + ")";
        ctx.fillRect(ox + j * cell, oy + i * cell, cell - 0.5, cell - 0.5);
        hitRegions.push({
          x: ox + j * cell, y: oy + i * cell, w: cell, h: cell,
          tip: feats[i] + " × " + feats[j] + "\n" + mat[i][j].toFixed(5),
          feature: feats[i],
          detail: "× " + shortOf(feats[j]) + " · " + mat[i][j].toFixed(5)
        });
      }
    }
  }

  const drawers = {
    bars: drawBars,
    beeswarm: drawBeeswarm,
    heatmap: drawHeatmap,
    waterfall: drawWaterfall,
    decision1: drawDecision1,
    decisionN: drawDecisionN,
    scatter: drawScatter,
    matrix: drawMatrix
  };

  function hideTip() {
    tipEl.style.display = "none";
  }

  function pickNearestScatter(hit, x, y) {
    const s = hit.scatter;
    if (!s) return null;
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < s.x.length; i += s.step) {
      const px = s.xOf(s.x[i]);
      const py = s.yOf(s.shap[i]);
      const dd = (px - x) * (px - x) + (py - y) * (py - y);
      if (dd < bestD) {
        bestD = dd;
        best = i;
      }
    }
    if (best == null || bestD > 14 * 14) return null;
    let tip = hit.feature + " = " + Number(s.x[best]).toPrecision(4) +
      "\nSHAP = " + s.shap[best].toFixed(5);
    if (s.color && s.color_feature) {
      tip += "\n" + s.color_feature + " = " + Number(s.color[best]).toPrecision(4);
    }
    return {
      tip: tip,
      detail: "point x=" + Number(s.x[best]).toPrecision(4) +
        " · SHAP " + (s.shap[best] >= 0 ? "+" : "") + s.shap[best].toFixed(5)
    };
  }

  canvas.addEventListener("mousemove", function (e) {
    const rect = canvas.getBoundingClientRect();
    const cssW = parseFloat(canvas.style.width) || rect.width;
    const cssH = parseFloat(canvas.style.height) || rect.height;
    const x = ((e.clientX - rect.left) / rect.width) * cssW;
    const y = ((e.clientY - rect.top) / rect.height) * cssH;
    let hit = null;
    for (let i = hitRegions.length - 1; i >= 0; i--) {
      const r = hitRegions[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        hit = r;
        break;
      }
    }
    if (!hit) {
      hideTip();
      return;
    }
    let tip = hit.tip;
    let detail = hit.detail || null;
    if (hit.scatter) {
      const near = pickNearestScatter(hit, x, y);
      if (near) {
        tip = near.tip;
        detail = near.detail;
      }
    }
    tipEl.style.display = "block";
    tipEl.textContent = tip;
    const stageRect = stage.getBoundingClientRect();
    tipEl.style.left = Math.min(e.clientX - stageRect.left + 12, stageRect.width - 180) + "px";
    tipEl.style.top = Math.max(8, e.clientY - stageRect.top - 28) + "px";

    if (hit.feature && (hit.feature !== hoverFeature || detail)) {
      selectFeature(hit.feature, detail);
      searchEl.value = hit.feature;
    }
  });
  canvas.addEventListener("mouseleave", hideTip);
  canvas.addEventListener("click", function (e) {
    const rect = canvas.getBoundingClientRect();
    const cssW = parseFloat(canvas.style.width) || rect.width;
    const cssH = parseFloat(canvas.style.height) || rect.height;
    const x = ((e.clientX - rect.left) / rect.width) * cssW;
    const y = ((e.clientY - rect.top) / rect.height) * cssH;
    for (let i = hitRegions.length - 1; i >= 0; i--) {
      const r = hitRegions[i];
      if (r.feature && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        let detail = r.detail || null;
        if (r.scatter) {
          const near = pickNearestScatter(r, x, y);
          if (near) detail = near.detail;
        }
        selectFeature(r.feature, detail);
        searchEl.value = r.feature;
        break;
      }
    }
  });

  async function renderView() {
    const v = VIEWS[viewIdx];
    const token = ++drawToken;
    viewSelect.value = String(viewIdx);
    jumpSelect.value = String(viewIdx);
    blurbEl.textContent = v.blurb;
    titleEl.textContent = v.title;
    canvas.hidden = true;
    statusEl.hidden = true;
    hideTip();
    hoverFeature = null;
    hoverDetail = null;

    statusEl.hidden = false;
    statusEl.textContent = "Loading figure…";
    try {
      const payload = await loadJSON(v.file);
      if (token !== drawToken) return;
      syncFeaturesFromExport(payload);
      canvas.hidden = false;
      statusEl.hidden = true;
      const size = fitCanvas();
      drawers[v.draw](payload, size);
      // Seed panel with the top factor of this view when possible
      if (ranked[0]) selectFeature(ranked[0]);
    } catch (err) {
      if (token !== drawToken) return;
      statusEl.hidden = false;
      statusEl.textContent = "Could not load " + v.file;
      console.error(err);
    }
    try { history.replaceState(null, "", "#" + v.id); } catch (e) {}
  }

  function setView(i) {
    viewIdx = (i + VIEWS.length) % VIEWS.length;
    renderView();
  }

  viewSelect.addEventListener("change", function () { setView(Number(viewSelect.value)); });
  jumpSelect.addEventListener("change", function () { setView(Number(jumpSelect.value)); });
  window.addEventListener("keydown", function (e) {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT")) return;
    if (e.key === "ArrowLeft") setView(viewIdx - 1);
    if (e.key === "ArrowRight") setView(viewIdx + 1);
  });
  window.addEventListener("resize", function () {
    if (!canvas.hidden) renderView();
  });

  // Prefetch importance + interaction for the side panel, then open.
  Promise.all([
    loadJSON("01_importance.json").then(syncFeaturesFromExport).catch(function () {}),
    loadJSON("09_interaction_matrix.json").then(syncFeaturesFromExport).catch(function () {})
  ]).then(function () {
    selectFeature(ranked[0] || features[0]);
    searchEl.placeholder = "e.g. " + shortOf(ranked[0] || features[0] || "return_5");
    const hash = (location.hash || "").replace("#", "");
    const fromHash = VIEWS.findIndex(function (v) { return v.id === hash; });
    setView(fromHash >= 0 ? fromHash : 0);
  });
})();
