/* TNxMovieZone — movie detail logic */
(function () {
  'use strict';

  function qs(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  /* TMDB originals are 1-2MB each; rewrite to the size actually displayed */
  function timg(url, size) {
    if (!url) return url;
    return String(url).replace('image.tmdb.org/t/p/original/', 'image.tmdb.org/t/p/' + size + '/');
  }

  var allMovies = [];
  var toastTimer = null;
  function toast(msg, ms) {
    var t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, ms || 3000);
  }
  function fetchJSON(url) {
    return fetch(url + (url.indexOf('?') > -1 ? '&' : '?') + 't=' + Date.now())
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
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

  function cardHTML(m, i) {
    var rating = m.rating ? '<span class="imdb">★ ' + esc(m.rating) + '</span>' : '';
    return '<a class="card" href="movie.html?id=' + encodeURIComponent(m.id) + '" style="animation-delay:' + (i * 40) + 'ms">' +
      '<div class="card-poster">' +
      (m.poster_url ? '<img src="' + esc(timg(m.poster_url, 'w342')) + '" alt="' + esc(m.title) + '" loading="lazy" decoding="async">' : '') +
      '<div class="card-play"><span>▶</span></div></div>' +
      '<div class="card-info"><div class="card-title">' + esc(m.title) + '</div>' +
      '<div class="card-sub"><span>' + esc(m.year || '') + '</span>' + rating + '</div></div></a>';
  }

  /* ---------- hover-expand preview (desktop, related cards) ---------- */
  function initHoverCard() {
    if (!window.matchMedia('(hover:hover) and (pointer:fine)').matches) return;
    if (document.getElementById('hoverCard')) return;
    var hc = document.createElement('div');
    hc.id = 'hoverCard';
    document.body.appendChild(hc);
    var timer = null, currentCard = null, open = false;
    function movieFromCard(card) {
      var href = card.getAttribute('href') || '';
      var mm = /[?&]id=([^&]+)/.exec(href);
      if (!mm) return null;
      var id = decodeURIComponent(mm[1]);
      for (var i = 0; i < allMovies.length; i++) if (String(allMovies[i].id) === id) return allMovies[i];
      return null;
    }
    function fill(m) {
      var img = timg(m.backdrop_url, 'w780') || timg(m.poster_url, 'w500') || '';
      var meta = (m.rating ? '<span class="imdb">★ ' + esc(m.rating) + '</span>' : '') +
        (m.year ? '<span>' + esc(m.year) + '</span>' : '') +
        (m.duration ? '<span>' + esc(m.duration) + '</span>' : '') +
        (m.quality ? '<span>' + esc(m.quality) + '</span>' : '') +
        (m.genre ? '<span>' + esc(m.genre) + '</span>' : '');
      hc.innerHTML =
        '<div class="hc-media">' + (img ? '<img src="' + esc(img) + '" alt="">' : '') + '<div class="hc-grad"></div></div>' +
        '<div class="hc-body"><div class="hc-title">' + esc(m.title) + '</div>' +
        '<div class="hc-meta">' + meta + '</div>' +
        (m.description ? '<p class="hc-desc">' + esc(m.description) + '</p>' : '') +
        '<div class="hc-actions"><a class="hc-btn hc-play" href="movie.html?id=' + encodeURIComponent(m.id) + '">▶ Watch Now</a></div></div>';
    }
    function show(card) {
      var m = movieFromCard(card);
      if (!m) return;
      fill(m);
      var r = card.getBoundingClientRect();
      var w = Math.min(320, window.innerWidth - 16);
      hc.style.width = w + 'px';
      var h = hc.offsetHeight;
      var left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8));
      var top = Math.max(8, Math.min(r.top + r.height / 2 - h / 2, window.innerHeight - h - 8));
      hc.style.left = left + 'px';
      hc.style.top = top + 'px';
      hc.classList.add('show');
      open = true;
    }
    function hide() { hc.classList.remove('show'); open = false; currentCard = null; }
    document.addEventListener('mouseover', function (e) {
      var card = e.target.closest ? e.target.closest('.card') : null;
      if (card && card !== currentCard) {
        currentCard = card;
        if (timer) clearTimeout(timer);
        timer = setTimeout(function () { if (currentCard === card) show(card); }, 450);
      }
    });
    document.addEventListener('mouseout', function (e) {
      var card = e.target.closest ? e.target.closest('.card') : null;
      if (card && card === currentCard && !card.contains(e.relatedTarget)) {
        if (timer) clearTimeout(timer);
        currentCard = null;
        if (open) setTimeout(function () { if (!hc.matches(':hover')) hide(); }, 160);
      }
    });
    hc.addEventListener('mouseleave', hide);
    window.addEventListener('scroll', function () { if (timer) clearTimeout(timer); if (open) hide(); }, { passive: true, capture: true });
    window.addEventListener('resize', hide);
  }

  function boot() {
    initTheme();
    document.body.classList.add('detail-loading');
    initHoverCard();
    document.getElementById('year').textContent = new Date().getFullYear();
    var id = qs('id');
    if (!id) { document.body.classList.remove('detail-loading'); document.getElementById('dTitle').textContent = 'Movie not found'; return; }

    Promise.all([
      fetchJSON('data/movies.json').catch(function () { return []; }),
      fetchJSON('data/settings.json').catch(function () { return null; })
    ]).then(function (res) {
      var movies = Array.isArray(res[0]) ? res[0] : [];
      allMovies = movies;
      var settings = res[1];
      if (settings && settings.site_name) {
        document.title = 'Movie — ' + settings.site_name;
        var fn = document.getElementById('footName');
        if (fn) fn.textContent = settings.site_name;
      }
      var m = null;
      for (var i = 0; i < movies.length; i++) {
        if (String(movies[i].id) === String(id)) { m = movies[i]; break; }
      }
      if (!m) { document.body.classList.remove('detail-loading'); document.getElementById('dTitle').textContent = 'Movie not found'; return; }

      document.getElementById('dBackdrop').src = timg(m.backdrop_url, 'w1280') || timg(m.poster_url, 'w780') || '';
      document.getElementById('dPoster').src = timg(m.poster_url, 'w500') || '';
      document.getElementById('dTitle').textContent = m.title || '';
      if (m.quality) document.getElementById('dTitle').innerHTML = esc(m.title || '') + ' <span class="d-quality">' + esc(m.quality) + '</span>';
      document.getElementById('dMeta').innerHTML =
        (m.rating ? '<span class="imdb">★ ' + esc(m.rating) + '</span>' : '') +
        '<span>' + esc(m.year || '') + '</span>' +
        '<span>' + esc(m.genre || '') + '</span>' +
        (m.duration ? '<span>' + esc(m.duration) + '</span>' : '');
      document.getElementById('dDesc').textContent = m.description || 'No description available.';

      var extra = [];
      if (m.director) extra.push(['Director', m.director]);
      if (m.genre) extra.push(['Genre', m.genre]);
      if (m.language) extra.push(['Language', m.language]);
      if (m.country) extra.push(['Country', m.country]);
      if (m.release_date) extra.push(['Release Date', m.release_date]);
      document.getElementById('dExtra').innerHTML = extra.map(function (e) {
        return '<div class="extra-box"><div class="k">' + esc(e[0]) + '</div><div class="v">' + esc(e[1]) + '</div></div>';
      }).join('');

      document.getElementById('dWatch').href = 'watch.html?id=' + encodeURIComponent(m.id);
      document.body.classList.remove('detail-loading');
      if (window.__hidePre) window.__hidePre();
      /* trailer button */
      var trBtn = document.getElementById('dTrailer');
      if (trBtn) {
        if (m.trailer_url) { trBtn.href = m.trailer_url; trBtn.style.display = ''; }
        else trBtn.style.display = 'none';
      }
      /* share button */
      var shBtn = document.getElementById('dShare');
      if (shBtn) {
        shBtn.onclick = function () {
          var url = location.href;
          var text = '🎬 ' + (m.title || '') + ' — TNxMovieZone-e dekho!';
          if (navigator.share) {
            navigator.share({ title: m.title, text: text, url: url }).catch(function () {});
          } else {
            var wa = 'https://wa.me/?text=' + encodeURIComponent(text + ' ' + url);
            window.open(wa, '_blank');
          }
        };
      }

      /* view counter */
      (function countView() {
        try {
          var key = 'tnx_views_' + m.id;
          var v = parseInt(localStorage.getItem(key) || '0', 10) + 1;
          localStorage.setItem(key, String(v));
          var el = document.getElementById('viewCount');
          if (el) el.textContent = '👁 ' + v.toLocaleString() + ' views';
        } catch (e) {}
      })();

      /* user star rating */
      (function initRating() {
        var box = document.getElementById('starsBox');
        var info = document.getElementById('ratingInfo');
        if (!box) return;
        var key = 'tnx_rating_' + m.id;
        var my = 0;
        try { my = parseInt(localStorage.getItem(key) || '0', 10); } catch (e) {}
        function draw(n) {
          var h = '';
          for (var i = 1; i <= 5; i++) h += '<span data-s="' + i + '" style="color:' + (i <= n ? '#ffc107' : 'var(--text-faint)') + ';">★</span>';
          box.innerHTML = h;
        }
        draw(my);
        if (info && my) info.textContent = 'Tumi ' + my + '/5 diso';
        box.querySelectorAll('span').forEach(function (s) {
          s.onclick = function () {
            var v = parseInt(s.getAttribute('data-s'), 10);
            try { localStorage.setItem(key, String(v)); } catch (e) {}
            draw(v);
            if (info) info.textContent = 'Tumi ' + v + '/5 diso';
            toast('Rating save hoise — ' + v + '★');
          };
        });
      })();

      /* cast with photos from stored data */
      var castSec = document.getElementById('dCastSec');
      var castBox = document.getElementById('dCast');
      function renderCastList(arr) {
        if (!castSec || !castBox || !arr.length) return;
        castSec.style.display = '';
        castBox.innerHTML = arr.map(function (c) {
          var img = c.photo
            ? '<img src="' + esc(c.photo) + '" alt="' + esc(c.name) + '" loading="lazy" decoding="async">'
            : '<div class="cast-noimg">🎭</div>';
          return '<div class="cast-card">' + img +
            '<div class="cast-name">' + esc(c.name) + '</div>' +
            (c.character ? '<div class="cast-char">' + esc(c.character) + '</div>' : '') + '</div>';
        }).join('');
      }
      var castArr = [];
      if (Array.isArray(m.cast)) {
        castArr = m.cast.map(function (c) {
          if (c && typeof c === 'object') return { name: c.name || '', photo: c.photo || '', character: c.character || '' };
          return { name: String(c), photo: '', character: '' };
        }).filter(function (c) { return c.name; });
      } else if (m.cast) {
        castArr = String(m.cast).split(',').map(function (s) { return { name: s.trim(), photo: '', character: '' }; }).filter(function (c) { return c.name; });
      }
      renderCastList(castArr);

      // Related (same genre)
      var g = (m.genre || '').split(',')[0].trim().toLowerCase();
      var rel = movies.filter(function (x) {
        return String(x.id) !== String(m.id) && x.listed !== false &&
          (x.genre || '').toLowerCase().indexOf(g) > -1;
      }).slice(0, 15);
      document.getElementById('relatedRow').innerHTML =
        rel.length ? rel.map(cardHTML).join('') : '<div class="empty">No related titles.</div>';
    });
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
