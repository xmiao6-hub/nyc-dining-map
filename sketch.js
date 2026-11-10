const CSV_FILE = 'Dining_Out_NYC_Locations_20260929.csv';
const NYC_LIMITS = { latMin: 40.45, latMax: 40.95, lonMin: -74.3, lonMax: -73.68 };
const MAP_MARGIN = 38;

const BOROUGH_COLORS = {
  Manhattan: '#45c8ff',
  Brooklyn: '#00b4d8',
  Queens: '#b388e0',
  Bronx: '#0fa8a0',
  'Staten Island': '#c0392b',
};

let points = [];
let dataBounds = null;
let mapRect = null;
let layer = null;
let bgLayer = null;
const BG_ALPHA_KEY = 'nyc-dining-bg-alpha';

function storedBgAlpha() {
  try {
    const v = parseInt(window.localStorage.getItem(BG_ALPHA_KEY), 10);
    return v >= 10 && v <= 100 ? v : 80;
  } catch (err) {
    return 80;
  }
}

let bgAlphaPct = storedBgAlpha();
let props = [];
let ready = false;
let fatalMsg = '';
let visibleBoroughs = {};
let licenseFilter = 'ALL';
let hovered = null;
let fadeStart = 0;
let restGlow = 0;
let restHover = false;
let hud = null;
let hudWired = false;
let milesPerPx = 0;
let restHit = null;
let tooltip = null;
let detail = null;
let badge = null;
let selected = null;
let sourceNote = null;
let introActive = true;
let mapRot = 0;
let mapRotTarget = 0;
let rotDragging = false;
let rotDragStart = 0;
let rotDragRot = 0;
let lastRotSfx = 0;
let compassEl = null;
let headingEl = null;
let compassShownDeg = -999;

const FAV_KEY = 'nyc-dining-favs';
let favs = new Set();
let favWired = false;

function favKey(p) {
  return [p.name, p.street, p.borough, p.type, p.lat, p.lon].join('\u0001');
}

function loadFavs() {
  try {
    const raw = window.localStorage.getItem(FAV_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    favs = new Set(Array.isArray(arr) ? arr : []);
  } catch (err) {
    favs = new Set();
  }
}

function saveFavs() {
  try {
    window.localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(favs)));
  } catch (err) {
    /* storage unavailable */
  }
}

function isFav(p) {
  return p ? favs.has(favKey(p)) : false;
}

function toggleFav(p) {
  if (!p) return false;
  const k = favKey(p);
  let added;
  if (favs.has(k)) {
    favs.delete(k);
    added = false;
  } else {
    favs.add(k);
    added = true;
  }
  saveFavs();
  renderFavorites();
  return added;
}

function findFavPoint(key) {
  for (const p of points) {
    if (favKey(p) === key) return p;
  }
  return null;
}

function renderFavorites() {
  const list = document.getElementById('fav-list');
  const count = document.getElementById('fav-count');
  if (count) count.textContent = String(favs.size);
  if (!list) return;
  if (!favs.size) {
    list.innerHTML = '<div class="fav-empty">Tap the star on a place to save it</div>';
    return;
  }
  const entries = [];
  favs.forEach((k) => {
    const p = findFavPoint(k);
    if (p) entries.push({ k: k, p: p });
  });
  if (!entries.length) {
    list.innerHTML = '<div class="fav-empty">Tap the star on a place to save it</div>';
    return;
  }
  entries.sort((a, b) => String(a.p.name).localeCompare(String(b.p.name)));
  let html = '';
  for (const it of entries) {
    const p = it.p;
    if (!p.cat) p.cat = classifyPlace(p);
    const col = p.cat && p.cat.color ? p.cat.color : boroughColor(p.borough);
    const icon = p.cat && typeof placeIconSvg === 'function' ? placeIconSvg(p.cat, 12) : '';
    const active = selected === p ? ' active' : '';
    html +=
      '<button type="button" class="fav-row' + active + '" data-key="' + encodeURIComponent(it.k) + '">' +
      '<i style="background:' + col + '">' + icon + '</i>' +
      '<span>' + escapeHtml(trimName(p.name)) + '</span>' +
      '<em>' + escapeHtml(p.borough) + '</em>' +
      '<span class="fav-remove" role="button" title="Remove from favorites" aria-label="Remove from favorites">&times;</span>' +
      '</button>';
  }
  list.innerHTML = html;
}

function updateDetailFavButton(p) {
  const btn = document.getElementById('detail-fav');
  if (!btn) return;
  const on = isFav(p);
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.setAttribute('aria-label', on ? 'Remove from favorites' : 'Save to favorites');
  btn.setAttribute('title', on ? 'Remove from favorites' : 'Save to favorites');
}

function wireFavorites() {
  if (favWired) return;
  favWired = true;
  const favBtn = document.getElementById('detail-fav');
  if (favBtn) {
    favBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (!selected) return;
      const added = toggleFav(selected);
      updateDetailFavButton(selected);
      playSfx(added ? 'pop' : 'close');
    });
  }
  const list = document.getElementById('fav-list');
  if (list) {
    const leave = () => {
      setHover(null);
      hideTooltip();
    };
    list.addEventListener('pointerenter', leave);
    list.addEventListener('pointerleave', leave);
    list.addEventListener('click', (ev) => {
      const row = ev.target && ev.target.closest ? ev.target.closest('.fav-row') : null;
      if (!row) return;
      const key = decodeURIComponent(row.dataset.key || '');
      const rm = ev.target && ev.target.closest ? ev.target.closest('.fav-remove') : null;
      if (rm) {
        favs.delete(key);
        saveFavs();
        renderFavorites();
        if (selected && favKey(selected) === key) updateDetailFavButton(selected);
        playSfx('close');
        return;
      }
      const p = findFavPoint(key);
      if (p) selectPoint(p);
    });
  }
}

