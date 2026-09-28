/* ==========================================================
   CityVision TV — public site behaviour
   ========================================================== */
(function () {
  var CV = window.CV, CFG = CV.CFG, I = CV.I, esc = CV.esc;
  var body = document.body;
  var BASE = body.getAttribute('data-base') || '';
  var PAGE = body.getAttribute('data-page') || '';
  var ALL = [];           // published posts, newest first
  var LS = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function qs(k) { return new URLSearchParams(location.search).get(k); }

  /* ---------- shell ---------- */
  var active = body.getAttribute('data-active') || '';
  if (PAGE === 'section') active = qs('c') || (qs('type') === 'video' ? 'videos' : qs('show') ? 'shows' : '');
  if (PAGE === 'home') active = 'home';
  $('#cv-header').outerHTML = CV.header(BASE, active);
  $('#cv-footer').outerHTML = CV.footer(BASE);
  var toastEl = document.createElement('div'); toastEl.className = 'toast'; body.appendChild(toastEl);
  function toast(m) { toastEl.textContent = m; toastEl.classList.add('show'); clearTimeout(toastEl._t); toastEl._t = setTimeout(function () { toastEl.classList.remove('show'); }, 2600); }

  var mast = $('#mast');
  var onScroll = function () {
    mast.classList.toggle('scrolled', scrollY > 40);
    var pr = $('#progress');
    if (pr) { var st = $('.story-body'); if (st) { var r = st.getBoundingClientRect(); var p = Math.min(1, Math.max(0, (innerHeight * .4 - r.top) / r.height)); pr.style.width = (p * 100) + '%'; } }
  };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  function openLayer(el) { closeLayers(); el.classList.add('open'); el.setAttribute('aria-hidden', 'false'); if (el.id !== 'bellPanel') body.style.overflow = 'hidden'; }
  function closeLayers() { $$('.drawer.open,.search-ov.open,.bellpanel.open,.lb.open').forEach(function (e) { e.classList.remove('open'); e.setAttribute('aria-hidden', 'true'); if (e.classList.contains('lb')) $('.lb-player', e).innerHTML = ''; }); body.style.overflow = ''; $$('.nl-drop.open').forEach(function (d) { d.classList.remove('open'); }); }
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-menu],[data-search],[data-bell],[data-close],[data-drop],[data-copy],[data-native]');
    if (!t) {
      if (!e.target.closest('.bellpanel,.nl-drop')) { $$('.bellpanel.open').forEach(function (b) { b.classList.remove('open'); }); $$('.nl-drop.open').forEach(function (d) { d.classList.remove('open'); }); }
      if (e.target.classList.contains('drawer') || e.target.classList.contains('lb')) closeLayers();
      return;
    }
    if (t.hasAttribute('data-menu')) openLayer($('#drawer'));
    else if (t.hasAttribute('data-search')) { openLayer($('#searchOv')); setTimeout(function () { $('#searchOv input').focus(); }, 60); }
    else if (t.hasAttribute('data-bell')) { var bp = $('#bellPanel'); if (bp.classList.contains('open')) closeLayers(); else { openLayer(bp); bp.style.top = ($('.mast-in').getBoundingClientRect().bottom + 6) + 'px'; markSeen(); } }
    else if (t.hasAttribute('data-close')) closeLayers();
    else if (t.hasAttribute('data-drop')) { e.preventDefault(); t.parentNode.classList.toggle('open'); }
    else if (t.hasAttribute('data-copy')) {
      var u = t.closest('.share').getAttribute('data-share-url');
      (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { t.classList.add('copied'); toast('Link copied'); setTimeout(function () { t.classList.remove('copied'); }, 1600); }, function () { prompt('Copy this link', u); });
    } else if (t.hasAttribute('data-native')) {
      var sh = t.closest('.share');
      if (navigator.share) navigator.share({ title: sh.getAttribute('data-share-title'), url: sh.getAttribute('data-share-url') }).catch(function () {});
    }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeLayers(); });

  /* newsletter (Web3Forms delivers subscriber emails to the CityVision inbox) */
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (!f.hasAttribute('data-newsletter')) return;
    e.preventDefault();
    var msg = $('.stay-msg', f), btn = $('button', f);
    btn.disabled = true; btn.textContent = 'Subscribing…';
    var fd = new FormData(); fd.append('access_key', CFG.web3formsKey); fd.append('subject', 'New newsletter subscriber'); fd.append('from_name', 'CityVision TV website'); fd.append('email', f.email.value); fd.append('message', 'Please add ' + f.email.value + ' to the CityVision TV newsletter list.');
    fetch('https://api.web3forms.com/submit', { method: 'POST', body: fd, headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (!d.success) throw 0; msg.textContent = 'Thanks! You’re on the list. We’ll be in touch with new stories and episodes.'; f.reset(); })
      .catch(function () { msg.textContent = 'Something went wrong. Please email ' + CFG.email + ' to subscribe.'; })
      .then(function () { btn.disabled = false; btn.textContent = 'Subscribe'; });
  });

  /* ---------- data ---------- */
  function load() {
    var bust = Math.floor(Date.now() / 60000);
    return fetch(BASE + 'articles.json?v=' + bust, { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) {
        var list = Array.isArray(d) ? d : (d.items || []);
        ALL = list.map(CV.normalize).filter(function (p) { return p && p.status !== 'draft' && new Date(p.date) <= new Date(Date.now() + 5 * 60000); })
          .sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
        return ALL;
      })
      .catch(function (e) { console.warn('Could not load articles.json', e); ALL = []; return ALL; });
  }
  function card(p, v, eager) { return CV.card(p, BASE, v, eager); }
  function pickFeatured(list) {
    var f = list.filter(function (p) { return p.featured && p.type !== 'update'; })[0];
    return f || list.filter(function (p) { return p.type !== 'update'; })[0] || list[0];
  }

  /* ticker */
  function ticker() {
    if (!ALL.length) return;
    var recentBreaking = ALL.filter(function (p) { return p.breaking && (Date.now() - new Date(p.date)) < 72 * 3600e3; });
    var items = (recentBreaking.length ? recentBreaking : ALL).slice(0, 8);
    var label = recentBreaking.length ? 'Breaking' : 'Latest';
    var links = items.map(function (p) { return '<a href="' + CV.postUrl(p, BASE) + '"><b>' + esc(CV.ago(p.date)) + '</b>' + esc(p.title) + '</a>'; }).join('');
    var tk = $('#ticker');
    tk.innerHTML = '<div class="wrap ticker-in"><span class="ticker-label"><span class="pulse"></span>' + label + '</span><div class="ticker-track"><div class="ticker-move" style="--dur:' + Math.max(25, items.length * 8) + 's">' + links + links + '</div></div></div>';
    tk.hidden = false;
  }

  /* what's new (bell) */
  function seenAt() { var v = LS.get('cv_seen'); return v ? +v : Date.now() - 7 * 86400e3; }
  function bell() {
    var since = seenAt();
    var fresh = ALL.filter(function (p) { return new Date(p.date).getTime() > since; });
    var dot = $('.bell-dot');
    if (fresh.length) { dot.hidden = false; dot.textContent = fresh.length > 9 ? '9+' : fresh.length; } else dot.hidden = true;
    var list = ALL.slice(0, 8);
    $('#bpList').innerHTML = list.length ? list.map(function (p) {
      var isNew = new Date(p.date).getTime() > since;
      return '<a class="bp-item" href="' + CV.postUrl(p, BASE) + '">' + CV.media(p, BASE) + '<span><strong>' + (isNew ? '<span class="bp-new">NEW</span>' : '') + esc(p.title) + '</strong><small>' + esc(CV.kicker(p)) + ' &middot; ' + CV.ago(p.date) + '</small></span></a>';
    }).join('') : '<div class="bp-empty">No updates yet. Check back soon.</div>';
  }
  function markSeen() { LS.set('cv_seen', String(Date.now())); var d = $('.bell-dot'); if (d) d.hidden = true; }

  /* live search in overlay */
  function search(q, list) {
    q = (q || '').trim().toLowerCase(); if (!q) return [];
    var words = q.split(/\s+/);
    return (list || ALL).map(function (p) {
      var hay = (p.title + ' ' + p.summary + ' ' + CV.kicker(p) + ' ' + (p.author || '') + ' ' + (p.tags || []).join(' ')).toLowerCase();
      var score = 0; words.forEach(function (w) { if (hay.indexOf(w) > -1) score++; if (p.title.toLowerCase().indexOf(w) > -1) score++; });
      return { p: p, s: words.every(function (w) { return hay.indexOf(w) > -1; }) ? score : 0 };
    }).filter(function (x) { return x.s > 0; }).sort(function (a, b) { return b.s - a.s; }).map(function (x) { return x.p; });
  }
  var sInput = $('#searchOv input');
  sInput.addEventListener('input', function () {
    var r = search(sInput.value).slice(0, 8), box = $('#searchLive');
    if (!sInput.value.trim()) { box.innerHTML = ''; return; }
    box.innerHTML = r.length ? r.map(function (p) { return card(p, 'row'); }).join('') + '<p><a class="lnk" href="' + BASE + 'section.html?q=' + encodeURIComponent(sInput.value) + '">See all results ' + I.arrow + '</a></p>' : '<p class="search-hint">No stories match “' + esc(sInput.value) + '” yet.</p>';
  });

  /* video lightbox */
  var lb = document.createElement('div'); lb.className = 'lb'; lb.setAttribute('aria-hidden', 'true');
  lb.innerHTML = '<div class="lb-in"><div class="lb-top"><h3></h3><button class="icon-btn" data-close aria-label="Close video">' + I.close + '</button></div><div class="lb-player"></div><div class="lb-foot"></div></div>';
  body.appendChild(lb);
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-lightbox] .is-video a');
    if (!a || e.metaKey || e.ctrlKey) return;
    var href = a.getAttribute('href');
    var p = ALL.filter(function (x) { return CV.postUrl(x, BASE) === href; })[0];
    if (!p || !CV.ytId(p.video)) return;
    e.preventDefault();
    $('h3', lb).textContent = p.title;
    $('.lb-player', lb).innerHTML = CV.videoEmbed(p.video).replace('?rel=0', '?rel=0&autoplay=1');
    $('.lb-foot', lb).innerHTML = '<a class="btn btn--light btn--sm" href="' + href + '">Read the full story ' + I.arrow + '</a>';
    openLayer(lb);
  });

  /* ---------- pages ---------- */
  var R = {};

  R.home = function () {
    var root = $('#home');
    if (!ALL.length) {
      root.innerHTML = '<section class="wrap top"><div class="empty"><h3>Welcome to CityVision TV</h3><p>Our newsroom is getting ready. New stories are on the way.</p></div></section>';
      return;
    }
    var used = {};
    var lead = pickFeatured(ALL); used[lead.id] = 1;
    var rest = ALL.filter(function (p) { return !used[p.id] && p.type !== 'update'; });
    var mid = rest.slice(0, 2); mid.forEach(function (p) { used[p.id] = 1; });
    var live = ALL.slice(0, 7);
    var row = ALL.filter(function (p) { return !used[p.id] && p.type !== 'update'; }).slice(0, 4);
    row.forEach(function (p) { used[p.id] = 1; });

    var h = '<section class="wrap top"><h1 class="sr" hidden>CityVision TV: Nepali community news in Australia</h1><div class="top-grid">' +
      '<div>' + card(lead, 'lead', true) + '</div>' +
      '<div class="top-mid">' + mid.map(function (p) { return card(p, 'std'); }).join('') + '</div>' +
      '<aside class="live"><div class="live-h"><span class="pulse"></span>Latest updates</div><div class="live-list">' +
      live.map(function (p) { return '<a class="live-item" href="' + CV.postUrl(p, BASE) + '"><time datetime="' + esc(p.date) + '">' + CV.ago(p.date) + '</time><strong>' + esc(p.title) + '</strong></a>'; }).join('') +
      '</div><a class="lnk live-more" href="' + BASE + 'updates.html">All updates ' + I.arrow + '</a></aside></div>' +
      (row.length >= 2 ? '<div class="row4 row4--n' + row.length + '">' + row.map(function (p) { return card(p, 'std'); }).join('') + '</div>' : '') + '</section>';

    // Watch band
    var vids = ALL.filter(function (p) { return p.type === 'video' || p.video; });
    h += '<section class="watch" data-lightbox><div class="wrap"><div class="sec-h"><h2><span class="dot"></span>Watch</h2><a class="lnk" href="' + BASE + 'section.html?type=video">All videos ' + I.arrow + '</a></div>';
    if (vids.length) {
      h += '<div class="watch-grid"><div>' + card(vids[0], 'lead') + '</div><div class="watch-side">' + vids.slice(1, 4).map(function (p) { return card(p, 'row'); }).join('') +
        (vids.length < 4 ? '<a class="btn btn--light" href="' + CFG.social.youtube + '" target="_blank" rel="noopener">' + I.yt + ' More on our YouTube channel</a>' : '') + '</div></div>';
    } else {
      h += '<div class="watch-empty"><div><span class="eyebrow eyebrow--light">CityVision on YouTube</span><h3>Documentaries, talk shows and community stories</h3><p>Watch Hamro Story, 8 Baje, My Days in Nepal and more on our channel.</p><a class="btn btn--red" href="' + CFG.social.youtube + '" target="_blank" rel="noopener">' + I.yt + ' Watch on YouTube</a></div><a class="watch-plate" href="' + CFG.social.youtube + '" target="_blank" rel="noopener" aria-label="Watch on YouTube"><span>' + I.play + '</span></a></div>';
    }
    h += '</div></section>';

    // Shows rail
    h += '<section class="wrap sec"><div class="sec-h"><h2><span class="dot" style="--k:var(--indigo)"></span>Our shows</h2><a class="lnk" href="' + BASE + 'shows.html">All shows ' + I.arrow + '</a></div><div class="shows-rail">' +
      CFG.shows.map(function (s) {
        return '<a class="show-card" href="' + BASE + 'section.html?show=' + s.id + '" style="--tile:' + s.tile + ';--c:' + s.color + '"><div class="sc-art">' + (s.logo ? '<img src="' + BASE + s.logo + '" alt="" loading="lazy">' : '<b>' + esc(s.name) + '</b>') + '</div><div class="sc-b"><strong>' + esc(s.name) + '</strong><small>' + esc(s.format) + '</small></div></a>';
      }).join('') + '</div></section>';

    // Category blocks + sidebar
    var blocks = '';
    CFG.categories.forEach(function (c) {
      var items = ALL.filter(function (p) { return p.category === c.id && p.type !== 'update'; });
      if (items.length < 2) return;
      blocks += '<section class="blk"><div class="sec-h"><h2><span class="dot"></span>' + c.name + '</h2><a class="lnk" href="' + BASE + 'section.html?c=' + c.id + '">More ' + c.name.toLowerCase() + ' ' + I.arrow + '</a></div>' +
        card(items[0], 'wide') + (items.length > 1 ? '<div class="blk-grid">' + items.slice(1, 4).map(function (p) { return card(p, 'std'); }).join('') + '</div>' : '') + '</section>';
    });
    if (!blocks) {
      blocks = '<section class="blk"><div class="sec-h"><h2><span class="dot"></span>More stories</h2><a class="lnk" href="' + BASE + 'section.html">Everything ' + I.arrow + '</a></div><div class="blk-grid">' +
        ALL.filter(function (p) { return p.type !== 'update'; }).slice(0, 6).map(function (p) { return card(p, 'std'); }).join('') + '</div></section>';
    }
    h += '<div class="wrap split"><div>' + blocks + '</div><aside class="split-side"><div class="sticky">' + sidebar() + '</div></aside></div>';
    root.innerHTML = h;
  };

  function sidebar(exclude) {
    var recent = ALL.filter(function (p) { return p.id !== exclude; }).slice(0, 5);
    var kur = CV.showById('kurakani');
    return '<div class="panel"><div class="panel-h">Most recent</div><div class="num-list">' + recent.map(function (p) { return card(p, 'text'); }).join('') + '</div></div>' +
      '<div class="pod" style="margin-top:24px"><div class="pod-top"><img src="' + BASE + kur.logo + '" alt=""><div><span class="eyebrow">Podcast</span><h3>Kurakani</h3></div></div>' +
      '<iframe title="Kurakani on Spotify" src="https://open.spotify.com/embed/show/5AyBIxWf3yroPNncxRpsVw?utm_source=generator&theme=0" height="152" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>' +
      '<a class="pod-btn" href="' + CFG.social.spotify + '" target="_blank" rel="noopener">' + I.sp + ' Listen on Spotify</a></div>' +
      '<div class="cta-panel" style="margin-top:24px"><span class="eyebrow eyebrow--light">Your story</span><h3>Got a story the community should hear?</h3><p>Send us a news tip, an event, or someone we should feature.</p><a class="btn btn--light btn--sm" href="' + BASE + 'contact.html?topic=story">Submit a story ' + I.arrow + '</a></div>';
  }

  R.section = function () {
    var c = qs('c'), show = qs('show'), type = qs('type'), q = qs('q');
    var head = $('#phead'), list = ALL.slice(), title = 'All stories', desc = 'Everything from the CityVision TV newsroom.';
    var s = show && CV.showById(show), cat = c && CV.catById(c);
    if (s) {
      list = list.filter(function (p) { return p.show === s.id; });
      document.title = s.name + ' | CityVision TV';
      head.outerHTML = '<header class="phead phead--show" style="--tile:' + s.tile + ';--c:' + s.color + '"><div class="wrap"><div class="ps-logo">' + (s.logo ? '<img src="' + BASE + s.logo + '" alt="' + esc(s.name) + '">' : '<b>' + esc(s.name) + '</b>') + '</div><div><span class="eyebrow">' + esc(s.format) + '</span><h1 style="margin:10px 0;font:800 clamp(32px,5vw,54px)/1.02 var(--f-ui);letter-spacing:-.03em">' + esc(s.name) + '</h1><p>' + esc(s.desc) + '</p><div class="ps-actions">' +
        (s.link ? '<a class="btn btn--ink" href="' + s.link + '" target="_blank" rel="noopener">' + I.sp + ' Listen on Spotify</a>' : '<a class="btn btn--red" href="' + CFG.social.youtube + '" target="_blank" rel="noopener">' + I.yt + ' Watch on YouTube</a>') +
        '<a class="btn btn--ghost" href="' + BASE + 'contact.html?topic=feature">Be on the show</a></div></div></div></header>';
    } else {
      if (cat) { list = list.filter(function (p) { return p.category === cat.id; }); title = cat.name; desc = cat.desc; }
      if (type === 'video') { list = list.filter(function (p) { return p.type === 'video' || p.video; }); title = 'Watch'; desc = 'Videos, episodes and clips from CityVision TV.'; }
      if (q) { list = search(q, list); title = 'Search'; desc = list.length + ' result' + (list.length === 1 ? '' : 's') + ' for “' + q + '”'; }
      document.title = title + ' | CityVision TV';
      head.innerHTML = '<div class="wrap"><span class="eyebrow">' + (q ? 'Search' : cat ? 'Section' : 'CityVision TV') + '</span><h1>' + esc(title) + '</h1><p>' + esc(desc) + '</p>' +
        (q !== null ? '<form class="search-bar" action="section.html"><input name="q" type="search" value="' + esc(q || '') + '" placeholder="Search stories" aria-label="Search"><button>Search</button></form>' : '') + '</div>';
    }
    var filter = 'all', shown = 12, grid = $('#list');
    var types = {}; list.forEach(function (p) { types[p.type] = 1; });
    var chipHost = $('#chips');
    if (Object.keys(types).length > 1 && type !== 'video') {
      chipHost.innerHTML = '<div class="chips">' + [['all', 'All'], ['article', 'Stories'], ['video', 'Videos'], ['update', 'Updates']].filter(function (x) { return x[0] === 'all' || types[x[0]]; })
        .map(function (x) { return '<button class="chip' + (x[0] === 'all' ? ' on' : '') + '" data-f="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>';
      chipHost.addEventListener('click', function (e) { var b = e.target.closest('.chip'); if (!b) return; filter = b.getAttribute('data-f'); shown = 12; $$('.chip', chipHost).forEach(function (x) { x.classList.toggle('on', x === b); }); draw(); });
    }
    function draw() {
      var items = filter === 'all' ? list : list.filter(function (p) { return p.type === filter; });
      if (!items.length) { grid.innerHTML = '<div class="empty" style="margin-top:32px"><h3>Nothing here yet</h3><p>' + (q ? 'Try a different search.' : 'New stories will appear here as soon as they are published.') + '</p></div>'; $('#moreWrap').hidden = true; return; }
      var lead = items[0], restI = items.slice(1, shown);
      grid.innerHTML = '<div class="list-lead fade-in">' + card(lead, 'wide', true) + '</div>' + (restI.length ? '<div class="grid3 fade-in">' + restI.map(function (p) { return card(p, 'std'); }).join('') + '</div>' : '');
      $('#moreWrap').hidden = items.length <= shown;
    }
    $('#moreBtn').addEventListener('click', function () { shown += 12; draw(); });
    draw();
  };

  R.updates = function () {
    var host = $('#timeline'), since = seenAt();
    if (!ALL.length) { host.innerHTML = '<div class="empty"><h3>No updates yet</h3><p>Check back soon.</p></div>'; return; }
    var day = '', h = '';
    ALL.slice(0, 60).forEach(function (p) {
      var d = CV.fmtDate(p.date);
      if (d !== day) { day = d; h += '<div class="tl-day">' + d + '</div>'; }
      var isNew = new Date(p.date).getTime() > since;
      h += '<div class="tl-item fade-in"><div class="tl-time">' + CV.fmtTime(p.date) + '</div><div class="tl-body">' + card(p, 'row-lg').replace('</h3>', (isNew ? ' <span class="bp-new tl-new">NEW</span>' : '') + '</h3>') + '</div></div>';
    });
    host.innerHTML = h;
    markSeen();
  };

  R.shows = function () {
    $('#showsGrid').innerHTML = CFG.shows.map(function (s) {
      var n = ALL.filter(function (p) { return p.show === s.id; }).length;
      return '<a class="show-big" href="' + BASE + 'section.html?show=' + s.id + '" style="--tile:' + s.tile + ';--c:' + s.color + '"><div class="sc-art">' + (s.logo ? '<img src="' + BASE + s.logo + '" alt="" loading="lazy">' : '<b>' + esc(s.name) + '</b>') + '</div>' +
        '<div class="sb-b"><span class="eyebrow">' + esc(s.format) + (n ? ' &middot; ' + n + ' post' + (n === 1 ? '' : 's') : '') + '</span><h3>' + esc(s.name) + '</h3><p>' + esc(s.desc) + '</p></div></a>';
    }).join('');
  };

  // Static story pages: add sidebar + related
  R.about = function () { R.shows(); };

  R.story = function () {
    var id = body.getAttribute('data-id');
    var me = ALL.filter(function (p) { return p.id === id; })[0];
    var side = $('#storySide'); if (side) side.innerHTML = '<div class="sticky">' + sidebar(id) + '</div>';
    var rel = ALL.filter(function (p) { return p.id !== id; });
    if (me) rel.sort(function (a, b) { return ((b.show && b.show === me.show) * 2 + (b.category === me.category)) - ((a.show && a.show === me.show) * 2 + (a.category === me.category)); });
    rel = rel.slice(0, 4);
    if (rel.length) $('#more').innerHTML = '<div class="sec-h"><h2><span class="dot"></span>More from CityVision</h2><a class="lnk" href="' + BASE + 'updates.html">Latest ' + I.arrow + '</a></div><div class="row4" style="border:0;padding:0;margin:0">' + rel.map(function (p) { return card(p, 'std'); }).join('') + '</div>';
  };

  // Dynamic article reader (article.html?id=…) — fallback when a static page does not exist
  R.article = function () {
    var id = qs('id'), host = $('#articleHost');
    var idx = ALL.filter(function (p) { return p.id === id; })[0];
    function show(p) {
      if (!p) { host.innerHTML = '<div class="empty" style="margin:40px 0"><h3>Story not found</h3><p>It may have been moved or removed. <a class="lnk" href="index.html">Back to home</a></p></div>'; return; }
      document.title = p.title + ' | CityVision TV';
      var abs = CFG.siteUrl + '/' + (p.static ? 'stories/' + p.id + '.html' : 'article.html?id=' + encodeURIComponent(p.id));
      p.body = sanitize(p.body || (p.summary ? '<p>' + esc(p.summary) + '</p>' : ''));
      host.innerHTML = CV.storyInner(p, BASE, abs);
      body.setAttribute('data-id', p.id); R.story();
    }
    if (idx && idx.body) return show(idx);
    fetch(BASE + 'posts/' + encodeURIComponent(id) + '.json?v=' + Date.now()).then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (d) { show(CV.normalize(Object.assign({}, idx || {}, d))); })
      .catch(function () { show(idx); });
  };

  R.contact = function () {
    var t = qs('topic'); var sel = $('#topic');
    if (t && sel) { $$('option', sel).forEach(function (o) { if (o.getAttribute('data-k') === t) sel.value = o.value; }); }
    var f = $('#contactForm'); if (!f) return;
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = $('button[type=submit]', f), msg = $('#formMsg');
      btn.disabled = true; btn.textContent = 'Sending…'; msg.hidden = true;
      var fd = new FormData(f); fd.append('access_key', CFG.web3formsKey); fd.append('subject', 'Website enquiry: ' + (fd.get('topic') || 'General')); fd.append('from_name', 'CityVision TV website');
      fetch('https://api.web3forms.com/submit', { method: 'POST', body: fd, headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); })
        .then(function (d) { if (!d.success) throw 0; msg.className = 'form-msg ok full'; msg.textContent = 'Thank you! Your message has been sent. We usually reply within 1–2 business days.'; f.reset(); })
        .catch(function () { msg.className = 'form-msg err full'; msg.innerHTML = 'Sorry, something went wrong. Please email us directly at <a href="mailto:' + CFG.email + '">' + CFG.email + '</a>.'; })
        .then(function () { msg.hidden = false; btn.disabled = false; btn.textContent = 'Send message'; });
    });
  };

  /* simple allow-list sanitiser for article bodies */
  function sanitize(html) {
    var ok = { P: 1, BR: 1, STRONG: 1, B: 1, EM: 1, I: 1, U: 1, A: 1, H2: 1, H3: 1, UL: 1, OL: 1, LI: 1, BLOCKQUOTE: 1, FIGURE: 1, FIGCAPTION: 1, IMG: 1, HR: 1, DIV: 1, SPAN: 1 };
    var doc = new DOMParser().parseFromString('<div>' + (html || '') + '</div>', 'text/html');
    (function walk(n) {
      Array.prototype.slice.call(n.children).forEach(function (el) {
        if (!ok[el.tagName]) { if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|FORM)$/.test(el.tagName)) el.remove(); else { walk(el); el.replaceWith.apply(el, el.childNodes); } return; }
        Array.prototype.slice.call(el.attributes).forEach(function (a) {
          var k = a.name, keep = (k === 'href' && el.tagName === 'A') || ((k === 'src' || k === 'alt') && el.tagName === 'IMG') || (k === 'class' && /^(cv-embed)$/.test(a.value)) || (k === 'data-video');
          if (!keep || /^\s*javascript:/i.test(a.value)) el.removeAttribute(k);
        });
        if (el.tagName === 'A') { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener'); }
        walk(el);
      });
    })(doc.body.firstChild);
    return doc.body.firstChild.innerHTML;
  }

  load().then(function () {
    ticker(); bell();
    if (R[PAGE]) R[PAGE]();
  });
})();
