(function () {
  const API = "https://api.llama.fi";
  const PEERS = ["Base", "Arbitrum", "Optimism", "Starknet", "Linea", "Scroll", "Manta", "Manta Atlantic"];
  const INTERN = { start: Date.UTC(2024, 0, 1) / 1000, end: Date.UTC(2024, 3, 30) / 1000 };
  const CACHE_KEY = "manta-desk-v1";

  const els = {
    cliStatus: document.getElementById("cli-status"),
    kpiTvl: document.getElementById("kpi-tvl"),
    kpiTvlSub: document.getElementById("kpi-tvl-sub"),
    kpiDd: document.getElementById("kpi-dd"),
    kpiDdSub: document.getElementById("kpi-dd-sub"),
    kpiAtl: document.getElementById("kpi-atl"),
    kpiRank: document.getElementById("kpi-rank"),
    kpiRankSub: document.getElementById("kpi-rank-sub"),
    chart: document.getElementById("tvl-chart"),
    chartMeta: document.getElementById("chart-meta"),
    signals: document.getElementById("signals"),
    peerBody: document.querySelector("#peer-table tbody"),
    protoBody: document.querySelector("#proto-table tbody"),
    fetchStatus: document.getElementById("fetch-status"),
    toolbar: document.getElementById("range-toolbar"),
    refresh: document.getElementById("btn-refresh"),
  };

  let history = [];
  let range = "365";
  let state = null;

  function fmtUsd(n) {
    if (n == null || !Number.isFinite(n)) return "—";
    const abs = Math.abs(n);
    if (abs >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
    if (abs >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
    if (abs >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
    return "$" + n.toFixed(0);
  }

  function fmtPct(x) {
    if (x == null || !Number.isFinite(x)) return "—";
    const sign = x > 0 ? "+" : "";
    return sign + (x * 100).toFixed(1) + "%";
  }

  function fmtDate(ts) {
    const d = new Date(ts * 1000);
    return d.toISOString().slice(0, 10);
  }

  async function getJson(path) {
    const res = await fetch(API + path, { cache: "no-store" });
    if (!res.ok) throw new Error(path + " → HTTP " + res.status);
    return res.json();
  }

  function mantaChainTvl(p) {
    const ct = p.chainTvls || {};
    if (typeof ct.Manta === "number") return ct.Manta;
    return 0;
  }

  function setStatus(msg, isErr) {
    if (!els.fetchStatus) return;
    els.fetchStatus.textContent = msg;
    els.fetchStatus.classList.toggle("error", !!isErr);
  }

  function saveCache(payload) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), payload }));
    } catch (_) {}
  }

  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function renderKpis(payload) {
    const { manta, atlantic, hist, peers } = payload;
    const last = hist[hist.length - 1];
    const peak = hist.reduce((a, b) => (b.tvl > a.tvl ? b : a), hist[0]);
    const dd = peak.tvl ? 1 - last.tvl / peak.tvl : null;

    els.kpiTvl.textContent = fmtUsd(manta?.tvl ?? last?.tvl);
    els.kpiTvlSub.textContent = "as of " + fmtDate(last.date) + " · live chain row";
    els.kpiDd.textContent = dd != null ? ("−" + (dd * 100).toFixed(1) + "%") : "—";
    els.kpiDd.className = "value neg";
    els.kpiDdSub.textContent = "ATH " + fmtUsd(peak.tvl) + " on " + fmtDate(peak.date);
    els.kpiAtl.textContent = fmtUsd(atlantic?.tvl ?? 0);

    const ordered = peers.slice().sort((a, b) => (b.tvl || 0) - (a.tvl || 0));
    const idx = ordered.findIndex((p) => p.name === "Manta");
    els.kpiRank.textContent = idx >= 0 ? "#" + (idx + 1) : "—";
    els.kpiRankSub.textContent = "of " + ordered.length + " in peer set";
  }

  function renderPeers(peers, mantaTvl) {
    const rows = peers
      .slice()
      .sort((a, b) => (b.tvl || 0) - (a.tvl || 0))
      .map((p) => {
        const mult = mantaTvl ? (p.tvl || 0) / mantaTvl : null;
        const hl = p.name === "Manta" ? " class=\"hl\"" : "";
        return (
          "<tr" +
          hl +
          "><td>" +
          p.name +
          "</td><td class=\"num\">" +
          fmtUsd(p.tvl || 0) +
          "</td><td class=\"num\">" +
          (mult == null ? "—" : mult >= 1 ? mult.toFixed(1) + "×" : (mult * 100).toFixed(0) + "% of") +
          "</td><td>" +
          (p.tokenSymbol || "—") +
          "</td></tr>"
        );
      });
    els.peerBody.innerHTML = rows.join("") || "<tr><td colspan=\"4\">No data</td></tr>";
  }

  function renderProtocols(list) {
    const rows = list.map((p) => {
      return (
        "<tr><td>" +
        p.name +
        "</td><td class=\"muted\">" +
        (p.category || "—") +
        "</td><td class=\"num\">" +
        fmtUsd(p.mantaTvl) +
        "</td></tr>"
      );
    });
    els.protoBody.innerHTML = rows.join("") || "<tr><td colspan=\"3\">No protocols returned</td></tr>";
  }

  function renderSignals(payload) {
    const { hist, atlantic, protocols } = payload;
    const last = hist[hist.length - 1];
    const peak = hist.reduce((a, b) => (b.tvl > a.tvl ? b : a), hist[0]);
    const dd = peak.tvl ? 1 - last.tvl / peak.tvl : 0;
    const day7 = hist.length > 7 ? hist[hist.length - 8] : null;
    const ch7 = day7 && day7.tvl ? last.tvl / day7.tvl - 1 : null;

    const top = protocols.slice(0, 3);
    const topSum = top.reduce((s, p) => s + (p.mantaTvl || 0), 0);
    const dens = last.tvl ? topSum / last.tvl : null;

    const internPts = hist.filter((p) => p.date >= INTERN.start && p.date <= INTERN.end);
    const internPeak = internPts.length
      ? internPts.reduce((a, b) => (b.tvl > a.tvl ? b : a), internPts[0])
      : null;

    const bits = [];
    bits.push({
      cls: dd > 0.9 ? "crit" : dd > 0.5 ? "warn" : "ok",
      html:
        "<strong>Liquidity drawdown</strong>" +
        fmtPct(-dd) +
        " from ATH (" +
        fmtUsd(peak.tvl) +
        " → " +
        fmtUsd(last.tvl) +
        ").",
    });
    bits.push({
      cls: (atlantic?.tvl || 0) < 1e5 ? "warn" : "ok",
      html:
        "<strong>Atlantic TVL</strong>" +
        fmtUsd(atlantic?.tvl || 0) +
        " (DefiLlama chain row).",
    });
    if (internPeak) {
      bits.push({
        cls: "ok",
        html:
          "<strong>Research window peak</strong>" +
          fmtUsd(internPeak.tvl) +
          " on " +
          fmtDate(internPeak.date) +
          " (Jan–Apr 2024).",
      });
    }
    if (ch7 != null) {
      bits.push({
        cls: ch7 < -0.05 ? "warn" : "ok",
        html:
          "<strong>7-day TVL change</strong>" +
          fmtPct(ch7) +
          " (" +
          fmtUsd(day7.tvl) +
          " → " +
          fmtUsd(last.tvl) +
          ").",
      });
    }
    if (dens != null && top.length) {
      bits.push({
        cls: dens > 1.5 ? "warn" : "ok",
        html:
          "<strong>Top protocols</strong>" +
          top.map((p) => p.name).join(", ") +
          ".",
      });
    }

    els.signals.innerHTML = bits.map((b) => '<div class="signal ' + b.cls + '">' + b.html + "</div>").join("");
  }

  function filteredHistory() {
    if (!history.length) return [];
    const last = history[history.length - 1].date;
    if (range === "intern") return history.filter((p) => p.date >= INTERN.start && p.date <= INTERN.end);
    if (range === "all") return history;
    const days = range === "90" ? 90 : 365;
    const cut = last - days * 86400;
    return history.filter((p) => p.date >= cut);
  }

  function drawChart() {
    const canvas = els.chart;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth || 800;
    const cssH = canvas.clientHeight || 340;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const data = filteredHistory();
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = "#faf9f7";
    ctx.fillRect(0, 0, cssW, cssH);

    if (data.length < 2) {
      ctx.fillStyle = "#666";
      ctx.font = "13px Georgia, serif";
      ctx.fillText("Waiting for TVL series…", 16, 28);
      return;
    }

    const pad = { l: 54, r: 14, t: 16, b: 34 };
    const w = cssW - pad.l - pad.r;
    const h = cssH - pad.t - pad.b;
    const minT = data[0].date;
    const maxT = data[data.length - 1].date;
    const minV = 0;
    const maxV = Math.max(...data.map((d) => d.tvl)) * 1.05;

    function xOf(t) {
      return pad.l + ((t - minT) / (maxT - minT || 1)) * w;
    }
    function yOf(v) {
      return pad.t + (1 - (v - minV) / (maxV - minV || 1)) * h;
    }

    // Intern band on all/1y views
    if (range !== "intern") {
      const x0 = xOf(Math.max(minT, INTERN.start));
      const x1 = xOf(Math.min(maxT, INTERN.end));
      if (x1 > x0) {
        ctx.fillStyle = "rgba(6,69,173,0.08)";
        ctx.fillRect(x0, pad.t, x1 - x0, h);
        ctx.fillStyle = "rgba(6,69,173,0.55)";
        ctx.font = "10px Georgia, serif";
        ctx.fillText("research window", x0 + 4, pad.t + 12);
      }
    }

    // Grid
    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    ctx.fillStyle = "#777";
    ctx.font = "10px Georgia, serif";
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const v = (maxV * i) / 4;
      const y = yOf(v);
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + w, y);
      ctx.stroke();
      ctx.fillText(fmtUsd(v), pad.l - 6, y + 3);
    }

    // Line
    ctx.beginPath();
    data.forEach((pt, i) => {
      const x = xOf(pt.date);
      const y = yOf(pt.tvl);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#0645ad";
    ctx.lineWidth = 1.75;
    ctx.stroke();

    // Fill
    ctx.lineTo(xOf(data[data.length - 1].date), yOf(0));
    ctx.lineTo(xOf(data[0].date), yOf(0));
    ctx.closePath();
    ctx.fillStyle = "rgba(6,69,173,0.12)";
    ctx.fill();

    // End label
    const last = data[data.length - 1];
    ctx.fillStyle = "#111";
    ctx.font = "bold 12px Georgia, serif";
    ctx.textAlign = "left";
    ctx.fillText(fmtUsd(last.tvl), xOf(last.date) - 70, yOf(last.tvl) - 8);

    ctx.fillStyle = "#555";
    ctx.font = "10px Georgia, serif";
    ctx.textAlign = "center";
    const n = data.length;
    const tickIdx = [0, Math.floor((n - 1) / 2), n - 1].filter(function (v, i, a) {
      return a.indexOf(v) === i;
    });
    tickIdx.forEach(function (idx) {
      const pt = data[idx];
      const x = xOf(pt.date);
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.moveTo(x, pad.t + h);
      ctx.lineTo(x, pad.t + h + 4);
      ctx.stroke();
      ctx.fillText(fmtDate(pt.date), x, cssH - 10);
    });

    if (els.chartMeta) {
      els.chartMeta.textContent =
        data.length + " points · " + fmtDate(data[0].date) + " → " + fmtDate(last.date);
    }
  }

  function applyPayload(payload, sourceLabel) {
    state = payload;
    history = payload.hist;
    renderKpis(payload);
    renderPeers(payload.peers, payload.manta?.tvl ?? payload.hist[payload.hist.length - 1]?.tvl);
    renderProtocols(payload.protocols);
    renderSignals(payload);
    drawChart();
    if (els.cliStatus) {
      els.cliStatus.textContent =
        "# " +
        sourceLabel +
        " · Manta TVL " +
        fmtUsd(payload.manta?.tvl) +
        " · hist n=" +
        payload.hist.length;
    }
  }

  async function loadLive() {
    setStatus("Fetching DefiLlama chains / history / protocols…");
    if (els.cliStatus) els.cliStatus.textContent = "# fetching api.llama.fi …";

    const [chains, hist, protocols] = await Promise.all([
      getJson("/v2/chains"),
      getJson("/v2/historicalChainTvl/Manta"),
      getJson("/protocols"),
    ]);

    const byName = Object.fromEntries(chains.map((c) => [c.name, c]));
    const manta = byName["Manta"] || null;
    const atlantic = byName["Manta Atlantic"] || null;
    const peers = PEERS.map((name) => byName[name] || { name: name, tvl: 0, tokenSymbol: "—" }).filter(
      (p) => p.name !== "Optimism" || (p.tvl || 0) > 0 || true
    );

    const onManta = protocols
      .filter((p) => (p.chains || []).includes("Manta"))
      .map((p) => ({
        name: p.name,
        category: p.category,
        mantaTvl: mantaChainTvl(p),
      }))
      .filter((p) => p.mantaTvl > 0)
      .sort((a, b) => b.mantaTvl - a.mantaTvl)
      .slice(0, 12);

    const payload = {
      manta,
      atlantic,
      peers: peers.filter((p) => p.name !== "Optimism" || (p.tvl || 0) > 0),
      hist: hist.filter((p) => p && typeof p.tvl === "number"),
      protocols: onManta,
    };

    // Prefer non-zero peers; keep Manta Atlantic even if near-zero
    payload.peers = PEERS.map((name) => byName[name])
      .filter(Boolean)
      .filter((p) => p.name === "Manta" || p.name === "Manta Atlantic" || (p.tvl || 0) > 0);

    saveCache(payload);
    applyPayload(payload, "live " + new Date().toISOString());
    setStatus(
      "Live · refreshed " +
        new Date().toLocaleString() +
        " · source api.llama.fi (no API key)."
    );
  }

  // Subscan Atlantic
  const SUBSCAN = "https://manta.api.subscan.io";
  const KEY_STORE = "manta-desk-subscan-key";
  const SNAPSHOT_URL = "assets/data/subscan_manta_snapshot.json";
  const ss = {
    keyInput: document.getElementById("subscan-key"),
    btn: document.getElementById("btn-subscan"),
    clear: document.getElementById("btn-subscan-clear"),
    status: document.getElementById("subscan-status"),
    symbol: document.getElementById("ss-symbol"),
    symbolSub: document.getElementById("ss-symbol-sub"),
    holders: document.getElementById("ss-holders"),
    transfers: document.getElementById("ss-transfers"),
    transfersSub: document.getElementById("ss-transfers-sub"),
    now: document.getElementById("ss-now"),
    chart: document.getElementById("subscan-chart"),
  };
  let dailyTransfers = [];

  function setSsStatus(msg, isErr) {
    if (!ss.status) return;
    ss.status.textContent = msg;
    ss.status.classList.toggle("error", !!isErr);
  }

  function getSubscanKey() {
    return (ss.keyInput?.value || localStorage.getItem(KEY_STORE) || "").trim();
  }

  function fmtToken(raw, decimals) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    const d = Number(decimals);
    const v = Number.isFinite(d) && d > 0 ? n / Math.pow(10, d) : n;
    if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
    if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
    if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
    return v.toFixed(2);
  }

  async function subscanPost(path, body, key) {
    const res = await fetch(SUBSCAN + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": key,
      },
      body: JSON.stringify(body || {}),
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch (_) {
      throw new Error(path + " non-JSON HTTP " + res.status);
    }
    if (!res.ok || (json.code != null && json.code !== 0)) {
      throw new Error(path + " → " + (json.message || "HTTP " + res.status));
    }
    return json.data;
  }

  function drawSubscanChart() {
    const canvas = ss.chart;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = canvas.clientWidth || 800;
    const cssH = canvas.clientHeight || 180;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = "#faf9f7";
    ctx.fillRect(0, 0, cssW, cssH);

    const data = dailyTransfers;
    ctx.fillStyle = "#666";
    ctx.font = "11px Georgia, serif";
    if (data.length < 2) {
      ctx.fillText("Atlantic daily transfers appear here after Subscan load.", 12, 28);
      return;
    }

    const pad = { l: 44, r: 12, t: 12, b: 34 };
    const w = cssW - pad.l - pad.r;
    const h = cssH - pad.t - pad.b;
    const maxV = Math.max(...data.map((d) => d.v), 1);

    function shortDate(d) {
      // Prefer YYYY-MM-DD → "May 15"
      const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!m) return String(d).slice(0, 10);
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return months[Number(m[2]) - 1] + " " + Number(m[3]);
    }

    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    ctx.fillStyle = "#777";
    ctx.font = "9px Georgia, serif";
    ctx.textAlign = "right";
    for (let i = 0; i <= 3; i++) {
      const v = (maxV * i) / 3;
      const y = pad.t + (1 - i / 3) * h;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(pad.l + w, y);
      ctx.stroke();
      ctx.fillText(Math.round(v).toLocaleString(), pad.l - 4, y + 3);
    }

    const n = data.length;
    const barW = Math.max(2, (w / n) * 0.7);
    data.forEach((pt, i) => {
      const x = pad.l + (i / Math.max(n - 1, 1)) * w;
      const bh = (pt.v / maxV) * h;
      ctx.fillStyle = "rgba(6,69,173,0.55)";
      ctx.fillRect(x - barW / 2, pad.t + h - bh, barW, bh);
    });

    // X axis + date ticks (start / mid / end)
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t + h);
    ctx.lineTo(pad.l + w, pad.t + h);
    ctx.stroke();

    const tickIdx = [0, Math.floor((n - 1) / 2), n - 1].filter(function (v, i, a) {
      return a.indexOf(v) === i;
    });
    ctx.fillStyle = "#555";
    ctx.font = "10px Georgia, serif";
    ctx.textAlign = "center";
    tickIdx.forEach(function (idx) {
      const x = pad.l + (idx / Math.max(n - 1, 1)) * w;
      ctx.strokeStyle = "rgba(0,0,0,0.28)";
      ctx.beginPath();
      ctx.moveTo(x, pad.t + h);
      ctx.lineTo(x, pad.t + h + 4);
      ctx.stroke();
      ctx.fillText(shortDate(data[idx].d), x, cssH - 10);
    });
  }

  function parseDailyList(daily) {
    const list = Array.isArray(daily)
      ? daily
      : Array.isArray(daily?.list)
        ? daily.list
        : Array.isArray(daily?.stats)
          ? daily.stats
          : [];
    return list
      .map((row) => {
        const d = row.time_utc || row.date || row.time || row.day || "";
        const v = Number(row.transfer_count ?? row.total ?? row.count ?? row.extrinsic_count ?? 0);
        return { d: String(d).slice(0, 10), v: Number.isFinite(v) ? v : 0 };
      })
      .filter((r) => r.d)
      .sort((a, b) => (a.d < b.d ? -1 : 1));
  }

  function applySubscanBundle(bundle, sourceLabel) {
    const meta = bundle.metadata || {};
    const token = bundle.token_manta || bundle.token || {};
    const nowVal = bundle.now;

    if (ss.now) {
      if (typeof nowVal === "number") {
        ss.now.textContent = new Date(nowVal * (nowVal < 1e12 ? 1000 : 1)).toISOString().slice(0, 19) + "Z";
      } else if (bundle.fetched_at) {
        ss.now.textContent = String(bundle.fetched_at).slice(0, 19);
      } else {
        ss.now.textContent = "—";
      }
    }

    if (ss.symbol) ss.symbol.textContent = token.symbol || "MANTA";
    if (ss.symbolSub) {
      const price = token.price != null ? "$" + Number(token.price).toFixed(4) : null;
      const issued = fmtToken(token.total_issuance, token.token_decimals);
      ss.symbolSub.textContent = [price, issued ? "issuance ~" + issued : null].filter(Boolean).join(" · ") || "native";
    }

    const accounts = Number(meta.count_account);
    const accountsAll = Number(meta.count_account_all);
    if (ss.holders) {
      ss.holders.textContent = Number.isFinite(accounts) ? accounts.toLocaleString() : "—";
    }
    // mutate holders sub via sibling if present
    const holdersKpi = ss.holders?.parentElement?.querySelector(".sub");
    if (holdersKpi && Number.isFinite(accountsAll)) {
      holdersKpi.textContent = "holders / " + accountsAll.toLocaleString() + " accounts";
    }

    dailyTransfers = parseDailyList(bundle.daily_transfers);
    const sum = dailyTransfers.reduce((s, r) => s + r.v, 0);
    const lifetimeTransfers = Number(meta.count_transfer);
    if (ss.transfers) {
      ss.transfers.textContent = Number.isFinite(lifetimeTransfers)
        ? lifetimeTransfers.toLocaleString()
        : sum.toLocaleString();
    }
    if (ss.transfersSub) {
      ss.transfersSub.textContent =
        dailyTransfers.length > 0
          ? "lifetime · window " +
            dailyTransfers[0].d +
            "→" +
            dailyTransfers[dailyTransfers.length - 1].d +
            " sum " +
            sum.toLocaleString()
          : "lifetime transfers";
    }

    drawSubscanChart();
    setSsStatus(
      sourceLabel +
        " · blocks " +
        (meta.blockNum || "—") +
        " · signed extrinsics " +
        (meta.count_signed_extrinsic || "—") +
        " · explorer https://manta.subscan.io/"
    );
  }

  async function loadSubscanSnapshot() {
    if (window.SUBSCAN_SNAPSHOT && window.SUBSCAN_SNAPSHOT.metadata) {
      applySubscanBundle(
        window.SUBSCAN_SNAPSHOT,
        "Subscan " + String(window.SUBSCAN_SNAPSHOT.fetched_at || "").slice(0, 19)
      );
      return;
    }
    const res = await fetch(SNAPSHOT_URL + "?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("snapshot HTTP " + res.status);
    const snap = await res.json();
    applySubscanBundle(snap, "Snapshot " + (snap.fetched_at || "").slice(0, 19));
  }

  async function loadSubscanLive() {
    const key = getSubscanKey();
    if (!key) {
      await loadSubscanSnapshot();
      return;
    }
    try {
      localStorage.setItem(KEY_STORE, key);
    } catch (_) {}

    setSsStatus("Calling manta.api.subscan.io …");
    const end = new Date();
    const start = new Date(end.getTime() - 60 * 86400000);
    const fmt = (d) => d.toISOString().slice(0, 10);

    try {
      const [nowData, meta, tokenPayload, daily] = await Promise.all([
        subscanPost("/api/now", {}, key),
        subscanPost("/api/scan/metadata", {}, key),
        subscanPost("/api/scan/token", {}, key),
        subscanPost(
          "/api/v2/scan/daily",
          { start: fmt(start), end: fmt(end), format: "day", category: "transfer" },
          key
        ),
      ]);

      const tokenManta = tokenPayload?.detail?.MANTA || tokenPayload?.token?.MANTA || null;
      applySubscanBundle(
        {
          now: nowData,
          metadata: meta,
          token_manta: tokenManta,
          daily_transfers: daily,
          fetched_at: new Date().toISOString(),
        },
        "Live Subscan " + new Date().toISOString().slice(0, 19)
      );
      if (els.cliStatus) {
        els.cliStatus.textContent =
          "# llama + subscan live · accounts=" + (meta?.count_account || "?");
      }
    } catch (err) {
      // Fall back to embedded numbers if browser CORS / network blocks live API
      try {
        await loadSubscanSnapshot();
      } catch (_) {}
      setSsStatus("Subscan live refresh failed (" + err.message + "). Showing cached Subscan data.", true);
    }
  }

  async function boot() {
    try {
      await loadLive();
    } catch (err) {
      const cached = loadCache();
      if (cached?.payload?.hist?.length) {
        applyPayload(cached.payload, "cache " + new Date(cached.savedAt).toISOString());
        setStatus(
          "Live fetch failed (" +
            err.message +
            "). Showing last browser cache from " +
            new Date(cached.savedAt).toLocaleString() +
            ".",
          true
        );
      } else {
        setStatus("Live fetch failed: " + err.message + ". Open this page online and retry Refresh.", true);
        if (els.cliStatus) els.cliStatus.textContent = "# fetch error: " + err.message;
      }
    }

    try {
      if (getSubscanKey()) await loadSubscanLive();
      else await loadSubscanSnapshot();
    } catch (err) {
      setSsStatus("Subscan: " + err.message, true);
    }
  }

  els.toolbar?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-range]");
    if (!btn) return;
    range = btn.getAttribute("data-range");
    els.toolbar.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
    drawChart();
  });

  els.refresh?.addEventListener("click", () => {
    boot();
  });

  ss.btn?.addEventListener("click", () => {
    loadSubscanLive().catch((err) => setSsStatus("Subscan: " + err.message, true));
  });
  ss.clear?.addEventListener("click", () => {
    try {
      localStorage.removeItem(KEY_STORE);
    } catch (_) {}
    if (ss.keyInput) ss.keyInput.value = "";
    loadSubscanSnapshot().catch((err) => setSsStatus("Subscan: " + err.message, true));
  });

  try {
    const saved = localStorage.getItem(KEY_STORE);
    if (saved && ss.keyInput) ss.keyInput.value = saved;
  } catch (_) {}

  window.addEventListener("resize", () => {
    if (history.length) drawChart();
    drawSubscanChart();
  });

  boot();
})();
