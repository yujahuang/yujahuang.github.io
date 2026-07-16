(function () {
  const canvas = document.getElementById("manta-preview");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const INTERN_START = Date.UTC(2024, 0, 1) / 1000;
  const INTERN_END = Date.UTC(2024, 3, 30) / 1000;
  // Show context around the research window so the thesis read is obvious
  const VIEW_START = Date.UTC(2023, 10, 1) / 1000;
  const VIEW_END = Date.UTC(2024, 6, 1) / 1000;

  let raf = 0;
  /** @type {{ date: number, tvl: number }[] | null} */
  let series = null;
  let peak = null;
  let startPt = null;
  let reveal = 0;

  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const css = canvas.clientWidth || 152;
    canvas.width = Math.floor(css * dpr);
    canvas.height = Math.floor(css * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function fmtShort(n) {
    if (!Number.isFinite(n)) return "—";
    if (n >= 1e9) return "$" + (n / 1e9).toFixed(1) + "B";
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(0) + "M";
    if (n >= 1e3) return "$" + (n / 1e3).toFixed(0) + "K";
    return "$" + n.toFixed(0);
  }

  async function tryLoad() {
    try {
      const res = await fetch("https://api.llama.fi/v2/historicalChainTvl/Manta", {
        cache: "force-cache",
      });
      if (!res.ok) return;
      const hist = await res.json();
      const all = hist
        .filter((p) => p && typeof p.tvl === "number" && typeof p.date === "number")
        .map((p) => ({ date: p.date, tvl: p.tvl }));
      const view = all.filter((p) => p.date >= VIEW_START && p.date <= VIEW_END);
      series = view.length > 10 ? view : all.slice(-180);

      const internPts = all.filter((p) => p.date >= INTERN_START && p.date <= INTERN_END);
      if (internPts.length) {
        peak = internPts.reduce((a, b) => (b.tvl > a.tvl ? b : a), internPts[0]);
        startPt = internPts.reduce((best, p) => {
          return Math.abs(p.date - INTERN_START) < Math.abs(best.date - INTERN_START) ? p : best;
        }, internPts[0]);
      }
    } catch (_) {
      series = null;
      peak = null;
      startPt = null;
    }
  }

  function fallbackData(t) {
    const n = 48;
    return Array.from({ length: n }, (_, i) => {
      const u = i / (n - 1);
      const bump = Math.exp(-Math.pow((u - 0.55) / 0.12, 2));
      return {
        date: VIEW_START + u * (VIEW_END - VIEW_START),
        tvl: 80 + 40 * Math.sin(u * 4 + t * 0.4) + 520 * bump,
      };
    });
  }

  function frame(now) {
    const t = now * 0.001;
    const w = canvas.clientWidth || 152;
    const h = w;
    ctx.clearRect(0, 0, w, h);

    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#f7f4ef");
    g.addColorStop(1, "#eef2f7");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const data = series && series.length > 2 ? series : fallbackData(t);
    const padL = 8;
    const padR = 8;
    const padT = 28;
    const padB = 22;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const minT = data[0].date;
    const maxT = data[data.length - 1].date;
    const maxV = Math.max(...data.map((d) => d.tvl)) * 1.08;
    const minV = 0;

    function xOf(ts) {
      return padL + ((ts - minT) / (maxT - minT || 1)) * plotW;
    }
    function yOf(v) {
      return padT + (1 - (v - minV) / (maxV - minV || 1)) * plotH;
    }

    // Research window band
    const x0 = Math.max(padL, xOf(Math.max(minT, INTERN_START)));
    const x1 = Math.min(padL + plotW, xOf(Math.min(maxT, INTERN_END)));
    if (x1 > x0) {
      ctx.fillStyle = "rgba(6,69,173,0.1)";
      ctx.fillRect(x0, padT, x1 - x0, plotH);
      ctx.fillStyle = "rgba(6,69,173,0.65)";
      ctx.font = "7.5px Georgia, serif";
      ctx.textAlign = "left";
      ctx.fillText("research", x0 + 3, padT + 10);
    }

    // Progressive reveal of the curve
    reveal = Math.min(1, reveal + 0.012);
    const nShow = Math.max(2, Math.floor(1 + (data.length - 1) * (0.35 + 0.65 * reveal)));
    const shown = data.slice(0, nShow);

    ctx.beginPath();
    shown.forEach((pt, i) => {
      const x = xOf(pt.date);
      const y = yOf(pt.tvl);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#0645ad";
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.lineTo(xOf(shown[shown.length - 1].date), yOf(0));
    ctx.lineTo(xOf(shown[0].date), yOf(0));
    ctx.closePath();
    ctx.fillStyle = "rgba(6,69,173,0.14)";
    ctx.fill();

    // Peak marker during research window
    if (peak && startPt && peak.tvl > startPt.tvl * 1.15) {
      const px = xOf(peak.date);
      const py = yOf(peak.tvl);
      const pulse = 0.55 + 0.45 * Math.sin(t * 3.2);
      ctx.beginPath();
      ctx.arc(px, py, 2.6 + pulse * 1.2, 0, Math.PI * 2);
      ctx.fillStyle = "#0a7a3e";
      ctx.fill();
      ctx.strokeStyle = "rgba(10,122,62," + (0.35 + 0.35 * pulse) + ")";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(px, py, 5 + pulse * 2, 0, Math.PI * 2);
      ctx.stroke();

      const mult = peak.tvl / Math.max(startPt.tvl, 1);
      ctx.fillStyle = "#0a7a3e";
      ctx.font = "bold 8.5px Georgia, serif";
      ctx.textAlign = "right";
      ctx.fillText("+" + mult.toFixed(1) + "× peak", w - padR, 14);
      ctx.font = "7px Georgia, serif";
      ctx.fillStyle = "#444";
      ctx.fillText("call held", w - padR, 24);
    }

    ctx.fillStyle = "#555";
    ctx.font = "8px Georgia, serif";
    ctx.textAlign = "left";
    ctx.fillText("MANTA TVL", padL, 14);

    ctx.fillStyle = "#333";
    ctx.font = "bold 8px Georgia, serif";
    ctx.fillText("Jan–Apr 2024 thesis", padL, h - 7);

    if (peak) {
      ctx.font = "7px Georgia, serif";
      ctx.fillStyle = "#555";
      ctx.textAlign = "right";
      ctx.fillText(fmtShort(peak.tvl), w - padR, h - 7);
    }

    raf = requestAnimationFrame(frame);
  }

  size();
  window.addEventListener("resize", size);
  tryLoad().finally(() => {
    reveal = 0;
    raf = requestAnimationFrame(frame);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else raf = requestAnimationFrame(frame);
  });
})();