function setup() {
  const wrap = document.getElementById('canvas-wrap');
  const w = Math.max(320, wrap.clientWidth);
  const h = Math.round(Math.min(w * 0.92, window.innerHeight * 0.76));
  pixelDensity(Math.min(2, window.devicePixelRatio || 1));
  createCanvas(w, h).parent(wrap);
  tooltip = document.getElementById('tooltip');
  sourceNote = document.getElementById('source-note');
  tooltip.classList.add('hidden');
  detail = document.getElementById('detail');
  badge = document.getElementById('place-badge');
  hud = document.getElementById('map-hud');
  loadFavs();
  wireFavorites();
  if (detail) detail.classList.add('hidden');
  if (badge) badge.classList.add('hidden');
  const closeBtn = document.getElementById('detail-close');
  if (closeBtn) closeBtn.addEventListener('click', clearSelection);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') clearSelection();
  });
  buildBgLayer();
  wireBgOpacity();
  wireHud();

  loadData()
    .then((rows) => {
      points = rows.filter(inNYC);
      console.log('VALID POINTS:', points.length);
      if (!points.length) throw new Error('no valid rows found in data');
      computeBounds();
      layoutMap();
      projectPoints();
      buildBgLayer();
      for (const b of boroughList()) visibleBoroughs[b] = true;
      buildChips();
      wireFilters();
      wireBgOpacity();
      wireHud();
      redrawLayer();
      fadeStart = millis();
      ready = true;
      updateStats();
      renderFavorites();
      syncFilterButtons();
    })
    .catch((err) => {
      console.error(err);
      fatalMsg = String(err && err.message ? err.message : err);
      if (sourceNote) {
        sourceNote.textContent = 'failed to load data';
        sourceNote.style.color = '#ff6b6b';
      }
    });

  if (document.getElementById('intro')) {
    noLoop();
  } else {
    introActive = false;
  }
}

