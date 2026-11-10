(function () {
  var overlay = document.getElementById('intro');
  if (!overlay) return;

  var canvas = document.getElementById('intro-canvas');
  var choicesBox = document.getElementById('intro-choices');
  var skipBtn = document.getElementById('intro-skip');
  var ctx = canvas.getContext('2d');

  var W = 760;
  var H = 300;
  var SIDE_TOP = 214;
  var CURB = 238;
  var FEET = 234;
  var DOOR_X = 498;
  var STOP_X = 464;
  var REST_LEFT = 470;
  var REST_RIGHT = 702;
  var REST_TOP = 58;
  var PHOTO_LEFT = 472;
  var PHOTO_RIGHT = 746;
  var PHOTO_TOP = 8;
  var PHOTO_BASE = CURB + 2;
  var ART_SCALE = 1.0;
  var ART_CX = 566;
  var ART_BASE = CURB + 8;

  function artFit() {
    if (!restBox) return null;
    var boxW = (PHOTO_RIGHT - PHOTO_LEFT) * ART_SCALE;
    var boxH = (PHOTO_BASE - PHOTO_TOP) * ART_SCALE;
    var sc = Math.min(boxW / restBox.sw, boxH / restBox.sh);
    return { dw: restBox.sw * sc, dh: restBox.sh * sc };
  }

  var restImg = new Image();
  var restImgOk = false;
  var restImgFailed = false;
  var restBox = null;
  var restCache = null;
  var restCacheK = -1;
  var restMode = 'none';

  function measureArt(img) {
    var maxW = 460;
    var w = Math.max(1, Math.round(Math.min(maxW, img.naturalWidth || img.width)));
    var h = Math.max(1, Math.round(w * (img.naturalHeight || img.height) / (img.naturalWidth || img.width)));
    var probe = document.createElement('canvas');
    probe.width = w;
    probe.height = h;
    var pg = probe.getContext('2d');
    pg.clearRect(0, 0, w, h);
    pg.drawImage(img, 0, 0, w, h);
    var d = pg.getImageData(0, 0, w, h).data;
    var minX = w, minY = h, maxX = -1, maxY = -1;
    var rows = [], solid = [], rowL = [], rowR = [], maxRow = 0, maxSolid = 0, y, x;
    for (y = 0; y < h; y++) {
      var cnt = 0, scnt = 0, lft = -1, rgt = -1;
      for (x = 0; x < w; x++) {
        var al = d[4 * (y * w + x) + 3];
        if (al > 16) {
          cnt++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
        if (al > 200) {
          scnt++;
          if (lft < 0) lft = x;
          rgt = x;
        }
      }
      rows[y] = cnt;
      solid[y] = scnt;
      rowL[y] = lft;
      rowR[y] = rgt;
      if (cnt > maxRow) maxRow = cnt;
      if (scnt > maxSolid) maxSolid = scnt;
    }
    if (maxX < 0) return null;
    var need = Math.max(4, maxSolid * 0.55);
    var solidRow = maxY;
    var run = 0;
    for (y = maxY; y >= minY; y--) {
      if (solid[y] >= need) {
        run++;
        if (run >= 3) {
          solidRow = y + 2;
          break;
        }
      } else {
        run = 0;
      }
    }
    var bandL = -1, bandR = -1;
    for (y = Math.max(minY, solidRow - 2); y <= solidRow; y++) {
      if (rowL[y] >= 0) {
        if (bandL < 0 || rowL[y] < bandL) bandL = rowL[y];
        if (rowR[y] > bandR) bandR = rowR[y];
      }
    }
    var colS = [], maxCol = 0, seed = -1, cut, gap, c;
    for (x = 0; x < w; x++) colS[x] = 0;
    for (y = minY; y <= solidRow; y++) {
      for (x = 0; x < w; x++) {
        if (d[4 * (y * w + x) + 3] > 200) colS[x]++;
      }
    }
    for (x = 0; x < w; x++) {
      if (colS[x] > maxCol) { maxCol = colS[x]; seed = x; }
    }
    if (seed >= 0 && maxCol > 4) {
      cut = maxCol * 0.12;
      gap = 0;
      for (c = seed; c >= 0; c--) {
        if (colS[c] >= cut) { minX = c; gap = 0; } else if (++gap > 5) break;
      }
      gap = 0;
      for (c = seed; c < w; c++) {
        if (colS[c] >= cut) { maxX = c; gap = 0; } else if (++gap > 5) break;
      }
    }
    var fx = img.naturalWidth / w;
    var fy = img.naturalHeight / h;
    var padX = (maxX - minX + 1) * 0.015;
    var sx = Math.max(0, (minX - padX) * fx);
    var sy = Math.max(0, minY * fy);
    var sw = Math.min(img.naturalWidth - sx, (maxX - minX + 1 + 2 * padX) * fx);
    var bottomRow = solidRow + 1.6;
    var sh = Math.min(img.naturalHeight - sy, (bottomRow - minY) * fy);
    var foot = null;
    if (bandL >= 0 && bandR > bandL && sw > 0) {
      var a0 = (bandL * fx - sx) / sw;
      var b0 = ((bandR + 1) * fx - sx) / sw;
      a0 = Math.min(0.9, Math.max(0, a0));
      b0 = Math.min(1, Math.max(a0 + 0.08, b0));
      foot = { a: a0, b: b0 };
    }
    return { sx: sx, sy: sy, sw: sw, sh: sh, solid: 1, foot: foot };
  }

  function sharpenCanvas(cv, amount) {
    try {
      var g = cv.getContext('2d');
      var im = g.getImageData(0, 0, cv.width, cv.height);
      var d = im.data;
      var w = cv.width, h = cv.height;
      var src = new Uint8ClampedArray(d);
      var amt = amount;
      for (var y = 1; y < h - 1; y++) {
        for (var x = 1; x < w - 1; x++) {
          var i = 4 * (y * w + x);
          if (src[i + 3] < 8) continue;
          var self = src[i + 3];
          for (var ch = 0; ch < 3; ch++) {
            var o = i + ch;
            var c0 = src[o];
            var n1 = src[i + 3 - w * 4] > 60 ? src[o - w * 4] : c0;
            var n2 = src[i + 3 + w * 4] > 60 ? src[o + w * 4] : c0;
            var n3 = src[i + 3 - 4] > 60 ? src[o - 4] : c0;
            var n4 = src[i + 3 + 4] > 60 ? src[o + 4] : c0;
            var nb = (n1 + n2 + n3 + n4) * 0.25;
            var v = c0 + amt * (c0 - nb);
            d[o] = v < 0 ? 0 : v > 255 ? 255 : v;
          }
          if (self < 200) {
            var mix = self / 200;
            for (var c2 = 0; c2 < 3; c2++) d[i + c2] = Math.round(src[i + c2] * (1 - mix) + d[i + c2] * mix);
          }
        }
      }
      g.putImageData(im, 0, 0);
      return true;
    } catch (e) {
      return false;
    }
  }

  function upgradeRestCache(target, box, version) {
    if (!window.createImageBitmap) return;
    try {
      window.createImageBitmap(restImg, box.sx, box.sy, box.sw, box.sh, {
        resizeWidth: target.width,
        resizeHeight: target.height,
        resizeQuality: 'high'
      }).then(function (bmp) {
        try {
          if (!restImgOk || restCacheK !== version) return;
          var cv = document.createElement('canvas');
          cv.width = target.width;
          cv.height = target.height;
          var g = cv.getContext('2d');
          g.imageSmoothingEnabled = true;
          g.imageSmoothingQuality = 'high';
          if (typeof g.filter === 'string') g.filter = 'contrast(1.06) saturate(1.08) brightness(1.02)';
          g.drawImage(bmp, 0, 0);
          if (typeof g.filter === 'string') g.filter = 'none';
          if (bmp.close) bmp.close();
          var hard = sharpenCanvas(cv, 0.6);
          restCache = cv;
          restMode = hard ? 'bitmap+sharpen' : 'bitmap';
        } catch (e) {
          /* keep the stepped cache */
        }
      }, function () { /* keep the stepped cache */ });
    } catch (e) {
      /* createImageBitmap options unsupported */
    }
  }

  function buildRestCache() {
    restCache = null;
    if (!restImgOk) return;
    if (!restBox) ensureRestBox();
    if (!restBox || !(restBox.sw > 0 && restBox.sh > 0)) return;
    var fit = artFit();
    var sc = fit.dw * k / restBox.sw;
    var tw = Math.max(1, Math.round(restBox.sw * sc));
    var th = Math.max(1, Math.round(restBox.sh * sc));
    var cur = document.createElement('canvas');
    cur.width = Math.max(1, Math.round(restBox.sw));
    cur.height = Math.max(1, Math.round(restBox.sh));
    var cg = cur.getContext('2d');
    cg.imageSmoothingEnabled = true;
    cg.imageSmoothingQuality = 'high';
    if (typeof cg.filter === 'string') cg.filter = 'contrast(1.06) saturate(1.08) brightness(1.02)';
    cg.drawImage(restImg, restBox.sx, restBox.sy, restBox.sw, restBox.sh, 0, 0, cur.width, cur.height);
    if (typeof cg.filter === 'string') cg.filter = 'none';
    while (cur.width / 2 >= tw && cur.height / 2 >= th) {
      var nxt = document.createElement('canvas');
      nxt.width = Math.max(1, Math.round(cur.width / 2));
      nxt.height = Math.max(1, Math.round(cur.height / 2));
      var ng = nxt.getContext('2d');
      ng.imageSmoothingEnabled = true;
      ng.imageSmoothingQuality = 'high';
      ng.drawImage(cur, 0, 0, cur.width, cur.height, 0, 0, nxt.width, nxt.height);
      cur = nxt;
    }
    if (cur.width !== tw || cur.height !== th) {
      var fin = document.createElement('canvas');
      fin.width = tw;
      fin.height = th;
      var fg = fin.getContext('2d');
      fg.imageSmoothingEnabled = true;
      fg.imageSmoothingQuality = 'high';
      fg.drawImage(cur, 0, 0, cur.width, cur.height, 0, 0, tw, th);
      cur = fin;
    }
    restMode = sharpenCanvas(cur, 0.6) ? 'stepped+sharpen' : 'stepped';
    restCache = cur;
    restCacheK = k;
    upgradeRestCache(cur, restBox, k);
  }

  function defaultBox(img) {
    var iw = img.naturalWidth || img.width;
    var ih = img.naturalHeight || img.height;
    if (!(iw > 0 && ih > 0)) return null;
    return { sx: iw * 0.02, sy: ih * 0.09, sw: iw * 0.95, sh: ih * 0.83, solid: 1 };
  }

  function ensureRestBox() {
    if (restBox) return restBox;
    try {
      restBox = measureArt(restImg);
    } catch (e) {
      restBox = null;
    }
    if (!restBox) restBox = defaultBox(restImg);
    return restBox;
  }

  restImg.onload = function () {
    ensureRestBox();
    restImgOk = true;
    try {
      buildRestCache();
    } catch (e) {
      restCache = null;
    }
  };
  restImg.onerror = function () {
    restImgOk = false;
    restImgFailed = true;
  };
  restImg.src = encodeURIComponent('新房子.png') + '?v=20261103a';

  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var variant = 'sidewalk';
  var START_X = -36;
  var PERSON_SPEED = 205;
  var person = { x: START_X, walking: true, phase: 0 };
  var walkStart = 0;
  var arrivedWall = 0;
  var dust = [];
  var lastStepSign = 1;
  var stepAlt = false;
  var walkBegan = false;
  var gateAt = 0;
  var walkUnlocked = false;
  var revealed = false;
  var chosen = false;
  var raf = null;
  var lastPump = 0;
  var watchdog = null;
  var lastTime = 0;
  var clock = 0;
  var k = 1;

  function fit() {
    var dpr = Math.max(2, Math.min(3, window.devicePixelRatio || 1));
    var cssW = canvas.clientWidth || W;
    var cssH = Math.round(cssW * H / W);
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    k = (cssW * dpr) / W;
  }

  function rr(x, y, w, h, r) {
    var rad = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  function box(x, y, w, h, fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w, h);
  }

  function blob(x, y, r, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function cloud(x, y, s, a) {
    ctx.fillStyle = 'rgba(255,255,255,' + a + ')';
    ctx.beginPath();
    ctx.ellipse(x, y, 26 * s, 12 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 18 * s, y + 3 * s, 18 * s, 9 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 19 * s, y + 4 * s, 15 * s, 8 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function skyline() {
    ctx.fillStyle = '#e3eee6';
    var tops = [[40, 150, 52], [100, 118, 40], [150, 168, 60], [215, 132, 46], [270, 176, 54], [330, 122, 42]];
    for (var i = 0; i < tops.length; i++) {
      ctx.fillRect(tops[i][0], tops[i][1], tops[i][2], SIDE_TOP - tops[i][1]);
    }
    ctx.fillStyle = '#d7e6db';
    for (var j = 0; j < tops.length; j++) {
      ctx.fillRect(tops[j][0], tops[j][1], tops[j][2], 4);
    }
  }

  function streetTree(x) {
    box(x - 3, SIDE_TOP - 26, 6, 26, '#a9714c');
    blob(x, SIDE_TOP - 40, 17, '#8ed3a0');
    blob(x - 12, SIDE_TOP - 32, 13, '#a8e6b8');
    blob(x + 12, SIDE_TOP - 33, 12, '#7cc98f');
  }

  function lamp(x) {
    box(x - 2, 116, 4, SIDE_TOP - 116, '#b9c7bd');
    ctx.fillStyle = '#b9c7bd';
    ctx.fillRect(x - 10, 112, 20, 5);
    var glow = 0.55 + Math.sin(clock * 1.4) * 0.12;
    ctx.fillStyle = 'rgba(255,201,60,' + glow + ')';
    rr(x - 9, 117, 18, 9, 3);
    ctx.fill();
  }

  function cafeWithPhoto(t) {
    if (!restImgOk) return false;
    if (!restBox) ensureRestBox();
    if (!restBox) return false;
    if (!restCache || restCacheK !== k) buildRestCache();
    if (!restCache) return false;
    var fit = artFit();
    var dw = fit.dw;
    var dh = fit.dh;
    var groundY = Math.round(ART_BASE * k) / k;
    var dx = Math.round((ART_CX - dw / 2) * k) / k;
    var dy = groundY - dh * restBox.solid;
    var drawW = Math.round(restCache.width) / k;
    var drawH = Math.round(restCache.height) / k;
    var fa = restBox.foot ? restBox.foot.a : 0;
    var fb = restBox.foot ? restBox.foot.b : 1;
    var cx = dx + dw * (fa + fb) / 2;
    var half = (dw * (fb - fa)) / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(38,64,48,0.26)';
    ctx.beginPath();
    ctx.ellipse(cx, groundY - 1.5, half * 1.04, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.beginPath();
    ctx.rect(0, 0, W, groundY);
    ctx.clip();
    var glowPulse = 0.45;
    ctx.shadowColor = 'rgba(106,165,124,' + glowPulse.toFixed(3) + ')';
    ctx.shadowBlur = 11 * k;
    ctx.drawImage(restCache, 0, 0, restCache.width, restCache.height, dx, dy, drawW, drawH);
    ctx.drawImage(restCache, 0, 0, restCache.width, restCache.height, dx, dy, drawW, drawH);
    ctx.drawImage(restCache, 0, 0, restCache.width, restCache.height, dx, dy, drawW, drawH);
    ctx.restore();
    var rectTag = [Math.round(dx), Math.round(dy), Math.round(drawW), Math.round(drawH)].join(',');
    if (canvas.dataset.restRect !== rectTag) canvas.dataset.restRect = rectTag;
    if (canvas.dataset.restMode !== restMode) canvas.dataset.restMode = restMode;
    return true;
  }

  function cafe(t) {
    if (!restImgFailed) {
      cafeWithPhoto(t);
      return;
    }
    ctx.fillStyle = '#e6f4dc';
    rr(REST_LEFT, REST_TOP, REST_RIGHT - REST_LEFT, SIDE_TOP - REST_TOP, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(143,191,142,0.9)';
    ctx.lineWidth = 2;
    rr(REST_LEFT, REST_TOP, REST_RIGHT - REST_LEFT, SIDE_TOP - REST_TOP, 6);
    ctx.stroke();

    ctx.fillStyle = '#8fbf8e';
    rr(REST_LEFT - 10, REST_TOP - 14, REST_RIGHT - REST_LEFT + 20, 16, 5);
    ctx.fill();

    ctx.fillStyle = '#d9d0f2';
    ctx.fillRect(REST_RIGHT - 34, REST_TOP + 4, 3, 22);
    blob(REST_RIGHT - 32, REST_TOP + 34, 15, 'rgba(255,201,60,' + (0.72 + Math.sin(t * 2) * 0.18) + ')');
    ctx.fillStyle = '#f6ffe9';
    ctx.font = 'bold 13px Helvetica, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('EAT', REST_RIGHT - 32, REST_TOP + 35);

    var lit = 0.66 + Math.sin(t * 0.9) * 0.12;
    for (var i = 0; i < 2; i++) {
      var wx = REST_LEFT + 22 + i * 74;
      ctx.fillStyle = 'rgba(255,201,60,' + lit + ')';
      rr(wx, 118, 58, 44, 5);
      ctx.fill();
      ctx.fillStyle = 'rgba(234,217,184,0.95)';
      ctx.fillRect(wx + 27, 118, 4, 44);
      ctx.fillRect(wx, 138, 58, 4);
    }

    ctx.fillStyle = 'rgba(255,201,60,' + (0.7 + Math.sin(t * 1.3) * 0.14) + ')';
    rr(DOOR_X - 19, 154, 38, SIDE_TOP - 154, 5);
    ctx.fill();
    ctx.strokeStyle = '#8fbf8e';
    ctx.lineWidth = 2;
    rr(DOOR_X - 19, 154, 38, SIDE_TOP - 154, 5);
    ctx.stroke();
    blob(DOOR_X + 11, 190, 2.6, '#5a7a62');

    var stripes = 6;
    var sw = (REST_RIGHT - REST_LEFT - 20) / stripes;
    for (var s = 0; s < stripes; s++) {
      ctx.fillStyle = s % 2 === 0 ? '#ff5d6c' : '#ead9b8';
      var sx = REST_LEFT + 10 + s * sw;
      ctx.fillRect(sx, 96, sw, 20);
      ctx.beginPath();
      ctx.arc(sx + sw / 2, 116, sw / 2, 0, Math.PI);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(255,201,60,0.22)';
    ctx.beginPath();
    ctx.ellipse(DOOR_X, SIDE_TOP + 4, 40, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function tableSet(x, y, umbColor) {
    ctx.fillStyle = '#d9d0f2';
    ctx.fillRect(x - 1.6, y - 44, 3.2, 44);
    ctx.fillStyle = umbColor;
    ctx.beginPath();
    ctx.arc(x, y - 44, 26, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.arc(x, y - 44, 26, Math.PI + 0.5, Math.PI + 0.9);
    ctx.fill();
    blob(x, y - 71, 2.6, '#d9d0f2');
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(x, y - 22, 20, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e4e9ee';
    ctx.fillRect(x - 2, y - 22, 4, 20);
    ctx.beginPath();
    ctx.ellipse(x, y - 2, 12, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff8a5c';
    ctx.fillRect(x - 20, y - 18, 8, 3);
    ctx.fillRect(x - 19, y - 18, 2, 16);
    ctx.fillRect(x + 12, y - 18, 8, 3);
    ctx.fillRect(x + 17, y - 18, 2, 16);
  }

  function planter(x, y) {
    ctx.fillStyle = '#e8c46a';
    rr(x - 14, y - 20, 28, 20, 4);
    ctx.fill();
    blob(x - 6, y - 24, 8, '#2d9a52');
    blob(x + 6, y - 26, 7, '#57c07a');
    blob(x, y - 31, 6, '#7ddf9a');
  }

  function stringLights(x0, y0, x1, y1, n) {
    ctx.strokeStyle = 'rgba(120,140,128,0.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (var i = 0; i <= 24; i++) {
      var u = i / 24;
      var mx = (1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * ((x0 + x1) / 2) + u * u * x1;
      var my = (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * ((y0 + y1) / 2 + 26) + u * u * y1;
      if (i === 0) ctx.moveTo(mx, my); else ctx.lineTo(mx, my);
    }
    ctx.stroke();
    for (var b = 1; b < n; b++) {
      var v = b / n;
      var bx = (1 - v) * (1 - v) * x0 + 2 * (1 - v) * v * ((x0 + x1) / 2) + v * v * x1;
      var by = (1 - v) * (1 - v) * y0 + 2 * (1 - v) * v * ((y0 + y1) / 2 + 26) + v * v * y1;
      blob(bx, by + 5, 3.4, b % 2 === 0 ? 'rgba(255,201,60,0.95)' : 'rgba(255,138,92,0.95)');
    }
  }

  function street() {
    ctx.fillStyle = '#eaf1ea';
    ctx.fillRect(0, SIDE_TOP, W, CURB - SIDE_TOP);
    ctx.fillStyle = '#d5e2d7';
    ctx.fillRect(0, CURB - 4, W, 4);
    ctx.fillStyle = '#7b8794';
    ctx.fillRect(0, CURB, W, H - CURB);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (var x = 12; x < W; x += 54) {
      ctx.fillRect(x, 274, 26, 3.5);
    }
  }

  function plaza() {
    ctx.fillStyle = 'rgba(155,212,245,0.55)';
    rr(236, CURB + 6, 250, H - CURB - 14, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([9, 8]);
    rr(236, CURB + 6, 250, H - CURB - 14, 10);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawScene(t) {
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, W, H);
    cloud(120 + Math.sin(t * 0.12) * 6, 58, 1, 0.85);
    cloud(610 - Math.sin(t * 0.1) * 5, 38, 0.8, 0.7);
    skyline();
    street();
    if (variant === 'roadway' || variant === 'both') {
      plaza();
      planter(246, H - 10);
      planter(476, H - 10);
      stringLights(250, 196, 472, 190, 8);
      box(246, 196, 4, 44, '#b9c7bd');
      box(472, 190, 4, 50, '#b9c7bd');
    }
    cafe(t);
    if (variant === 'sidewalk' || variant === 'both') {
      tableSet(300, SIDE_TOP + 16, '#c9a8e8');
      tableSet(382, SIDE_TOP + 16, '#9bd4f5');
    }
    if (variant === 'roadway' || variant === 'both') {
      tableSet(316, H - 16, '#ffffff');
      tableSet(404, H - 16, '#ff5d6c');
    }
    streetTree(120);
    lamp(206);
    drawDust();
    drawWalker(person.x, FEET, person.phase, person.walking, t);
    drawBubble();
  }

  function drawBubble() {
    if (person.walking) return;
    var age = (performance.now() - arrivedWall) / 1000;
    var a = Math.min(1, Math.max(0, age / 0.2));
    if (a <= 0) return;
    var bx = person.x + 20;
    var by = FEET - 62 + Math.sin(clock * 3) * 1.4;
    ctx.fillStyle = 'rgba(255,255,255,' + (0.95 * a) + ')';
    rr(bx, by, 34, 26, 9);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(bx + 6, by + 24);
    ctx.lineTo(bx + 2, by + 33);
    ctx.lineTo(bx + 15, by + 25);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(46,70,54,' + a + ')';
    ctx.font = 'bold 15px Helvetica, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', bx + 17, by + 14);
  }

  function drawWalker(x, gy, phase, walking, t) {
    var bob = walking ? -Math.abs(Math.sin(phase)) * 1.8 : 0;
    ctx.save();
    ctx.translate(x, gy + bob);
    ctx.fillStyle = 'rgba(46,70,54,0.16)';
    ctx.beginPath();
    ctx.ellipse(0, 1 - bob * 0.4, 13, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();

    var swing = walking ? Math.sin(phase) * 0.55 : 0;
    limb(-2.5, -13, swing, '#3b4b57', '#26323b', 11);
    limb(2.5, -13, -swing, '#3b4b57', '#26323b', 11);

    ctx.fillStyle = '#ff8a5c';
    rr(-10, -27, 5, 11, 2);
    ctx.fill();

    ctx.fillStyle = '#45c8ff';
    rr(-6.5, -28, 13, 16, 4);
    ctx.fill();
    ctx.fillStyle = '#2fa8e0';
    ctx.fillRect(-6.5, -16, 13, 3);

    limb(-5, -26, -swing * 0.8, '#45c8ff', '#f0c49c', 11);
    limb(5, -26, swing * 0.8, '#45c8ff', '#f0c49c', 11);

    ctx.fillStyle = '#f0c49c';
    rr(-5, -40, 10, 11, 4);
    ctx.fill();
    ctx.fillStyle = '#3f3630';
    rr(-6, -42, 12, 6, 3);
    ctx.fill();
    ctx.fillRect(-6.5, -39, 2.5, 6);
    ctx.fillStyle = '#2e4636';
    ctx.fillRect(2, -35, 2, 2);

    ctx.restore();
  }

  function limb(dx, pivotY, ang, colorLimb, colorTip, len) {
    ctx.save();
    ctx.translate(dx, pivotY);
    ctx.rotate(ang);
    ctx.fillStyle = colorLimb;
    rr(-2, 0, 4, len, 2);
    ctx.fill();
    ctx.fillStyle = colorTip;
    rr(-2.4, len - 3, 5, 3.4, 1.6);
    ctx.fill();
    ctx.restore();
  }

  function updateDust() {
    if (person.walking && Math.random() < 0.28) {
      dust.push({ x: person.x - 8, y: FEET - 1, r: 2 + Math.random() * 3, life: 0, max: 26 + Math.random() * 16, vx: -0.25 - Math.random() * 0.4 });
    }
    for (var i = dust.length - 1; i >= 0; i--) {
      var d = dust[i];
      d.life++;
      d.x += d.vx;
      d.y -= 0.18;
      if (d.life > d.max) dust.splice(i, 1);
    }
  }

  function footfalls(elapsed) {
    if (reduceMotion || typeof SFX === 'undefined' || !SFX || !SFX.play) return;
    var sign = Math.sin(elapsed * 11) >= 0 ? 1 : -1;
    if (sign !== lastStepSign) {
      lastStepSign = sign;
      stepAlt = !stepAlt;
      SFX.play('step', stepAlt);
    }
  }

  function audioLive() {
    if (typeof SFX === 'undefined' || !SFX || !SFX.state) return true;
    return SFX.state() === 'running';
  }

  function unlockNow() {
    walkUnlocked = true;
    window.removeEventListener('pointerdown', unlockNow, true);
    window.removeEventListener('keydown', unlockNow, true);
    window.removeEventListener('touchstart', unlockNow, true);
  }

  window.addEventListener('pointerdown', unlockNow, true);
  window.addEventListener('keydown', unlockNow, true);
  window.addEventListener('touchstart', unlockNow, true);

  function beginWalk() {
    if (walkBegan) return;
    walkBegan = true;
    lastStepSign = 1;
    walkStart = performance.now();
    var total = ((STOP_X - START_X) / PERSON_SPEED) * 1000;
    window.setTimeout(function () {
      if (!person.walking) return;
      person.walking = false;
      person.x = STOP_X;
      arrivedWall = performance.now();
    }, total + 400);
    window.setTimeout(revealChoices, total + 800);
  }

  function step(dt) {
    if (person.walking && !walkBegan) {
      if (walkUnlocked || audioLive() || performance.now() - gateAt > 1200) beginWalk();
      else return;
    }
    if (person.walking) {
      var elapsed = (performance.now() - walkStart) / 1000;
      person.x = Math.min(STOP_X, START_X + PERSON_SPEED * elapsed);
      person.phase = elapsed * 11;
      if (person.x < STOP_X) footfalls(elapsed);
      if (person.x >= STOP_X) {
        person.walking = false;
        arrivedWall = performance.now();
      }
    }
    updateDust();
    if (!revealed && !person.walking && performance.now() - arrivedWall > 350) revealChoices();
  }

  function drawDust() {
    for (var i = 0; i < dust.length; i++) {
      var d = dust[i];
      ctx.fillStyle = 'rgba(180,200,185,' + (0.5 * (1 - d.life / d.max)) + ')';
      blob(d.x, d.y, d.r * (1 + d.life / d.max), ctx.fillStyle);
    }
  }

  function revealChoices() {
    if (revealed) return;
    revealed = true;
    choicesBox.classList.add('ready');
    var first = choicesBox.querySelector('.choice');
    if (first && !reduceMotion) first.focus({ preventScroll: true });
  }

  function pump() {
    if (chosen) return;
    var now = performance.now();
    var dt = Math.min(0.05, (now - lastTime) / 1000);
    if (dt <= 0) return;
    lastTime = now;
    lastPump = now;
    clock += dt;
    step(dt);
    drawScene(clock);
  }

  function frame() {
    if (chosen) return;
    raf = requestAnimationFrame(frame);
    pump();
  }

  function startLoop() {
    watchdog = window.setInterval(function () {
      if (chosen) {
        window.clearInterval(watchdog);
        return;
      }
      if (performance.now() - lastPump > 120) pump();
    }, 90);
    raf = requestAnimationFrame(frame);
  }

  function choose(choice) {
    if (chosen) return;
    chosen = true;
    if (raf) cancelAnimationFrame(raf);
    overlay.classList.add('intro-hide');
    window.setTimeout(function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }, 640);
    if (typeof window.startMapFromIntro === 'function') window.startMapFromIntro(choice);
  }

  var buttons = choicesBox.querySelectorAll('[data-choice]');
  for (var i = 0; i < buttons.length; i++) {
    (function (btn) {
      btn.addEventListener('click', function () { choose(btn.getAttribute('data-choice')); });
      btn.addEventListener('mouseenter', function () {
        variant = btn.getAttribute('data-variant') || 'sidewalk';
      });
      btn.addEventListener('focus', function () {
        variant = btn.getAttribute('data-variant') || 'sidewalk';
      });
    })(buttons[i]);
  }

  skipBtn.addEventListener('click', function () {
    walkBegan = true;
    person.walking = false;
    person.x = STOP_X;
    if (!arrivedWall) arrivedWall = performance.now();
    revealChoices();
    skipBtn.classList.add('gone');
  });

  document.addEventListener('keydown', function (e) {
    if (chosen || !revealed) return;
    if (e.key === '1') choose('Sidewalk');
    else if (e.key === '2') choose('Roadway');
    else if (e.key === '3') choose('ALL');
  });

  window.addEventListener('resize', fit);
  fit();

  lastTime = performance.now();
  walkStart = performance.now();
  arrivedWall = walkStart;
  gateAt = walkStart;

  if (reduceMotion) {
    person.walking = false;
    person.x = STOP_X;
    revealChoices();
  }

  startLoop();
})();
