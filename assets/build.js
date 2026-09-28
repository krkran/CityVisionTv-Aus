/* ==========================================================
   CityVision TV — shared templates
   Used by the public site (site.js), the newsroom (admin.js)
   and to generate static story pages, RSS and sitemap.
   ========================================================== */
(function (root) {
  var CFG = (typeof module !== 'undefined' && module.exports) ? require('./config.js') : root.CV_CONFIG;

  /* ---------- utilities ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function slugify(s) {
    var base = String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9ऀ-ॿ]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/, '');
    // Devanagari-only titles make awkward URLs; fall back to a dated id
    if (!/[a-z0-9]/.test(base)) base = 'story';
    return base;
  }
  function stripTags(h) { return String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); }
  function readMins(html) { var w = stripTags(html).split(' ').filter(Boolean).length; return Math.max(1, Math.round(w / 220)); }
  function tz() { return CFG.timezone || 'Australia/Brisbane'; }
  function fmtDate(iso, withTime) {
    var d = new Date(iso); if (isNaN(d)) return '';
    var o = { timeZone: tz(), day: 'numeric', month: 'long', year: 'numeric' };
    var s = d.toLocaleDateString('en-AU', o);
    if (withTime) s += ', ' + d.toLocaleTimeString('en-AU', { timeZone: tz(), hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase();
    return s;
  }
  function fmtShort(iso) {
    var d = new Date(iso); if (isNaN(d)) return '';
    return d.toLocaleDateString('en-AU', { timeZone: tz(), day: 'numeric', month: 'short', year: 'numeric' });
  }
  function fmtTime(iso) {
    var d = new Date(iso); if (isNaN(d)) return '';
    return d.toLocaleTimeString('en-AU', { timeZone: tz(), hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase();
  }
  function ago(iso) {
    var s = (Date.now() - new Date(iso)) / 1000;
    if (isNaN(s)) return '';
    if (s < 60) return 'Just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 86400 * 7) { var n = Math.floor(s / 86400); return n + (n === 1 ? ' day ago' : ' days ago'); }
    return fmtShort(iso);
  }
  function ytId(url) {
    if (!url) return '';
    var m = String(url).match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : '';
  }
  function videoEmbed(url) {
    var id = ytId(url);
    if (id) return '<div class="embed"><iframe src="https://www.youtube-nocookie.com/embed/' + id + '?rel=0" title="Video player" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>';
    if (/facebook\.com|fb\.watch/.test(url || '')) return '<div class="embed"><iframe src="https://www.facebook.com/plugins/video.php?href=' + encodeURIComponent(url) + '&show_text=false" title="Facebook video" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>';
    if (url) return '<p><a class="btn btn--red" href="' + esc(url) + '" target="_blank" rel="noopener">Watch the video &rarr;</a></p>';
    return '';
  }
  function showById(id) { for (var i = 0; i < CFG.shows.length; i++) if (CFG.shows[i].id === id) return CFG.shows[i]; return null; }
  function catById(id) { for (var i = 0; i < CFG.categories.length; i++) if (CFG.categories[i].id === id) return CFG.categories[i]; return null; }
  function isAbs(u) { return /^(https?:|data:|blob:)/.test(u || ''); }
  function url(base, p) { return !p ? '' : isAbs(p) ? p : (base || '') + String(p).replace(/^\//, ''); }

  /* Normalise items from any version of articles.json (old site formats included) */
  var OLD_SHOW = { 'City Vision Reports': 'city-vision-reports', 'Hamro Story': 'hamro-story', 'Kurakani': 'kurakani', '8 Baje': '8-baje', 'My Days in Nepal': 'my-days-in-nepal', 'Day in the Life': 'day-in-the-life', 'Diaspora Talk': 'diaspora-talk', 'Podcast': 'kurakani' };
  function normalize(a) {
    if (!a) return null;
    var o = {};
    o.id = String(a.id || ('post-' + Date.now()));
    o.type = a.type || 'article';
    o.title = a.title || 'Untitled';
    o.summary = a.summary || a.excerpt || stripTags(a.content || a.body || '').slice(0, 220);
    var cat = a.category || a.cat || 'news';
    o.show = a.show || OLD_SHOW[cat] || '';
    o.category = catById(String(cat).toLowerCase()) ? String(cat).toLowerCase() : 'news';
    o.author = a.author || '';
    o.image = a.image || a.img || '';
    if (/imgur\.com\/a\//.test(o.image)) o.image = ''; // album links are not images
    o.imageAlt = a.imageAlt || '';
    o.imageCaption = a.imageCaption || '';
    o.video = a.video || (o.type === 'video' ? (a.link || '') : '');
    o.link = a.link && o.type !== 'video' ? a.link : (a.externalLink || '');
    o.date = a.date || new Date().toISOString();
    o.updated = a.updated || '';
    o.featured = a.featured === true || a.pinned === 'yes';
    o.breaking = !!a.breaking;
    o.status = a.status || 'published';
    o.tags = Array.isArray(a.tags) ? a.tags : [];
    o.readMins = a.readMins || 0;
    o.static = a.static === true;
    o.json = a.json === true;
    if (a.body != null || a.content != null) {
      var b = a.body != null ? a.body : a.content;
      o.body = /<\w+/.test(b) ? b : String(b).split(/\n{2,}/).map(function (p) { return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>'; }).join('');
    }
    return o;
  }
  function postUrl(p, base) {
    return p.static ? url(base, 'stories/' + p.id + '.html') : url(base, 'article.html?id=' + encodeURIComponent(p.id));
  }
  function thumb(p) {
    if (p.image) return p.image;
    var id = ytId(p.video); if (id) return 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg';
    return '';
  }
  function kicker(p) {
    var s = showById(p.show); if (s) return s.name;
    var c = catById(p.category); return c ? c.name : 'News';
  }
  function kickerColor(p) { var s = showById(p.show); return s ? s.color : ''; }
  function kickerHref(p, base) {
    return p.show ? url(base, 'section.html?show=' + p.show) : url(base, 'section.html?c=' + (p.category || 'news'));
  }

  /* ---------- icons ---------- */
  var I = {
    yt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4l6.3 3.6z"/></svg>',
    fb: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.7 4.53-4.7 1.31 0 2.69.24 2.69.24v2.96h-1.52c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"/></svg>',
    ig: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.2c3.2 0 3.6 0 4.8.1 3.3.1 4.8 1.7 4.9 4.9.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 3.2-1.7 4.8-4.9 4.9-1.3.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-3.3-.1-4.8-1.7-4.9-4.9C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.8C2.4 3.9 3.9 2.4 7.2 2.3 8.4 2.2 8.8 2.2 12 2.2zM12 0C8.7 0 8.3 0 7.1.1 2.7.3.3 2.7.1 7.1 0 8.3 0 8.7 0 12s0 3.7.1 4.9c.2 4.4 2.6 6.8 7 7 1.2.1 1.6.1 4.9.1s3.7 0 4.9-.1c4.4-.2 6.8-2.6 7-7 .1-1.2.1-1.6.1-4.9s0-3.7-.1-4.9c-.2-4.4-2.6-6.8-7-7C15.7 0 15.3 0 12 0zm0 5.8a6.2 6.2 0 1 0 0 12.4 6.2 6.2 0 0 0 0-12.4zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.4-11.8a1.4 1.4 0 1 0 0 2.9 1.4 1.4 0 0 0 0-2.9z"/></svg>',
    tt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.5.02C13.8 0 15.1.01 16.4 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>',
    sp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24zm5.5 17.3a.75.75 0 0 1-1 .25c-2.85-1.74-6.43-2.13-10.66-1.17a.75.75 0 1 1-.33-1.46c4.62-1.06 8.6-.6 11.74 1.33.36.21.47.68.25 1.05zm1.47-3.26a.94.94 0 0 1-1.29.3c-3.26-2-8.23-2.58-12.08-1.41a.94.94 0 0 1-.55-1.8c4.4-1.33 9.88-.69 13.62 1.61.44.27.58.85.3 1.3zm.13-3.4C15.18 8.33 8.72 8.12 4.98 9.25a1.13 1.13 0 1 1-.65-2.16c4.29-1.3 11.42-1.05 15.92 1.62a1.13 1.13 0 0 1-1.15 1.93z"/></svg>',
    wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.4-.5c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.3zM12 21.8a9.9 9.9 0 0 1-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4A9.8 9.8 0 1 1 12 21.8zM20.5 3.5A11.8 11.8 0 0 0 1.9 17.7L.2 24l6.4-1.7A11.8 11.8 0 0 0 24 12c0-3.2-1.2-6.2-3.5-8.5z"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.9 1.2h3.7l-8 9.2L24 22.8h-7.4l-5.8-7.6-6.6 7.6H.5l8.6-9.8L0 1.2h7.6l5.2 6.9 6.1-6.9zm-1.3 19.4h2L6.5 3.2H4.3l13.3 17.4z"/></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
    menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5.5v13l11-6.5z"/></svg>',
    rss: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 4.5v3a12.5 12.5 0 0 1 12.5 12.5h3A15.5 15.5 0 0 0 4 4.5zm0 6v3a6.5 6.5 0 0 1 6.5 6.5h3A9.5 9.5 0 0 0 4 10.5zM6 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>',
    mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 7l9 6 9-6" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    chev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  /* ---------- brand ---------- */
  function brand(base, cls) {
    return '<a class="brand ' + (cls || '') + '" href="' + url(base, 'index.html') + '" aria-label="CityVision TV home">' +
      '<img class="brand-mark" src="' + url(base, 'assets/brand/mark.png') + '" alt="" width="84" height="44">' +
      '<span class="brand-word"><span class="bw-city">CITY</span><span class="bw-vision">VISION</span></span>' +
      '<span class="brand-tv">TV</span></a>';
  }

  /* ---------- header / footer (injected on every page) ---------- */
  function header(base, active) {
    var S = CFG.social;
    var cats = CFG.categories.filter(function (c) { return ['news', 'community', 'culture', 'diaspora'].indexOf(c.id) > -1; });
    var nav = '<a class="nl' + (active === 'home' ? ' on' : '') + '" href="' + url(base, 'index.html') + '">Home</a>';
    cats.forEach(function (c) { nav += '<a class="nl' + (active === c.id ? ' on' : '') + '" href="' + url(base, 'section.html?c=' + c.id) + '">' + c.name + '</a>'; });
    nav += '<a class="nl' + (active === 'videos' ? ' on' : '') + '" href="' + url(base, 'section.html?type=video') + '">Watch</a>';
    nav += '<div class="nl-drop"><button class="nl' + (active === 'shows' ? ' on' : '') + '" aria-expanded="false" data-drop>Shows ' + I.chev + '</button><div class="mega"><div class="mega-in">' +
      CFG.shows.map(function (s) {
        return '<a class="mega-item" href="' + url(base, 'section.html?show=' + s.id) + '"><span class="mega-logo" style="background:' + s.tile + '">' +
          (s.logo ? '<img src="' + url(base, s.logo) + '" alt="" loading="lazy">' : '<b style="color:' + s.color + '">' + esc(s.name) + '</b>') +
          '</span><span><strong>' + esc(s.name) + '</strong><small>' + esc(s.format) + '</small></span></a>';
      }).join('') + '<a class="mega-all" href="' + url(base, 'shows.html') + '">All shows ' + I.arrow + '</a></div></div></div>';
    nav += '<a class="nl' + (active === 'updates' ? ' on' : '') + '" href="' + url(base, 'updates.html') + '">Updates</a>';
    nav += '<a class="nl' + (active === 'events' ? ' on' : '') + '" href="' + url(base, 'section.html?c=events') + '">Events</a>';

    var date = new Date().toLocaleDateString('en-AU', { timeZone: tz(), weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return '' +
      '<a class="skip" href="#main">Skip to content</a>' +
      '<div class="util"><div class="wrap util-in"><span class="util-date">' + date + '</span>' +
      '<span class="util-tag">Nepali community broadcaster &middot; Australia</span>' +
      '<span class="util-soc">' +
      '<a href="' + S.facebook + '" target="_blank" rel="noopener" aria-label="Facebook">' + I.fb + '</a>' +
      '<a href="' + S.youtube + '" target="_blank" rel="noopener" aria-label="YouTube">' + I.yt + '</a>' +
      '<a href="' + S.instagram + '" target="_blank" rel="noopener" aria-label="Instagram">' + I.ig + '</a>' +
      '<a href="' + S.tiktok + '" target="_blank" rel="noopener" aria-label="TikTok">' + I.tt + '</a>' +
      '<a href="' + S.spotify + '" target="_blank" rel="noopener" aria-label="Spotify">' + I.sp + '</a>' +
      '</span></div></div>' +
      '<header class="mast" id="mast"><div class="wrap mast-in">' +
      '<button class="icon-btn burger" aria-label="Open menu" data-menu>' + I.menu + '</button>' +
      brand(base) +
      '<div class="mast-actions">' +
      '<button class="icon-btn" aria-label="Search" data-search>' + I.search + '</button>' +
      '<button class="icon-btn bell" aria-label="What’s new" data-bell>' + I.bell + '<span class="bell-dot" hidden></span></button>' +
      '<a class="btn btn--red btn--sm mast-watch" href="' + S.youtube + '" target="_blank" rel="noopener">' + I.play + '<span>Watch</span></a>' +
      '</div></div>' +
      '<nav class="nav" aria-label="Main"><div class="wrap nav-in">' + nav + '</div></nav></header>' +
      '<div class="ticker" id="ticker" hidden></div>' +
      // drawer
      '<div class="drawer" id="drawer" aria-hidden="true"><div class="drawer-panel"><div class="drawer-top">' + brand(base, 'brand--sm') +
      '<button class="icon-btn" aria-label="Close menu" data-close>' + I.close + '</button></div>' +
      '<form class="drawer-search" action="' + url(base, 'section.html') + '"><input name="q" type="search" placeholder="Search CityVision TV" aria-label="Search"><button aria-label="Search">' + I.search + '</button></form>' +
      '<div class="drawer-links">' + nav.replace(/<div class="nl-drop">[\s\S]*?<\/div><\/div><\/div>/, '<a class="nl" href="' + url(base, 'shows.html') + '">Shows</a>') +
      '<a class="nl" href="' + url(base, 'about.html') + '">About us</a><a class="nl" href="' + url(base, 'contact.html') + '">Contact</a></div>' +
      '<div class="drawer-shows">' + CFG.shows.map(function (s) { return '<a href="' + url(base, 'section.html?show=' + s.id) + '" style="--c:' + s.color + '">' + esc(s.name) + '</a>'; }).join('') + '</div>' +
      '</div></div>' +
      // search overlay
      '<div class="search-ov" id="searchOv" aria-hidden="true"><div class="wrap"><form class="search-form" action="' + url(base, 'section.html') + '">' + I.search +
      '<input name="q" type="search" placeholder="Search stories, shows, people…" aria-label="Search" autocomplete="off"><button type="button" class="icon-btn" data-close aria-label="Close search">' + I.close + '</button></form>' +
      '<div class="search-live" id="searchLive"></div></div></div>' +
      // updates panel
      '<div class="bellpanel" id="bellPanel" aria-hidden="true"><div class="bp-head"><strong>What’s new</strong><a href="' + url(base, 'updates.html') + '">See all updates</a></div><div class="bp-list" id="bpList"></div></div>';
  }

  function footer(base) {
    var S = CFG.social, y = new Date().getFullYear();
    return '' +
      '<section class="stay" id="stay"><div class="wrap stay-in">' +
      '<div class="stay-copy"><span class="eyebrow eyebrow--light">Stay updated</span><h2>Never miss a story from the community</h2>' +
      '<p>Get new stories, episodes and community updates in your inbox. Or follow us wherever you watch.</p></div>' +
      '<form class="stay-form" data-newsletter><input type="email" name="email" required placeholder="Your email address" aria-label="Email address">' +
      '<button class="btn btn--red" type="submit">Subscribe</button><p class="stay-msg" role="status"></p>' +
      '<div class="stay-alt"><a href="' + S.youtube + '" target="_blank" rel="noopener">' + I.yt + ' YouTube</a><a href="' + S.facebook + '" target="_blank" rel="noopener">' + I.fb + ' Facebook</a>' +
      '<a href="' + S.spotify + '" target="_blank" rel="noopener">' + I.sp + ' Spotify</a><a href="' + url(base, 'feed.xml') + '">' + I.rss + ' RSS</a></div></form>' +
      '</div></section>' +
      '<footer class="foot"><div class="wrap">' +
      '<div class="foot-top"><div class="foot-brand"><span class="foot-badge"><img src="' + url(base, 'assets/brand/logo.png') + '" alt="CityVision TV" width="120" height="112" loading="lazy"></span>' +
      '<p>' + esc(CFG.tagline) + '</p><p class="foot-loc">' + esc(CFG.location) + '</p></div>' +
      '<div class="foot-col"><h4>Sections</h4>' + CFG.categories.map(function (c) { return '<a href="' + url(base, 'section.html?c=' + c.id) + '">' + c.name + '</a>'; }).join('') + '<a href="' + url(base, 'section.html?type=video') + '">Watch</a></div>' +
      '<div class="foot-col"><h4>Shows</h4>' + CFG.shows.map(function (s) { return '<a href="' + url(base, 'section.html?show=' + s.id) + '">' + esc(s.name) + '</a>'; }).join('') + '</div>' +
      '<div class="foot-col"><h4>CityVision</h4><a href="' + url(base, 'about.html') + '">About us</a><a href="' + url(base, 'contact.html') + '">Contact</a>' +
      '<a href="' + url(base, 'contact.html?topic=story') + '">Submit a story</a><a href="' + url(base, 'contact.html?topic=advertising') + '">Advertise with us</a>' +
      '<a href="' + url(base, 'contact.html?topic=event') + '">List an event</a><a href="' + url(base, 'updates.html') + '">Latest updates</a><a href="' + url(base, 'feed.xml') + '">RSS feed</a></div>' +
      '<div class="foot-col"><h4>Follow</h4><a href="' + S.youtube + '" target="_blank" rel="noopener">YouTube</a><a href="' + S.facebook + '" target="_blank" rel="noopener">Facebook</a>' +
      '<a href="' + S.instagram + '" target="_blank" rel="noopener">Instagram</a><a href="' + S.tiktok + '" target="_blank" rel="noopener">TikTok</a><a href="' + S.spotify + '" target="_blank" rel="noopener">Spotify</a>' +
      '<a href="mailto:' + CFG.email + '">Email us</a></div></div>' +
      '<div class="foot-bottom"><span>&copy; ' + y + ' CityVision TV Australia</span><span lang="ne">नेपाली मिडिया अष्ट्रेलिया</span><a href="' + url(base, 'admin.html') + '" class="foot-admin">Newsroom</a></div>' +
      '</div></footer>';
  }

  /* ---------- cards ---------- */
  function media(p, base, cls, eager) {
    var src = thumb(p), s = showById(p.show), play = p.type === 'video' ? '<span class="play">' + I.play + '</span>' : '';
    var badge = p.type === 'video' ? '' : '';
    if (src) return '<div class="media ' + (cls || '') + '"><img src="' + esc(url(base, src)) + '" alt="' + esc(p.imageAlt || '') + '"' + (eager ? '' : ' loading="lazy"') + ' decoding="async">' + play + badge + '</div>';
    if (s) return '<div class="media media--tile ' + (cls || '') + '" style="--tile:' + s.tile + ';--c:' + s.color + '">' + (s.logo ? '<img class="tile-logo" src="' + url(base, s.logo) + '" alt="" loading="lazy">' : '<b class="tile-word">' + esc(s.name) + '</b>') + play + '</div>';
    return '<div class="media media--brand ' + (cls || '') + '"><img class="tile-mark" src="' + url(base, 'assets/brand/mark.png') + '" alt="" loading="lazy">' + play + '</div>';
  }
  function metaLine(p, opts) {
    opts = opts || {};
    var bits = [];
    if (p.breaking) bits.push('<span class="flag">Breaking</span>');
    bits.push('<time datetime="' + esc(p.date) + '">' + ago(p.date) + '</time>');
    if (opts.author && p.author) bits.push('<span>' + esc(p.author) + '</span>');
    if (p.type === 'video') bits.push('<span class="m-video">' + I.play + 'Video</span>');
    else if (opts.read && p.readMins) bits.push('<span>' + p.readMins + ' min read</span>');
    return '<div class="meta">' + bits.join('<i></i>') + '</div>';
  }
  function kick(p, base) {
    var c = kickerColor(p);
    return '<a class="kicker" href="' + kickerHref(p, base) + '"' + (c ? ' style="--k:' + c + '"' : '') + '>' + esc(kicker(p)) + '</a>';
  }
  function card(p, base, variant, eager) {
    var href = postUrl(p, base);
    variant = variant || '';
    if (variant === 'text') {
      return '<article class="card card--text">' + kick(p, base) + '<h3 class="card-t"><a href="' + href + '">' + esc(p.title) + '</a></h3>' + metaLine(p) + '</article>';
    }
    var sum = (variant === 'lead' || variant === 'wide' || variant === 'row-lg') && p.summary ? '<p class="card-s">' + esc(p.summary) + '</p>' : '';
    return '<article class="card card--' + (variant || 'std') + (p.type === 'video' ? ' is-video' : '') + '">' +
      '<a class="card-m" href="' + href + '" tabindex="-1" aria-hidden="true">' + media(p, base, '', eager) + '</a>' +
      '<div class="card-b">' + kick(p, base) + '<h3 class="card-t"><a href="' + href + '">' + esc(p.title) + '</a></h3>' + sum + metaLine(p, { author: variant === 'lead' }) + '</div></article>';
  }

  /* ---------- story (article) ---------- */
  function renderBodyEmbeds(html) {
    // <div class="cv-embed" data-video="URL"></div> placeholders become players
    return String(html || '').replace(/<div class="cv-embed" data-video="([^"]*)"[^>]*>\s*<\/div>/g, function (m, u) {
      return videoEmbed(u.replace(/&amp;/g, '&'));
    });
  }
  function shareBar(p, abs) {
    var u = encodeURIComponent(abs), t = encodeURIComponent(p.title);
    return '<div class="share" data-share-url="' + esc(abs) + '" data-share-title="' + esc(p.title) + '">' +
      '<span class="share-l">Share</span>' +
      '<a class="sh sh-fb" href="https://www.facebook.com/sharer/sharer.php?u=' + u + '" target="_blank" rel="noopener" aria-label="Share on Facebook">' + I.fb + '</a>' +
      '<a class="sh sh-wa" href="https://wa.me/?text=' + t + '%20' + u + '" target="_blank" rel="noopener" aria-label="Share on WhatsApp">' + I.wa + '</a>' +
      '<a class="sh sh-x" href="https://twitter.com/intent/tweet?text=' + t + '&url=' + u + '" target="_blank" rel="noopener" aria-label="Share on X">' + I.x + '</a>' +
      '<button class="sh sh-copy" type="button" data-copy aria-label="Copy link">' + I.link + '</button>' +
      '<button class="sh sh-native" type="button" data-native aria-label="Share">' + I.share + '</button></div>';
  }
  function storyInner(p, base, absUrl) {
    var s = showById(p.show);
    var mins = p.readMins || readMins(p.body);
    var heroMedia = '';
    if (p.video) heroMedia = '<figure class="story-hero">' + videoEmbed(p.video) + (p.imageCaption ? '<figcaption>' + esc(p.imageCaption) + '</figcaption>' : '') + '</figure>';
    else if (p.image) heroMedia = '<figure class="story-hero"><img src="' + esc(url(base, p.image)) + '" alt="' + esc(p.imageAlt || '') + '" decoding="async">' + (p.imageCaption ? '<figcaption>' + esc(p.imageCaption) + '</figcaption>' : '') + '</figure>';
    var tags = (p.tags || []).length ? '<div class="tags">' + p.tags.map(function (t) { return '<a href="' + url(base, 'section.html?q=' + encodeURIComponent(t)) + '">' + esc(t) + '</a>'; }).join('') + '</div>' : '';
    var showBox = s ? '<aside class="showbox" style="--c:' + s.color + ';--tile:' + s.tile + '"><div class="showbox-logo">' + (s.logo ? '<img src="' + url(base, s.logo) + '" alt="" loading="lazy">' : '<b>' + esc(s.name) + '</b>') + '</div><div><span class="eyebrow">' + esc(s.format) + '</span><h3>' + esc(s.name) + '</h3><p>' + esc(s.desc) + '</p><a class="lnk" href="' + url(base, 'section.html?show=' + s.id) + '">More from ' + esc(s.name) + ' ' + I.arrow + '</a></div></aside>' : '';
    var ext = p.link ? '<p><a class="btn btn--ink" href="' + esc(p.link) + '" target="_blank" rel="noopener">Read more at the source &rarr;</a></p>' : '';
    var updated = p.updated && p.updated !== p.date ? ' <span class="upd">Updated ' + fmtDate(p.updated, true) + '</span>' : '';
    return '<article class="story' + (p.type === 'update' ? ' story--update' : '') + '">' +
      '<header class="story-head">' + kick(p, base) + (p.breaking ? '<span class="flag">Breaking</span>' : '') +
      '<h1 class="story-title">' + esc(p.title) + '</h1>' +
      (p.summary ? '<p class="story-dek">' + esc(p.summary) + '</p>' : '') +
      '<div class="byline"><span class="by-avatar">' + (p.author && !/cityvision/i.test(p.author) ? esc(p.author.trim().charAt(0).toUpperCase()) : '<img src="' + url(base, 'assets/brand/mark.png') + '" alt="">') + '</span>' +
      '<div><strong>' + (p.author ? 'By ' + esc(p.author) : 'CityVision TV') + '</strong><span><time datetime="' + esc(p.date) + '">' + fmtDate(p.date, true) + '</time>' + updated +
      (p.type !== 'video' ? ' &middot; ' + mins + ' min read' : '') + '</span></div></div>' +
      shareBar(p, absUrl) + '</header>' + heroMedia +
      '<div class="story-body prose">' + renderBodyEmbeds(p.body || '') + ext + '</div>' +
      tags + '<div class="story-foot">' + shareBar(p, absUrl) + '</div>' + showBox + '</article>';
  }

  /* Full static page for /stories/<id>.html — great for Facebook/WhatsApp previews and Google */
  function storyPage(p) {
    var base = '../';
    var abs = CFG.siteUrl + '/stories/' + p.id + '.html';
    var img = thumb(p); img = img ? (isAbs(img) ? img : CFG.siteUrl + '/' + img.replace(/^\//, '')) : CFG.siteUrl + '/assets/brand/og-default.jpg';
    var desc = p.summary || stripTags(p.body).slice(0, 200);
    var ld = { '@context': 'https://schema.org', '@type': p.type === 'video' ? 'VideoObject' : 'NewsArticle', headline: p.title, description: desc, image: [img], datePublished: p.date, dateModified: p.updated || p.date, author: p.author ? [{ '@type': 'Person', name: p.author }] : [{ '@type': 'Organization', name: 'CityVision TV' }], publisher: { '@type': 'Organization', name: 'CityVision TV', logo: { '@type': 'ImageObject', url: CFG.siteUrl + '/assets/brand/icon-512.png' } }, mainEntityOfPage: abs };
    if (p.type === 'video') { ld.name = p.title; ld.thumbnailUrl = [img]; ld.uploadDate = p.date; if (p.video) ld.embedUrl = p.video; }
    return '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
      '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      '<title>' + esc(p.title) + ' | CityVision TV</title>\n' +
      '<meta name="description" content="' + esc(desc) + '">\n<link rel="canonical" href="' + abs + '">\n' +
      '<meta property="og:type" content="article">\n<meta property="og:site_name" content="CityVision TV">\n' +
      '<meta property="og:title" content="' + esc(p.title) + '">\n<meta property="og:description" content="' + esc(desc) + '">\n' +
      '<meta property="og:url" content="' + abs + '">\n<meta property="og:image" content="' + esc(img) + '">\n' +
      '<meta property="article:published_time" content="' + esc(p.date) + '">\n' +
      '<meta name="twitter:card" content="summary_large_image">\n' +
      '<script type="application/ld+json">' + JSON.stringify(ld).replace(/</g, '\\u003c') + '</script>\n' +
      headAssets(base) +
      '</head>\n<body data-page="story" data-base="../" data-id="' + esc(p.id) + '">\n' +
      '<div id="cv-header"></div>\n<div class="progress" id="progress"></div>\n' +
      '<main id="main" class="wrap story-wrap"><div class="story-grid"><div class="story-col">' + storyInner(p, base, abs) + '</div>' +
      '<aside class="story-side" id="storySide"></aside></div>' +
      '<section class="more" id="more"></section></main>\n' +
      '<div id="cv-footer"></div>\n' + tailAssets(base) + '</body>\n</html>\n';
  }
  function headAssets(base) {
    return '<link rel="icon" href="' + base + 'favicon.png">\n<link rel="apple-touch-icon" href="' + base + 'assets/brand/apple-touch-icon.png">\n' +
      '<meta name="theme-color" content="#2b0782">\n<link rel="alternate" type="application/rss+xml" title="CityVision TV" href="' + base + 'feed.xml">\n' +
      '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
      '<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800&family=Montserrat:wght@300;400;800&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&family=Mukta:wght@400;600;700&display=swap" rel="stylesheet">\n' +
      '<link rel="stylesheet" href="' + base + 'assets/site.css">\n';
  }
  function tailAssets(base) {
    return '<script src="' + base + 'assets/config.js"></script>\n<script src="' + base + 'assets/build.js"></script>\n<script src="' + base + 'assets/site.js"></script>\n';
  }

  /* ---------- RSS + sitemap ---------- */
  function xmlEsc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function feedXML(index) {
    var items = index.filter(function (p) { return p.status !== 'draft'; }).slice(0, 50);
    return '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">\n<channel>\n' +
      '<title>CityVision TV</title>\n<link>' + CFG.siteUrl + '/</link>\n<description>' + xmlEsc(CFG.tagline) + '</description>\n<language>en-au</language>\n' +
      '<atom:link href="' + CFG.siteUrl + '/feed.xml" rel="self" type="application/rss+xml"/>\n<lastBuildDate>' + new Date().toUTCString() + '</lastBuildDate>\n' +
      items.map(function (p) {
        var link = p.static ? CFG.siteUrl + '/stories/' + p.id + '.html' : CFG.siteUrl + '/article.html?id=' + encodeURIComponent(p.id);
        var img = thumb(p); if (img && !isAbs(img)) img = CFG.siteUrl + '/' + img;
        return '<item>\n<title>' + xmlEsc(p.title) + '</title>\n<link>' + link + '</link>\n<guid isPermaLink="true">' + link + '</guid>\n' +
          '<pubDate>' + new Date(p.date).toUTCString() + '</pubDate>\n<category>' + xmlEsc(kicker(p)) + '</category>\n' +
          '<description>' + xmlEsc(p.summary) + '</description>\n' + (img ? '<media:content url="' + xmlEsc(img) + '" medium="image"/>\n' : '') + '</item>\n';
      }).join('') + '</channel>\n</rss>\n';
  }
  function sitemapXML(index) {
    var pages = ['', 'shows.html', 'updates.html', 'about.html', 'contact.html'].map(function (p) { return CFG.siteUrl + '/' + p; });
    CFG.categories.forEach(function (c) { pages.push(CFG.siteUrl + '/section.html?c=' + c.id); });
    CFG.shows.forEach(function (s) { pages.push(CFG.siteUrl + '/section.html?show=' + s.id); });
    var out = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    pages.forEach(function (u) { out += '<url><loc>' + xmlEsc(u) + '</loc></url>\n'; });
    index.forEach(function (p) {
      if (p.status === 'draft' || !p.static) return;
      out += '<url><loc>' + CFG.siteUrl + '/stories/' + p.id + '.html</loc><lastmod>' + String(p.updated || p.date).slice(0, 10) + '</lastmod></url>\n';
    });
    return out + '</urlset>\n';
  }

  var API = {
    CFG: CFG, I: I, esc: esc, slugify: slugify, stripTags: stripTags, readMins: readMins, fmtDate: fmtDate, fmtShort: fmtShort, fmtTime: fmtTime, ago: ago,
    ytId: ytId, videoEmbed: videoEmbed, showById: showById, catById: catById, url: url, isAbs: isAbs, normalize: normalize, postUrl: postUrl, thumb: thumb,
    kicker: kicker, brand: brand, header: header, footer: footer, media: media, metaLine: metaLine, card: card, storyInner: storyInner,
    storyPage: storyPage, headAssets: headAssets, tailAssets: tailAssets, feedXML: feedXML, sitemapXML: sitemapXML, renderBodyEmbeds: renderBodyEmbeds
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.CV = API;
})(this);
