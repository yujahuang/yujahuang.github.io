(function () {
  const canvas = document.getElementById("paper-network");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const img = new Image();
  img.src = "assets/images/research/correlation_network.png";

  // Focus points estimated from the original correlation-network layout
  // (normalized image coordinates: 0–1).
  const FOCI = [
    { id: "overview", x: 0.50, y: 0.50, zoom: 1.00, hold: 4.2 },
    { id: "BTC",      x: 0.50, y: 0.78, zoom: 2.35, hold: 2.4 },
    { id: "USDT",     x: 0.72, y: 0.28, zoom: 2.45, hold: 2.4 },
    { id: "ETH",      x: 0.22, y: 0.48, zoom: 2.40, hold: 2.4 },
    { id: "SOL",      x: 0.78, y: 0.36, zoom: 2.50, hold: 2.4 },
    { id: "BNB",      x: 0.62, y: 0.58, zoom: 2.35, hold: 2.2 }
  ];

  const ZOOM_IN = 2.8;
  const ZOOM_OUT = 2.0;

  let cssSize = 152;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let ready = false;
  let t0 = 0;

  function resize() {
    const w = Math.round(canvas.getBoundingClientRect().width) || 152;
    if (w === cssSize && canvas.width) return;
    cssSize = w;
    canvas.width = cssSize * dpr;
    canvas.height = cssSize * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function ease(u) {
    u = Math.max(0, Math.min(1, u));
    return u * u * (3 - 2 * u);
  }

  function lerp(a, b, u) {
    return a + (b - a) * u;
  }

  function buildTimeline() {
    // overview -> zoom each hub -> return overview between hubs
    var steps = [];
    steps.push({ from: 0, to: 0, duration: FOCI[0].hold, label: true });
    for (var i = 1; i < FOCI.length; i++) {
      steps.push({ from: 0, to: i, duration: ZOOM_IN });
      steps.push({ from: i, to: i, duration: FOCI[i].hold, label: true });
      steps.push({ from: i, to: 0, duration: ZOOM_OUT });
      steps.push({ from: 0, to: 0, duration: 1.2 });
    }
    var total = 0;
    for (var s = 0; s < steps.length; s++) {
      steps[s].start = total;
      total += steps[s].duration;
      steps[s].end = total;
    }
    return { steps: steps, total: total };
  }

  const timeline = buildTimeline();

  function cameraAt(now) {
    var t = ((now - t0) / 1000) % timeline.total;
    var step = timeline.steps[0];
    for (var i = 0; i < timeline.steps.length; i++) {
      if (t >= timeline.steps[i].start && t < timeline.steps[i].end) {
        step = timeline.steps[i];
        break;
      }
    }
    var u = ease((t - step.start) / step.duration);
    var A = FOCI[step.from];
    var B = FOCI[step.to];
    return {
      x: lerp(A.x, B.x, u),
      y: lerp(A.y, B.y, u),
      zoom: lerp(A.zoom, B.zoom, u),
      label: step.label ? (step.from === step.to ? FOCI[step.to].id : null) : null,
      focusId: step.to === 0 && step.from === 0 ? null : (u > 0.55 ? FOCI[step.to].id : FOCI[step.from].id)
    };
  }

  function draw(now) {
    if (!ready) {
      requestAnimationFrame(draw);
      return;
    }
    resize();
    var W = cssSize;
    var H = cssSize;
    var cam = cameraAt(now);

    // Cover the square canvas with a zoomed crop of the original figure.
    var base = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    var scale = base * cam.zoom;
    var drawW = img.naturalWidth * scale;
    var drawH = img.naturalHeight * scale;
    var dx = W / 2 - cam.x * drawW;
    var dy = H / 2 - cam.y * drawH;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#faf9f7";
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img, dx, dy, drawW, drawH);

    // subtle vignette so the crop reads as intentional, not clipped randomly
    var g = ctx.createRadialGradient(W / 2, H / 2, W * 0.35, W / 2, H / 2, W * 0.72);
    g.addColorStop(0, "rgba(250,249,247,0)");
    g.addColorStop(1, "rgba(250,249,247,0.28)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    if (cam.focusId && cam.focusId !== "overview" && cam.label) {
      ctx.fillStyle = "rgba(17,17,17,0.78)";
      ctx.font = "600 10px Georgia, 'Times New Roman', serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(cam.focusId, 8, 8);
    }

    requestAnimationFrame(draw);
  }

  img.onload = function () {
    ready = true;
    t0 = performance.now();
    requestAnimationFrame(draw);
  };
  img.onerror = function () {
    // keep canvas blank if image missing
  };

  window.addEventListener("resize", resize);
  resize();
})();
