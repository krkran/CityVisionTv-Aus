/* ==========================================================
   CityVision TV — Newsroom (CMS)
   Publishes straight to the GitHub repository that hosts the
   site. Every save is ONE atomic commit containing:
     articles.json · posts/<id>.json · stories/<id>.html
     media/… (photos) · feed.xml · sitemap.xml
   ========================================================== */
(function () {
  var CV = window.CV, CFG = CV.CFG, esc = CV.esc;
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  var store = {
    get: function (k) { try { return localStorage.getItem(k) || sessionStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v, persist) { try { (persist === false ? sessionStorage : localStorage).setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (e) {} }
  };

  /* ---------- state ---------- */
  var S = { token: '', repo: null, index: [], filter: 'all', q: '', post: null, isNew: true, media: {}, heroData: '', dirty: false };

  function toast(msg, ms) {
    var t = $('#toast'); t.innerHTML = msg; t.classList.add('show');
    clearTimeout(t._t); t._t = setTimeout(function () { t.classList.remove('show'); }, ms || 3500);
  }
  function busy(on, msg, sub) { $('#busy').hidden = !on; if (msg) $('#busyMsg').textContent = msg; $('#busySub').textContent = sub || ''; }

  /* ---------- GitHub API ---------- */
  function gh(path, opts) {
    opts = opts || {};
    var r = S.repo;
    var u = path.indexOf('http') === 0 ? path : 'https://api.github.com/repos/' + r.owner + '/' + r.repo + path;
    var h = { Authorization: 'Bearer ' + S.token, Accept: opts.raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (opts.body) h['Content-Type'] = 'application/json';
    return fetch(u, { method: opts.method || 'GET', headers: h, body: opts.body ? JSON.stringify(opts.body) : undefined, cache: 'no-store' })
      .then(function (res) {
        if (opts.allow404 && res.status === 404) return null;
        if (!res.ok) return res.text().then(function (t) { var m = t; try { m = JSON.parse(t).message; } catch (e) {} var err = new Error(m || ('GitHub error ' + res.status)); err.status = res.status; throw err; });
        return opts.raw ? res.text() : res.json();
      });
  }
  function readFile(path, ref) { return gh('/contents/' + path.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(ref || S.repo.branch), { raw: true, allow404: true }); }
  function parseIndex(txt) {
    if (!txt) return [];
    var d; try { d = JSON.parse(txt); } catch (e) { throw new Error('articles.json is not valid JSON'); }
    var list = Array.isArray(d) ? d : (d.items || []);
    return list.map(CV.normalize).filter(Boolean);
  }
  function indexJSON(list) {
    var clean = list.map(function (p) { var o = Object.assign({}, p); delete o.body; return o; })
      .sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    return JSON.stringify({ version: 2, updated: new Date().toISOString(), items: clean }, null, 1) + '\n';
  }

  /* One atomic commit. build(freshIndex, headSha) returns {files:[…], message}.
     Retries automatically if someone else published at the same moment. */
  function transact(build, attempt) {
    attempt = attempt || 1;
    var br = S.repo.branch, head, baseTree, plan;
    return gh('/git/ref/heads/' + encodeURIComponent(br))
      .then(function (ref) { head = ref.object.sha; return gh('/git/commits/' + head); })
      .then(function (c) { baseTree = c.tree.sha; return readFile('articles.json', head); })
      .then(function (txt) { return build(parseIndex(txt), head); })
      .then(function (p) {
        plan = p;
        return Promise.all(plan.files.map(function (f) {
          if (f.remove) return Promise.resolve({ path: f.path, mode: '100644', type: 'blob', sha: null });
          return gh('/git/blobs', { method: 'POST', body: { content: f.content, encoding: f.base64 ? 'base64' : 'utf-8' } })
            .then(function (b) { return { path: f.path, mode: '100644', type: 'blob', sha: b.sha }; });
        }));
      })
      .then(function (tree) { return gh('/git/trees', { method: 'POST', body: { base_tree: baseTree, tree: tree } }); })
      .then(function (t) { return gh('/git/commits', { method: 'POST', body: { message: plan.message, tree: t.sha, parents: [head] } }); })
      .then(function (c) { return gh('/git/refs/heads/' + encodeURIComponent(br), { method: 'PATCH', body: { sha: c.sha, force: false } }).then(function () { return plan; }); })
      .catch(function (e) {
        if (attempt < 3 && (e.status === 422 || e.status === 409)) return new Promise(function (r) { setTimeout(r, 800 * attempt); }).then(function () { return transact(build, attempt + 1); });
        throw e;
      });
  }
  function siteFiles(index) {
    return [
      { path: 'articles.json', content: indexJSON(index) },
      { path: 'feed.xml', content: CV.feedXML(index.filter(function (p) { return p.status !== 'draft' && new Date(p.date) <= new Date(); })) },
      { path: 'sitemap.xml', content: CV.sitemapXML(index) }
    ];
  }

  /* ---------- connect ---------- */
  function showConnect(err) {
    $('#vApp').hidden = true; $('#vConnect').hidden = false;
    $('#acBrand').innerHTML = CV.brand('');
    var r = S.repo || CFG.github;
    $('#gOwner').value = r.owner; $('#gRepo').value = r.repo; $('#gBranch').value = r.branch;
    $('#repoName').textContent = r.repo;
    $('#connectErr').textContent = err || '';
  }
  $('#connectForm').addEventListener('submit', function (e) {
    e.preventDefault();
    S.token = $('#tok').value.trim();
    S.repo = { owner: $('#gOwner').value.trim(), repo: $('#gRepo').value.trim(), branch: $('#gBranch').value.trim() || 'main' };
    var btn = $('.ac-go'); btn.disabled = true; btn.textContent = 'Checking…';
    verify().then(function () {
      var remember = $('#remember').checked;
      store.set('cv_admin_token', S.token, remember);
      store.set('cv_admin_repo', JSON.stringify(S.repo), remember);
      startApp();
    }).catch(function (err) {
      $('#connectErr').textContent = err.message;
    }).then(function () { btn.disabled = false; btn.textContent = 'Connect newsroom'; });
  });
  function verify() {
    return gh('').then(function (repo) {
      if (repo.permissions && !repo.permissions.push) throw new Error('This token can read the repository but cannot publish. Set Contents to “Read and write”.');
      return gh('https://api.github.com/user').then(function (u) { S.user = u; }, function () { S.user = null; });
    }, function (e) {
      if (e.status === 401) throw new Error('That token was not accepted. Check you copied all of it, and that it has not expired.');
      if (e.status === 404) throw new Error('Repository not found. Make sure the token has access to ' + S.repo.owner + '/' + S.repo.repo + '.');
      throw e;
    });
  }
  $('#signOut').addEventListener('click', function () {
    if (!confirm('Sign out of the newsroom on this device?')) return;
    store.del('cv_admin_token'); S.token = ''; showConnect();
  });

  /* ---------- dashboard ---------- */
  function startApp() {
    $('#vConnect').hidden = true; $('#vApp').hidden = false;
    $('#topBrand').innerHTML = CV.brand('').replace(/^<a[^>]*>|<\/a>$/g, '');
    $('#userBox').innerHTML = S.user ? '<img src="' + esc(S.user.avatar_url) + '" alt=""><span>' + esc(S.user.name || S.user.login) + '</span>' : '';
    if (!store.get('cv_author') && S.user && S.user.name) store.set('cv_author', S.user.name);
    fillSelects(); fillFilterSelects();
    route();
  }
  function loadIndex() {
    $('#dashSub').textContent = 'Loading…';
    return readFile('articles.json').then(function (t) { S.index = parseIndex(t).sort(function (a, b) { return new Date(b.date) - new Date(a.date); }); drawDash(); drawTraffic(); drawStorage(); })
      .catch(function (e) { $('#rows').innerHTML = '<div class="rows-empty">Could not load stories: ' + esc(e.message) + '</div>'; });
  }

  function rowHTML(p) {
    var pills = '<span class="pill">' + (p.type === 'update' ? 'Update' : p.type === 'video' ? 'Video' : 'Article') + '</span>' + (p.featured ? '<span class="pill lead">Lead</span>' : '') + (p.breaking ? '<span class="pill brk">Breaking</span>' : '') + (p.noAds ? '<span class="pill">No ads</span>' : '');
    var live = p.status !== 'draft' ? CV.postUrl(p, '') : '';
    return '<div class="row" data-id="' + esc(p.id) + '">' + CV.media(p, '') + '<div><div class="row-t" data-edit>' + esc(p.title) + '</div><div class="row-m">' + pills + '<span>' + esc(CV.kicker(p)) + '</span>' + (p.author ? '<span>· ' + esc(p.author) + '</span>' : '') + (p.status !== 'draft' && p.static ? '<span class="views" data-views="' + esc(p.id) + '"></span>' : '') + '</div></div>' +
      '<div class="row-date">' + CV.fmtShort(p.date) + '<br><span class="muted">' + CV.fmtTime(p.date) + '</span></div>' +
      '<div class="row-st"><span class="pill ' + (p.status === 'draft' ? 'draft">Draft' : 'pub">Published') + '</span></div>' +
      '<div class="row-act"><button data-edit>Edit</button>' + (live ? '<a href="' + live + '" target="_blank" rel="noopener">View</a>' : '') + '<button class="del" data-del>Delete</button></div></div>';
  }
  S.views = {};
  function filteredStories() {
    var list = S.index.filter(function (p) { return S.filter === 'all' || (S.filter === 'draft' ? p.status === 'draft' : p.status !== 'draft'); });
    if (S.fSec) list = list.filter(function (p) { return p.category === S.fSec; });
    if (S.fShow) list = list.filter(function (p) { return S.fShow === '_none' ? !p.show : p.show === S.fShow; });
    if (S.fType) list = list.filter(function (p) { return (p.type || 'article') === S.fType; });
    if (S.q) { var q = S.q.toLowerCase(); list = list.filter(function (p) { return (p.title + ' ' + p.summary + ' ' + (p.author || '') + ' ' + (p.tags || []).join(' ')).toLowerCase().indexOf(q) > -1; }); }
    var sort = S.sort || 'new';
    list = list.slice().sort(function (a, b) {
      if (sort === 'old') return new Date(a.date) - new Date(b.date);
      if (sort === 'az') return a.title.localeCompare(b.title);
      if (sort === 'views') return (S.views[b.id] || 0) - (S.views[a.id] || 0) || new Date(b.date) - new Date(a.date);
      return new Date(b.date) - new Date(a.date);
    });
    return list;
  }
  function fillFilterSelects() {
    $('#fltSec').innerHTML = '<option value="">All sections</option>' + CFG.categories.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + '</option>'; }).join('');
    $('#fltShow').innerHTML = '<option value="">All shows</option><option value="_none">Not part of a show</option>' + CFG.shows.map(function (x) { return '<option value="' + x.id + '">' + esc(x.name) + '</option>'; }).join('');
    try { var f = JSON.parse(localStorage.getItem('cv_dash_f') || '{}'); S.fSec = f.sec || ''; S.fShow = f.show || ''; S.fType = f.type || ''; S.sort = f.sort || 'new'; S.group = !!f.group; } catch (e) {}
    $('#fltSec').value = S.fSec || ''; $('#fltShow').value = S.fShow || ''; $('#fltType').value = S.fType || ''; $('#fltSort').value = S.sort || 'new'; $('#fltGroup').checked = !!S.group;
  }
  function saveFilters() { try { localStorage.setItem('cv_dash_f', JSON.stringify({ sec: S.fSec, show: S.fShow, type: S.fType, sort: S.sort, group: S.group })); } catch (e) {} }
  ['#fltSec', '#fltShow', '#fltType', '#fltSort'].forEach(function (sel) {
    $(sel).addEventListener('change', function () {
      S.fSec = $('#fltSec').value; S.fShow = $('#fltShow').value; S.fType = $('#fltType').value; S.sort = $('#fltSort').value; S.limit = 40;
      saveFilters();
      if (S.sort === 'views') loadAllViews().then(drawDash); else drawDash();
    });
  });
  $('#fltGroup').addEventListener('change', function () { S.group = $('#fltGroup').checked; saveFilters(); drawDash(); });
  $('#fltClear').addEventListener('click', function () {
    S.fSec = S.fShow = S.fType = ''; S.q = ''; S.filter = 'all'; $('#dashSearch').value = '';
    $$('#statusSeg button').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-s') === 'all'); });
    $('#fltSec').value = ''; $('#fltShow').value = ''; $('#fltType').value = ''; saveFilters(); drawDash();
  });
  function loadAllViews() {
    var pub = S.index.filter(function (p) { return p.status !== 'draft' && p.static; });
    return Promise.all(pub.map(function (p) { return gcCount('/stories/' + p.id).then(function (n) { S.views[p.id] = n; }, function () {}); }));
  }
  function drawDash() {
    var all = S.index, pub = all.filter(function (p) { return p.status !== 'draft'; });
    var month = pub.filter(function (p) { var d = new Date(p.date), n = new Date(); return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear(); });
    $('#dashSub').textContent = pub.length + ' published · ' + (all.length - pub.length) + ' drafts';
    $('#stats').innerHTML = [[pub.length, 'Published'], [all.length - pub.length, 'Drafts'], [month.length, 'Published this month'], [pub.filter(function (p) { return p.type === 'video'; }).length, 'Videos']]
      .map(function (s) { return '<div class="stat"><b>' + s[0] + '</b><span>' + s[1] + '</span></div>'; }).join('');
    var list = filteredStories();
    var active = S.fSec || S.fShow || S.fType || S.q || S.filter !== 'all';
    $('#fltClear').hidden = !active;
    $('#fltCount').textContent = active ? list.length + ' of ' + all.length + ' stories' : all.length + ' stories';
    if (!list.length) { $('#rows').innerHTML = '<div class="rows-empty">' + (all.length ? 'No stories match these filters.' : 'No stories yet. Click <b>+ New article</b> to publish your first one.') + '</div>'; return; }
    if (S.group) {
      var groups = CFG.categories.map(function (c) { return { id: c.id, name: c.name, items: list.filter(function (p) { return p.category === c.id; }) }; });
      var known = CFG.categories.map(function (c) { return c.id; });
      groups.push({ id: 'other', name: 'Other', items: list.filter(function (p) { return known.indexOf(p.category) < 0; }) });
      var closed = {}; try { closed = JSON.parse(localStorage.getItem('cv_grp_closed') || '{}'); } catch (e) {}
      $('#rows').innerHTML = groups.filter(function (g) { return g.items.length; }).map(function (g) {
        return '<details class="grp" data-grp="' + g.id + '"' + (closed[g.id] ? '' : ' open') + '><summary><span class="grp-name">' + esc(g.name) + '</span><span class="grp-n">' + g.items.length + '</span></summary>' + g.items.map(rowHTML).join('') + '</details>';
      }).join('');
      $$('#rows details.grp').forEach(function (d) { d.addEventListener('toggle', function () { closed[d.getAttribute('data-grp')] = !d.open; try { localStorage.setItem('cv_grp_closed', JSON.stringify(closed)); } catch (e) {} }); });
    } else {
      var shown = list.slice(0, S.limit || 40);
      $('#rows').innerHTML = shown.map(rowHTML).join('') + (list.length > shown.length ? '<div class="rows-more"><button class="btn btn--ghost btn--sm" id="rowsMore">Show more (' + (list.length - shown.length) + ' more)</button></div>' : '');
      var more = $('#rowsMore'); if (more) more.onclick = function () { S.limit = (S.limit || 40) + 40; drawDash(); };
    }
    fillRowViews();
  }

  /* ---------- visitor stats (GoatCounter) ---------- */
  var EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
  var GC = { cache: {}, ok: null };
  try { localStorage.setItem('skipgc', 't'); } catch (e) {} // don't count the newsroom team's own visits on this device
  function gcCode() { return store.get('cv_gc_code') || (CFG.analytics && CFG.analytics.goatcounter) || 'cityvisiontv'; }
  function gcCount(path, start) {
    var key = path + '|' + (start || '');
    if (GC.cache[key]) return GC.cache[key];
    var u = 'https://' + gcCode() + '.goatcounter.com/counter/' + (path === 'TOTAL' ? 'TOTAL' : encodeURIComponent(path)) + '.json' + (start ? '?start=' + start : '');
    GC.cache[key] = fetch(u).then(function (r) {
      if (r.status === 404) return 0;           // page not viewed yet
      if (!r.ok) { var e = new Error('stats ' + r.status); e.status = r.status; throw e; }
      return r.json().then(function (d) { return parseInt(String(d.count || '0').replace(/[^0-9]/g, ''), 10) || 0; });
    });
    return GC.cache[key];
  }
  function fmtNum(n) { return n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '') + 'k' : n.toLocaleString('en-AU'); }
  function todayISO() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  /* ---------- storage meter (GitHub recommends keeping a site under 1 GB) ---------- */
  function drawStorage() {
    var box = $('#storage'); if (!box) return;
    gh('').then(function (repo) {
      var kb = +repo.size || 0; if (!kb) return;
      var LIMIT = 1024, PLAN = 700; // MB: GitHub's limit, and the point to start planning the move
      var mb = kb / 1024, pct = Math.min(100, mb / LIMIT * 100);
      var posts = S.index.length, base = 15; // roughly what the site code, logos and brand images take
      // until there are enough posts for a fair average, assume about 0.33 MB per post (photo + page)
      var per = posts >= 50 ? Math.min(2, Math.max(0.05, (mb - base) / posts)) : 0.33;
      var left = Math.max(0, Math.floor((PLAN - mb) / per));
      var lvl = mb >= PLAN ? 'hi' : mb >= PLAN * 0.7 ? 'mid' : 'ok';
      var pl = function (n) { return n.toLocaleString() + ' more post' + (n === 1 ? '' : 's'); };
      var fmt = function (v) { return v >= 100 ? Math.round(v) + ' MB' : v.toFixed(1) + ' MB'; };
      var msg = lvl === 'ok' ? 'Plenty of room. Roughly <b>' + pl(left) + '</b> before you need to think about moving photos.'
        : lvl === 'mid' ? 'Getting fuller. Roughly <b>' + pl(left) + '</b> before it’s time to move photos to Cloudflare. Worth planning the switch soon.'
        : 'Time to move photos to Cloudflare. The site still works, but you are close to GitHub’s 1 GB limit.';
      box.className = 'storage st-' + lvl; box.hidden = false;
      box.innerHTML = '<div class="sto-top"><b>Storage</b><span>' + fmt(mb) + ' of 1 GB used</span></div>' +
        '<div class="sto-bar"><i style="width:' + Math.max(1, pct).toFixed(1) + '%"></i><em style="left:' + (PLAN / LIMIT * 100) + '%" title="Plan the move here (700 MB)"></em></div>' +
        '<p>' + msg + '</p><small class="muted">' + (posts >= 50 ? 'About ' + (per * 1024 < 1000 ? Math.round(per * 1024) + ' KB' : per.toFixed(1) + ' MB') + ' per post on average · ' : 'Based on about 330 KB per post · ') + posts.toLocaleString() + ' posts · GitHub updates this figure every few hours.</small>';
    }, function () {});
  }
  function drawTraffic() {
    var host = $('#traffic'); if (!host) return;
    var dash = 'https://' + gcCode() + '.goatcounter.com';
    host.innerHTML = '<div class="tr-head"><h2>Visitors</h2><a class="btn btn--ghost btn--sm" href="' + dash + '" target="_blank" rel="noopener">Full stats &rarr;</a></div>' +
      '<div class="tr-cards">' + [['today', 'Today'], ['week', 'Past 7 days'], ['month', 'Past 30 days'], ['all', 'All time']].map(function (x) { return '<div class="tr-card"><b data-tr="' + x[0] + '">&hellip;</b><span>' + x[1] + '</span></div>'; }).join('') + '</div>' +
      '<div class="tr-top"><h3>Most read in the past 30 days</h3><ol id="trTop"><li class="muted">Loading&hellip;</li></ol></div>' +
      '<p class="tr-note muted">Views update every few hours. Visits from this device are not counted.</p>';
    Promise.all([gcCount('TOTAL', todayISO()), gcCount('TOTAL', 'week'), gcCount('TOTAL', 'month'), gcCount('TOTAL')]).then(function (v) {
      GC.ok = true;
      ['today', 'week', 'month', 'all'].forEach(function (k, i) { $('[data-tr="' + k + '"]').textContent = fmtNum(v[i]); });
      var pub = S.index.filter(function (p) { return p.status !== 'draft' && p.static; }).slice(0, 40);
      return Promise.all(pub.map(function (p) { return gcCount('/stories/' + p.id, 'month').then(function (n) { return { p: p, n: n }; }, function () { return { p: p, n: 0 }; }); }));
    }).then(function (rows) {
      if (!rows) return;
      rows = rows.filter(function (r) { return r.n > 0; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 5);
      $('#trTop').innerHTML = rows.length ? rows.map(function (r) { return '<li><a href="' + CV.postUrl(r.p, '') + '" target="_blank" rel="noopener">' + esc(r.p.title) + '</a><span>' + fmtNum(r.n) + ' views</span></li>'; }).join('') : '<li class="muted">No story views yet. Share a story to get things started!</li>';
      fillRowViews();
    }).catch(function () {
      GC.ok = false;
      host.innerHTML = '<div class="tr-setup"><h2>Visitor stats aren&rsquo;t connected yet</h2>' +
        '<ol><li>Sign up at <a href="https://www.goatcounter.com/signup" target="_blank" rel="noopener">goatcounter.com</a> and choose the code <b>' + esc(gcCode()) + '</b>.</li>' +
        '<li>In GoatCounter go to <b>Settings</b> and tick <b>&ldquo;Allow adding visitor counts on your website&rdquo;</b>, then save.</li>' +
        '<li>Come back here and refresh. Numbers appear once people start visiting.</li></ol>' +
        '<form class="tr-code" id="gcForm"><label for="gcCode">Signed up with a different code?</label><div><input id="gcCode" value="' + esc(gcCode()) + '" autocomplete="off"><button class="btn btn--indigo btn--sm">Save</button></div></form></div>';
      $('#gcForm').addEventListener('submit', function (e) { e.preventDefault(); var v = $('#gcCode').value.trim().toLowerCase().replace(/\.goatcounter\.com.*$/, '').replace(/^https?:\/\//, ''); if (v) { store.set('cv_gc_code', v); GC.cache = {}; drawTraffic(); } });
    });
  }
  function fillRowViews() {
    if (GC.ok !== true) return;
    $$('[data-views]').forEach(function (el) {
      if (el.getAttribute('data-done')) return; el.setAttribute('data-done', '1');
      gcCount('/stories/' + el.getAttribute('data-views')).then(function (n) { el.innerHTML = EYE + fmtNum(n) + (n === 1 ? ' view' : ' views'); }, function () {});
    });
  }
  $('#statusSeg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; S.filter = b.getAttribute('data-s'); $$('#statusSeg button').forEach(function (x) { x.classList.toggle('on', x === b); }); drawDash(); });
  $('#dashSearch').addEventListener('input', function (e) { S.q = e.target.value; drawDash(); });
  $('#rows').addEventListener('click', function (e) {
    var row = e.target.closest('.row'); if (!row) return;
    var id = row.getAttribute('data-id');
    if (e.target.closest('[data-edit]')) location.hash = '#edit/' + encodeURIComponent(id);
    if (e.target.closest('[data-del]')) removePost(id);
  });
  $$('[data-new]').forEach(function (b) { b.addEventListener('click', function () { location.hash = '#new/' + b.getAttribute('data-new'); }); });

  /* ---------- routing ---------- */
  function showView(id) {
    ['vDash', 'vEdit', 'vAds', 'vAdEdit', 'vAdPlace'].forEach(function (v) { $('#' + v).hidden = v !== id; });
    var tab = /Ad/.test(id) ? 'ads' : 'stories';
    $$('[data-nav]').forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-nav') === tab); });
    scrollTo(0, 0);
  }
  function route() {
    var h = location.hash.replace(/^#/, '').split('/');
    if (h[0] === 'new') { showView('vEdit'); return openEditor(null, h[1] || 'article'); }
    if (h[0] === 'edit' && h[1]) { showView('vEdit'); return openEditor(decodeURIComponent(h[1])); }
    if (h[0] === 'ads') {
      if (h[1] === 'new') { showView('vAdEdit'); return openAdEditor(null, h[2] || 'popup'); }
      if (h[1] === 'edit' && h[2]) { showView('vAdEdit'); return openAdEditor(decodeURIComponent(h[2])); }
      if (h[1] === 'placement') { showView('vAdPlace'); document.title = 'Ad placement | Newsroom'; return openPlacement(); }
      showView('vAds'); document.title = 'Ads | Newsroom'; return loadAds();
    }
    showView('vDash'); document.title = 'Newsroom | CityVision TV';
    loadIndex();
  }
  addEventListener('hashchange', function () {
    if (S.dirty && (!$('#vEdit').hidden || !$('#vAdEdit').hidden || !$('#vAdPlace').hidden) && !confirm('You have unsaved changes. Leave without saving? (A backup is kept on this device.)')) return;
    S.dirty = false; route();
  });
  addEventListener('beforeunload', function (e) { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- editor ---------- */
  function fillSelects() {
    $('#fCategory').innerHTML = CFG.categories.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + '</option>'; }).join('');
    $('#fShow').innerHTML = '<option value="">None</option>' + CFG.shows.map(function (s) { return '<option value="' + s.id + '">' + esc(s.name) + '</option>'; }).join('');
  }
  function toLocalInput(iso) { var d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); }
  function openEditor(id, type) {
    $('#vDash').hidden = true; $('#vEdit').hidden = false; scrollTo(0, 0);
    S.media = {}; S.heroData = ''; S.dirty = false;
    if (!id) {
      S.isNew = true;
      S.post = { id: '', type: type, title: '', summary: '', body: '', category: 'news', show: '', author: store.get('cv_author') || '', image: '', imageAlt: '', imageCaption: '', video: '', link: '', tags: [], featured: false, breaking: false, status: 'draft', date: new Date().toISOString() };
      fillForm(); maybeRestore('new');
      document.title = 'New ' + type + ' | Newsroom';
      return;
    }
    S.isNew = false;
    busy(true, 'Opening story…');
    var meta = S.index.filter(function (p) { return p.id === id; })[0];
    var go = meta ? Promise.resolve() : readFile('articles.json').then(function (t) { S.index = parseIndex(t); meta = S.index.filter(function (p) { return p.id === id; })[0]; });
    go.then(function () { return readFile('posts/' + id + '.json'); })
      .then(function (txt) {
        var full = txt ? CV.normalize(JSON.parse(txt)) : null;
        if (!full && !meta) throw new Error('Story not found');
        S.post = Object.assign({}, meta || {}, full || {});
        if (!S.post.body) S.post.body = meta && meta.summary ? '<p>' + esc(meta.summary) + '</p>' : '';
        fillForm(); maybeRestore(id);
        document.title = 'Edit: ' + S.post.title + ' | Newsroom';
      })
      .catch(function (e) { toast('Could not open story: ' + esc(e.message)); location.hash = ''; })
      .then(function () { busy(false); });
  }
  function fillForm() {
    var p = S.post;
    setType(p.type);
    $('#fTitle').value = p.title; $('#fSummary').value = p.summary || '';
    $('#fBody').innerHTML = toEditorHTML(p.body || '');
    $('#fVideo').value = p.video || '';
    $('#fDate').value = toLocalInput(p.date);
    $('#fFeatured').checked = !!p.featured; $('#fBreaking').checked = !!p.breaking; $('#fNoAds').checked = !!p.noAds;
    $('#fCategory').value = p.category || 'news'; $('#fShow').value = p.show || '';
    $('#fAuthor').value = p.author || ''; $('#fTags').value = (p.tags || []).join(', ');
    $('#fLink').value = p.link || '';
    $('#fAlt').value = p.imageAlt || ''; $('#fCaption').value = p.imageCaption || '';
    $('#fImageUrl').value = p.image && CV.isAbs(p.image) ? p.image : '';
    showHero(p.image ? CV.url('', p.image) : '');
    $('#edState').textContent = S.isNew ? 'New, not yet saved' : (p.status === 'draft' ? 'Draft' : 'Published ' + CV.fmtDate(p.date, true));
    $('#publishBtn').textContent = S.isNew || p.status === 'draft' ? 'Publish' : 'Update';
    $('#dangerBox').hidden = S.isNew;
    autoGrow($('#fTitle')); autoGrow($('#fSummary'));
    videoPreview(); counts(); socialPreview();
  }
  function setType(t) {
    S.post.type = t;
    $$('#typeSeg button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-t') === t); });
    $('#videoField').hidden = t !== 'video';
    $('#fBody').setAttribute('data-ph', t === 'update' ? 'Write a short update. A few sentences is perfect.' : 'Write your story here. Paste from Word or Google Docs and the formatting will be cleaned up automatically.');
  }
  $('#typeSeg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { setType(b.getAttribute('data-t')); dirty(); } });
  function autoGrow(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
  ['#fTitle', '#fSummary'].forEach(function (s) { $(s).addEventListener('input', function (e) { autoGrow(e.target); }); });

  var saveTimer;
  function dirty() {
    S.dirty = true; counts(); socialPreview();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem('cv_backup_' + (S.post.id || 'new'), JSON.stringify({ at: Date.now(), post: collect(true) })); $('#autosave').textContent = 'Backup saved on this device ' + CV.fmtTime(new Date().toISOString()); } catch (e) {}
    }, 1200);
  }
  $('#vEdit').addEventListener('input', function (e) { if (e.target.closest('.ed-main,.ed-side')) dirty(); });
  $('#vEdit').addEventListener('change', function (e) { if (e.target.closest('.ed-main,.ed-side')) dirty(); });
  function maybeRestore(key) {
    var raw; try { raw = localStorage.getItem('cv_backup_' + key); } catch (e) {}
    if (!raw) return;
    var b = JSON.parse(raw);
    if (!b || !b.post || Date.now() - b.at > 14 * 86400e3) return;
    if (!S.isNew && b.at < new Date(S.post.updated || S.post.date).getTime()) return;
    if (confirm('There are unsaved changes to this story from ' + CV.ago(new Date(b.at).toISOString()) + ' on this device. Restore them?')) {
      var keepId = S.post.id; S.post = Object.assign({}, S.post, b.post, { id: keepId }); fillForm(); S.dirty = true;
    }
  }
  function clearBackup() { try { localStorage.removeItem('cv_backup_' + (S.post.id || 'new')); localStorage.removeItem('cv_backup_new'); } catch (e) {} }

  function counts() {
    var w = CV.stripTags($('#fBody').innerHTML).split(' ').filter(Boolean).length;
    $('#wc').textContent = w + ' words · ' + Math.max(1, Math.round(w / 220)) + ' min read';
  }
  function socialPreview() {
    var p = { title: $('#fTitle').value || 'Your headline', summary: $('#fSummary').value, image: S.heroData || $('#fImageUrl').value || (S.post.image && !S.heroData ? S.post.image : ''), video: $('#fVideo').value, show: $('#fShow').value };
    $('#fbPrev').innerHTML = CV.media(p, '') + '<div class="fb-b"><small>cityvisiontv.com.au</small><b>' + esc(p.title) + '</b><span>' + esc(p.summary || 'Add a summary so people know what the story is about.') + '</span></div>';
  }
  function videoPreview() {
    var v = $('#fVideo').value.trim();
    $('#videoPrev').innerHTML = v ? (CV.ytId(v) || /facebook|fb\.watch/.test(v) ? CV.videoEmbed(v) : '<small class="muted">Paste a YouTube or Facebook link to preview it.</small>') : '';
  }
  $('#fVideo').addEventListener('change', videoPreview);
  $('#fImageUrl').addEventListener('change', function () { var v = $('#fImageUrl').value.trim(); if (v) { S.heroData = ''; delete S.media.hero; showHero(v); } socialPreview(); });

  /* ---------- images ---------- */
  function processImage(file, maxW) {
    return new Promise(function (resolve, reject) {
      if (!/^image\//.test(file.type)) return reject(new Error('Please choose an image file'));
      var img = new Image(), u = URL.createObjectURL(file);
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight, s = Math.min(1, maxW / w);
        var c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
        var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(u);
        var data = c.toDataURL('image/jpeg', 0.82);
        resolve({ dataUrl: data, base64: data.split(',')[1], w: c.width, h: c.height });
      };
      img.onerror = function () { reject(new Error('That image could not be read. Try a JPG or PNG.')); };
      img.src = u;
    });
  }
  function mediaPath(tag) {
    var d = new Date(), y = d.getFullYear(), m = ('0' + (d.getMonth() + 1)).slice(-2);
    var base = CV.slugify($('#fTitle').value || 'image').slice(0, 40);
    return 'media/' + y + '/' + m + '/' + base + '-' + tag + '-' + Date.now().toString(36) + '.jpg';
  }
  function showHero(src) {
    $('#dropImg').hidden = !src; $('#dropEmpty').hidden = !!src; $('#imgActions').hidden = !src;
    if (src) $('#dropImg').src = src;
  }
  function takeHero(file) {
    processImage(file, 1800).then(function (r) {
      var path = mediaPath('main');
      S.media.hero = { path: path, base64: r.base64 };
      S.heroData = r.dataUrl; $('#fImageUrl').value = '';
      showHero(r.dataUrl); dirty();
      toast('Photo ready (' + r.w + '×' + r.h + '). It will upload when you save.');
    }).catch(function (e) { toast(esc(e.message)); });
  }
  $('#imgFile').addEventListener('change', function (e) { if (e.target.files[0]) takeHero(e.target.files[0]); e.target.value = ''; });
  var drop = $('#drop');
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { var f = e.dataTransfer.files[0]; if (f) takeHero(f); });
  $('#imgRemove').addEventListener('click', function (e) { e.preventDefault(); delete S.media.hero; S.heroData = ''; S.post.image = ''; $('#fImageUrl').value = ''; showHero(''); dirty(); });

  /* ---------- rich text editor ---------- */
  var ed = $('#fBody');
  function exec(cmd, val) { ed.focus(); document.execCommand(cmd, false, val); dirty(); }
  document.execCommand('defaultParagraphSeparator', false, 'p');
  $('#rteBar').addEventListener('mousedown', function (e) { if (e.target.closest('button')) e.preventDefault(); });
  $('#rteBar').addEventListener('change', function (e) { if (e.target.getAttribute('data-cmd') === 'block') { exec('formatBlock', '<' + e.target.value + '>'); } });
  $('#rteBar').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var c = b.getAttribute('data-cmd');
    if (c === 'link') { var u = prompt('Link address (https://…)'); if (u) exec('createLink', /^https?:|^mailto:/.test(u) ? u : 'https://' + u); }
    else if (c === 'quote') exec('formatBlock', '<blockquote>');
    else if (c === 'hr') exec('insertHorizontalRule');
    else if (c === 'image') { var i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = function () { if (i.files[0]) inlineImage(i.files[0]); }; i.click(); }
    else if (c === 'video') { var v = prompt('Paste a YouTube or Facebook video link'); if (v) exec('insertHTML', embedPlaceholder(v) + '<p><br></p>'); }
    else exec(c);
  });
  function embedPlaceholder(u) { return '<div class="cv-embed" data-video="' + esc(u) + '" contenteditable="false">Video: ' + esc(u) + '</div>'; }
  function inlineImage(file) {
    processImage(file, 1400).then(function (r) {
      var path = mediaPath('img');
      S.media[path] = { path: path, base64: r.base64 };
      var cap = prompt('Caption for this photo (optional)') || '';
      exec('insertHTML', '<figure><img src="' + r.dataUrl + '" data-path="/' + path + '" alt="' + esc(cap) + '">' + (cap ? '<figcaption>' + esc(cap) + '</figcaption>' : '') + '</figure><p><br></p>');
    }).catch(function (e) { toast(esc(e.message)); });
  }
  ed.addEventListener('paste', function (e) {
    var cd = e.clipboardData; if (!cd) return;
    var f = Array.prototype.slice.call(cd.files || []).filter(function (x) { return /^image\//.test(x.type); })[0];
    if (f) { e.preventDefault(); inlineImage(f); return; }
    var html = cd.getData('text/html'), text = cd.getData('text/plain');
    e.preventDefault();
    if (html) exec('insertHTML', clean(html));
    else if (text) exec('insertHTML', text.split(/\n{2,}/).map(function (p) { return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>'; }).join(''));
  });
  ed.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('[data-cmd=link]').click(); }
  });

  // Allow-list cleaner used for pasting and for saving
  var OK = { P: 1, BR: 1, STRONG: 1, B: 1, EM: 1, I: 1, U: 1, A: 1, H2: 1, H3: 1, UL: 1, OL: 1, LI: 1, BLOCKQUOTE: 1, FIGURE: 1, FIGCAPTION: 1, IMG: 1, HR: 1, DIV: 1 };
  var MAP = { H1: 'H2', H4: 'H3', H5: 'H3', H6: 'H3' };
  function clean(html, forSave) {
    var doc = new DOMParser().parseFromString('<div id="r">' + html + '</div>', 'text/html');
    var root = doc.getElementById('r');
    (function walk(n) {
      Array.prototype.slice.call(n.childNodes).forEach(function (el) {
        if (el.nodeType === 8) { el.remove(); return; }
        if (el.nodeType !== 1) return;
        var tag = el.tagName;
        if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|FORM|META|LINK|TITLE|svg)$/i.test(tag)) { el.remove(); return; }
        if (tag === 'DIV' && el.classList.contains('cv-embed')) {
          var v = el.getAttribute('data-video') || '';
          var nd = doc.createElement('div'); nd.className = 'cv-embed'; nd.setAttribute('data-video', v);
          if (!forSave) { nd.setAttribute('contenteditable', 'false'); nd.textContent = 'Video: ' + v; }
          el.replaceWith(nd); return;
        }
        if (MAP[tag]) { var h = doc.createElement(MAP[tag]); while (el.firstChild) h.appendChild(el.firstChild); el.replaceWith(h); el = h; tag = h.tagName; }
        if (tag === 'DIV') { var p = doc.createElement('p'); while (el.firstChild) p.appendChild(el.firstChild); el.replaceWith(p); el = p; tag = 'P'; }
        if (!OK[tag]) { walk(el); var frag = doc.createDocumentFragment(); while (el.firstChild) frag.appendChild(el.firstChild); el.replaceWith(frag); return; }
        if (tag === 'B') { var s = doc.createElement('strong'); while (el.firstChild) s.appendChild(el.firstChild); el.replaceWith(s); el = s; }
        if (tag === 'I') { var em = doc.createElement('em'); while (el.firstChild) em.appendChild(el.firstChild); el.replaceWith(em); el = em; }
        var keep = {};
        if (el.tagName === 'A') keep.href = 1;
        if (el.tagName === 'IMG') { keep.src = 1; keep.alt = 1; keep['data-path'] = 1; }
        Array.prototype.slice.call(el.attributes).forEach(function (a) { if (!keep[a.name] || /^\s*javascript:/i.test(a.value)) el.removeAttribute(a.name); });
        if (el.tagName === 'IMG' && forSave) {
          var dp = el.getAttribute('data-path'); if (dp) el.setAttribute('src', dp); el.removeAttribute('data-path');
          if (/^data:/.test(el.getAttribute('src') || '')) { el.remove(); return; }
        }
        walk(el);
      });
    })(root);
    // wrap stray top-level text / inline elements in paragraphs
    var INLINE = { STRONG: 1, EM: 1, A: 1, U: 1, BR: 1, SPAN: 1, B: 1, I: 1 }, cur = null;
    Array.prototype.slice.call(root.childNodes).forEach(function (n) {
      var inline = n.nodeType === 3 ? n.textContent.trim() !== '' || cur : (n.nodeType === 1 && INLINE[n.tagName]);
      if (inline) { if (!cur) { cur = doc.createElement('p'); root.insertBefore(cur, n); } cur.appendChild(n); }
      else { if (n.nodeType === 3) n.remove(); cur = null; }
    });
    // drop empty paragraphs
    $$('p', root).forEach(function (p) { if (!p.textContent.trim() && !p.querySelector('img,br')) p.remove(); });
    var out = root.innerHTML.replace(/<p><br><\/p>/g, '').replace(/&nbsp;/g, ' ');
    return out;
  }
  function toEditorHTML(body) {
    var html = clean(body || '');
    // show pending (not yet uploaded) images from memory
    return html.replace(/src="\/(media\/[^"]+)"/g, function (m, p) { return S.media[p] ? 'src="data:image/jpeg;base64,' + S.media[p].base64 + '" data-path="/' + p + '"' : m; });
  }

  /* ---------- collect + validate ---------- */
  function collect(loose) {
    var p = Object.assign({}, S.post);
    p.title = $('#fTitle').value.trim();
    p.summary = $('#fSummary').value.trim();
    p.body = clean($('#fBody').innerHTML, true);
    p.video = $('#fVideo').value.trim();
    var dv = $('#fDate').value; p.date = dv ? new Date(dv).toISOString() : new Date().toISOString();
    p.featured = $('#fFeatured').checked; p.breaking = $('#fBreaking').checked; p.noAds = $('#fNoAds').checked;
    p.category = $('#fCategory').value; p.show = $('#fShow').value;
    p.author = $('#fAuthor').value.trim();
    p.tags = $('#fTags').value.split(',').map(function (t) { return t.trim(); }).filter(Boolean).slice(0, 12);
    p.link = $('#fLink').value.trim();
    p.imageAlt = $('#fAlt').value.trim(); p.imageCaption = $('#fCaption').value.trim();
    var iu = $('#fImageUrl').value.trim();
    if (S.media.hero) p.image = S.media.hero.path; else if (iu) p.image = iu; else if (CV.isAbs(S.post.image)) p.image = '';
    p.readMins = CV.readMins(p.body);
    if (!loose) {
      if (!p.title) throw new Error('Please add a headline.');
      if (p.type === 'video' && !p.video) throw new Error('Please paste the video link for this video post.');
      if (p.type !== 'update' && !p.summary) p.summary = CV.stripTags(p.body).slice(0, 200).replace(/\s\S*$/, '') + (CV.stripTags(p.body).length > 200 ? '…' : '');
      if (p.type === 'update' && !p.summary) p.summary = CV.stripTags(p.body).slice(0, 200);
    }
    return p;
  }
  function uniqueId(title, index) {
    var base = CV.slugify(title);
    if (base === 'story') base = 'story-' + new Date().toISOString().slice(0, 10);
    var id = base, n = 2, taken = {};
    index.forEach(function (p) { taken[p.id] = 1; });
    while (taken[id]) id = base + '-' + n++;
    return id;
  }

  /* ---------- save / publish ---------- */
  function save(status) {
    var p;
    try { p = collect(); } catch (e) { toast(esc(e.message)); return; }
    p.status = status;
    if (!S.isNew) p.updated = new Date().toISOString();
    var verb = status === 'draft' ? 'Saving draft…' : (S.isNew || S.post.status === 'draft' ? 'Publishing…' : 'Updating…');
    busy(true, verb, 'Uploading ' + (Object.keys(S.media).length ? 'photos and ' : '') + 'story to the website');
    if (p.author) store.set('cv_author', p.author);
    var media = S.media;
    transact(function (index, head) {
      var files = [];
      var existing = S.isNew ? null : index.filter(function (x) { return x.id === p.id; })[0];
      if (S.isNew && !p.id) p.id = uniqueId(p.title, index);
      if (!S.isNew && !existing) { /* was deleted elsewhere — re-create */ }
      p.json = true;
      // media
      Object.keys(media).forEach(function (k) { var m = media[k]; if (p.body.indexOf(m.path) > -1 || p.image === m.path) files.push({ path: m.path, content: m.base64, base64: true }); });
      // only one lead story at a time
      if (p.featured) index.forEach(function (x) { if (x.id !== p.id && x.featured) x.featured = false; });
      var wasStatic = existing && existing.static;
      p.static = status !== 'draft';
      var full = Object.assign({}, p);
      files.push({ path: 'posts/' + p.id + '.json', content: JSON.stringify(full, null, 1) + '\n' });
      if (p.static) files.push({ path: 'stories/' + p.id + '.html', content: CV.storyPage(full) });
      else if (wasStatic) files.push({ path: 'stories/' + p.id + '.html', remove: true });
      var entry = Object.assign({}, p); delete entry.body;
      var nextIndex = index.filter(function (x) { return x.id !== p.id; }); nextIndex.push(entry);
      nextIndex.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
      files = files.concat(siteFiles(nextIndex));
      S._nextIndex = nextIndex;
      return { files: files, message: (status === 'draft' ? 'Draft: ' : (S.isNew ? 'Publish: ' : 'Update: ')) + p.title };
    }).then(function () {
      busy(false);
      S.index = S._nextIndex; S.dirty = false; S.media = {}; S.heroData = '';
      clearBackup();
      var wasNew = S.isNew;
      S.isNew = false; S.post = p;
      history.replaceState(null, '', '#edit/' + encodeURIComponent(p.id));
      fillForm();
      if (status === 'draft') toast('Draft saved. Only the newsroom can see it.');
      else {
        var link = CV.postUrl(p, '');
        toast('<b>' + (wasNew ? 'Published!' : 'Updated!') + '</b> It will be live on the site in about a minute. <a href="' + link + '" target="_blank" rel="noopener">View story</a>', 9000);
        waitLive(link);
      }
    }).catch(function (e) {
      busy(false);
      toast('Could not save: ' + esc(e.message) + '. Your work is backed up on this device, so you can try again.', 9000);
      console.error(e);
    });
  }
  function waitLive(link) {
    var n = 0;
    (function poll() {
      if (++n > 18) return;
      setTimeout(function () {
        fetch(link + (link.indexOf('?') > -1 ? '&' : '?') + 'check=' + Date.now(), { method: 'HEAD', cache: 'no-store' }).then(function (r) {
          if (r.ok) { $('#edState').textContent = 'Live on the website now'; toast('Your story is live. <a href="' + link + '" target="_blank" rel="noopener">Open it</a>', 7000); }
          else poll();
        }).catch(poll);
      }, 10000);
    })();
  }
  $('#publishBtn').addEventListener('click', function () { save('published'); });
  $('#draftBtn').addEventListener('click', function () { save('draft'); });
  $('#backBtn').addEventListener('click', function () { location.hash = ''; });
  $('#deleteBtn').addEventListener('click', function () { removePost(S.post.id); });

  function removePost(id) {
    var meta = S.index.filter(function (p) { return p.id === id; })[0];
    if (!confirm('Delete “' + (meta ? meta.title : id) + '”? It will be removed from the website.')) return;
    busy(true, 'Deleting…');
    transact(function (index) {
      var ex = index.filter(function (p) { return p.id === id; })[0];
      var next = index.filter(function (p) { return p.id !== id; });
      var files = siteFiles(next);
      if (ex && ex.json) files.push({ path: 'posts/' + id + '.json', remove: true });
      if (ex && ex.static) files.push({ path: 'stories/' + id + '.html', remove: true });
      S._nextIndex = next;
      return { files: files, message: 'Delete: ' + (ex ? ex.title : id) };
    }).then(function () {
      busy(false); S.index = S._nextIndex; S.dirty = false;
      toast('Deleted. It will disappear from the site within a minute.');
      if (location.hash) location.hash = ''; else drawDash();
    }).catch(function (e) { busy(false); toast('Could not delete: ' + esc(e.message), 8000); });
  }


  /* ==========================================================
     ADS: full-screen pop-ups, small pop-ups and side banners,
     saved in ads.json. Each ad's "target" says where it runs:
       home: true/false            (front page)
       mode: all | groups | stories | none   (articles)
       sections, shows, stories, exclude     (lists of ids)
     ========================================================== */
  var A = { data: null, ad: null, img: null, img2: null };
  var AD_TYPES = {
    fullscreen: { name: 'Full-screen pop-up', tier: 'Premium', cls: 't1', maxW: 1600, hint: 'Computers: 1600 &times; 900 px (16:9)' },
    popup: { name: 'Small pop-up', tier: 'Standard', cls: 't2', maxW: 1200, hint: 'Recommended: 1200 &times; 800 px (3:2)' },
    banner: { name: 'Side banner', tier: 'Basic', cls: 't3', maxW: 600, hint: 'Recommended: 600 &times; 500 px, or 600 &times; 1200 px for a tall banner' }
  };
  function emptyAds() { return { enabled: true, ads: [] }; }
  function normTarget(t) {
    t = Object.assign({ home: false, mode: 'all', sections: [], shows: [], stories: [], exclude: [] }, t || {});
    ['sections', 'shows', 'stories', 'exclude'].forEach(function (k) { if (!Array.isArray(t[k])) t[k] = []; });
    return t;
  }
  function parseAds(t) {
    var d; try { d = t ? JSON.parse(t) : emptyAds(); } catch (e) { d = emptyAds(); }
    d.ads = (d.ads || []).map(function (a) { a.target = normTarget(a.target); a.type = AD_TYPES[a.type] ? a.type : 'popup'; return a; });
    if (d.enabled === undefined) d.enabled = true;
    return d;
  }
  function adsJSON(d) { return JSON.stringify({ enabled: d.enabled !== false, updated: new Date().toISOString(), ads: d.ads }, null, 1) + '\n'; }
  function adStatus(a) {
    var today = todayISO();
    if (!a.active) return ['paused', 'Paused'];
    if (a.start && a.start > today) return ['sched', 'Starts ' + CV.fmtShort(a.start)];
    if (a.end && a.end < today) return ['ended', 'Ended'];
    return ['live', 'Running'];
  }
  // Does this ad run on this story? (same rules as the website)
  function adOnStory(a, p) {
    var t = a.target;
    if (t.mode === 'none') return false;
    if (t.mode === 'stories') return t.stories.indexOf(p.id) > -1;
    if (t.exclude.indexOf(p.id) > -1) return false;
    if (t.mode === 'groups') return t.sections.indexOf(p.category) > -1 || (!!p.show && t.shows.indexOf(p.show) > -1);
    return true;
  }
  function adWhere(a) {
    var t = a.target, parts = [];
    if (t.home) parts.push('Front page');
    if (t.mode === 'all') parts.push(t.exclude.length ? 'All articles except ' + t.exclude.length : 'All articles');
    else if (t.mode === 'stories') parts.push(t.stories.length + ' chosen article' + (t.stories.length === 1 ? '' : 's'));
    else if (t.mode === 'groups') {
      var names = t.sections.map(function (id) { var c = CV.catById(id); return c ? c.name : id; }).concat(t.shows.map(function (id) { var x = CV.showById(id); return x ? x.name : id; }));
      parts.push(names.length ? names.join(', ') : 'No sections chosen');
    }
    return parts.length ? parts.join(' + ') : 'Not placed anywhere yet';
  }
  function saveAds(change, message, files) {
    busy(true, 'Saving…', 'Updating ads on the website');
    return transact(function (index, head) {
      return readFile('ads.json', head).then(function (t) {
        var d = parseAds(t); change(d); A.data = d;
        return { files: (files || []).concat([{ path: 'ads.json', content: adsJSON(d) }]), message: message };
      });
    }).then(function () { busy(false); }, function (e) { busy(false); toast('Could not save: ' + esc(e.message), 8000); throw e; });
  }
  function ensureIndex() { return S.index.length ? Promise.resolve() : readFile('articles.json').then(function (t) { S.index = parseIndex(t).sort(function (a, b) { return new Date(b.date) - new Date(a.date); }); }); }
  function loadAds() {
    $('#adRows').innerHTML = '<div class="sk" style="height:200px"></div>';
    return ensureIndex().then(function () { return readFile('ads.json'); }).then(function (t) { A.data = parseAds(t); drawAds(); })
      .catch(function (e) { $('#adRows').innerHTML = '<div class="rows-empty">Could not load ads: ' + esc(e.message) + '</div>'; });
  }
  function drawAds() {
    var d = A.data;
    $('#adsMaster').innerHTML = '<div><b>Ads on the website</b><span class="muted">' + (d.enabled ? 'Ads are showing on the site.' : 'All ads are switched off. Nothing will show until you turn this back on.') + '</span></div>' +
      '<button class="switch' + (d.enabled ? ' on' : '') + '" id="adsMasterBtn" role="switch" aria-checked="' + !!d.enabled + '"><span></span>' + (d.enabled ? 'ON' : 'OFF') + '</button>';
    $('#adsMasterBtn').onclick = function () {
      var to = !A.data.enabled;
      saveAds(function (x) { x.enabled = to; }, to ? 'Ads: switched on' : 'Ads: switched off').then(function () { drawAds(); toast(to ? 'Ads are on. They will show within a couple of minutes.' : 'All ads switched off. They will disappear within a couple of minutes.'); });
    };
    if (!d.ads.length) { $('#adRows').innerHTML = '<div class="rows-empty">No ads yet. Add a <b>full-screen pop-up</b>, <b>small pop-up</b> or <b>side banner</b> using the buttons above.</div>'; return; }
    var order = { fullscreen: 0, popup: 1, banner: 2 };
    var list = d.ads.slice().sort(function (a, b) { return order[a.type] - order[b.type]; });
    $('#adRows').innerHTML = list.map(function (a) {
      var st = adStatus(a), ty = AD_TYPES[a.type];
      return '<div class="row ad-row" data-ad="' + esc(a.id) + '"><div class="media ad-thumb">' + (a.image ? '<img src="' + esc(CV.url('', a.image)) + '" alt="">' : '') + '</div>' +
        '<div><div class="row-t" data-adedit>' + esc(a.name || 'Untitled ad') + '</div><div class="row-m"><span class="tier ' + ty.cls + '">' + ty.name + '</span><span>' + esc(adWhere(a)) + '</span>' +
        (a.start || a.end ? '<span>· ' + (a.start ? CV.fmtShort(a.start) : 'Now') + ' to ' + (a.end ? CV.fmtShort(a.end) : 'no end') + '</span>' : '') +
        '<span class="views" data-adstats="' + esc(a.id) + '"></span></div></div>' +
        '<div class="row-st"><span class="pill st-' + st[0] + '">' + st[1] + '</span></div>' +
        '<div><button class="switch sm' + (a.active ? ' on' : '') + '" data-adtoggle role="switch" aria-checked="' + !!a.active + '" title="Turn this ad on or off"><span></span>' + (a.active ? 'ON' : 'OFF') + '</button></div>' +
        '<div class="row-act"><button data-adedit>Edit</button><button class="del" data-addel>Delete</button></div></div>';
    }).join('');
    $$('[data-adstats]').forEach(function (el) {
      var id = el.getAttribute('data-adstats');
      Promise.all([gcCount('ad-view-' + id), gcCount('ad-click-' + id)]).then(function (v) { el.innerHTML = EYE + fmtNum(v[0]) + ' views · ' + fmtNum(v[1]) + ' clicks'; }, function () {});
    });
  }
  $('#adRows').addEventListener('click', function (e) {
    var row = e.target.closest('[data-ad]'); if (!row) return;
    var id = row.getAttribute('data-ad'), ad = A.data.ads.filter(function (a) { return a.id === id; })[0];
    if (e.target.closest('[data-adedit]')) location.hash = '#ads/edit/' + encodeURIComponent(id);
    if (e.target.closest('[data-adtoggle]')) {
      var to = !ad.active;
      saveAds(function (d) { d.ads.forEach(function (a) { if (a.id === id) a.active = to; }); }, (to ? 'Ad on: ' : 'Ad paused: ') + ad.name).then(function () { drawAds(); toast(to ? 'Ad turned on.' : 'Ad paused.'); });
    }
    if (e.target.closest('[data-addel]')) deleteAd(id);
  });
  $$('[data-newad]').forEach(function (b) { b.addEventListener('click', function () { location.hash = '#ads/new/' + b.getAttribute('data-newad'); }); });
  $('#adBack').addEventListener('click', function () { location.hash = '#ads'; });

  function deleteAd(id) {
    var ad = (A.data.ads || []).filter(function (a) { return a.id === id; })[0];
    if (!confirm('Delete the ad “' + (ad ? ad.name : id) + '”? It will be removed from the website.')) return;
    saveAds(function (d) { d.ads = d.ads.filter(function (a) { return a.id !== id; }); }, 'Ad deleted: ' + (ad ? ad.name : id)).then(function () { S.dirty = false; toast('Ad deleted.'); if (location.hash !== '#ads') location.hash = '#ads'; else drawAds(); });
  }
  $('#adDelete').addEventListener('click', function () { deleteAd(A.ad.id); });

  /* ---------- ad editor ---------- */
  function openAdEditor(id, type) {
    A.img = null; A.img2 = null; S.dirty = false;
    Promise.all([A.data ? Promise.resolve() : loadAds(), ensureIndex()]).then(function () {
      var ex = id ? A.data.ads.filter(function (a) { return a.id === id; })[0] : null;
      if (id && !ex) { toast('Ad not found'); location.hash = '#ads'; return; }
      A.ad = ex ? JSON.parse(JSON.stringify(ex)) : { id: '', type: AD_TYPES[type] ? type : 'popup', name: '', title: '', text: '', button: 'Learn more', link: '', image: '', imageMobile: '', start: '', end: '', active: true, target: normTarget({ home: type === 'fullscreen', mode: 'all' }) };
      A.isNew = !ex;
      fillAdForm();
    });
  }
  function fillAdForm() {
    var a = A.ad, t = a.target;
    setAdType(a.type);
    $('#aActive').checked = a.active !== false;
    $('#aName').value = a.name || ''; $('#aTitle').value = a.title || ''; $('#aText').value = a.text || ''; $('#aBtn').value = a.button || ''; $('#aLink').value = a.link || '';
    $('#aStart').value = a.start || ''; $('#aEnd').value = a.end || '';
    $('#aHome').checked = !!t.home;
    $$('input[name=aMode]').forEach(function (r) { r.checked = r.value === t.mode; });
    $('#aGroups').innerHTML = '<div class="tb-col"><b>Sections</b>' + CFG.categories.map(function (c) { return '<label><input type="checkbox" data-sec="' + c.id + '"' + (t.sections.indexOf(c.id) > -1 ? ' checked' : '') + '> ' + esc(c.name) + '</label>'; }).join('') + '</div>' +
      '<div class="tb-col"><b>Shows</b>' + CFG.shows.map(function (x) { return '<label><input type="checkbox" data-show="' + x.id + '"' + (t.shows.indexOf(x.id) > -1 ? ' checked' : '') + '> ' + esc(x.name) + '</label>'; }).join('') + '</div>';
    $('#aStorySec').innerHTML = '<option value="">All sections</option>' + CFG.categories.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + '</option>'; }).join('');
    $('#aStorySearch').value = '';
    drawStoryChecks(); showTargetBox();
    showAdImg(a.image ? CV.url('', a.image) : ''); showAdImg2(a.imageMobile ? CV.url('', a.imageMobile) : '');
    $('#adState').textContent = A.isNew ? 'New ad, not yet saved' : 'Editing: ' + (a.name || 'ad');
    $('#adDangerBox').hidden = A.isNew;
    adPreview();
  }
  function storyPool() {
    var q = ($('#aStorySearch').value || '').toLowerCase(), sec = $('#aStorySec').value;
    return S.index.filter(function (p) { return p.status !== 'draft'; }).filter(function (p) { return (!q || p.title.toLowerCase().indexOf(q) > -1) && (!sec || p.category === sec); });
  }
  function drawStoryChecks() {
    var chosen = A.ad.target.stories, list = storyPool();
    $('#aStoryList').innerHTML = list.map(function (p) { var c = CV.catById(p.category); return '<label><input type="checkbox" data-story="' + esc(p.id) + '"' + (chosen.indexOf(p.id) > -1 ? ' checked' : '') + '> <span>' + esc(p.title) + '</span><small>' + (c ? esc(c.name) + ' · ' : '') + CV.fmtShort(p.date) + '</small></label>'; }).join('') || '<p class="muted">No articles found.</p>';
    $('#aSelCount').textContent = chosen.length + ' selected';
  }
  $('#aStoryList').addEventListener('change', function (e) {
    var c = e.target.closest('[data-story]'); if (!c) return;
    var id = c.getAttribute('data-story'), list = A.ad.target.stories, i = list.indexOf(id);
    if (c.checked && i < 0) list.push(id); if (!c.checked && i > -1) list.splice(i, 1);
    $('#aSelCount').textContent = list.length + ' selected'; S.dirty = true;
  });
  $('#aStorySearch').addEventListener('input', drawStoryChecks);
  $('#aStorySec').addEventListener('change', drawStoryChecks);
  $('#aSelAll').addEventListener('click', function () { var t = A.ad.target; storyPool().forEach(function (p) { if (t.stories.indexOf(p.id) < 0) t.stories.push(p.id); }); drawStoryChecks(); S.dirty = true; });
  $('#aSelNone').addEventListener('click', function () { A.ad.target.stories = []; drawStoryChecks(); S.dirty = true; });
  function showTargetBox() {
    var m = ($$('input[name=aMode]').filter(function (r) { return r.checked; })[0] || {}).value || 'all';
    $('#aGroups').hidden = m !== 'groups'; $('#aStories').hidden = m !== 'stories';
    var ex = A.ad.target.exclude.length;
    $('#aExclNote').hidden = !(ex && m === 'all');
    $('#aExclNote').textContent = ex + ' article' + (ex === 1 ? ' is' : 's are') + ' switched off for this ad in the placement table.';
  }
  function collectTargets() {
    var t = A.ad.target;
    t.home = $('#aHome').checked;
    t.mode = ($$('input[name=aMode]').filter(function (r) { return r.checked; })[0] || {}).value || 'all';
    t.sections = $$('[data-sec]').filter(function (c) { return c.checked; }).map(function (c) { return c.getAttribute('data-sec'); });
    t.shows = $$('[data-show]').filter(function (c) { return c.checked; }).map(function (c) { return c.getAttribute('data-show'); });
  }
  function setAdType(t) {
    A.ad.type = t;
    $$('#adType button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-t') === t); });
    $$('.popup-only').forEach(function (el) { el.hidden = t === 'banner'; });
    $$('.fs-only').forEach(function (el) { el.hidden = t !== 'fullscreen'; });
    $$('.opt-fs').forEach(function (el) { el.hidden = t !== 'fullscreen'; });
    $('#aSizeHint').innerHTML = AD_TYPES[t].hint;
    var lab = $('#aDropLabel'); if (lab) lab.textContent = t === 'fullscreen' ? 'Drop the main (computer) image here' : 'Drop the ad image here';
  }
  $('#adType').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; setAdType(b.getAttribute('data-t')); S.dirty = true; adPreview(); });
  $('#vAdEdit').addEventListener('input', function (e) { if (e.target.closest('.ad-form') && !e.target.closest('#aStories')) { S.dirty = true; adPreview(); } });
  $('#vAdEdit').addEventListener('change', function (e) { if (e.target.name === 'aMode') showTargetBox(); if (!e.target.closest('#aStories')) { S.dirty = true; adPreview(); } });
  function showAdImg(src) { $('#aImg').hidden = !src; $('#aDropEmpty').hidden = !!src; if (src) $('#aImg').src = src; }
  function showAdImg2(src) { $('#aImg2').hidden = !src; $('#aDropEmpty2').hidden = !!src; $('#aImg2Actions').hidden = !src; if (src) $('#aImg2').src = src; }
  function processAdImage(file, maxW, cb) {
    if (!/^image\//.test(file.type)) return toast('Please choose an image file');
    var keepPng = /png/.test(file.type), img = new Image(), u = URL.createObjectURL(file);
    img.onload = function () {
      var sc = Math.min(1, maxW / img.naturalWidth), c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
      var x = c.getContext('2d'); if (!keepPng) { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); } x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u);
      var data = keepPng ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.9);
      cb({ path: 'media/ads/' + CV.slugify($('#aName').value || 'ad').slice(0, 40) + '-' + Date.now().toString(36) + '.' + (keepPng ? 'png' : 'jpg'), base64: data.split(',')[1], dataUrl: data, w: c.width, h: c.height });
    };
    img.onerror = function () { toast('That image could not be read. Try a JPG or PNG.'); };
    img.src = u;
  }
  function takeAdImage(file) { processAdImage(file, AD_TYPES[A.ad.type].maxW, function (r) { A.img = r; showAdImg(r.dataUrl); S.dirty = true; adPreview(); toast('Image ready (' + r.w + '×' + r.h + '). It uploads when you save.'); }); }
  function takeAdImage2(file) { processAdImage(file, 1080, function (r) { r.path = r.path.replace(/(\.\w+)$/, '-phone$1'); A.img2 = r; showAdImg2(r.dataUrl); S.dirty = true; adPreview(); toast('Phone image ready (' + r.w + '×' + r.h + ').'); }); }
  function wireDrop(dropSel, inputSel, fn) {
    var dz = $(dropSel); if (!dz) return;
    $(inputSel).addEventListener('change', function (e) { if (e.target.files[0]) fn(e.target.files[0]); e.target.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('over'); }); });
    dz.addEventListener('drop', function (e) { var f = e.dataTransfer.files[0]; if (f) fn(f); });
  }
  wireDrop('#aDrop', '#aFile', takeAdImage);
  wireDrop('#aDrop2', '#aFile2', takeAdImage2);
  $('#aImg2Remove').addEventListener('click', function (e) { e.preventDefault(); A.img2 = null; A.ad.imageMobile = ''; showAdImg2(''); S.dirty = true; adPreview(); });

  function collectAd() {
    var a = A.ad;
    a.active = $('#aActive').checked;
    a.name = $('#aName').value.trim(); a.title = $('#aTitle').value.trim(); a.text = $('#aText').value.trim(); a.button = $('#aBtn').value.trim();
    var l = $('#aLink').value.trim(); a.link = l && !/^https?:\/\//.test(l) ? 'https://' + l : l;
    a.start = $('#aStart').value; a.end = $('#aEnd').value;
    collectTargets();
    if (A.img) a.image = A.img.path;
    if (A.img2) a.imageMobile = A.img2.path;
    return a;
  }
  function adPreview() {
    var a = collectAd(), src = A.img ? A.img.dataUrl : (a.image ? CV.url('', a.image) : ''), src2 = A.img2 ? A.img2.dataUrl : (a.imageMobile ? CV.url('', a.imageMobile) : '');
    var ph = function (txt, ratio) { return '<div class="ad-ph" style="aspect-ratio:' + ratio + '">' + txt + '</div>'; };
    var text = '<b>' + esc(a.title || (a.type === 'fullscreen' ? '' : 'Your headline')) + '</b>' + ((a.text || a.type !== 'fullscreen') ? '<p>' + esc(a.text || 'A line or two about the offer.') + '</p>' : '') + ((a.button || a.type !== 'fullscreen') && a.type !== 'banner' ? '<span class="cv-pop-btn">' + esc(a.button || 'Learn more') + '</span>' : '');
    if (a.type === 'fullscreen') {
      var hasText = a.title || a.text || a.button;
      $('#adPrev').innerHTML = '<div class="fs-mock"><div class="cv-fs-card"><button class="cv-pop-x" type="button">&times;</button><span class="cv-ad-label">Advertisement</span>' + (src ? '<img src="' + src + '" alt="">' : ph('Main image (1600 &times; 900)', '16/9')) +
        (hasText ? '<div class="cv-pop-b">' + text + '</div>' : '') + '</div></div>' +
        (src2 ? '<p class="muted" style="font-size:12.5px;margin:12px 0 6px">On phones:</p><div class="fs-mock fs-mock--phone"><div class="cv-fs-card"><img src="' + src2 + '" alt="">' + (hasText ? '<div class="cv-pop-b">' + text + '</div>' : '') + '</div></div>' : '');
    } else if (a.type === 'popup') {
      $('#adPrev').innerHTML = '<div class="cv-pop cv-pop--preview"><button class="cv-pop-x" type="button" aria-label="Close">&times;</button><span class="cv-ad-label">Advertisement</span>' + (src ? '<img src="' + src + '" alt="">' : ph('Your image (1200 &times; 800)', '3/2')) + '<div class="cv-pop-b">' + text + '</div></div>';
    } else {
      $('#adPrev').innerHTML = '<div class="cv-banner"><span class="cv-ad-label">Advertisement</span>' + (src ? '<img src="' + src + '" alt="">' : ph('Your banner (600 &times; 500)', '6/5')) + '</div>';
    }
  }
  $('#adSave').addEventListener('click', function () {
    var a = collectAd(), t = a.target;
    if (!a.name) return toast('Please give the ad a name.');
    if (!a.image) return toast('Please add the ad image.');
    if (a.type === 'popup' && !a.title) return toast('Please add a headline for the pop-up.');
    if (a.start && a.end && a.end < a.start) return toast('The end date is before the start date.');
    if (t.mode === 'groups' && !t.sections.length && !t.shows.length) return toast('Choose at least one section or show, or pick another option.');
    if (t.mode === 'stories' && !t.stories.length) return toast('Choose at least one article, or pick another option.');
    if (!t.home && t.mode === 'none') return toast('This ad is not placed anywhere. Tick Front page or choose some articles.');
    if (!a.id) a.id = CV.slugify(a.name).slice(0, 30) + '-' + Date.now().toString(36);
    var files = [];
    if (A.img) files.push({ path: A.img.path, content: A.img.base64, base64: true });
    if (A.img2) files.push({ path: A.img2.path, content: A.img2.base64, base64: true });
    var wasNew = A.isNew;
    saveAds(function (d) {
      var i = d.ads.findIndex(function (x) { return x.id === a.id; });
      a.updated = new Date().toISOString(); if (i > -1) d.ads[i] = a; else { a.created = a.updated; d.ads.unshift(a); }
    }, (wasNew ? 'Ad added: ' : 'Ad updated: ') + a.name, files).then(function () {
      S.dirty = false; A.img = A.img2 = null; A.isNew = false;
      toast((wasNew ? 'Ad saved.' : 'Ad updated.') + (A.data.enabled ? (a.active ? ' It will appear on the site within a couple of minutes.' : ' It is paused, so it will not show yet.') : ' Note: all ads are switched off at the moment.'), 7000);
      location.hash = '#ads';
    }, function () {});
  });

  /* ---------- placement table: every ad x the front page + every article ---------- */
  var PL = { draft: null };
  function openPlacement() {
    Promise.all([loadAds(), ensureIndex()]).then(function () {
      PL.draft = JSON.parse(JSON.stringify(A.data.ads)).map(function (a) { a.target = normTarget(a.target); return a; });
      $('#placeSec').innerHTML = '<option value="">All sections</option>' + CFG.categories.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + '</option>'; }).join('');
      $('#placeSave').disabled = true; S.dirty = false;
      drawPlacement();
    });
  }
  function setOnStory(a, p, on) {
    var t = a.target;
    if (adOnStory(a, p) === on) return;
    if (t.mode === 'all') { var i = t.exclude.indexOf(p.id); if (on && i > -1) t.exclude.splice(i, 1); if (!on && i < 0) t.exclude.push(p.id); return; }
    if (t.mode === 'groups' || t.mode === 'none') {
      // switch to an explicit list, keeping everything the ad currently runs on
      var cur = S.index.filter(function (x) { return x.status !== 'draft' && adOnStory(a, x); }).map(function (x) { return x.id; });
      t.mode = 'stories'; t.stories = cur; t.exclude = [];
    }
    var j = t.stories.indexOf(p.id); if (on && j < 0) t.stories.push(p.id); if (!on && j > -1) t.stories.splice(j, 1);
  }
  function drawPlacement() {
    var ads = PL.draft;
    if (!ads.length) { $('#placeWrap').innerHTML = '<div class="rows-empty">Add an ad first, then come back here to choose where it runs.</div>'; return; }
    var q = ($('#placeSearch').value || '').toLowerCase(), sec = $('#placeSec').value;
    var stories = S.index.filter(function (p) { return p.status !== 'draft' && (!q || p.title.toLowerCase().indexOf(q) > -1) && (!sec || p.category === sec); });
    var head = '<tr><th class="pl-page">Page</th>' + ads.map(function (a, i) {
      var ty = AD_TYPES[a.type];
      return '<th class="pl-ad"><div class="pl-ad-in"><span class="tier ' + ty.cls + '">' + ty.name + '</span><b title="' + esc(a.name) + '">' + esc(a.name) + '</b>' + (a.active ? '' : '<small class="muted">Paused</small>') +
        '<span class="pl-bulk"><button type="button" data-plall="' + i + '">All</button><button type="button" data-plnone="' + i + '">None</button></span></div></th>';
    }).join('') + '</tr>';
    var homeRow = '<tr class="pl-home"><td class="pl-page"><b>Front page</b><small>Homepage</small></td>' + ads.map(function (a, i) {
      return '<td><label class="pl-cell"><input type="checkbox" data-plhome="' + i + '"' + (a.target.home ? ' checked' : '') + '></label></td>';
    }).join('') + '</tr>';
    var rows = stories.map(function (p) {
      var c = CV.catById(p.category);
      return '<tr><td class="pl-page"><span class="pl-title">' + esc(p.title) + '</span><small>' + (c ? esc(c.name) + ' · ' : '') + CV.fmtShort(p.date) + (p.noAds ? ' · <b class="noads">No ads</b>' : '') + '</small></td>' + ads.map(function (a, i) {
        return '<td><label class="pl-cell"><input type="checkbox" data-plstory="' + esc(p.id) + '" data-pli="' + i + '"' + (adOnStory(a, p) ? ' checked' : '') + (p.noAds ? ' disabled title="This story is set to No ads"' : '') + '></label></td>';
      }).join('') + '</tr>';
    }).join('');
    $('#placeWrap').innerHTML = '<table class="pl-table"><thead>' + head + '</thead><tbody>' + homeRow + rows + '</tbody></table>' + (stories.length ? '' : '<div class="rows-empty">No articles match.</div>');
    $('#placeNote').textContent = stories.length + ' article' + (stories.length === 1 ? '' : 's');
  }
  function plChanged() { $('#placeSave').disabled = false; S.dirty = true; $('#placeState').textContent = 'You have unsaved changes.'; }
  $('#placeWrap').addEventListener('change', function (e) {
    var el = e.target, ads = PL.draft;
    if (el.hasAttribute('data-plhome')) { ads[+el.getAttribute('data-plhome')].target.home = el.checked; plChanged(); return; }
    if (el.hasAttribute('data-plstory')) {
      var p = S.index.filter(function (x) { return x.id === el.getAttribute('data-plstory'); })[0];
      setOnStory(ads[+el.getAttribute('data-pli')], p, el.checked); plChanged();
    }
  });
  $('#placeWrap').addEventListener('click', function (e) {
    var b = e.target.closest('[data-plall],[data-plnone]'); if (!b) return;
    var a = PL.draft[+(b.getAttribute('data-plall') || b.getAttribute('data-plnone'))];
    if (b.hasAttribute('data-plall')) { a.target.mode = 'all'; a.target.exclude = []; a.target.home = true; }
    else { a.target.mode = 'none'; a.target.stories = []; a.target.exclude = []; a.target.home = false; }
    plChanged(); drawPlacement();
  });
  $('#placeSearch').addEventListener('input', drawPlacement);
  $('#placeSec').addEventListener('change', drawPlacement);
  $('#placeBack').addEventListener('click', function () { location.hash = '#ads'; });
  $('#placeSave').addEventListener('click', function () {
    var byId = {}; PL.draft.forEach(function (a) { byId[a.id] = a.target; });
    saveAds(function (d) { d.ads.forEach(function (a) { if (byId[a.id]) a.target = byId[a.id]; }); }, 'Ads: placement updated').then(function () {
      S.dirty = false; $('#placeSave').disabled = true; $('#placeState').textContent = 'Saved. Changes show on the site within a couple of minutes.'; toast('Placement saved.');
    }, function () {});
  });

  /* ---------- preview ---------- */
  $('#previewBtn').addEventListener('click', function () {
    var p; try { p = collect(true); } catch (e) { return; }
    p.title = p.title || 'Your headline';
    if (S.heroData) p.image = S.heroData;
    p.body = $('#fBody').innerHTML.replace(/ contenteditable="false"/g, '').replace(/(<div class="cv-embed" data-video="[^"]*">)[^<]*(<\/div>)/g, '$1$2');
    var baseHref = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="' + baseHref + '">' + CV.headAssets('') +
      '</head><body><div class="wrap story-wrap"><div class="story-grid"><div class="story-col">' + CV.storyInner(p, '', CFG.siteUrl) + '</div><aside></aside></div></div></body></html>';
    $('#pvFrame').srcdoc = html; $('#pv').hidden = false; document.body.style.overflow = 'hidden';
  });
  $('#pvClose').addEventListener('click', function () { $('#pv').hidden = true; document.body.style.overflow = ''; });
  $('#pvSeg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; $$('#pvSeg button').forEach(function (x) { x.classList.toggle('on', x === b); }); $('#pvFrame').style.width = b.getAttribute('data-w'); });

  /* ---------- boot ---------- */
  S.token = store.get('cv_admin_token') || '';
  try { S.repo = JSON.parse(store.get('cv_admin_repo')); } catch (e) {}
  S.repo = S.repo || Object.assign({}, CFG.github);
  if (!S.token) showConnect();
  else verify().then(startApp).catch(function (e) { showConnect(e.message); });
})();