function loadData() {
  setStatus('loading data\u2026');
  let base = null;
  if (Array.isArray(window.NYC_DINING_DATA) && window.NYC_DINING_DATA.length) {
    base = window.NYC_DINING_DATA.map((r) => ({
      name: r[0],
      street: r[1],
      borough: r[2] || 'Unknown',
      type: r[3],
      lat: r[4],
      lon: r[5],
    }));
    console.log('SNAPSHOT DATA LENGTH:', base.length);
  }
  const finish = (rows, tag) => {
    console.log('DATA LOADED (' + tag + '):', rows.length, 'rows');
    const valid = rows.filter(inNYC);
    console.log('VALID POINTS:', valid.length);
    const bc = { Manhattan: 0, Brooklyn: 0, Queens: 0, Bronx: 0, 'Staten Island': 0, Unknown: 0 };
    for (const p of valid) bc[p.borough] = (bc[p.borough] || 0) + 1;
    console.log('MANHATTAN:', bc.Manhattan);
    console.log('BROOKLYN:', bc.Brooklyn);
    console.log('QUEENS:', bc.Queens);
    console.log('BRONX:', bc.Bronx);
    console.log('STATEN ISLAND:', bc['Staten Island']);
    console.log('UNKNOWN:', bc.Unknown);
    return rows;
  };
  return fetchText(CSV_FILE, 8000)
    .then((text) => {
      const rows = parseCsv(text);
      console.log('RAW CSV ROWS:', rows.length);
      if (!rows.length) throw new Error('CSV was empty');
      console.log('CSV HEADER FIELDS:', Object.keys(rows[0]).join(', '));
      console.log('first 3 lat/lon:', rows.slice(0, 3).map((r) => r.lat + '/' + r.lon).join(' | '));
      setStatus('live CSV loaded');
      return finish(rows, 'live CSV');
    })
    .catch((err) => {
      console.log('live CSV unavailable:', String(err).substring(0, 80));
      if (base) {
        setStatus('bundled snapshot (live CSV unreachable)');
        return finish(base, 'bundled snapshot');
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
      city: (cells[idx['City']] || '').trim(),
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
  updateScaleBar(scale);
}

function lonLatToXY(lon, lat) {
  const fx = (lon - dataBounds.lonMin) / (dataBounds.lonMax - dataBounds.lonMin);
  const fy = 1 - (lat - dataBounds.latMin) / (dataBounds.latMax - dataBounds.latMin);
  return { x: mapRect.x + fx * mapRect.w, y: mapRect.y + fy * mapRect.h };
}

function rotScreen(x, y) {
  if (!mapRot) return { x: x, y: y };
  const cx = width / 2;
  const cy = height / 2;
  const s = Math.sin(mapRot);
  const c = Math.cos(mapRot);
  const dx = x - cx;
  const dy = y - cy;
  return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
}

function projectPoints() {
  for (const p of points) {
    const c = lonLatToXY(p.lon, p.lat);
    p.mx = c.x;
    p.my = c.y;
    const s = rotScreen(c.x, c.y);
    p.x = s.x;
    p.y = s.y;
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
  if (layer) layer.remove();
  layer = createGraphics(width, height);
  layer.pixelDensity(Math.min(2, window.devicePixelRatio || 1));
  layer.clear();
  layer.noStroke();
  for (const p of visiblePoints()) {
    const glow = layer.color(boroughColor(p.borough));
    glow.setAlpha(38);
    layer.fill(glow);
    if (p.type === 'Roadway') layer.rect(p.mx - 6, p.my - 6, 12, 12, 2);
    else layer.circle(p.mx, p.my, 11);
  }
  for (const p of visiblePoints()) {
    const core = layer.color(boroughColor(p.borough));
    core.setAlpha(220);
    layer.fill(core);
    if (p.type === 'Roadway') layer.rect(p.mx - 3.2, p.my - 3.2, 6.4, 6.4, 1.5);
    else layer.circle(p.mx, p.my, 5.2);
  }
}

function draw() {
  clear();
  resetMatrix();
  easeMapRot();
  updateCompass();
  projectPoints();
  push();
  translate(width / 2, height / 2);
  rotate(mapRot);
  translate(-width / 2, -height / 2);
  image(bgLayer, 0, 0);
  if (!introActive && ready && layer) {
    const t = constrain((millis() - fadeStart) / 900, 0, 1);
    if (t < 1) {
      tint(255, 255 * (1 - Math.pow(1 - t, 3)));
      image(layer, 0, 0);
      noTint();
    } else {
      image(layer, 0, 0);
    }
  }
  pop();
  if (introActive) return;
  drawRestaurant();
  cursor(restHover ? 'pointer' : 'default');
  if (fatalMsg) {
    drawMessage('Could not load data', fatalMsg);
    return;
  }
  if (!ready || !layer) {
    drawMessage('Loading NYC dining data\u2026', '');
    return;
  }
  updateHover();
  if (selected && !isVisible(selected)) clearSelection();
  if (selected) drawSelection(selected);
  if (hovered && hovered !== selected) drawRing(hovered);
}

function easeMapRot() {
  const diff = mapRotTarget - mapRot;
  if (Math.abs(diff) < 0.0006) {
    if (mapRot !== mapRotTarget) {
      mapRot = mapRotTarget;
      updateNearby();
    }
    return;
  }
  mapRot += diff * 0.18;
}

function updateCompass() {
  if (!compassEl || !headingEl) return;
  const deg = ((mapRot * 180 / Math.PI) % 360 + 360) % 360;
  if (Math.abs(deg - compassShownDeg) < 0.4) return;
  compassShownDeg = deg;
  compassEl.style.transform = 'rotate(' + deg.toFixed(1) + 'deg)';
  compassEl.classList.toggle('rotated', deg > 0.5 && deg < 359.5);
  const shown = Math.round(deg);
  headingEl.textContent = (shown < 100 ? (shown < 10 ? '00' : '0') : '') + shown + '\u00b0 ' + cardinal(shown);
}

function cardinal(deg) {
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return names[Math.round(((deg % 360) / 45)) % 8];
}

function setMapRot(rad, snap, quiet) {
  let v = rad;
  let snapped = false;
  if (snap) {
    const deg = ((v * 180 / Math.PI) % 360 + 360) % 360;
    if (deg < 2 || deg > 358) {
      snapped = mapRotTarget !== 0;
      v = 0;
    }
  }
  if (Math.abs(v - mapRotTarget) < 0.0001) return;
  mapRotTarget = v;
  if (quiet) return;
  const now = millis();
  if (snapped) {
    lastRotSfx = now;
    playSfx('switch');
  } else if (now - lastRotSfx > 110) {
    lastRotSfx = now;
    playSfx('rot');
  }
}

function nudgeMapRot(step, quiet) {
  setMapRot(mapRotTarget + step, true, quiet);
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
  if (restHover || isMouseInDetail() || isMouseInHud() || mouseX < 0 || mouseY < 0 || mouseX > width || mouseY > height) {
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

function isMouseInHud() {
  const rail = document.getElementById('left-rail');
  const el = rail || hud;
  if (!el || el.classList.contains('hidden')) return false;
  const wrap = document.getElementById('canvas-wrap');
  const r = el.getBoundingClientRect();
  const wr = wrap.getBoundingClientRect();
  const px = wr.left + mouseX;
  const py = wr.top + mouseY;
  return px >= r.left && px <= r.right && py >= r.top && py <= r.bottom;
}

function wireHud() {
  if (!hud || hudWired) return;
  hudWired = true;
  compassEl = document.getElementById('hud-compass');
  headingEl = document.getElementById('hud-heading');
  const surprise = document.getElementById('hud-surprise');
  const reset = document.getElementById('hud-reset');
  const leave = () => {
    setHover(null);
    hideTooltip();
  };
  hud.addEventListener('pointerenter', leave);
  hud.addEventListener('pointerleave', leave);
  if (surprise) {
    surprise.addEventListener('click', () => {
      const vis = visiblePoints();
      if (!vis.length) {
        playSfx('close');
        return;
      }
      selectPoint(vis[Math.floor(Math.random() * vis.length)]);
    });
  }
  if (reset) {
    reset.addEventListener('click', () => {
      for (const b of boroughList()) visibleBoroughs[b] = true;
      buildChips();
      applyLicenseFilter('ALL', true);
      clearSelection();
      mapRotTarget = 0;
      playSfx('switch');
    });
  }
  wireCompass();
  wireNearby();
}

function wireCompass() {
  const el = document.getElementById('hud-compass');
  let dragging = false;
  let startAngle = 0;
  let startRot = 0;
  let moved = 0;
  if (!el) return;
  const angleOf = (ev) => {
    const r = el.getBoundingClientRect();
    return Math.atan2(ev.clientY - (r.top + r.height / 2), ev.clientX - (r.left + r.width / 2));
  };
  el.addEventListener('pointerdown', (ev) => {
    dragging = true;
    moved = 0;
    startAngle = angleOf(ev);
    startRot = mapRotTarget;
    try {
      if (el.setPointerCapture) el.setPointerCapture(ev.pointerId);
    } catch (err) {
      /* synthetic pointer, no capture */
    }
    ev.preventDefault();
  });
  el.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    let d = angleOf(ev) - startAngle;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    moved = Math.max(moved, Math.abs(d));
    setMapRot(startRot + d, false);
  });
  const endDrag = (ev) => {
    if (!dragging) return;
    dragging = false;
    try {
      if (el.releasePointerCapture) el.releasePointerCapture(ev.pointerId);
    } catch (err) {
      /* ignore */
    }
    if (moved < 0.07) {
      if (mapRotTarget === 0) {
        playSfx('tap');
        return;
      }
      mapRotTarget = 0;
      playSfx('switch');
    } else {
      setMapRot(mapRotTarget, true);
    }
  };
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);
  el.addEventListener('keydown', (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === 'q' || ev.key === 'ArrowLeft') {
      nudgeMapRot(-Math.PI / 12);
    } else if (ev.key === 'e' || ev.key === 'ArrowRight') {
      nudgeMapRot(Math.PI / 12);
    } else if (ev.key === 'Enter' || ev.key === ' ') {
      mapRotTarget = 0;
      playSfx('switch');
    } else {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
  });
  const left = document.getElementById('hud-rot-left');
  const right = document.getElementById('hud-rot-right');
  if (left) left.addEventListener('click', () => nudgeMapRot(-Math.PI / 12));
  if (right) right.addEventListener('click', () => nudgeMapRot(Math.PI / 12));
}

function trimName(name) {
  const s = String(name || '');
  return s.length > 24 ? s.slice(0, 23) + '\u2026' : s;
}

function updateNearby() {
  const list = document.getElementById('hud-nearby');
  const title = document.getElementById('hud-nearby-title');
  if (!list || !title) return;
  if (!ready || introActive) {
    list.innerHTML = '';
    title.textContent = 'Closest places';
    return;
  }
  const focus = selected;
  const fx = focus ? focus.x : width / 2;
  const fy = focus ? focus.y : height / 2;
  title.textContent = focus ? 'Closest to ' + trimName(focus.name) : 'Closest to the middle';
  const rows = [];
  for (const p of visiblePoints()) {
    if (p === selected) continue;
    if (p.x < -24 || p.y < -24 || p.x > width + 24 || p.y > height + 24) continue;
    rows.push({ p: p, d: Math.hypot(p.x - fx, p.y - fy) });
  }
  if (!rows.length) {
    list.innerHTML = '<div class="near-empty">Nothing on the map right now</div>';
    return;
  }
  rows.sort((a, b) => a.d - b.d);
  const top = rows.slice(0, 4);
  let html = '';
  for (const it of top) {
    const p = it.p;
    const mi = it.d * milesPerPx;
    const dist = mi < 0.15 ? Math.max(1, Math.round(mi * 5280)) + ' ft' : mi.toFixed(1) + ' mi';
    if (!p.cat) p.cat = classifyPlace(p);
    const col = p.cat && p.cat.color ? p.cat.color : boroughColor(p.borough);
    const icon = p.cat && typeof placeIconSvg === 'function' ? placeIconSvg(p.cat, 12) : '';
    html +=
      '<button type="button" class="near-row" data-i="' + points.indexOf(p) + '">' +
      '<i style="background:' + col + '">' + icon + '</i>' +
      '<span>' + escapeHtml(trimName(p.name)) + '</span>' +
      '<em>' + dist + '</em></button>';
  }
  list.innerHTML = html;
}

function wireNearby() {
  const list = document.getElementById('hud-nearby');
  if (!list) return;
  list.addEventListener('click', (ev) => {
    const row = ev.target && ev.target.closest ? ev.target.closest('.near-row') : null;
    if (!row) return;
    const p = points[parseInt(row.dataset.i, 10)];
    if (p) selectPoint(p);
  });
}

function updateHudStats() {
  if (!hud) return;
  const vis = visiblePoints();
  let side = 0;
  let road = 0;
  for (const p of vis) {
    if (p.type === 'Roadway') road += 1;
    else side += 1;
  }
  const v = document.getElementById('hud-visible');
  const s = document.getElementById('hud-sidewalk');
  const r = document.getElementById('hud-roadway');
  if (v) v.textContent = vis.length.toLocaleString('en-US');
  if (s) s.textContent = side.toLocaleString('en-US');
  if (r) r.textContent = road.toLocaleString('en-US');
  updateNearby();
}

function updateScaleBar(scale) {
  if (!hud || !(scale > 0)) return;
  milesPerPx = 1 / scale;
  const bar = document.getElementById('hud-scale-bar');
  const label = document.getElementById('hud-scale-label');
  if (!bar || !label) return;
  const choices = [0.1, 0.25, 0.5, 1, 2, 5, 10];
  let best = choices[0];
  let bestDiff = Infinity;
  for (const c of choices) {
    const px = c * scale;
    const diff = Math.abs(px - 62);
    if (px > 18 && px < 120 && diff < bestDiff) {
      bestDiff = diff;
      best = c;
    }
  }
  bar.style.width = Math.round(best * scale) + 'px';
  label.textContent = best >= 1 ? best + ' mi' : Math.round(best * 5280) + ' ft';
}

function isMouseInDetail() {
  if (!detail || detail.classList.contains('hidden')) return false;
  const wrap = document.getElementById('canvas-wrap');
  const r = detail.getBoundingClientRect();
  const wr = wrap.getBoundingClientRect();
  const px = wr.left + mouseX;
  const py = wr.top + mouseY;
  return px >= r.left && px <= r.right && py >= r.top && py <= r.bottom;
}

function drawSelection(p) {
  const t = millis() / 1000;
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.6);
  const col = p.cat ? p.cat.color : boroughColor(p.borough);
  push();
  noFill();
  const halo = color(col);
  halo.setAlpha(30 + 22 * pulse);
  noStroke();
  fill(halo);
  circle(p.x, p.y, 34 + 6 * pulse);
  drawingContext.shadowBlur = 16;
  drawingContext.shadowColor = col;
  stroke(col);
  strokeWeight(2.2);
  circle(p.x, p.y, 24 + 3 * pulse);
  drawingContext.shadowBlur = 0;
  stroke(255, 255, 255, 200);
  strokeWeight(1.4);
  circle(p.x, p.y, 19);
  pop();
}

function setHover(p) {
  if (p === hovered) {
    if (p) positionTooltip(p);
    return;
  }
  hovered = p;
  if (!p) {
    tooltip.classList.add('hidden');
    cursor(restHover ? 'pointer' : 'default');
    return;
  }
  tooltip.innerHTML =
    '<strong>' + escapeHtml(p.name) + '</strong>' +
    '<span class="street">' + escapeHtml(p.street) + '</span>' +
    '<span class="meta"><i style="background:' + boroughColor(p.borough) + '"></i>' +
    escapeHtml(p.borough) + ' &middot; ' + escapeHtml(p.type) + '</span>' +
    '<span class="cat-hint">Click for details</span>';
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
      clearSelection();
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
    btn.addEventListener('click', () => applyLicenseFilter(btn.dataset.filter));
  }
  syncFilterButtons();
}

function syncFilterButtons() {
  for (const btn of document.querySelectorAll('#license-filters button')) {
    btn.classList.toggle('active', btn.dataset.filter === licenseFilter);
  }
}

function playSfx(name) {
  if (typeof SFX !== 'undefined' && SFX && SFX.play) SFX.play(name);
}

function applyLicenseFilter(value, silent) {
  licenseFilter = value;
  hovered = null;
  clearSelection();
  if (!silent) playSfx('switch');
  if (tooltip) tooltip.classList.add('hidden');
  syncFilterButtons();
  if (ready) {
    redrawLayer();
    updateStats();
  }
  fadeStart = millis();
}

function cycleLicenseFilter() {
  const order = ['ALL', 'Sidewalk', 'Roadway'];
  const i = order.indexOf(licenseFilter);
  applyLicenseFilter(order[(i + 1) % order.length]);
}

function mousePressed(event) {
  if (introActive) return;
  const target = event && event.target;
  if (!target || target.tagName !== 'CANVAS') return;
  if (keyIsDown(SHIFT)) return;
  if (isMouseInHud() || isMouseInDetail()) return;
  if (restHit && mouseX >= restHit.x0 && mouseX <= restHit.x1 && mouseY >= restHit.y0 && mouseY <= restHit.y1) {
    cycleLicenseFilter();
    return;
  }
  const hit = nearestPoint(20);
  if (hit) selectPoint(hit);
  else {
    playSfx(selected ? 'close' : 'tap');
    clearSelection();
  }
}

function mouseDragged() {
  if (introActive || !mouseIsPressed || !keyIsDown(SHIFT)) return;
  if (mouseX < 0 || mouseY < 0 || mouseX > width || mouseY > height) return;
  if (isMouseInHud() || isMouseInDetail()) return;
  const a = Math.atan2(mouseY - height / 2, mouseX - width / 2);
  if (!rotDragging) {
    rotDragging = true;
    rotDragStart = a;
    rotDragRot = mapRotTarget;
    return;
  }
  let d = a - rotDragStart;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  setMapRot(rotDragRot + d, false);
  return false;
}

function mouseReleased() {
  if (!rotDragging) return;
  rotDragging = false;
  setMapRot(mapRotTarget, true);
}

function keyPressed(event) {
  if (introActive) return;
  if (event && (event.metaKey || event.ctrlKey || event.altKey)) return;
  const active = document.activeElement;
  if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return;
  const k = (key || '').toLowerCase();
  if (k === 'q') {
    nudgeMapRot(-Math.PI / 12);
  } else if (k === 'e') {
    nudgeMapRot(Math.PI / 12);
  } else if (k === 'r') {
    if (mapRotTarget === 0) return;
    mapRotTarget = 0;
    playSfx('switch');
  }
}

function nearestPoint(maxDist) {
  if (mouseX < 0 || mouseY < 0 || mouseX > width || mouseY > height) return null;
  const lim = maxDist * maxDist;
  let best = null;
  let bestD = lim;
  for (const p of visiblePoints()) {
    const d = (p.x - mouseX) ** 2 + (p.y - mouseY) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

function selectPoint(p) {
  selected = p;
  p.cat = classifyPlace(p);
  playSfx('pop');
  updateNearby();
  renderFavorites();
  if (!detail) return;
  const url = googleMapsUrl(p);
  const icon = document.getElementById('detail-icon');
  const name = document.getElementById('detail-name');
  const street = document.getElementById('detail-street');
  const meta = document.getElementById('detail-meta');
  const mapLink = document.getElementById('detail-map');
  if (!icon || !name || !street || !meta || !mapLink) return;
  icon.innerHTML = placeIconSvg(p.cat, 22);
  icon.style.background = p.cat.color;
  name.textContent = p.name;
  name.href = url;
  street.textContent = p.street || '—';
  meta.innerHTML =
    '<i style="background:' + boroughColor(p.borough) + '"></i>' +
    escapeHtml(p.borough) + ' &middot; ' + escapeHtml(p.type) +
    ' <em>' + escapeHtml(p.cat.label) + '</em>';
  mapLink.href = url;
  updateDetailFavButton(p);
  detail.classList.remove('hidden');
  if (badge) {
    badge.innerHTML = placeIconSvg(p.cat, 16);
    badge.style.background = p.cat.color;
    badge.classList.remove('hidden');
  }
  positionDetail();
  hideTooltip();
  emitCategoryIcons(p);
}

function emitCategoryIcons(p) {
  const wrap = document.getElementById('canvas-wrap');
  if (!wrap || !p.cat || typeof placeIconSvg !== 'function') return;
  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (wrap.querySelectorAll('.float-ico').length > 40) return;
  const count = reduceMotion ? 3 : 8;
  for (let i = 0; i < count; i++) {
    const el = document.createElement('span');
    el.className = 'float-ico';
    el.innerHTML = placeIconSvg(p.cat, 18);
    const svg = el.querySelector('svg');
    if (svg) {
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
    }
    const size = 13 + Math.random() * 12;
    el.style.left = p.x + 'px';
    el.style.top = (p.y - 8) + 'px';
    el.style.width = size.toFixed(1) + 'px';
    el.style.height = size.toFixed(1) + 'px';
    el.style.color = p.cat.color;
    el.style.setProperty('--dx', ((Math.random() - 0.5) * 130).toFixed(1) + 'px');
    el.style.setProperty('--sway', ((Math.random() - 0.5) * 30).toFixed(1) + 'px');
    el.style.setProperty('--rise', '-' + (70 + Math.random() * 95).toFixed(0) + 'px');
    el.style.setProperty('--rot', ((Math.random() - 0.5) * 90).toFixed(0) + 'deg');
    el.style.animationDuration = (reduceMotion ? 0.9 : 1.5 + Math.random() * 1.1).toFixed(2) + 's';
    const delay = i * 0.06 + Math.random() * 0.06;
    el.style.animationDelay = delay.toFixed(2) + 's';
    const remove = () => {
      if (el.parentNode) el.parentNode.removeChild(el);
    };
    el.addEventListener('animationend', remove);
    window.setTimeout(remove, (delay + parseFloat(el.style.animationDuration) + 0.5) * 1000);
    wrap.appendChild(el);
  }
}

function clearSelection() {
  selected = null;
  if (detail) detail.classList.add('hidden');
  if (badge) badge.classList.add('hidden');
  updateNearby();
  renderFavorites();
}

function positionDetail() {
  if (!selected || !detail || detail.classList.contains('hidden')) return;
  const wrap = document.getElementById('canvas-wrap');
  const ch = wrap.clientHeight;
  if (badge) {
    badge.style.left = selected.x + 'px';
    badge.style.top = selected.y + 'px';
  }
  const dh = detail.offsetHeight;
  const x = 14;
  let y = 14;
  y = Math.max(8, Math.min(y, ch - dh - 8));
  detail.style.left = x + 'px';
  detail.style.top = y + 'px';
}

function hideTooltip() {
  if (tooltip) tooltip.classList.add('hidden');
}

function updateStats() {
  const vis = visiblePoints();
  const visEl = document.getElementById('stat-visible');
  const totalEl = document.getElementById('stat-total');
  if (visEl) visEl.textContent = vis.length.toLocaleString('en-US');
  if (totalEl) totalEl.textContent = points.length.toLocaleString('en-US');
  updateHudStats();
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
  if (bgLayer) bgLayer.remove();
  bgLayer = createGraphics(width, height);
  const dens = Math.min(2, window.devicePixelRatio || 1);
  bgLayer.pixelDensity(dens);
  bgLayer.noStroke();
  bgLayer.loadPixels();
  const pw = Math.round(width * dens);
  const ph = Math.round(height * dens);
  const flat = 0.86;
  const ramp = 1 - flat;
  const Land = [230, 246, 234];
  const px = bgLayer.pixels;
  const eRow = new Float32Array(ph);
  const eCol = new Float32Array(pw);
  for (let y = 0; y < ph; y++) {
    const t = Math.min(1, Math.max(0, (Math.abs(y - ph / 2) / (ph / 2) - flat) / ramp));
    eRow[y] = t * t * (3 - 2 * t);
  }
  for (let x = 0; x < pw; x++) {
    const t = Math.min(1, Math.max(0, (Math.abs(x - pw / 2) / (pw / 2) - flat) / ramp));
    eCol[x] = t * t * (3 - 2 * t);
  }
  const rTab = new Uint8Array(256);
  const gTab = new Uint8Array(256);
  const bTab = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const e = i / 255;
    rTab[i] = Math.round(255 + (Land[0] - 255) * e);
    gTab[i] = Math.round(255 + (Land[1] - 255) * e);
    bTab[i] = Math.round(255 + (Land[2] - 255) * e);
  }
  for (let y = 0; y < ph; y++) {
    const ey = eRow[y];
    const rowBase = y * pw;
    for (let x = 0; x < pw; x++) {
      const e = (ey > eCol[x] ? ey : eCol[x]) * 255 | 0;
      const k = 4 * (rowBase + x);
      px[k] = rTab[e];
      px[k + 1] = gTab[e];
      px[k + 2] = bTab[e];
      px[k + 3] = 255;
    }
  }
  bgLayer.updatePixels();
  if (mapRect) drawCoastline();
  setBgAlpha(bgAlphaPct);
}

function setBgAlpha(pct) {
  bgAlphaPct = Math.min(100, Math.max(10, Math.round(pct)));
  if (!bgLayer) return;
  bgLayer.loadPixels();
  const px = bgLayer.pixels;
  const a = Math.round((255 * bgAlphaPct) / 100);
  for (let i = 3; i < px.length; i += 4) px[i] = a;
  bgLayer.updatePixels();
}

let bgOpacityWired = false;

function wireBgOpacity() {
  const input = document.getElementById('bg-opacity');
  const out = document.getElementById('bg-opacity-value');
  if (!input || bgOpacityWired) return;
  bgOpacityWired = true;
  input.value = String(bgAlphaPct);
  if (out) out.textContent = bgAlphaPct + '%';
  let pending = false;
  const apply = (sound) => {
    const next = Math.min(100, Math.max(10, parseInt(input.value, 10) || 80));
    bgAlphaPct = next;
    if (out) out.textContent = next + '%';
    try {
      window.localStorage.setItem(BG_ALPHA_KEY, String(next));
    } catch (err) {
      /* storage blocked */
    }
    if (pending) return;
    pending = true;
    window.setTimeout(() => {
      pending = false;
      setBgAlpha(bgAlphaPct);
      if (typeof redraw === 'function') {
        try {
          redraw();
        } catch (err) {
          /* loop still running */
        }
      }
    }, 0);
    if (sound) playSfx('switch');
  };
  input.addEventListener('input', () => apply(false));
  input.addEventListener('change', () => apply(true));
  input.addEventListener('keydown', () => {
    window.setTimeout(() => apply(false), 0);
  });
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
  glass.setAlpha(Math.min(255, Math.round(120 + Math.sin(t * 0.8) * 25)));
  fill(glass);
  rect(-1.9 * u, -2.15 * u, 2.9 * u, 1.35 * u, 0.08 * u);
  noStroke();
  const shine = color('#ffffff');
  shine.setAlpha(150);
  fill(shine);
  quad(-1.78 * u, -0.92 * u, -1.64 * u, -0.92 * u, -1.28 * u, -2.03 * u, -1.42 * u, -2.03 * u);
  quad(-1.52 * u, -0.92 * u, -1.46 * u, -0.92 * u, -1.1 * u, -2.03 * u, -1.16 * u, -2.03 * u);

  const canopy = color('#9bd4f5');
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
  const tableC = color('#ffffff');
  const chairC = color('#cabfe8');
  for (const um of [[-1.45, 2.35, '#c9a8e8'], [0.4, 2.15, '#ffffff']]) {
    const ux = um[0] * u;
    const poleTop = -um[1] * u;
    poleC.setAlpha(245);
    fill(poleC);
    rect(ux - 0.035 * u, poleTop, 0.07 * u, um[1] * u - 0.22 * u, 0.03 * u);
    const umb = color(um[2]);
    umb.setAlpha(255);
    fill(umb);
    arc(ux, poleTop, 1.7 * u, 0.62 * u, PI, TWO_PI);
    fill(poleC);
    circle(ux, poleTop - 0.34 * u, 0.1 * u);
    tableC.setAlpha(255);
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

function drawPatio(t, u) {
  noStroke();
  let c = color('#5a7a62');
  c.setAlpha(30);
  fill(c);
  ellipse(0, 0.52 * u, 5.0 * u, 0.16 * u);
  c = color('#c9a35a');
  c.setAlpha(235);
  fill(c);
  rect(-2.4 * u, 0.14 * u, 4.8 * u, 0.26 * u, 0.04 * u);
  c = color('#8fbf8e');
  c.setAlpha(235);
  fill(c);
  for (const px of [-2.4, -0.8, 0.8, 2.4]) {
    rect(px * u - 0.045 * u, -1.05 * u, 0.09 * u, 1.12 * u, 0.03 * u);
  }
  rect(-2.4 * u, -1.05 * u, 4.8 * u, 0.09 * u, 0.03 * u);
  rect(-2.4 * u, -0.55 * u, 4.8 * u, 0.09 * u, 0.03 * u);
  const wire = color('#e8c46a');
  wire.setAlpha(160);
  noFill();
  stroke(wire);
  strokeWeight(0.04 * u);
  beginShape();
  for (let i = 0; i <= 24; i++) {
    const k = i / 24;
    vertex(
      (1 - k) * (1 - k) * -2.35 * u + 2 * (1 - k) * k * 0 + k * k * 2.35 * u,
      (1 - k) * (1 - k) * -1.5 * u + 2 * (1 - k) * k * -1.15 * u + k * k * -1.5 * u
    );
  }
  endShape();
  noStroke();
  for (let i = 1; i < 8; i++) {
    const k = i / 8;
    const bx = (1 - k) * (1 - k) * -2.35 * u + k * k * 2.35 * u;
    const by = (1 - k) * (1 - k) * -1.5 * u + 2 * (1 - k) * k * -1.15 * u + k * k * -1.5 * u;
    const bulb = color(i % 2 === 0 ? '#ffc93c' : '#ff8a5c');
    bulb.setAlpha(200 + Math.sin(t * 2 + i * 1.6) * 55);
    fill(bulb);
    circle(bx, by + 0.06 * u, 0.13 * u);
  }
  for (const tx of [-1.2, 1.2]) {
    const poleTop = -1.42 * u;
    c = color('#fffef8');
    c.setAlpha(245);
    fill(c);
    rect(tx * u - 0.035 * u, poleTop, 0.07 * u, 1.28 * u, 0.03 * u);
    const umb = color('#ffffff');
    umb.setAlpha(255);
    fill(umb);
    arc(tx, poleTop, 1.35 * u, 0.52 * u, PI, TWO_PI);
    c = color('#e8c46a');
    c.setAlpha(200);
    fill(c);
    arc(tx, poleTop, 1.35 * u, 0.52 * u, PI + 0.5, TWO_PI - 0.5);
    c = color('#fffef8');
    c.setAlpha(245);
    fill(c);
    circle(tx, poleTop - 0.26 * u, 0.09 * u);
    c = color('#ffffff');
    c.setAlpha(255);
    fill(c);
    ellipse(tx, -0.62 * u, 0.85 * u, 0.14 * u);
    rect(tx * u - 0.03 * u, -0.62 * u, 0.06 * u, 0.72 * u, 0.03 * u);
    ellipse(tx, 0.1 * u, 0.44 * u, 0.09 * u);
    const chx = tx + 0.58 * u;
    c = color('#e8712f');
    c.setAlpha(215);
    fill(c);
    rect(chx, -0.5 * u, 0.3 * u, 0.07 * u, 0.02 * u);
    rect(chx + 0.24 * u, -0.82 * u, 0.06 * u, 0.38 * u, 0.02 * u);
    rect(chx + 0.02 * u, -0.43 * u, 0.05 * u, 0.34 * u, 0.02 * u);
    rect(chx + 0.24 * u, -0.43 * u, 0.05 * u, 0.34 * u, 0.02 * u);
  }
  for (const px of [-2.75, 2.75]) {
    c = color('#e8c46a');
    c.setAlpha(220);
    fill(c);
    rect(px * u - 0.28 * u, -0.42 * u, 0.56 * u, 0.5 * u, 0.05 * u);
    c = color('#2d9a52');
    c.setAlpha(235);
    fill(c);
    circle(px * u - 0.12 * u, -0.56 * u, 0.32 * u);
    circle(px * u + 0.12 * u, -0.6 * u, 0.28 * u);
    circle(px * u, -0.74 * u, 0.24 * u);
  }
}

const REST_LABELS = { ALL: 'All outdoor dining', Sidewalk: 'Sidewalk dining', Roadway: 'Roadway dining' };
const REST_HINTS = { ALL: 'click for sidewalk dining', Sidewalk: 'click for roadway dining', Roadway: 'click to show everything' };

function drawRestaurant() {
  const t = millis() / 1000;
  const u = Math.min(width, height) / 19;
  let ax = width - 1.9 * u;
  let hw = 2.5 * u;
  if (licenseFilter === 'Sidewalk') {
    ax = width - 2.15 * u;
    hw = 2.75 * u;
  } else if (licenseFilter === 'Roadway') {
    ax = width - 2.35 * u;
    hw = 2.95 * u;
  }
  const baseY = height - 6;
  const topY = baseY - 4.5 * u;
  restHit = { x0: ax - hw - 8, y0: topY - 40, x1: Math.min(width, ax + hw + 8), y1: baseY + 6 };
  restHover =
    mouseX >= restHit.x0 && mouseX <= restHit.x1 &&
    mouseY >= restHit.y0 && mouseY <= restHit.y1;

  const dt = Math.min(deltaTime / 1000, 0.1);
  restGlow += ((restHover ? 1 : 0) - restGlow) * Math.min(1, dt * 7);
  if (restGlow < 0.005) restGlow = 0;

  push();
  noStroke();
  translate(ax, baseY);
  scale(1 + restGlow * 0.07);
  drawingContext.globalAlpha = 0.88 + 0.12 * restGlow;
  if (restGlow > 0.02) {
    drawingContext.shadowBlur = 12 * restGlow;
    drawingContext.shadowColor = 'rgba(90, 165, 255, 0.5)';
  }
  if (licenseFilter === 'Sidewalk') drawCafeSidewalk(t, u);
  else if (licenseFilter === 'Roadway') drawPatio(t, u);
  else drawBistro(t, u);
  drawingContext.shadowBlur = 0;
  drawingContext.globalAlpha = 1;
  pop();

  drawRestaurantCaption(ax, topY);
}

function drawRestaurantCaption(ax, topY) {
  const label = REST_LABELS[licenseFilter] || REST_LABELS.ALL;
  const hint = REST_HINTS[licenseFilter] || REST_HINTS.ALL;
  push();
  noStroke();
  textAlign(CENTER, CENTER);
  textFont('Helvetica');
  textSize(11);
  textStyle(BOLD);
  const lw = textWidth(label);
  textSize(9.5);
  textStyle(NORMAL);
  const hw = textWidth(hint);
  const pw = Math.max(lw, hw) + 20;
  const ph = 34;
  const px = Math.min(constrain(ax - pw / 2, 6, width - pw - 6), width - 6);
  const py = topY - ph - 8;
  const bg = color('#ffffff');
  bg.setAlpha(restHover ? 245 : 205);
  fill(bg);
  if (restHover) {
    drawingContext.shadowBlur = 16;
    drawingContext.shadowColor = 'rgba(90, 165, 255, 0.5)';
  }
  rect(px, py, pw, ph, 10);
  drawingContext.shadowBlur = 0;
  noFill();
  stroke(74, 163, 255, restHover ? 230 : 130);
  strokeWeight(1);
  rect(px, py, pw, ph, 10);
  noStroke();
  fill(46, 70, 54);
  textStyle(BOLD);
  text(label, px + pw / 2, py + 11);
  fill(110, 138, 120, 150 + 105 * restGlow);
  textStyle(NORMAL);
  textSize(9.5);
  text(hint, px + pw / 2, py + 24);
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
  const awnCream = color('#ead9b8');
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
    const mull = color('#ead9b8');
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
  const wrap = document.getElementById('canvas-wrap');
  const w = Math.max(320, wrap.clientWidth);
  const h = Math.round(Math.min(w * 0.92, window.innerHeight * 0.76));
  pixelDensity(Math.min(2, window.devicePixelRatio || 1));
  resizeCanvas(w, h);
  if (ready) layoutMap();
  if (ready) redrawLayer();
  buildBgLayer();
  fadeStart = millis();
  positionDetail();
  reportProjection();
}

function startMapFromIntro(filter) {
  introActive = false;
  loop();
  applyLicenseFilter(filter || 'ALL', true);
  playSfx('reveal');
  const panel = document.querySelector('.panel');
  if (panel) {
    panel.classList.remove('panel-enter');
    void panel.offsetWidth;
    panel.classList.add('panel-enter');
  }
}

window.startMapFromIntro = startMapFromIntro;

function reportProjection() {
  if (!sourceNote || !ready || !points.length || !mapRect) return;
  const midLat = radians((dataBounds.latMin + dataBounds.latMax) / 2);
  const scale = mapRect.w / ((dataBounds.lonMax - dataBounds.lonMin) * 69.17 * Math.cos(midLat));
  const p0 = points[0];
  const p1 = points[1] || p0;
  const p2 = points[2] || p0;
  sourceNote.textContent = 'w=' + width + ' h=' + height +
    ' scale=' + scale.toFixed(2) +
    ' ox=' + mapRect.x.toFixed(0) + ' oy=' + mapRect.y.toFixed(0) +
    ' n=' + points.length +
    ' p0=(' + p0.x.toFixed(0) + ',' + p0.y.toFixed(0) + ')' +
    ' p1=(' + p1.x.toFixed(0) + ',' + p1.y.toFixed(0) + ')' +
    ' p2=(' + p2.x.toFixed(0) + ',' + p2.y.toFixed(0) + ')';
}
