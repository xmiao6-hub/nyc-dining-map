const CSV_FILE = 'Dining_Out_NYC_Locations_20260929.csv';
const NYC_LIMITS = { latMin: 40.45, latMax: 40.95, lonMin: -74.3, lonMax: -73.68 };
const MAP_MARGIN = 38;

const BOROUGH_COLORS = {
  Manhattan: '#e84393',
  Brooklyn: '#d95f20',
  Queens: '#5f6ce7',
  Bronx: '#0fa8a0',
  'Staten Island': '#c0392b',
};

let points = [];
let dataBounds = null;
let mapRect = null;
let layer = null;
let bgLayer = null;
let props = [];
let ready = false;
let fatalMsg = '';
let visibleBoroughs = {};
let licenseFilter = 'ALL';
let hovered = null;
let fadeStart = 0;
let restGlow = 0;
let tooltip = null;
let sourceNote = null;

function setup() {
  const wrap = document.getElementById('canvas-wrap');
  const w = Math.max(320, wrap.clientWidth);
  const h = Math.round(Math.min(w * 0.92, window.innerHeight * 0.76));
  createCanvas(w, h).parent(wrap);
  buildHeaderSpots();
  buildEdgeSpots();
  tooltip = document.getElementById('tooltip');
  sourceNote = document.getElementById('source-note');
  tooltip.classList.add('hidden');
  buildBgLayer();
  initProps();

  loadData()
    .then((rows) => {
      points = rows.filter(inNYC);
      if (!points.length) throw new Error('no valid rows found in data');
      computeBounds();
      layoutMap();
      projectPoints();
      buildBgLayer();
      for (const b of boroughList()) visibleBoroughs[b] = true;
      buildChips();
      wireFilters();
      redrawLayer();
      fadeStart = millis();
      ready = true;
      updateStats();
    })
    .catch((err) => {
      console.error(err);
      fatalMsg = String(err && err.message ? err.message : err);
      if (sourceNote) {
        sourceNote.textContent = 'failed to load data';
        sourceNote.style.color = '#ff6b6b';
      }
    });
}

function loadData() {
  setStatus('loading CSV\u2026');
  return fetchText(CSV_FILE, 8000)
    .then((text) => {
      const rows = parseCsv(text);
      if (!rows.length) throw new Error('CSV was empty');
      sourceNote.textContent = 'live CSV loaded';
      return rows;
    })
    .catch((err) => {
      if (Array.isArray(window.NYC_DINING_DATA) && window.NYC_DINING_DATA.length) {
        sourceNote.textContent = 'bundled snapshot (start a local server to read the live CSV)';
        return window.NYC_DINING_DATA.map((r) => ({
          name: r[0],
          street: r[1],
          borough: r[2] || 'Unknown',
          type: r[3],
          lat: r[4],
          lon: r[5],
        }));
      }
      throw err;
    });
}

