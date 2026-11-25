document.addEventListener('DOMContentLoaded', function(){
  const board = document.getElementById('pelikan-board');
  if (!board) return;
  const fM = document.getElementById('pelikan-filter-manufacturer');
  const fModell = document.getElementById('pelikan-filter-modell');
  const fOrigin = document.getElementById('pelikan-filter-origin');
  const fSort = document.getElementById('pelikan-filter-sort');
  const PELIKAN_SORT_STORAGE_KEY = 'mcfly-pelikan-sort';
  function initPelikanSortSelect() {
    if (!fSort) return;
    try {
      localStorage.removeItem(PELIKAN_SORT_STORAGE_KEY);
      sessionStorage.removeItem(PELIKAN_SORT_STORAGE_KEY);
    } catch (e) { /* private mode */ }
    fSort.value = 'vendor-model';
  }
  initPelikanSortSelect();
  const fsRoot = document.getElementById('pelikan-fs');
  const fsFrame = document.getElementById('pelikan-fs-frame');
  const fsClose = document.getElementById('pelikan-fs-close');
  let fsHistoryPushed = false;

  const preloadHost = document.createElement('div');
  preloadHost.id = 'pelikan-preload-host';
  preloadHost.setAttribute('aria-hidden', 'true');
  document.body.appendChild(preloadHost);

  function fitPreview(iframe, wrap) {
    if (!wrap) wrap = iframe._pelikanWrap || iframe.closest('.pelikan-preview-wrap');
    if (!wrap) return;
    iframe._pelikanWrap = wrap;
    const resize = () => {
      let doc;
      try { doc = iframe.contentDocument; } catch (e) { return; }
      if (!doc) return;
      const body = doc.body || doc.documentElement;
      const stageOnly = wrap.dataset.stageOnly === '1';
      const frameOnly = wrap.dataset.frameOnly === '1';
      const sceneRoot = wrap.dataset.sceneRoot === '1';
      const wrapW = Math.max(wrap.clientWidth, wrap.getBoundingClientRect().width, 1);
      const wrapH = Math.max(wrap.clientHeight, wrap.getBoundingClientRect().height, 1);
      if (!doc.getElementById('pelikan-fit-style')) {
        const st = doc.createElement('style');
        st.id = 'pelikan-fit-style';
        let rules = ['#pelikan-fit-host{transform-origin:center center;display:inline-block;line-height:0;}'];
        if (stageOnly) {
          rules.push(
            'html,body{margin:0!important;padding:0!important;overflow:hidden!important;width:100%!important;height:100%!important;background:#120E26!important;}',
            'body{padding-top:0!important;display:block!important;}',
            'body::before,body::after{display:none!important;}',
            'header,aside.panel,footer,main .mechanics,main>.marquee{display:none!important;}',
            'main{padding:0!important;margin:0!important;width:100%!important;min-height:100%!important;display:flex!important;align-items:center!important;justify-content:center!important;}',
            '.workbench{width:auto!important;margin:0!important;padding:0!important;display:block!important;}',
            '.stage-wrap,.stage-frame{margin:0!important;padding:0!important;border:none!important;box-shadow:none!important;background:transparent!important;animation:none!important;opacity:1!important;}',
            '.caption,.chip,.paused-overlay{display:none!important;}',
            '.stage-view{transform-origin:center center;display:block!important;line-height:0;border-radius:0!important;overflow:hidden!important;background:#0A0E2A!important;}',
            '#scene{display:block!important;width:100%!important;height:auto!important;aspect-ratio:3/2;}',
          );
        } else if (frameOnly && sceneRoot) {
          rules.push(
            'html,body{margin:0!important;padding:0!important;overflow:hidden!important;width:100%!important;height:100%!important;background:transparent!important;}',
            'body{margin:0!important;padding:0!important;display:block!important;position:relative!important;overflow:hidden!important;background:transparent!important;}',
            'body>button{display:none!important;}',
            'svg,body>svg{width:auto!important;max-width:none!important;border-radius:0!important;}',
            '#pelikan-scene-shell{position:absolute!important;left:50%!important;top:50%!important;display:block!important;margin:0!important;overflow:visible!important;transform-origin:center center!important;line-height:0!important;}',
            '#pelikan-scene-shell svg#scene{display:block!important;width:100%!important;height:100%!important;margin:0!important;border-radius:0!important;}',
          );
        } else if (frameOnly) {
          rules.push(
            'html,body{margin:0!important;padding:0!important;overflow:hidden!important;width:100%!important;height:100%!important;}',
            'body{padding:0!important;display:flex!important;align-items:center!important;justify-content:center!important;min-height:100%!important;}',
            'body>h1,body>footer,body>button{display:none!important;}',
            '.frame{margin:0!important;padding:0!important;border:none!important;box-shadow:none!important;border-radius:0!important;width:auto!important;max-width:none!important;transform-origin:center center;display:block!important;line-height:0;overflow:hidden!important;}',
            '.frame svg{display:block!important;width:100%!important;height:auto!important;}',
          );
        } else {
          rules.push(
            'html,body{margin:0!important;padding:0!important;overflow:hidden!important;width:100%!important;height:100%!important;}',
            'body{display:flex!important;align-items:center!important;justify-content:center!important;}',
          );
        }
        st.textContent = rules.join('');
        (doc.head || doc.documentElement).appendChild(st);
      }
      const pad = 4;
      if (stageOnly) {
        const viewport = doc.querySelector('.stage-view');
        const scene = doc.getElementById('scene');
        if (viewport && scene) {
          viewport.style.transform = 'none';
          const w = Math.max(viewport.offsetWidth, scene.getBoundingClientRect().width, 1);
          const h = Math.max(viewport.offsetHeight, scene.getBoundingClientRect().height, 1);
          viewport.style.transform = 'scale(' + Math.max((wrap.clientWidth - pad) / w, (wrap.clientHeight - pad) / h) + ')';
          return;
        }
      }
      if (frameOnly) {
        if (sceneRoot) {
          const scene = doc.getElementById('scene');
          const root = doc.documentElement;
          if (scene && root && body) {
            root.style.width = wrapW + 'px';
            root.style.height = wrapH + 'px';
            body.style.width = wrapW + 'px';
            body.style.height = wrapH + 'px';
            let shell = doc.getElementById('pelikan-scene-shell');
            if (!shell) {
              shell = doc.createElement('div');
              shell.id = 'pelikan-scene-shell';
              body.insertBefore(shell, scene);
              shell.appendChild(scene);
            }
            const vb = scene.viewBox && scene.viewBox.baseVal;
            const w = (vb && vb.width > 0) ? vb.width : 800;
            const h = (vb && vb.height > 0) ? vb.height : 500;
            shell.style.width = w + 'px';
            shell.style.height = h + 'px';
            scene.style.width = '100%';
            scene.style.height = '100%';
            scene.style.transform = 'none';
            shell.style.transform = 'none';
            const cover = Math.max((wrapW - pad) / w, (wrapH - pad) / h);
            shell.style.transform = 'translate(-50%,-50%) scale(' + cover + ')';
            try {
              iframe.dataset.pelikanCover = cover.toFixed(4);
            } catch (e) { /* strict dataset */ }
          }
          return;
        }
        const viewport = doc.querySelector('.frame');
        const scene = viewport && viewport.querySelector('svg');
        if (viewport && scene) {
          viewport.style.transform = 'none';
          const w = Math.max(viewport.offsetWidth, scene.getBoundingClientRect().width, 1);
          const h = Math.max(viewport.offsetHeight, scene.getBoundingClientRect().height, 1);
          viewport.style.transform = 'scale(' + Math.max((wrap.clientWidth - pad) / w, (wrap.clientHeight - pad) / h) + ')';
        }
        return;
      }
      let host = doc.getElementById('pelikan-fit-host');
      if (!host) {
        host = doc.createElement('div');
        host.id = 'pelikan-fit-host';
        const bucket = doc.createElement('div');
        while (body.firstChild) bucket.appendChild(body.firstChild);
        host.appendChild(bucket);
        body.appendChild(host);
      }
      host.style.transform = 'none';
      const w = Math.max(host.scrollWidth, host.offsetWidth, 1);
      const h = Math.max(host.scrollHeight, host.offsetHeight, 1);
      host.style.transform = 'scale(' + Math.min((wrapW - pad) / w, (wrapH - pad) / h) + ')';
    };
    try { resize(); } catch (e) { console.warn('pelikan fitPreview', e); }
    iframe._pelikanResize = resize;
  }

  function safeFitPreview(iframe, wrap) {
    try { fitPreview(iframe, wrap); } catch (e) { console.warn('pelikan fitPreview', e); }
  }

  function afterIframePaint(iframe, wrap, done) {
    safeFitPreview(iframe, wrap);
    const tightFit = wrap.dataset.stageOnly === '1' || wrap.dataset.frameOnly === '1';
    const sceneRootFit = wrap.dataset.sceneRoot === '1';
    const delay = tightFit ? 400 : 60;
    const finishDone = () => {
      try { done(); } catch (e) { console.warn('pelikan afterIframePaint done', e); }
    };
    setTimeout(() => {
      safeFitPreview(iframe, wrap);
      requestAnimationFrame(() => requestAnimationFrame(finishDone));
    }, delay);
    if (tightFit) [400, 900].forEach(t => setTimeout(() => safeFitPreview(iframe, wrap), t));
    if (sceneRootFit) {
      [50, 200, 600, 1600, 3200].forEach(t => setTimeout(() => safeFitPreview(iframe, wrap), t));
    }
  }

  window.addEventListener('resize', () => {
    board.querySelectorAll('.pelikan-live[data-loaded="1"]').forEach((iframe) => {
      if (typeof iframe._pelikanResize === 'function') iframe._pelikanResize();
    });
  });

  function visibleItemsInPaintOrder() {
    return [...document.querySelectorAll('#pelikan-board .pelikan-item')]
      .filter(el => !el.classList.contains('hidden'))
      .sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        if (Math.abs(ra.top - rb.top) > 8) return ra.top - rb.top;
        return ra.left - rb.left;
      });
  }

  function whenThumbsReady(items, done) {
    const thumbs = items.map(item => item.querySelector('.pelikan-thumb')).filter(Boolean);
    if (!thumbs.length) { done(); return; }
    let pending = thumbs.length;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      done();
    };
    const tick = () => { pending -= 1; if (pending <= 0) finish(); };
    setTimeout(finish, 1500);
    thumbs.forEach(img => {
      if (img.complete) tick();
      else { img.addEventListener('load', tick, { once: true }); img.addEventListener('error', tick, { once: true }); }
    });
  }

  function itemAnimationDone(item) {
    return item.dataset.animationReady === '1';
  }

  const LOAD_TIMEOUT_MS = 20000;

  function isIosLike() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function kickPreviewAnimation(iframe) {
    try {
      const w = iframe.contentWindow;
      const d = iframe.contentDocument;
      if (!d) return;
      const bike = d.querySelector('#bicycle');
      const pelicanNode = d.querySelector('#pelican');
      if (bike && !bike.getAttribute('transform')) bike.setAttribute('transform', 'translate(0)');
      if (pelicanNode && !pelicanNode.getAttribute('transform')) pelicanNode.setAttribute('transform', 'translate(0)');
      const toggle = d.getElementById('toggle');
      if (w && typeof w.setPlaying === 'function') { w.setPlaying(true); }
      else if (w && typeof w.setPaused === 'function') { w.setPaused(false); }
      const ov = d.getElementById('pausedOverlay');
      if (ov && ov.classList.contains('show')) {
        ov.click();
      }
      if (toggle) {
        const label = (toggle.textContent || '').trim();
        if (/^play$/i.test(label)) toggle.click();
      }
      if (d.body) {
        const btnPlay = d.getElementById('toggle');
        const label = btnPlay && btnPlay.textContent ? btnPlay.textContent.trim() : '';
        if (/^pause$/i.test(label)) {
          d.body.classList.remove('paused', 'still');
          d.querySelectorAll('*').forEach((el) => { el.style.animationPlayState = 'running'; });
        } else {
          d.body.classList.remove('still');
        }
      }
      if (w && typeof w.getAnimations === 'function') {
        w.getAnimations().forEach((a) => { try { a.play(); } catch (e) {} });
      }
      d.querySelectorAll('*').forEach((el) => {
        if (typeof el.getAnimations !== 'function') return;
        el.getAnimations().forEach((a) => { try { a.play(); } catch (e) {} });
      });
    } catch (e) { /* cross-origin or sandbox */ }
  }

  function closeFs(fromPopstate) {
    if (!fsRoot || fsRoot.classList.contains('is-hidden')) return;
    fsRoot.classList.add('is-hidden');
    if (fsFrame) fsFrame.src = 'about:blank';
    document.body.classList.remove('pelikan-fs-open');
    if (fsHistoryPushed && !fromPopstate) {
      fsHistoryPushed = false;
      history.back();
    } else {
      fsHistoryPushed = false;
    }
  }

  function openFs(href) {
    if (!fsRoot || !fsFrame || !href) return;
    fsFrame.src = href;
    fsRoot.classList.remove('is-hidden');
    document.body.classList.add('pelikan-fs-open');
    if (!fsHistoryPushed) {
      history.pushState({ pelikanFs: true }, '');
      fsHistoryPushed = true;
    }
    const startAnim = () => kickPreviewAnimation(fsFrame);
    fsFrame.addEventListener('load', startAnim, { once: true });
    [120, 500, 1200].forEach((t) => setTimeout(startAnim, t));
  }

  if (fsClose) fsClose.addEventListener('click', () => closeFs(false));
  window.addEventListener('popstate', () => {
    if (fsHistoryPushed) closeFs(true);
  });

  function iframeDocumentReady(iframe) {
    try {
      const doc = iframe.contentDocument;
      if (!doc) return false;
      const rs = doc.readyState;
      if (rs !== 'complete' && rs !== 'interactive') return false;
      const body = doc.body;
      return !!(body && body.childNodes.length > 0);
    } catch (e) { return false; }
  }

  function startSequentialAnimations() {
    let ordered = visibleItemsInPaintOrder();
    let index = 0;
    let inflight = null;
    const iosLike = isIosLike();

    const revealLive = (iframe, item) => {
      if (itemAnimationDone(item)) return true;
      const wrap = item.querySelector('.pelikan-preview-wrap');
      const slot = item.querySelector('.pelikan-live-slot');
      const thumb = item.querySelector('.pelikan-thumb');
      if (!wrap || !slot || !thumb) return false;
      iframe._pelikanWrap = wrap;
      iframe.dataset.loaded = '1';
      slot.appendChild(iframe);
      iframe.classList.add('is-ready');
      thumb.classList.add('is-replaced');
      item.dataset.animationReady = '1';
      safeFitPreview(iframe, wrap);
      requestAnimationFrame(() => requestAnimationFrame(() => safeFitPreview(iframe, wrap)));
      const tightFit = wrap.dataset.stageOnly === '1' || wrap.dataset.frameOnly === '1';
      const sceneRootFit = wrap.dataset.sceneRoot === '1';
      [120, 350, 900].forEach((t) => setTimeout(() => safeFitPreview(iframe, wrap), t));
      if (tightFit) {
        [1500, 2800].forEach((t) => setTimeout(() => safeFitPreview(iframe, wrap), t));
      }
      if (sceneRootFit) {
        [50, 200, 600, 1600, 3200].forEach((t) => setTimeout(() => safeFitPreview(iframe, wrap), t));
        if (typeof ResizeObserver !== 'undefined' && !wrap._pelikanSceneRo) {
          wrap._pelikanSceneRo = new ResizeObserver(() => safeFitPreview(iframe, wrap));
          wrap._pelikanSceneRo.observe(wrap);
        }
      }
      kickPreviewAnimation(iframe);
      [80, 250, 700].forEach((t) => setTimeout(() => kickPreviewAnimation(iframe), t));
      return true;
    };

    const scheduleLoadNext = () => {
      requestAnimationFrame(() => requestAnimationFrame(loadNext));
    };

    const loadNext = () => {
      if (inflight) return;
      while (index < ordered.length) {
        const item = ordered[index];
        if (itemAnimationDone(item)) { index += 1; continue; }
        const wrap = item.querySelector('.pelikan-preview-wrap');
        const thumb = item.querySelector('.pelikan-thumb');
        if (!wrap || !thumb) { index += 1; continue; }
        const src = wrap.dataset.previewSrc;
        if (!src) { index += 1; continue; }
        const w = Math.max(wrap.clientWidth, 280);
        const h = Math.max(wrap.clientHeight, 200);
        preloadHost.style.width = w + 'px';
        preloadHost.style.height = h + 'px';
        preloadHost.replaceChildren();
        const iframe = document.createElement('iframe');
        iframe.className = 'pelikan-live';
        iframe.title = thumb.alt || 'Pelikan-Vorschau';
        iframe.setAttribute('scrolling', 'no');
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe._pelikanWrap = wrap;
        preloadHost.appendChild(iframe);

        let settled = false;
        let loadTimer = null;
        let pollTimer = null;
        const clearTimers = () => {
          if (loadTimer) { clearTimeout(loadTimer); loadTimer = null; }
          if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        };

        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimers();
          let revealed = false;
          try {
            revealed = revealLive(iframe, item);
          } catch (e) {
            console.warn('pelikan revealLive', e);
            preloadHost.replaceChildren();
            inflight = null;
            index += 1;
            scheduleLoadNext();
            return;
          }
          preloadHost.replaceChildren();
          inflight = null;
          if (revealed) index += 1;
          scheduleLoadNext();
        };

        inflight = { item, finish };

        const stageOnly = wrap.dataset.stageOnly === '1';
        const frameOnly = wrap.dataset.frameOnly === '1';
        const sceneRoot = wrap.dataset.sceneRoot === '1';
        const tightFit = stageOnly || frameOnly;
        const timeoutMs = tightFit ? 60000 : LOAD_TIMEOUT_MS;
        loadTimer = setTimeout(finish, timeoutMs);

        const srcAt = Date.now();
        const minReadyMs = sceneRoot ? 900 : (tightFit ? 700 : (iosLike ? 350 : 0));
        const stageSceneReady = () => {
          try {
            const d = iframe.contentDocument;
            if (!d) return false;
            if (frameOnly && sceneRoot) {
              const scene = d.getElementById('scene');
              return !!(scene && scene.childNodes.length > 0);
            }
            if (frameOnly) {
              const svg = d.querySelector('.frame svg');
              return !!(svg && svg.childNodes.length > 0);
            }
            const scene = d.getElementById('scene');
            return !!(scene && scene.childNodes.length > 0);
          } catch (e) { return false; }
        };
        const tryReadyFinish = () => {
          if (settled) return;
          if (!iframeDocumentReady(iframe)) return;
          if (tightFit && !stageSceneReady()) return;
          if (Date.now() - srcAt < minReadyMs) return;
          afterIframePaint(iframe, wrap, finish);
        };

        if (iosLike || tightFit) {
          pollTimer = setInterval(tryReadyFinish, 160);
          iframe.addEventListener('load', tryReadyFinish, { once: true });
        } else {
          iframe.addEventListener('load', () => afterIframePaint(iframe, wrap, finish), { once: true });
        }
        iframe.addEventListener('error', finish, { once: true });
        iframe.src = src;
        return;
      }
      inflight = null;
      preloadHost.replaceChildren();
    };

    whenThumbsReady(ordered, loadNext);
  }

  function wireFullscreenClicks() {
    board.querySelectorAll('.pelikan-preview-wrap').forEach(wrap => {
      const href = wrap.dataset.fullscreen;
      if (!href) return;
      const open = () => openFs(href);
      wrap.addEventListener('click', open);
      wrap.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    });
    board.querySelectorAll('.pelikan-fullscreen[data-fs]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openFs(btn.getAttribute('data-fs'));
      });
    });
  }

  function makeSection(groupKey, heading) {
    const section = document.createElement('section');
    section.className = 'pelikan-vendor-section';
    section.dataset.groupKey = groupKey;
    section.dataset.manufacturer = groupKey;
    section.innerHTML =
      '<h2 class="pelikan-vendor-title"></h2>' +
      '<div class="pelikan-vendor-break" aria-hidden="true"></div>' +
      '<div class="pelikan-row"></div>';
    section.querySelector('.pelikan-vendor-title').textContent = heading;
    return section;
  }

  function compareWithinManufacturer(a, b) {
    const fixedA = a.dataset.rowSlot !== undefined && a.dataset.rowSlot !== '';
    const fixedB = b.dataset.rowSlot !== undefined && b.dataset.rowSlot !== '';
    if (fixedA && fixedB) {
      const na = Number(a.dataset.rowSlot);
      const nb = Number(b.dataset.rowSlot);
      if (na !== nb) return na - nb;
      return (a.dataset.title || '').localeCompare(b.dataset.title || '', 'de');
    }
    const ra = a.dataset.release || '';
    const rb = b.dataset.release || '';
    const ua = ra ? 0 : 1;
    const ub = rb ? 0 : 1;
    if (ua !== ub) return ua - ub;
    if (ra && rb) {
      const da = Number(ra);
      const db = Number(rb);
      if (da !== db) return da - db;
    }
    const sa = Number(a.dataset.strength || '50');
    const sb = Number(b.dataset.strength || '50');
    if (sa !== sb) return sa - sb;
    const ta = Number(a.dataset.mtime || '0');
    const tb = Number(b.dataset.mtime || '0');
    if (ta !== tb) return ta - tb;
    return (a.dataset.title || '').localeCompare(b.dataset.title || '', 'de');
  }

  const PREFERRED_VENDOR_ORDER = ['Alibaba', 'Google', 'OpenAI'];
  function vendorSortKey(name) {
    const idx = PREFERRED_VENDOR_ORDER.indexOf(name);
    return idx >= 0 ? idx : PREFERRED_VENDOR_ORDER.length;
  }

  function compareByName(a, b) {
    return (a.dataset.title || '').localeCompare(b.dataset.title || '', 'de');
  }

  function compareByRelease(a, b) {
    const ra = a.dataset.release ? Number(a.dataset.release) : Number.POSITIVE_INFINITY;
    const rb = b.dataset.release ? Number(b.dataset.release) : Number.POSITIVE_INFINITY;
    if (ra !== rb) return ra - rb;
    return compareByName(a, b);
  }

  function refitVisibleLivePreviews() {
    const run = () => {
      board.querySelectorAll('.pelikan-item:not(.hidden) .pelikan-live[data-loaded="1"]').forEach((iframe) => {
        const wrap = iframe._pelikanWrap || iframe.closest('.pelikan-preview-wrap');
        if (!wrap || !wrap.clientWidth || !wrap.clientHeight) return;
        if (typeof iframe._pelikanResize === 'function') {
          iframe._pelikanResize();
        } else {
          fitPreview(iframe, wrap);
        }
      });
    };
    requestAnimationFrame(() => requestAnimationFrame(run));
    setTimeout(run, 120);
  }

  function apply(){
    const items = [...document.querySelectorAll('#pelikan-board .pelikan-item')];
    const m = fM ? fM.value : '';
    const modell = fModell ? fModell.value : '';
    const origin = fOrigin ? fOrigin.value : '';
    const sortMode = fSort ? fSort.value : 'vendor-model';
    items.forEach(item => {
      const okM = !m || item.dataset.manufacturer === m;
      const okModell = !modell || item.dataset.modell === modell;
      const okOrigin = !origin || item.dataset.origin === origin;
      item.classList.toggle('hidden', !(okM && okModell && okOrigin));
    });
    const visible = items.filter(el => !el.classList.contains('hidden'));
    board.querySelectorAll('.pelikan-vendor-section').forEach(s => s.remove());

    if (sortMode === 'release') {
      const group = [...visible].sort(compareByRelease);
      const section = makeSection('all', 'Alle Modelle');
      const row = section.querySelector('.pelikan-row');
      group.forEach(el => row.appendChild(el));
      board.appendChild(section);
      refitVisibleLivePreviews();
      return;
    }

    const buckets = new Map();
    const bucketOrder = [];
    visible.forEach(item => {
      const key = item.dataset.manufacturer || '';
      if (!buckets.has(key)) {
        buckets.set(key, []);
        bucketOrder.push(key);
      }
      buckets.get(key).push(item);
    });
    bucketOrder.sort((a, b) => {
      const da = vendorSortKey(a);
      const db = vendorSortKey(b);
      if (da !== db) return da - db;
      return a.localeCompare(b, 'de');
    });

    bucketOrder.forEach(key => {
      const group = buckets.get(key);
      if (!group || group.length === 0) return;
      group.sort(compareWithinManufacturer);
      const section = makeSection(key, key);
      const row = section.querySelector('.pelikan-row');
      group.forEach(el => row.appendChild(el));
      board.appendChild(section);
    });
    refitVisibleLivePreviews();
  }

  wireFullscreenClicks();
  [fM, fModell, fOrigin, fSort].forEach(el => { if (el) el.addEventListener('change', apply); });
  apply();
  requestAnimationFrame(() => requestAnimationFrame(startSequentialAnimations));
});
