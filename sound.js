const SFX = (function () {
  const STORAGE_KEY = 'nyc-dining-sfx';
  let ctx = null;
  let noiseBuf = null;
  let master = null;
  let muted = false;

  try {
    muted = window.localStorage.getItem(STORAGE_KEY) === 'off';
  } catch (err) {
    muted = false;
  }

  let warned = false;

  function audio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      if (!warned) {
        warned = true;
        console.warn('SFX: this browser has no Web Audio support, click sounds are off.');
      }
      return null;
    }
    if (!ctx || ctx.state === 'closed') {
      try {
        ctx = new AC();
        noiseBuf = null;
        master = null;
        lastCtxTime = -1;
        lastPlayAt = 0;
      } catch (err) {
        if (!warned) {
          warned = true;
          console.warn('SFX: could not create AudioContext —', err && err.message);
        }
        return null;
      }
    }
    if (ctx.state !== 'running' && ctx.resume) {
      try {
        const p = ctx.resume();
        if (p && p.catch) p.catch(() => {});
      } catch (err) {
        /* resume blocked until the next gesture */
      }
    }
    return ctx;
  }

  function wake() {
    audio();
  }

  let masterForCtx = null;
  let lastCtxTime = -1;
  let lastPlayAt = 0;

  function resetAudio() {
    if (ctx && ctx.close) {
      try {
        ctx.close();
      } catch (err) {
        /* already gone */
      }
    }
    ctx = null;
    master = null;
    masterForCtx = null;
    noiseBuf = null;
  }

  function stalled(c) {
    const now = Date.now();
    const t = c.currentTime;
    const stuck = lastCtxTime >= 0 && t - lastCtxTime < 0.005 && now - lastPlayAt > 1500;
    lastCtxTime = t;
    lastPlayAt = now;
    return stuck;
  }

  function bus(c) {
    if (master && masterForCtx === c) return master;
    let tail = c.destination;
    try {
      if (c.createDynamicsCompressor) {
        const comp = c.createDynamicsCompressor();
        comp.threshold.setValueAtTime(-14, c.currentTime);
        comp.knee.setValueAtTime(14, c.currentTime);
        comp.ratio.setValueAtTime(6, c.currentTime);
        comp.attack.setValueAtTime(0.003, c.currentTime);
        comp.release.setValueAtTime(0.2, c.currentTime);
        comp.connect(c.destination);
        tail = comp;
      }
    } catch (err) {
      tail = c.destination;
    }
    master = c.createGain();
    master.gain.setValueAtTime(2.1, c.currentTime);
    master.connect(tail);
    masterForCtx = c;
    return master;
  }

  function tone(f0, f1, dur, type, gain, delay) {
    const c = audio();
    if (!c) return;
    const t0 = c.currentTime + 0.015 + (delay || 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.1, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(bus(c));
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  function hiss(dur, freq, gain, delay) {
    const c = audio();
    if (!c) return;
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, Math.floor(c.sampleRate * 0.5), c.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const t0 = c.currentTime + 0.015 + (delay || 0);
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const band = c.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.setValueAtTime(freq, t0);
    band.Q.value = 1.1;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.05, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(band);
    band.connect(g);
    g.connect(bus(c));
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  const sounds = {
    tap: () => tone(760, 660, 0.06, 'sine', 0.14),
    pop: () => {
      tone(540, 960, 0.12, 'triangle', 0.24);
      tone(1120, 1620, 0.08, 'sine', 0.11, 0.02);
      hiss(0.055, 2700, 0.05, 0.01);
    },
    switch: () => {
      tone(450, 690, 0.09, 'sine', 0.18);
      tone(700, 940, 0.08, 'sine', 0.12, 0.06);
    },
    chipOn: () => tone(560, 820, 0.08, 'sine', 0.16),
    chipOff: () => tone(560, 370, 0.1, 'sine', 0.14),
    link: () => {
      tone(980, 1340, 0.07, 'sine', 0.13);
      hiss(0.05, 3400, 0.045, 0.01);
    },
    close: () => tone(660, 300, 0.11, 'sine', 0.15),
    open: () => {
      tone(620, 940, 0.1, 'triangle', 0.18);
      tone(940, 1260, 0.07, 'sine', 0.1, 0.05);
    },
    step: (alt) => {
      const base = alt ? 205 : 172;
      tone(base, base * 0.62, 0.08, 'sine', 0.16);
      tone(alt ? 1350 : 1120, alt ? 900 : 760, 0.035, 'triangle', 0.07);
      hiss(0.06, alt ? 1750 : 1350, 0.055, 0.006);
    },
    rot: () => {
      tone(392, 350, 0.035, 'sine', 0.055);
      hiss(0.02, 1500, 0.02);
    },
    reveal: () => {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, f, 0.18, 'triangle', 0.15, i * 0.075));
      hiss(0.42, 900, 0.07, 0);
    },
  };

  function play(name, arg) {
    if (muted) return;
    try {
      let c = audio();
      if (c && stalled(c)) {
        resetAudio();
        c = audio();
      }
    } catch (err) {
      /* ignore */
    }
    const fn = sounds[name];
    if (fn) {
      try {
        fn(arg);
      } catch (err) {
        /* audio unavailable */
      }
    }
  }

  function isMuted() {
    return muted;
  }

  function setMuted(value) {
    muted = !!value;
    try {
      window.localStorage.setItem(STORAGE_KEY, muted ? 'off' : 'on');
    } catch (err) {
      /* storage blocked */
    }
    if (!muted) play('open');
  }

  function soundFor(t) {
    if (!t || !t.closest) return null;
    if (t.closest('#sound-toggle')) return null;
    if (t.closest('#canvas-wrap canvas')) return null;
    if (t.closest('#detail-fav')) return null;
    if (t.closest('#detail-close')) return 'close';
    if (t.closest('#detail-name') || t.closest('#detail-map')) return 'link';
    if (t.closest('#detail')) return 'tap';
    if (t.closest('.chip')) return t.classList.contains('off') ? 'chipOn' : 'chipOff';
    if (t.closest('#license-filters')) return null;
    if (t.closest('#intro-choices .choice')) return 'open';
    if (t.closest('#intro-skip')) return 'tap';
    if (t.closest('#map-hud') || t.closest('#fav-panel')) return null;
    if (t.closest('button') || t.closest('a')) return 'tap';
    return null;
  }

  function wireUi() {
    const btn = document.getElementById('sound-toggle');
    if (btn) {
      const sync = () => {
        btn.classList.toggle('muted', muted);
        btn.setAttribute('aria-pressed', muted ? 'false' : 'true');
        btn.title = muted ? 'Sound is muted — click to turn it back on' : 'Sound is on — click to mute';
        const label = btn.querySelector('.sound-label');
        if (label) label.textContent = muted ? 'Muted' : 'Sound';
      };
      btn.addEventListener('click', () => {
        wake();
        const wasMuted = muted;
        if (wasMuted) {
          setMuted(false);
          sync();
          play('pop');
          play('step', true);
          window.setTimeout(() => play('tap'), 180);
          return;
        }
        play('tap');
        window.setTimeout(() => {
          setMuted(true);
          sync();
        }, 260);
      });
      sync();
    }

    document.addEventListener(
      'pointerdown',
      (e) => {
        wake();
        const s = soundFor(e.target);
        if (s) play(s);
      },
      true
    );

    document.addEventListener(
      'touchstart',
      () => {
        wake();
      },
      { capture: true, passive: true }
    );

    document.addEventListener(
      'click',
      (e) => {
        if (e.detail !== 0) return;
        const s = soundFor(e.target);
        if (s) play(s);
      },
      true
    );

    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') return play('close');
        if (/^[123]$/.test(e.key)) play('open');
      },
      true
    );
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !muted && ctx && ctx.state !== 'running') {
      try {
        ctx.resume();
      } catch (err) {
        /* wait for the next gesture */
      }
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  function boot() {
    wireUi();
    if (muted) {
      console.info('SFX: click sounds are muted — click the "Muted" speaker button in the toolbar to turn them back on.');
    }
  }

  return {
    play,
    isMuted,
    setMuted,
    wake,
    state: () => (ctx ? ctx.state : 'no-context'),
  };
})();
