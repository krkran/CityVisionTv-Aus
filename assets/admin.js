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
    fillSelects();
    route();
  }
  function loadIndex() {
    $('#dashSub').textContent = 'Loading…';
    return readFile('articles.json').then(function (t) { S.index = parseIndex(t).sort(function (a, b) { return new Date(b.date) - new Date(a.date); }); drawDash(); })
      .catch(function (e) { $('#rows').innerHTML = '<div class="rows-empty">Could not load stories: ' + esc(e.message) + '</div>'; });
  }
  function drawDash() {
    var all = S.index, pub = all.filter(function (p) { return p.status !== 'draft'; });
    var month = pub.filter(function (p) { var d = new Date(p.date), n = new Date(); return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear(); });
    $('#dashSub').textContent = pub.length + ' published · ' + (all.length - pub.length) + ' drafts';
    $('#stats').innerHTML = [[pub.length, 'Published'], [all.length - pub.length, 'Drafts'], [month.length, 'Published this month'], [pub.filter(function (p) { return p.type === 'video'; }).length, 'Videos']]
      .map(function (s) { return '<div class="stat"><b>' + s[0] + '</b><span>' + s[1] + '</span></div>'; }).join('');
    var list = all.filter(function (p) { return S.filter === 'all' || (S.filter === 'draft' ? p.status === 'draft' : p.status !== 'draft'); });
    if (S.q) { var q = S.q.toLowerCase(); list = list.filter(function (p) { return (p.title + ' ' + p.summary + ' ' + (p.author || '')).toLowerCase().indexOf(q) > -1; }); }
    if (!list.length) { $('#rows').innerHTML = '<div class="rows-empty">' + (all.length ? 'No stories match.' : 'No stories yet. Click <b>+ New article</b> to publish your first one.') + '</div>'; return; }
    $('#rows').innerHTML = list.map(function (p) {
      var pills = '<span class="pill">' + (p.type === 'update' ? 'Update' : p.type === 'video' ? 'Video' : 'Article') + '</span>' + (p.featured ? '<span class="pill lead">Lead</span>' : '') + (p.breaking ? '<span class="pill brk">Breaking</span>' : '');
      var live = p.status !== 'draft' ? CV.postUrl(p, '') : '';
      return '<div class="row" data-id="' + esc(p.id) + '">' + CV.media(p, '') + '<div><div class="row-t" data-edit>' + esc(p.title) + '</div><div class="row-m">' + pills + '<span>' + esc(CV.kicker(p)) + '</span>' + (p.author ? '<span>· ' + esc(p.author) + '</span>' : '') + '</div></div>' +
        '<div class="row-date">' + CV.fmtShort(p.date) + '<br><span class="muted">' + CV.fmtTime(p.date) + '</span></div>' +
        '<div class="row-st"><span class="pill ' + (p.status === 'draft' ? 'draft">Draft' : 'pub">Published') + '</span></div>' +
        '<div class="row-act"><button data-edit>Edit</button>' + (live ? '<a href="' + live + '" target="_blank" rel="noopener">View</a>' : '') + '<button class="del" data-del>Delete</button></div></div>';
    }).join('');
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
  function route() {
    var h = location.hash.replace(/^#/, '').split('/');
    if (h[0] === 'new') return openEditor(null, h[1] || 'article');
    if (h[0] === 'edit' && h[1]) return openEditor(decodeURIComponent(h[1]));
    $('#vEdit').hidden = true; $('#vDash').hidden = false; document.title = 'Newsroom | CityVision TV';
    loadIndex();
  }
  addEventListener('hashchange', function () {
    if (S.dirty && !$('#vEdit').hidden && !confirm('You have unsaved changes. Leave without saving? (A backup is kept on this device.)')) return;
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
    $('#fFeatured').checked = !!p.featured; $('#fBreaking').checked = !!p.breaking;
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
    p.featured = $('#fFeatured').checked; p.breaking = $('#fBreaking').checked;
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