function fetchText(url, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('request timed out: ' + url)), ms);
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
        return res.text();
      })
      .then((text) => {
        clearTimeout(timer);
        resolve(text);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
  const header = parseCsvLine(lines[0]).map((s) => s.trim());
  const idx = {};
  header.forEach((h, i) => { idx[h] = i; });
  const rows = [];
  for (let li = 1; li < lines.length; li++) {
    if (!lines[li].trim()) continue;
    const cells = parseCsvLine(lines[li]);
    rows.push({
      name: (cells[idx['Assumed Name(s)']] || cells[idx['Business Legal Name']] || 'Unknown').trim(),
      street: (cells[idx['Street']] || '').trim(),
      borough: (cells[idx['Borough']] || '').trim() || 'Unknown',
      type: (cells[idx['License Type']] || '').trim(),
      lat: parseFloat(cells[idx['Latitude']]),
      lon: parseFloat(cells[idx['Longitude']]),
    });
  }
  return rows;
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function inNYC(p) {
  return (
    isFinite(p.lat) && isFinite(p.lon) &&
    p.lat >= NYC_LIMITS.latMin && p.lat <= NYC_LIMITS.latMax &&
    p.lon >= NYC_LIMITS.lonMin && p.lon <= NYC_LIMITS.lonMax
  );
}

function computeBounds() {
  let latMin = Infinity, latMax = -Infinity, lonMin = Infinity, lonMax = -Infinity;
  for (const p of points) {
    if (p.lat < latMin) latMin = p.lat;
    if (p.lat > latMax) latMax = p.lat;
    if (p.lon < lonMin) lonMin = p.lon;
    if (p.lon > lonMax) lonMax = p.lon;
  }
  const padLat = (latMax - latMin) * 0.025;
  const padLon = (lonMax - lonMin) * 0.025;
  dataBounds = {
    latMin: latMin - padLat,
    latMax: latMax + padLat,
    lonMin: lonMin - padLon,
    lonMax: lonMax + padLon,
  };
}

function layoutMap() {
  const dLat = dataBounds.latMax - dataBounds.latMin;
  const dLon = dataBounds.lonMax - dataBounds.lonMin;
  const midLat = radians((dataBounds.latMin + dataBounds.latMax) / 2);
  const milesWide = dLon * 69.17 * Math.cos(midLat);
  const milesTall = dLat * 69.0;
  const scale = Math.min(
    (width - MAP_MARGIN * 2) / milesWide,
    (height - MAP_MARGIN * 2) / milesTall
  );
  const mapW = milesWide * scale;
  const mapH = milesTall * scale;
  mapRect = { x: (width - mapW) / 2, y: (height - mapH) / 2, w: mapW, h: mapH };
}

function lonLatToXY(lon, lat) {
  const fx = (lon - dataBounds.lonMin) / (dataBounds.lonMax - dataBounds.lonMin);
  const fy = 1 - (lat - dataBounds.latMin) / (dataBounds.latMax - dataBounds.latMin);
  return { x: mapRect.x + fx * mapRect.w, y: mapRect.y + fy * mapRect.h };
}

function projectPoints() {
  for (const p of points) {
    const c = lonLatToXY(p.lon, p.lat);
    p.x = c.x;
    p.y = c.y;
  }
}

function isVisible(p) {
  return (
    (licenseFilter === 'ALL' || p.type === licenseFilter) &&
    visibleBoroughs[p.borough] !== false
  );
}

function visiblePoints() {
  return points.filter(isVisible);
}

function redrawLayer() {
  layer = createGraphics(width, height);
  layer.clear();
  layer.noStroke();
  for (const p of visiblePoints()) {
    const glow = layer.color(boroughColor(p.borough));
    glow.setAlpha(38);
    layer.fill(glow);
    if (p.type === 'Roadway') layer.rect(p.x - 6, p.y - 6, 12, 12, 2);
    else layer.circle(p.x, p.y, 11);
  }
  for (const p of visiblePoints()) {
    const core = layer.color(boroughColor(p.borough));
    core.setAlpha(220);
    layer.fill(core);
    if (p.type === 'Roadway') layer.rect(p.x - 3.2, p.y - 3.2, 6.4, 6.4, 1.5);
    else layer.circle(p.x, p.y, 5.2);
  }
}

function draw() {
  image(bgLayer, 0, 0);
  drawRestaurant();
  drawProps();
  if (fatalMsg) {
    drawMessage('Could not load data', fatalMsg);
    return;
  }
  if (!ready || !layer) {
    drawMessage('Loading NYC dining data\u2026', '');
    return;
  }
  const t = constrain((millis() - fadeStart) / 900, 0, 1);
  if (t < 1) {
    tint(255, 255 * (1 - Math.pow(1 - t, 3)));
    image(layer, 0, 0);
    noTint();
  } else {
    image(layer, 0, 0);
  }
  updateHover();
  if (hovered) drawRing(hovered);
}

function drawMessage(title, sub) {
  push();
  noStroke();
  fill(46, 70, 54);
  textAlign(CENTER, CENTER);
  textFont('Helvetica');
  textStyle(BOLD);
  textSize(18);
  text(title, width / 2, height / 2 - (sub ? 12 : 0));
  if (sub) {
    textStyle(NORMAL);
    textSize(12);
    fill(110, 138, 120);
    text(sub, width / 2, height / 2 + 14, width - 80);
  }
  pop();
}

function updateHover() {
  if (mouseX < 0 || mouseY < 0 || mouseX > width || mouseY > height) {
    setHover(null);
    return;
  }
  let best = null;
  let bestD = 169;
  for (const p of visiblePoints()) {
    const d = (p.x - mouseX) ** 2 + (p.y - mouseY) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  setHover(best);
}

function setHover(p) {
  if (p === hovered) {
    if (p) positionTooltip(p);
    return;
  }
  hovered = p;
  if (!p) {
    tooltip.classList.add('hidden');
    cursor('default');
    return;
  }
  tooltip.innerHTML =
    '<strong>' + escapeHtml(p.name) + '</strong>' +
    '<span class="street">' + escapeHtml(p.street) + '</span>' +
    '<span class="meta"><i style="background:' + boroughColor(p.borough) + '"></i>' +
    escapeHtml(p.borough) + ' &middot; ' + escapeHtml(p.type) + '</span>';
  tooltip.classList.remove('hidden');
  positionTooltip(p);
  cursor('pointer');
}

function positionTooltip(p) {
  const wrap = document.getElementById('canvas-wrap');
  const tw = tooltip.offsetWidth;
  const th = tooltip.offsetHeight;
  let x = p.x + 16;
  let y = p.y - th - 12;
  if (x + tw > wrap.clientWidth - 8) x = p.x - tw - 16;
  if (y < 8) y = p.y + 16;
  tooltip.style.left = x + 'px';
  tooltip.style.top = y + 'px';
}

function drawRing(p) {
  const r = 9 + Math.sin(millis() / 170) * 1.8;
  push();
  noStroke();
  const halo = color(boroughColor(p.borough));
  halo.setAlpha(36);
  fill(halo);
  circle(p.x, p.y, r * 4.4);
  halo.setAlpha(70);
  fill(halo);
  circle(p.x, p.y, r * 2.6);
  noFill();
  drawingContext.shadowBlur = 18;
  drawingContext.shadowColor = boroughColor(p.borough);
  stroke(boroughColor(p.borough));
  strokeWeight(2);
  circle(p.x, p.y, r * 2);
  drawingContext.shadowBlur = 10;
  drawingContext.shadowColor = 'rgba(80, 160, 255, 0.75)';
  stroke(74, 58, 66, 220);
  strokeWeight(1);
  circle(p.x, p.y, r * 2 + 6);
  drawingContext.shadowBlur = 0;
  pop();
}

function boroughList() {
  if (boroughList.cache) return boroughList.cache;
  const counts = {};
  for (const p of points) counts[p.borough] = (counts[p.borough] || 0) + 1;
  boroughList.cache = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  return boroughList.cache;
}

function boroughColor(b) {
  return BOROUGH_COLORS[b] || '#9aa7bd';
}

function buildChips() {
  const holder = document.getElementById('borough-chips');
  for (const b of boroughList()) {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.innerHTML =
      '<span class="dot" style="background:' + boroughColor(b) + '"></span>' +
      escapeHtml(b) +
      '<span class="count" data-borough="' + escapeHtml(b) + '"></span>';
    btn.addEventListener('click', () => {
      visibleBoroughs[b] = visibleBoroughs[b] === false;
      btn.classList.toggle('off', visibleBoroughs[b] === false);
      redrawLayer();
      fadeStart = millis();
      updateStats();
    });
    holder.appendChild(btn);
  }
}

function wireFilters() {
  const holder = document.getElementById('license-filters');
  for (const btn of holder.querySelectorAll('button')) {
    btn.addEventListener('click', () => {
      licenseFilter = btn.dataset.filter;
      for (const b of holder.querySelectorAll('button')) {
        b.classList.toggle('active', b === btn);
      }
      redrawLayer();
      fadeStart = millis();
      updateStats();
    });
  }
}

function updateStats() {
  const vis = visiblePoints();
  const visEl = document.getElementById('stat-visible');
  const totalEl = document.getElementById('stat-total');
  if (visEl) visEl.textContent = vis.length.toLocaleString('en-US');
  if (totalEl) totalEl.textContent = points.length.toLocaleString('en-US');
  const counts = {};
  for (const p of vis) counts[p.borough] = (counts[p.borough] || 0) + 1;
  for (const el of document.querySelectorAll('.count')) {
    el.textContent = counts[el.dataset.borough] || 0;
  }
}

function setStatus(msg) {
  if (sourceNote) {
    sourceNote.textContent = msg;
    sourceNote.style.color = '';
  }
}

function buildBgLayer() {
  bgLayer = createGraphics(width, height);
  bgLayer.noStroke();
  const cx = width / 2;
  const cy = height / 2;
  const maxD = Math.hypot(cx, cy);
  const edge = bgLayer.color(214, 240, 218);
  const center = bgLayer.color(247, 255, 245);
  for (let d = maxD; d > 0; d -= 8) {
    const t = 1 - d / maxD;
    bgLayer.fill(bgLayer.lerpColor(edge, center, t));
    bgLayer.circle(cx, cy, d * 2);
  }
  if (mapRect) drawCoastline();
}

function drawCoastline() {
  const g = bgLayer;
  if (!Array.isArray(window.NYC_BOROUGHS)) return;
  g.push();
  g.noFill();
  g.stroke(70, 150, 255, 130);
  g.strokeWeight(1.2);
  g.drawingContext.shadowBlur = 8;
  g.drawingContext.shadowColor = 'rgba(80, 170, 255, 0.9)';
  for (const b of window.NYC_BOROUGHS) {
    for (const ring of b.rings) {
      g.beginShape();
      for (const pt of ring) {
        const v = lonLatToXY(pt[0], pt[1]);
        g.vertex(v.x, v.y);
      }
      g.endShape(g.CLOSE);
    }
  }
  g.drawingContext.shadowBlur = 0;
  g.pop();
}

let headerSpots = [];
let edgeSpots = [];

function buildHeaderSpots() {
  for (const sc of headerSpots) sc.remove();
  headerSpots = [];
  const header = document.getElementById('page-header');
  if (!header) return;
  const defs = [
    { fn: spotCupcake, fx: 0.62, s: 78 },
    { fn: spotWine, fx: 0.78, s: 68 },
    { fn: spotCoffee, fx: 0.93, s: 60 },
  ];
  for (const d of defs) {
    const sc = makePixelSprite(d.fn, d.s, 3, 0.55);
    sc.parent(header);
    sc.style('position', 'absolute');
    sc.style('left', Math.round(d.fx * 100) + '%');
    sc.style('top', '50%');
    sc.style('transform', 'translate(-50%, -50%)');
    sc.style('display', 'block');
    headerSpots.push(sc);
  }
}

function buildEdgeSpots() {
  for (const sc of edgeSpots) sc.remove();
  edgeSpots = [];
  const defs = [
    { fn: glyphPizza, s: 70, style: { left: '6px', top: '30%', transform: 'translate(0, -50%) rotate(-10deg)' } },
    { fn: glyphFries, s: 66, style: { left: '6px', top: '70%', transform: 'translate(0, -50%) rotate(-5deg)' } },
    { fn: glyphBurger, s: 70, style: { right: '6px', top: '26%', transform: 'translate(0, -50%) rotate(8deg)' } },
    { fn: glyphIceCream, s: 68, style: { right: '6px', top: '68%', transform: 'translate(0, -50%) rotate(6deg)' } },
  ];
  for (const d of defs) {
    const sc = makePixelSprite(d.fn, d.s, 3, 0.55);
    sc.style('position', 'fixed');
    sc.style('z-index', '2');
    sc.style('display', 'block');
    sc.style('pointer-events', 'none');
    for (const k in d.style) sc.style(k, d.style[k]);
    sc.parent(document.body);
    edgeSpots.push(sc);
  }
}

function makePixelSprite(fn, s, pix, alpha) {
  const half = Math.ceil((s * 1.4) / pix);
  const off = createGraphics(half * 2, half * 2);
  off.pixelDensity(1);
  off.noStroke();
  off.push();
  off.translate(half, half);
  off.scale(1 / pix);
  fn(off, s);
  off.pop();
  off.loadPixels();
  const out = createGraphics(half * 2 * pix, half * 2 * pix);
  out.pixelDensity(1);
  out.noStroke();
  out.drawingContext.globalAlpha = alpha;
  for (let j = 0; j < half * 2; j++) {
    for (let i = 0; i < half * 2; i++) {
      const k = 4 * (j * half * 2 + i);
      if (off.pixels[k + 3] < 40) continue;
      let r = Math.min(255, Math.round(off.pixels[k] / 32) * 32);
      let gr = Math.min(255, Math.round(off.pixels[k + 1] / 32) * 32);
      let b = Math.min(255, Math.round(off.pixels[k + 2] / 32) * 32);
      const lum = 0.3 * r + 0.6 * gr + 0.1 * b;
      if (lum > 0 && lum < 55) {
        const f = 55 / lum;
        r = Math.min(255, Math.round(r * f));
        gr = Math.min(255, Math.round(gr * f));
        b = Math.min(255, Math.round(b * f));
      }
      out.fill(r, gr, b);
      out.rect(i * pix, j * pix, pix, pix);
    }
  }
  out.drawingContext.globalAlpha = 1;
  off.remove();
  return out;
}

function spotCoffee(g, s) {
  g.noStroke();
  let c = g.color('#fffef8');
  c.setAlpha(150);
  g.fill(c);
  g.ellipse(0, s * 0.55, s * 1.5, s * 0.18);
  g.rect(-s * 0.45, -s * 0.25, s * 0.9, s * 0.8, s * 0.2);
  c = g.color('#a9714c');
  c.setAlpha(160);
  g.fill(c);
  g.ellipse(0, -s * 0.21, s * 0.74, s * 0.13);
  c = g.color('#fffef8');
  c.setAlpha(150);
  g.noFill();
  g.stroke(c);
  g.strokeWeight(s * 0.13);
  g.arc(s * 0.4, s * 0.05, s * 0.62, s * 0.55, -HALF_PI, HALF_PI);
  c = g.color('#ffffff');
  c.setAlpha(110);
  g.stroke(c);
  g.strokeWeight(s * 0.09);
  g.arc(-s * 0.12, -s * 0.62, s * 0.3, s * 0.38, PI, TWO_PI);
  g.arc(s * 0.14, -s * 0.82, s * 0.24, s * 0.32, PI, TWO_PI);
  g.arc(-s * 0.02, -s * 1.0, s * 0.2, s * 0.28, PI, TWO_PI);
  g.noStroke();
  c = g.color('#a9714c');
  c.setAlpha(140);
  g.fill(c);
  g.ellipse(s * 0.85, s * 0.5, s * 0.18, s * 0.12);
  g.ellipse(s * 1.02, s * 0.62, s * 0.16, s * 0.11);
  c = g.color('#fffef8');
  c.setAlpha(90);
  g.stroke(c);
  g.strokeWeight(s * 0.03);
  g.line(s * 0.79, s * 0.5, s * 0.91, s * 0.5);
  g.line(s * 0.96, s * 0.62, s * 1.08, s * 0.62);
  g.noStroke();
}

function spotWine(g, s) {
  g.noStroke();
  let c = g.color('#5a7a62');
  c.setAlpha(30);
  g.fill(c);
  g.ellipse(-s * 0.5, s * 0.78, s * 0.85, s * 0.12);
  g.ellipse(s * 0.33, s * 0.4, s * 0.6, s * 0.1);
  c = g.color('#f0a83c');
  c.setAlpha(190);
  g.fill(c);
  g.rect(-s * 0.75, -s * 1.15, s * 0.5, s * 1.9, s * 0.1);
  g.rect(-s * 0.6, -s * 1.5, s * 0.2, s * 0.4, s * 0.04);
  c = g.color('#ff5d6c');
  c.setAlpha(210);
  g.fill(c);
  g.rect(-s * 0.62, -s * 1.62, s * 0.24, s * 0.16, s * 0.04);
  c = g.color('#fffef8');
  c.setAlpha(210);
  g.fill(c);
  g.rect(-s * 0.68, -s * 0.5, s * 0.36, s * 0.5, s * 0.05);
  c = g.color('#fffef8');
  c.setAlpha(160);
  g.fill(c);
  g.rect(s * 0.3, -s * 0.2, s * 0.06, s * 0.52, s * 0.03);
  g.ellipse(s * 0.33, s * 0.36, s * 0.5, s * 0.1);
  g.noFill();
  g.stroke(c);
  g.strokeWeight(s * 0.08);
  g.arc(s * 0.33, -s * 0.32, s * 0.55, s * 0.78, 0, PI);
  g.noStroke();
  c = g.color('#ff5d6c');
  c.setAlpha(210);
  g.fill(c);
  g.arc(s * 0.33, -s * 0.32, s * 0.4, s * 0.6, 0.3, PI - 0.3, CHORD);
}

function spotCupcake(g, s) {
  g.noStroke();
  let c = g.color('#5a7a62');
  c.setAlpha(30);
  g.fill(c);
  g.ellipse(0, s * 0.68, s * 1.05, s * 0.12);
  const bands = [
    [-s * 0.1, s * 0.04, '#ffb3c8'],
    [s * 0.04, s * 0.2, '#f0c07e'],
    [s * 0.2, s * 0.36, '#ffd1de'],
    [s * 0.36, s * 0.5, '#f0c07e'],
  ];
  for (const bd of bands) {
    c = g.color(bd[2]);
    c.setAlpha(220);
    g.fill(c);
    g.rect(-s * 0.45, bd[0], s * 0.9, bd[1] - bd[0]);
  }
  c = g.color('#ffd1de');
  c.setAlpha(225);
  g.fill(c);
  g.quad(-s * 0.45, -s * 0.1, s * 0.45, -s * 0.1, s * 0.35, -s * 0.32, -s * 0.35, -s * 0.32);
  c = g.color('#f0c07e');
  c.setAlpha(200);
  g.fill(c);
  g.rect(-s * 0.35, -s * 0.36, s * 0.7, s * 0.04);
  c = g.color('#ff5d6c');
  c.setAlpha(235);
  g.fill(c);
  g.circle(s * 0.08, -s * 0.44, s * 0.17);
  c = g.color('#7ddf9a');
  c.setAlpha(200);
  g.fill(c);
  g.circle(-s * 0.12, -s * 0.24, s * 0.12);
  c = g.color('#fffef8');
  c.setAlpha(170);
  g.fill(c);
  g.ellipse(0, s * 0.58, s * 1.15, s * 0.14);
}

const PROP_TYPES = ['fork', 'knife', 'cup', 'glass', 'pizza', 'bottle', 'burger', 'fries', 'icecream'];
const PROP_TONES = ['#ff8a5c', '#f0a500', '#2ec4b6', '#f26d9a'];

function initProps() {
  props = [];
  const n = Math.max(14, Math.round((width * height) / 48000));
  for (let i = 0; i < n; i++) {
    const prop = {};
    randomizeProp(prop, random(1));
    props.push(prop);
  }
}

function randomizeProp(prop, startY) {
  const s = random(15, 40);
  prop.type = random(PROP_TYPES);
  prop.tone = random(PROP_TONES);
  prop.x = random(1);
  prop.y = startY;
  prop.s = s;
  prop.alpha = map(s, 15, 40, 165, 85);
  prop.rot = random(-0.5, 0.5);
  prop.rotNow = prop.rot;
  prop.speed = random(0.006, 0.02);
  prop.swayAmp = random(5, 14);
  prop.swayFreq = random(0.15, 0.45);
  prop.spinAmp = random(0.05, 0.18);
  prop.spinFreq = random(0.1, 0.3);
  prop.phase = random(TWO_PI);
  prop.state = 'drift';
  prop.timer = 0;
  prop.drops = [];
  prop.cx = 0;
  prop.cy = 0;
}

function drawProps() {
  const t = millis() / 1000;
  const dt = Math.min(deltaTime / 1000, 0.1);
  for (const prop of props) {
    if (prop.state === 'drift') {
      prop.y -= prop.speed * dt;
      if (prop.y < -0.12) prop.y = 1.12;
      prop.cx = prop.x * width + Math.sin(t * prop.swayFreq + prop.phase) * prop.swayAmp;
      prop.cy = prop.y * height + Math.cos(t * prop.swayFreq * 0.8 + prop.phase) * prop.swayAmp * 0.5;
      prop.rotNow = prop.rot + Math.sin(t * prop.spinFreq + prop.phase) * prop.spinAmp;
      if (mouseX >= 0 && mouseY >= 0 && mouseX <= width && mouseY <= height) {
        const d2 = (mouseX - prop.cx) ** 2 + (mouseY - prop.cy) ** 2;
        if (d2 < (prop.s * 0.85) ** 2) {
          prop.state = 'lit';
          prop.timer = 0;
        }
      }
      drawingContext.globalAlpha = (prop.alpha / 255) * (0.72 + 0.28 * Math.sin(t * 0.6 + prop.phase));
      push();
      translate(prop.cx, prop.cy);
      rotate(prop.rotNow);
      drawGlyph(prop.type, window, prop.s);
      pop();
      drawingContext.globalAlpha = 1;
    } else if (prop.state === 'lit') {
      prop.timer += dt;
      const p = Math.min(prop.timer / 0.38, 1);
      const halo = color(prop.tone);
      halo.setAlpha(70 * p);
      push();
      noStroke();
      fill(halo);
      circle(prop.cx, prop.cy, prop.s * 1.9);
      pop();
      drawingContext.globalAlpha = 0.62 + 0.38 * p;
      push();
      translate(prop.cx, prop.cy);
      rotate(prop.rotNow);
      scale(1 + p * 0.18);
      drawGlyph(prop.type, window, prop.s);
      pop();
      drawingContext.globalAlpha = 1;
      if (p >= 1) {
        prop.state = 'pop';
        prop.timer = 0;
        prop.drops = [];
        for (let i = 0; i < 6; i++) {
          prop.drops.push({ a: (i * TWO_PI) / 6 + random(-0.4, 0.4), w: random(0.7, 1.3) });
        }
      }
    } else {
      prop.timer += dt;
      const p = Math.min(prop.timer / 0.3, 1);
      const c = color(prop.tone);
      c.setAlpha(255 * (1 - p));
      drawingContext.globalAlpha = 1 - p;
      push();
      translate(prop.cx, prop.cy);
      rotate(prop.rotNow);
      scale(1.18 + p * 0.5);
      drawGlyph(prop.type, window, prop.s);
      pop();
      drawingContext.globalAlpha = 1;
      push();
      noFill();
      stroke(c);
      strokeWeight(2.2);
      circle(prop.cx, prop.cy, prop.s * 1.5 * (1 + p * 1.6));
      pop();
      noStroke();
      for (const d of prop.drops) {
        const dc = color(prop.tone);
        dc.setAlpha(170 * (1 - p));
        fill(dc);
        const dd = prop.s * (0.55 + 1.7 * p) * d.w;
        circle(prop.cx + Math.cos(d.a) * dd, prop.cy + Math.sin(d.a) * dd, prop.s * 0.12 * (1 - p * 0.5));
      }
      if (p >= 1) randomizeProp(prop, 1.04 + random(0.08));
    }
  }
}


function drawCafeSidewalk(t, u) {
  noStroke();
  const pave = color('#d9d0f2');
  pave.setAlpha(90);
  fill(pave);
  rect(-2.6 * u, -0.22 * u, 5.2 * u, 0.22 * u, 0.05 * u);

  const wall = color('#e6f4dc');
  wall.setAlpha(165);
  fill(wall);
  rect(-2.3 * u, -2.7 * u, 4.6 * u, 2.48 * u, 0.1 * u);
  const trim = color('#8fbf8e');
  noFill();
  trim.setAlpha(150);
  stroke(trim);
  strokeWeight(0.045 * u);
  rect(-2.3 * u, -2.7 * u, 4.6 * u, 2.48 * u, 0.1 * u);
  noStroke();

  const glass = color('#ffc93c');
  glass.setAlpha(Math.min(255, Math.round(165 + Math.sin(t * 0.8) * 25)));
  fill(glass);
  rect(-1.9 * u, -2.15 * u, 2.9 * u, 1.35 * u, 0.08 * u);
  const mull = color('#5c6f92');
  mull.setAlpha(230);
  fill(mull);
  rect(-0.95 * u, -2.15 * u, 0.06 * u, 1.35 * u, 0.03 * u);
  rect(-0.05 * u, -2.15 * u, 0.06 * u, 1.35 * u, 0.03 * u);

  const canopy = color('#ff5d6c');
  canopy.setAlpha(195);
  fill(canopy);
  rect(-2.05 * u, -2.5 * u, 3.1 * u, 0.26 * u, 0.1 * u);

  const door = color('#ffc93c');
  door.setAlpha(165);
  fill(door);
  rect(1.3 * u, -1.65 * u, 0.72 * u, 1.43 * u, 0.1 * u);
  fill(trim);
  circle(1.88 * u, -0.95 * u, 0.09 * u);

  const poleC = color('#d9d0f2');
  const tableC = color('#fffef8');
  const chairC = color('#cabfe8');
  for (const um of [[-1.45, 2.35, '#ff8a5c'], [0.4, 2.15, '#f5ead9']]) {
    const ux = um[0] * u;
    const poleTop = -um[1] * u;
    poleC.setAlpha(180);
    fill(poleC);
    rect(ux - 0.035 * u, poleTop, 0.07 * u, um[1] * u - 0.22 * u, 0.03 * u);
    const umb = color(um[2]);
    umb.setAlpha(210);
    fill(umb);
    arc(ux, poleTop, 1.7 * u, 0.62 * u, PI, TWO_PI);
    fill(poleC);
    circle(ux, poleTop - 0.34 * u, 0.1 * u);
    tableC.setAlpha(210);
    fill(tableC);
    ellipse(ux, -0.88 * u, 0.78 * u, 0.13 * u);
    rect(ux - 0.03 * u, -0.88 * u, 0.06 * u, 0.62 * u, 0.03 * u);
    ellipse(ux, -0.26 * u, 0.42 * u, 0.09 * u);
    const cup = color('#ffc93c');
    cup.setAlpha(235);
    fill(cup);
    rect(ux - 0.28 * u, -1.06 * u, 0.1 * u, 0.18 * u, 0.03 * u);
    const chx = ux + 0.62 * u;
    chairC.setAlpha(185);
    fill(chairC);
    rect(chx, -0.62 * u, 0.3 * u, 0.07 * u, 0.02 * u);
    rect(chx + 0.24 * u, -0.95 * u, 0.06 * u, 0.4 * u, 0.02 * u);
    rect(chx + 0.02 * u, -0.55 * u, 0.05 * u, 0.33 * u, 0.02 * u);
    rect(chx + 0.24 * u, -0.55 * u, 0.05 * u, 0.33 * u, 0.02 * u);
  }



}

function drawShedRoadway(t, u) {
  noStroke();
  const deck = color('#d9d0f2');
  deck.setAlpha(110);
  fill(deck);
  rect(-2.7 * u, -0.24 * u, 5.4 * u, 0.24 * u, 0.05 * u);

  const inside = color('#ffc93c');
  inside.setAlpha(Math.min(255, Math.round(135 + Math.sin(t * 0.7) * 30)));
  fill(inside);
  rect(-2.25 * u, -1.62 * u, 4.5 * u, 1.38 * u, 0.06 * u);

  const wall = color('#e6f4dc');
  wall.setAlpha(165);
  fill(wall);
  rect(-2.25 * u, -1.62 * u, 4.5 * u, 1.38 * u, 0.06 * u);
  const slat = color('#5c6f92');
  slat.setAlpha(210);
  fill(slat);
  rect(-2.25 * u, -1.2 * u, 4.5 * u, 0.05 * u, 0.02 * u);
  rect(-2.25 * u, -0.75 * u, 4.5 * u, 0.05 * u, 0.02 * u);

  const post = color('#d9d0f2');
  post.setAlpha(185);
  fill(post);
  for (const px of [-2.2, -0.75, 0.75, 2.2]) {
    rect(px * u - 0.05 * u, -2.4 * u, 0.1 * u, 2.16 * u, 0.03 * u);
  }

  const roof = color('#fffef8');
  roof.setAlpha(185);
  fill(roof);
  quad(-2.75 * u, -2.45 * u, 2.75 * u, -2.45 * u, 2.95 * u, -2.05 * u, -2.95 * u, -2.05 * u);
  const roofTrim = color('#d9d0f2');
  roofTrim.setAlpha(155);
  noFill();
  stroke(roofTrim);
  strokeWeight(0.04 * u);
  quad(-2.75 * u, -2.45 * u, 2.75 * u, -2.45 * u, 2.95 * u, -2.05 * u, -2.95 * u, -2.05 * u);
  noStroke();

  const wire = color('#d9d0f2');
  wire.setAlpha(110);
  noFill();
  stroke(wire);
  strokeWeight(0.035 * u);
  beginShape();
  for (let i = 0; i <= 24; i++) {
    const k = i / 24;
    vertex(
      (1 - k) * (1 - k) * -2.3 * u + k * k * 2.3 * u,
      (1 - k) * (1 - k) * -2.0 * u + 2 * (1 - k) * k * -1.72 * u + k * k * -2.0 * u
    );
  }
  endShape();
  noStroke();
  for (let i = 1; i < 8; i++) {
    const k = i / 8;
    const bx = (1 - k) * (1 - k) * -2.3 * u + k * k * 2.3 * u;
    const by = (1 - k) * (1 - k) * -2.0 * u + 2 * (1 - k) * k * -1.72 * u + k * k * -2.0 * u;
    const bulb = color(i % 2 === 0 ? '#ffc93c' : '#ff8a5c');
    bulb.setAlpha(Math.min(255, Math.round(170 + Math.sin(t * 2 + i * 1.7) * 55)));
    fill(bulb);
    circle(bx, by + 0.07 * u, 0.13 * u);
  }

  const furn = color('#d9d0f2');
  furn.setAlpha(190);
  fill(furn);
  rect(-0.9 * u, -0.95 * u, 1.8 * u, 0.09 * u, 0.03 * u);
  rect(-0.82 * u, -0.86 * u, 0.08 * u, 0.62 * u, 0.03 * u);
  rect(0.74 * u, -0.86 * u, 0.08 * u, 0.62 * u, 0.03 * u);
  rect(-1.7 * u, -0.68 * u, 0.42 * u, 0.07 * u, 0.03 * u);
  rect(-1.53 * u, -0.61 * u, 0.08 * u, 0.37 * u, 0.03 * u);
  rect(1.28 * u, -0.68 * u, 0.42 * u, 0.07 * u, 0.03 * u);
  rect(1.45 * u, -0.61 * u, 0.08 * u, 0.37 * u, 0.03 * u);

  const box = color('#fffef8');
  box.setAlpha(195);
  fill(box);
  rect(-3.0 * u, -0.78 * u, 0.6 * u, 0.54 * u, 0.05 * u);
  const bush = color('#2ec4b6');
  bush.setAlpha(225);
  fill(bush);
  circle(-2.88 * u, -0.94 * u, 0.36 * u);
  circle(-2.62 * u, -0.97 * u, 0.3 * u);
  circle(-2.75 * u, -1.12 * u, 0.26 * u);

  const hPost = color('#d9d0f2');
  hPost.setAlpha(190);
  fill(hPost);
  rect(2.72 * u, -1.7 * u, 0.09 * u, 1.46 * u, 0.04 * u);
  rect(2.62 * u, -0.3 * u, 0.3 * u, 0.07 * u, 0.03 * u);
  const hCap = color('#fffef8');
  hCap.setAlpha(210);
  fill(hCap);
  arc(2.765 * u, -1.7 * u, 0.72 * u, 0.3 * u, PI, TWO_PI);
  const hGlow = color('#ff8a5c');
  hGlow.setAlpha(Math.min(255, Math.round(140 + Math.sin(t * 1.1) * 40)));
  fill(hGlow);
  circle(2.765 * u, -1.58 * u, 0.3 * u);


}

function drawGlyph(type, g, s) {
  if (type === 'fork') glyphFork(g, s);
  else if (type === 'knife') glyphKnife(g, s);
  else if (type === 'cup') glyphCup(g, s);
  else if (type === 'glass') glyphGlass(g, s);
  else if (type === 'pizza') glyphPizza(g, s);
  else if (type === 'icecream') glyphIceCream(g, s);
  else if (type === 'burger') glyphBurger(g, s);
  else if (type === 'fries') glyphFries(g, s);
  else glyphBottle(g, s);
}

function drawRestaurant() {
  const t = millis() / 1000;
  const u = Math.min(width, height) / 11;
  push();
  noStroke();
  let ax = width - 2.4 * u;
  let hw = 2.3;
  if (licenseFilter === 'Sidewalk') {
    ax = width - 2.75 * u;
    hw = 2.75;
  } else if (licenseFilter === 'Roadway') {
    ax = width - 3.25 * u;
    hw = 3.3;
  }
  const mx = mouseX;
  const my = mouseY;
  const hovered =
    mx >= ax - hw * u && mx <= ax + hw * u &&
    my >= height * 0.99 - 4.7 * u && my <= height * 0.99 + 4;
  const dt = Math.min(deltaTime / 1000, 0.1);
  restGlow += ((hovered ? 1 : 0) - restGlow) * Math.min(1, dt * 7);
  if (restGlow < 0.005) restGlow = 0;
  translate(ax, height * 0.99);
  scale(1 + restGlow * 0.08);
  drawingContext.globalAlpha = 0.88 + 0.12 * restGlow;
  if (restGlow > 0.02) {
    drawingContext.shadowBlur = 12 * restGlow;
    drawingContext.shadowColor = 'rgba(255, 201, 60, 0.4)';
  }
  if (licenseFilter === 'Sidewalk') drawCafeSidewalk(t, u);
  else if (licenseFilter === 'Roadway') drawShedRoadway(t, u);
  else drawBistro(t, u);
  drawingContext.shadowBlur = 0;
  drawingContext.globalAlpha = 1;
  pop();
}

function drawBistro(t, u) {
  u *= 0.8;
  noStroke();

  const wall = color('#e6f4dc');
  wall.setAlpha(45);
  fill(wall);
  rect(-2.3 * u, -3.4 * u, 4.6 * u, 3.4 * u, 0.12 * u);

  const trim = color('#8fbf8e');
  noFill();
  trim.setAlpha(150);
  stroke(trim);
  strokeWeight(0.045 * u);
  rect(-2.3 * u, -3.4 * u, 4.6 * u, 3.4 * u, 0.12 * u);
  noStroke();
  const cornice = color('#8fbf8e');
  cornice.setAlpha(160);
  fill(cornice);
  rect(-2.55 * u, -3.78 * u, 5.1 * u, 0.42 * u, 0.08 * u);

  const awnRed = color('#ff5d6c');
  awnRed.setAlpha(195);
  const awnCream = color('#fffef8');
  awnCream.setAlpha(215);
  const stripeW = 0.72 * u;
  const startX = -2.16 * u;
  for (let i = 0; i < 6; i++) {
    fill(i % 2 === 0 ? awnRed : awnCream);
    rect(startX + i * stripeW, -2.42 * u, stripeW, 0.5 * u);
    arc(startX + i * stripeW + stripeW / 2, -1.92 * u, stripeW, stripeW, 0, PI);
  }

  const signLine = color('#d9d0f2');
  signLine.setAlpha(150);
  noFill();
  stroke(signLine);
  strokeWeight(0.05 * u);
  line(2.05 * u, -3.78 * u, 2.05 * u, -3.3 * u);
  circle(2.05 * u, -2.95 * u, 0.75 * u);
  noStroke();
  const signFill = color('#ffc93c');
  signFill.setAlpha(230);
  fill(signFill);
  for (const ang of [-QUARTER_PI, QUARTER_PI]) {
    push();
    translate(2.05 * u, -2.95 * u);
    rotate(ang);
    rect(-0.035 * u, -0.3 * u, 0.07 * u, 0.6 * u, 0.035 * u);
    pop();
  }

  for (const wx of [-1.95, 0.85]) {
    const wcol = color('#ffc93c');
    wcol.setAlpha(Math.min(255, Math.round(185 + Math.sin(t * 0.8 + wx) * 30)));
    fill(wcol);
    rect(wx * u, -1.55 * u, 1.1 * u, 0.95 * u, 0.09 * u);
    const mull = color('#5c6f92');
    mull.setAlpha(230);
    fill(mull);
    rect((wx + 0.52) * u, -1.55 * u, 0.06 * u, 0.95 * u, 0.03 * u);
    rect(wx * u, -1.11 * u, 1.1 * u, 0.06 * u, 0.03 * u);
  }

  const door = color('#ffc93c');
  door.setAlpha(165);
  fill(door);
  rect(-0.4 * u, -0.9 * u, 0.8 * u, 0.9 * u, 0.12 * u);
  const doorFrame = color('#8fbf8e');
  doorFrame.setAlpha(175);
  noFill();
  stroke(doorFrame);
  strokeWeight(0.045 * u);
  rect(-0.4 * u, -0.9 * u, 0.8 * u, 0.9 * u, 0.12 * u);
  noStroke();
  fill(doorFrame);
  circle(0.24 * u, -0.45 * u, 0.09 * u);
  const porthole = color('#ffc93c');
  porthole.setAlpha(Math.min(255, Math.round(215 + Math.sin(t * 0.9 + 2) * 20)));
  fill(porthole);
  circle(0, -0.62 * u, 0.26 * u);

  const wire = color('#d9d0f2');
  wire.setAlpha(110);
  noFill();
  stroke(wire);
  strokeWeight(0.035 * u);
  beginShape();
  for (let i = 0; i <= 24; i++) {
    const k = i / 24;
    vertex(
      (1 - k) * (1 - k) * -2.4 * u + 2 * (1 - k) * k * 0 + k * k * 2.4 * u,
      (1 - k) * (1 - k) * -4.2 * u + 2 * (1 - k) * k * -3.85 * u + k * k * -4.2 * u
    );
  }
  endShape();
  noStroke();
  for (let i = 1; i < 8; i++) {
    const k = i / 8;
    const x = (1 - k) * (1 - k) * -2.4 * u + 2 * (1 - k) * k * 0 + k * k * 2.4 * u;
    const y = (1 - k) * (1 - k) * -4.2 * u + 2 * (1 - k) * k * -3.85 * u + k * k * -4.2 * u;
    const bulb = color(i % 2 === 0 ? '#ffc93c' : '#ff8a5c');
    bulb.setAlpha(Math.min(255, Math.round(170 + Math.sin(t * 2 + i * 1.7) * 55)));
    fill(bulb);
    circle(x, y + 0.07 * u, 0.14 * u);
  }


}

function glyphFork(g, s) {
  g.noStroke();
  g.fill('#f5ead9');
  for (let i = -1.5; i <= 1.5; i++) {
    g.rect(i * s * 0.2 - s * 0.05, -s, s * 0.1, s * 0.58, s * 0.05);
  }
  g.rect(-s * 0.42, -s * 0.52, s * 0.84, s * 0.22, s * 0.1);
  g.rect(-s * 0.09, -s * 0.34, s * 0.18, s * 1.34, s * 0.09);
  g.fill('#c9bda8');
  g.rect(s * 0.01, -s * 0.34, s * 0.08, s * 1.34, s * 0.04);
}

function glyphKnife(g, s) {
  g.noStroke();
  g.fill('#f5ead9');
  g.rect(-s * 0.09, -s * 0.1, s * 0.18, s * 1.1, s * 0.09);
  g.triangle(-s * 0.09, -s * 0.1, s * 0.3, -s * 0.9, -s * 0.09, -s * 0.95);
  g.fill('#c9bda8');
  g.rect(s * 0.01, -s * 0.1, s * 0.08, s * 1.1, s * 0.04);
}

function glyphCup(g, s) {
  g.noStroke();
  g.fill('#f5ead9');
  g.ellipse(0, s * 0.62, s * 1.3, s * 0.16);
  g.rect(-s * 0.42, -s * 0.28, s * 0.84, s * 0.82, s * 0.2);
  g.fill('#a9714c');
  g.ellipse(0, -s * 0.24, s * 0.72, s * 0.14);
  noFill();
  g.stroke('#f5ead9');
  g.strokeWeight(s * 0.12);
  g.arc(s * 0.36, -s * 0.05, s * 0.6, s * 0.55, -HALF_PI, HALF_PI);
  g.stroke('#ffffff');
  g.strokeWeight(s * 0.07);
  g.arc(-s * 0.1, -s * 0.62, s * 0.28, s * 0.34, PI, TWO_PI);
  g.arc(s * 0.14, -s * 0.78, s * 0.22, s * 0.3, PI, TWO_PI);
  g.noStroke();
}

function glyphGlass(g, s) {
  g.noStroke();
  g.fill('#ff5d6c');
  g.arc(0, -s * 0.3, s * 0.6, s * 0.72, 0.25, PI - 0.25, CHORD);
  g.fill('#f5ead9');
  g.rect(-s * 0.05, s * 0.2, s * 0.1, s * 0.55, s * 0.05);
  g.ellipse(0, s * 0.8, s * 0.62, s * 0.12);
  noFill();
  g.stroke('#f5ead9');
  g.strokeWeight(s * 0.1);
  g.arc(0, -s * 0.3, s * 0.85, s * 1.0, 0, PI);
  g.stroke('#ffffff');
  g.strokeWeight(s * 0.05);
  g.line(-s * 0.18, -s * 0.5, -s * 0.1, -s * 0.18);
  g.noStroke();
}

function glyphPizza(g, s) {
  g.noStroke();
  g.fill('#ffd23f');
  g.triangle(-s * 0.48, -s * 0.42, s * 0.48, -s * 0.42, 0, s * 0.72);
  g.fill('#f0c07e');
  g.arc(0, -s * 0.42, s * 0.96, s * 0.3, PI, TWO_PI);
  g.fill('#ff5d6c');
  g.ellipse(-s * 0.16, -s * 0.05, s * 0.16);
  g.ellipse(s * 0.14, s * 0.12, s * 0.14);
  g.ellipse(0, s * 0.38, s * 0.12);
  g.fill('#7ddf9a');
  g.circle(s * 0.1, -s * 0.16, s * 0.07);
  g.circle(-s * 0.2, s * 0.22, s * 0.07);
}

function glyphIceCream(g, s) {
  g.noStroke();
  g.fill('#f0c07e');
  g.triangle(-s * 0.26, s * 0.08, s * 0.26, s * 0.08, 0, s * 0.66);
  g.stroke('#c98d4c');
  g.strokeWeight(s * 0.04);
  g.line(-s * 0.16, s * 0.18, s * 0.1, s * 0.42);
  g.line(s * 0.16, s * 0.18, -s * 0.1, s * 0.42);
  g.noStroke();
  g.fill('#ffb3c8');
  g.circle(0, -s * 0.08, s * 0.58);
  g.fill('#9ff0e0');
  g.circle(0, -s * 0.44, s * 0.42);
  g.fill('#ff5d6c');
  g.circle(-s * 0.1, -s * 0.66, s * 0.12);
}

function glyphBurger(g, s) {
  g.noStroke();
  g.fill('#f0c07e');
  g.rect(-s * 0.42, s * 0.16, s * 0.84, s * 0.2, s * 0.09);
  g.fill('#a9714c');
  g.rect(-s * 0.4, -s * 0.02, s * 0.8, s * 0.18, s * 0.07);
  g.fill('#ffd23f');
  g.rect(-s * 0.38, -s * 0.14, s * 0.76, s * 0.07, s * 0.03);
  g.fill('#7ddf9a');
  for (let i = -1.5; i <= 1.5; i++) {
    g.circle(i * s * 0.22, -s * 0.08, s * 0.13);
  }
  g.fill('#f0c07e');
  g.arc(0, -s * 0.1, s * 0.95, s * 0.7, PI, TWO_PI);
  g.fill('#f5ead9');
  g.circle(-s * 0.12, -s * 0.3, s * 0.06);
  g.circle(s * 0.08, -s * 0.38, s * 0.06);
  g.circle(s * 0.24, -s * 0.24, s * 0.06);
}

function glyphFries(g, s) {
  g.noStroke();
  g.fill('#ffd23f');
  g.rect(-s * 0.26, -s * 0.62, s * 0.11, s * 0.5, s * 0.03);
  g.rect(-s * 0.05, -s * 0.7, s * 0.11, s * 0.55, s * 0.03);
  g.rect(s * 0.16, -s * 0.58, s * 0.11, s * 0.46, s * 0.03);
  g.fill('#ff5d6c');
  g.rect(-s * 0.34, -s * 0.28, s * 0.68, s * 0.62, s * 0.06);
  g.fill('#f5ead9');
  g.rect(-s * 0.34, -s * 0.1, s * 0.68, s * 0.08, s * 0.03);
}

function glyphBottle(g, s) {
  g.noStroke();
  g.fill('#f0a83c');
  g.rect(-s * 0.16, -s * 1.15, s * 0.32, s * 0.16, s * 0.05);
  g.rect(-s * 0.11, -s * 1.0, s * 0.22, s * 0.5, s * 0.04);
  g.rect(-s * 0.3, -s * 0.52, s * 0.6, s * 1.4, s * 0.14);
  g.fill('#ff5d6c');
  g.rect(-s * 0.18, -s * 1.19, s * 0.36, s * 0.1, s * 0.04);
  g.fill('#f5ead9');
  g.rect(-s * 0.22, -s * 0.25, s * 0.44, s * 0.42, s * 0.05);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function windowResized() {
  buildBgLayer();
  buildHeaderSpots();
  buildEdgeSpots();
  initProps();
  if (!ready) return;
  const wrap = document.getElementById('canvas-wrap');
  const w = Math.max(320, wrap.clientWidth);
  const h = Math.round(Math.min(w * 0.92, window.innerHeight * 0.76));
  resizeCanvas(w, h);
  layoutMap();
  projectPoints();
  redrawLayer();
  fadeStart = millis();
}
