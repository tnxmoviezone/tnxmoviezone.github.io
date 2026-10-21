/* TNxMovieZone — watch page: multi-server player with auto-failover */
(function () {
  'use strict';

  var movie = null;
  var settings = null;
  var servers = [];       // [{name, url, type}]
  var activeIdx = 0;
  var probeTimer = null;

  function qs(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fetchJSON(url) {
    return fetch(url + (url.indexOf('?') > -1 ? '&' : '?') + 't=' + Date.now())
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  }
  function toast(msg, ms) {
    var t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, ms || 3200);
  }

  function initTheme() {
    var t = localStorage.getItem('vf_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', t);
    var btn = document.getElementById('themeToggle');
    if (btn) {
      btn.textContent = t === 'dark' ? '🌙' : '☀️';
      btn.onclick = function () {
        var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('vf_theme', next);
        btn.textContent = next === 'dark' ? '🌙' : '☀️';
      };
    }
  }

  /* ---------- server list ---------- */
  function buildServers() {
    servers = [];
    if (movie.video_url) {
      servers.push({ name: 'Server 1', url: movie.video_url, type: 'direct' });
    }
    var tmpl = settings && settings.embed_server;
    if (movie.tmdb_id && tmpl) {
      servers.push({ name: 'Server 2', url: tmpl.replace('{tmdb}', encodeURIComponent(movie.tmdb_id)), type: 'embed' });
    }
    var extra = movie.servers || [];
    for (var i = 0; i < extra.length; i++) {
      var s = extra[i];
      if (s && s.url) servers.push({ name: s.name || ('Server ' + (servers.length + 1)), url: s.url, type: 'embed' });
    }
  }

  function renderServerBtns() {
    var wrap = document.getElementById('serverBtns');
    if (!wrap) return;
    wrap.innerHTML = '';
    servers.forEach(function (s, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'srv-btn' + (i === activeIdx ? ' on' : '');
      b.textContent = s.name;
      b.onclick = function () { switchServer(i, false); };
      wrap.appendChild(b);
    });
    if (!servers.length) {
      wrap.innerHTML = '<span style="color:var(--text-faint);font-size:.88rem">No playable servers for this title yet.</span>';
    }
  }

  /* ---------- player ---------- */
  function isDirectVideo(url) {
    return /\.(mp4|webm|m3u8|mkv)(\?|#|$)/i.test(url);
  }

  function loadServer(i) {
    var frame = document.getElementById('playerFrame');
    var loading = document.getElementById('playerLoading');
    if (!frame) return;
    // Remove old player nodes
    var olds = frame.querySelectorAll('iframe, video');
    for (var k = 0; k < olds.length; k++) olds[k].remove();
    if (loading) loading.style.display = 'grid';

    var s = servers[i];
    if (!s) { if (loading) loading.style.display = 'none'; return; }

    var el;
    if (s.type === 'direct' || isDirectVideo(s.url)) {
      el = document.createElement('video');
      el.src = s.url;
      el.controls = true;
      el.autoplay = true;
      el.playsInline = true;
      el.style.position = 'absolute';
      el.style.inset = '0';
      el.style.width = '100%';
      el.style.height = '100%';
      el.addEventListener('error', function () { onServerError(i); }, true);
      el.addEventListener('canplay', function () { if (loading) loading.style.display = 'none'; });
      el.addEventListener('ended', function () { onVideoEnded(); });
    } else {
      el = document.createElement('iframe');
      el.src = s.url;
      el.allowFullscreen = true;
      el.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');
      el.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
      el.addEventListener('load', function () { if (loading) loading.style.display = 'none'; });
    }
    frame.appendChild(el);

    // Probe: if still loading after 12s on an embed, offer next server
    if (probeTimer) clearTimeout(probeTimer);
    probeTimer = setTimeout(function () {
      if (loading && loading.style.display !== 'none' && servers.length > 1) {
        toast(s.name + ' seems slow — tap another server if it stays stuck.');
      }
    }, 12000);
  }

  function onServerError(failedIdx) {
    var next = failedIdx + 1;
    if (next < servers.length) {
      toast(servers[failedIdx].name + ' failed — switching to ' + servers[next].name + '…');
      switchServer(next, true);
    } else {
      toast('All servers failed. Please try again later.');
      var loading = document.getElementById('playerLoading');
      if (loading) {
        loading.style.display = 'grid';
        loading.innerHTML = '<div style="text-align:center;padding:20px">😞<br><br>Playback failed on all servers.</div>';
      }
    }
  }

  function switchServer(i, auto) {
    activeIdx = i;
    renderServerBtns();
    loadServer(i);
    if (!auto) toast('Switched to ' + servers[i].name);
  }

  /* ---------- episodes ---------- */
  var episodes = [];      // [{n, title, url}]
  var activeEp = 0;
  var EP_CHUNK = 50;
  var activeRange = 0;
  function isWebSeries() {
    if (episodes.length) return true;
    var ct = movie && movie.content_type ? String(movie.content_type).toLowerCase() : '';
    if (ct.indexOf('web') > -1 || ct.indexOf('series') > -1 || ct === 'anime' || ct === 'tv') return true;
    var ep = movie && movie.episodes ? String(movie.episodes).trim() : '';
    return ep !== '' && ep !== '0';
  }
  function buildEpisodes() {
    episodes = [];
    var list = movie.episode_list || [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e && e.url) episodes.push({ n: e.n || (i + 1), title: e.title || '', url: e.url });
    }
    episodes.sort(function (a, b) { return a.n - b.n; });
    // fallback: episode count without URLs → buttons use default servers
    if (!episodes.length && isWebSeries()) {
      var cnt = parseInt(String(movie.episodes || '').replace(/\D/g, ''), 10) || 0;
      if (cnt > 0 && cnt <= 200) {
        for (var j = 1; j <= cnt; j++) episodes.push({ n: j, title: '', url: '' });
      }
    }
  }
  function renderEpisodes() {
    var sec = document.getElementById('epSec');
    var grid = document.getElementById('epGrid');
    var nextBtn = document.getElementById('nextEpBtn');
    if (!sec || !grid) return;
    if (!episodes.length) { sec.style.display = 'none'; return; }
    sec.style.display = '';
    grid.innerHTML = '';
    var tgl = document.getElementById('autoNextToggle');
    if (tgl && !tgl._bound) {
      tgl._bound = true;
      tgl.checked = isAutoNextOn();
      tgl.onchange = function () {
        try { localStorage.setItem('vf_autonext', tgl.checked ? 'on' : 'off'); } catch (e) {}
        toast(tgl.checked ? 'Auto-next ON' : 'Auto-next OFF');
      };
    }
    /* range selector — long series are chunked 50 at a time */
    var rangeSel = document.getElementById('epRange');
    var rangeCount = Math.ceil(episodes.length / EP_CHUNK);
    if (activeRange > rangeCount - 1) activeRange = rangeCount - 1;
    if (activeRange < 0) activeRange = 0;
    var start = activeRange * EP_CHUNK;
    var end = Math.min(episodes.length, start + EP_CHUNK);
    if (rangeCount > 1 && rangeSel) {
      rangeSel.style.display = '';
      if (rangeSel.getAttribute('data-count') !== String(rangeCount)) {
        var opts = '';
        for (var r2 = 0; r2 < rangeCount; r2++) {
          var s2 = r2 * EP_CHUNK, e2 = Math.min(episodes.length, s2 + EP_CHUNK) - 1;
          opts += '<option value="' + r2 + '">EP ' + episodes[s2].n + ' – ' + episodes[e2].n + '</option>';
        }
        rangeSel.innerHTML = opts;
        rangeSel.setAttribute('data-count', String(rangeCount));
      }
      rangeSel.value = String(activeRange);
      if (!rangeSel._bound) {
        rangeSel._bound = true;
        rangeSel.onchange = function () {
          activeRange = parseInt(rangeSel.value, 10) || 0;
          renderEpisodes();
          grid.scrollTop = 0;
        };
      }
    } else if (rangeSel) {
      rangeSel.style.display = 'none';
    }
    episodes.slice(start, end).forEach(function (ep, j) {
      var i = start + j;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ep-btn' + (i === activeEp ? ' on' : '');
      b.textContent = ep.title ? (ep.n + '. ' + ep.title) : ('EP ' + ep.n);
      b.title = ep.title || ('Episode ' + ep.n);
      b.onclick = function () { playEpisode(i, false); };
      grid.appendChild(b);
    });
    updateNextBtn();
  }
  function updateNextBtn() {
    var nextBtn = document.getElementById('nextEpBtn');
    if (!nextBtn) return;
    if (activeEp + 1 < episodes.length) {
      nextBtn.style.display = '';
      nextBtn.onclick = function () { playEpisode(activeEp + 1, false); };
    } else {
      nextBtn.style.display = 'none';
    }
  }
  function playEpisode(i, auto) {
    if (i < 0 || i >= episodes.length) return;
    hideAutoNextOverlay();
    activeEp = i;
    activeRange = Math.floor(i / EP_CHUNK);
    var ep = episodes[i];
    renderEpisodes();
    // save progress
    try {
      var prog = JSON.parse(localStorage.getItem('vf_ep_progress') || '{}');
      prog[movie.id] = ep.n;
      localStorage.setItem('vf_ep_progress', JSON.stringify(prog));
    } catch (e) {}
    if (ep.url) {
      // per-episode URL → play directly
      servers = [{ name: 'EP ' + ep.n, url: ep.url, type: 'embed' }];
      activeIdx = 0;
      renderServerBtns();
      loadServer(0);
      document.getElementById('wTitle').textContent =
        movie.title + ' — EP ' + ep.n + (ep.title ? (': ' + ep.title) : '');
    } else {
      // no per-episode URL → default servers
      buildServers();
      activeIdx = 0;
      renderServerBtns();
      loadServer(0);
    }
    if (!auto) {
      toast('Playing Episode ' + ep.n);
      // update URL for shareable link
      try {
        var u = new URL(location.href);
        u.searchParams.set('ep', ep.n);
        history.replaceState(null, '', u.toString());
      } catch (e) {}
    }
    // scroll player into view on mobile
    var frame = document.getElementById('playerFrame');
    if (frame && !auto) frame.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* ---------- boot ---------- */
  function boot() {
    initTheme();
    document.getElementById('year').textContent = new Date().getFullYear();
    var id = qs('id');
    if (!id) { document.getElementById('wTitle').textContent = 'Video not found'; return; }

    Promise.all([
      fetchJSON('data/movies.json').catch(function () { return []; }),
      fetchJSON('data/settings.json').catch(function () { return null; })
    ]).then(function (res) {
      var movies = Array.isArray(res[0]) ? res[0] : [];
      settings = res[1];
      if (settings && settings.site_name) {
        var fn = document.getElementById('footName');
        if (fn) fn.textContent = settings.site_name;
      }
      for (var i = 0; i < movies.length; i++) {
        if (String(movies[i].id) === String(id)) { movie = movies[i]; break; }
      }
      if (!movie) { document.getElementById('wTitle').textContent = 'Video not found'; return; }

      document.title = 'Watch ' + movie.title + ' — ' + (settings && settings.site_name ? settings.site_name : 'TNxMovieZone');
      document.getElementById('wTitle').textContent = movie.title + (movie.year ? ' (' + movie.year + ')' : '');
      document.getElementById('wBack').href = 'movie.html?id=' + encodeURIComponent(movie.id);
      document.getElementById('wDetails').href = 'movie.html?id=' + encodeURIComponent(movie.id);

      /* cast below player — with photos */
      var castSec = document.getElementById('wCastSec');
      var castBox = document.getElementById('wCast');
      var castList = [];
      if (movie.cast) {
        if (Array.isArray(movie.cast)) {
          castList = movie.cast.map(function (c) {
            if (c && typeof c === 'object') return { name: c.name || '', photo: c.photo || '' };
            return { name: String(c), photo: '' };
          }).filter(function (c) { return c.name; });
        } else {
          castList = String(movie.cast).split(',').map(function (s) { return { name: s.trim(), photo: '' }; }).filter(function (c) { return c.name; });
        }
      }
      if (castSec && castBox && castList.length) {
        castSec.style.display = '';
        castBox.innerHTML = '<div class="cast-grid">' + castList.map(function (c) {
          var img = c.photo
            ? '<img src="' + esc(c.photo) + '" alt="' + esc(c.name) + '" loading="lazy" decoding="async">'
            : '<div class="cast-noimg">🎭</div>';
          return '<div class="cast-card">' + img + '<div class="cast-name">' + esc(c.name) + '</div></div>';
        }).join('') + '</div>';
      }

      buildServers();
      renderServerBtns();
      saveContinueWatching();
      /* episodes */
      buildEpisodes();
      var epParam = parseInt(qs('ep') || '0', 10) || 0;
      var startEp = -1;
      if (epParam > 0) {
        for (var ei = 0; ei < episodes.length; ei++) {
          if (episodes[ei].n === epParam) { startEp = ei; break; }
        }
      }
      if (startEp === -1 && episodes.length) {
        try {
          var prog = JSON.parse(localStorage.getItem('vf_ep_progress') || '{}');
          var lastN = prog[movie.id] || 0;
          for (var pi = 0; pi < episodes.length; pi++) {
            if (episodes[pi].n === lastN) { startEp = pi; break; }
          }
        } catch (e) {}
      }
      if (startEp >= 0) {
        renderEpisodes();
        playEpisode(startEp, true);
      } else {
        renderEpisodes();
        if (servers.length) loadServer(0);
        else {
          var loading = document.getElementById('playerLoading');
          if (loading) {
            loading.style.display = 'grid';
            loading.innerHTML = '<div style="text-align:center;padding:20px">No servers available for this title yet.</div>';
          }
        }
      }
    });
  }

  /* ---------- continue watching ---------- */
  function saveContinueWatching() {
    try {
      var key = 'tnx_continue';
      var list = JSON.parse(localStorage.getItem(key) || '[]');
      list = list.filter(function (x) { return String(x.id) !== String(movie.id); });
      list.unshift({ id: movie.id, ts: Date.now() });
      list = list.slice(0, 20);
      localStorage.setItem(key, JSON.stringify(list));
    } catch (e) {}
  }

  /* ---------- auto-next episode ---------- */
  var autoNextTimer = null;
  var autoNextCount = 0;
  function isAutoNextOn() {
    try { return localStorage.getItem('vf_autonext') !== 'off'; }
    catch (e) { return true; }
  }
  function onVideoEnded() {
    // only for direct videos; embeds can't fire 'ended'
    if (!isAutoNextOn()) return;
    if (activeEp + 1 >= episodes.length) return;
    var next = episodes[activeEp + 1];
    showAutoNextOverlay(next);
  }
  function showAutoNextOverlay(next) {
    hideAutoNextOverlay();
    autoNextCount = 5;
    var ov = document.createElement('div');
    ov.id = 'autoNextOv';
    ov.style.cssText = 'position:absolute;inset:0;z-index:20;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(0,0,0,.72);backdrop-filter:blur(8px);border-radius:16px;text-align:center;padding:20px;';
    ov.innerHTML =
      '<div style="font-size:1.05rem;font-weight:800;">Up Next</div>' +
      '<div style="font-size:1.3rem;font-weight:800;color:var(--purple);">EP ' + next.n + (next.title ? ': ' + esc(next.title) : '') + '</div>' +
      '<div id="autoNextCount" style="font-size:2.2rem;font-weight:800;">5</div>' +
      '<div style="display:flex;gap:10px;">' +
      '<button type="button" class="btn btn-grad btn-sm" id="autoNextPlay">▶ Play Now</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="autoNextCancel">Cancel</button>' +
      '</div>';
    var frame = document.getElementById('playerFrame');
    if (frame) { frame.style.position = 'relative'; frame.appendChild(ov); }
    document.getElementById('autoNextPlay').onclick = function () {
      hideAutoNextOverlay(); playEpisode(activeEp + 1, false);
    };
    document.getElementById('autoNextCancel').onclick = function () { hideAutoNextOverlay(); };
    autoNextTimer = setInterval(function () {
      autoNextCount--;
      var c = document.getElementById('autoNextCount');
      if (c) c.textContent = autoNextCount;
      if (autoNextCount <= 0) {
        hideAutoNextOverlay(); playEpisode(activeEp + 1, false);
      }
    }, 1000);
  }
  function hideAutoNextOverlay() {
    if (autoNextTimer) { clearInterval(autoNextTimer); autoNextTimer = null; }
    var ov = document.getElementById('autoNextOv');
    if (ov) ov.remove();
  }

  /* ---------- report broken link ---------- */
  function initReport() {
    var btn = document.getElementById('reportBtn');
    if (!btn) return;
    btn.onclick = function () {
      var msg = '🚨 Broken Link Report: ' + (movie ? movie.title : '') + ' (ID: ' + (movie ? movie.id : '') + ')';
      var wa = (settings && settings.request_whatsapp) || '';
      if (wa) {
        window.open('https://wa.me/' + wa.replace(/\D/g, '') + '?text=' + encodeURIComponent(msg), '_blank');
      } else {
        toast('Report system setup hoyni');
        return;
      }
      toast('Report send hoise ✓');
    };
  }

  document.addEventListener('DOMContentLoaded', boot);
  document.addEventListener('DOMContentLoaded', function () { setTimeout(initReport, 1000); });
})();
