// Refreshes youtube.json with the latest CityVision TV videos.
// Run by .github/workflows/youtube.yml every hour. Needs Node 18+ (built-in fetch).
//
// 1. Tries YouTube's RSS feed (exact publish dates).
// 2. If YouTube's feed is down (it sometimes returns 404 for days), reads the
//    channel's Videos and Shorts pages instead.
// 3. If YouTube can't be reached at all, keeps the current list and exits
//    without failing, so you don't get error emails every hour.
const fs = require('fs');
const path = require('path');

const CHANNEL = process.env.YT_CHANNEL || 'UC_xAWArdrRZYTNfMOwMPtiw';
const HANDLE = process.env.YT_HANDLE || '@CityVision_TV';
const OUT = path.join(__dirname, '..', '..', 'youtube.json');
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
  'Accept-Language': 'en-AU,en;q=0.9',
  'Cookie': 'CONSENT=YES+cb; SOCS=CAI'
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: HEADERS, redirect: 'follow' });
      if (r.ok) return await r.text();
      last = new Error(url + ' returned ' + r.status);
    } catch (e) { last = e; }
    await sleep(1500 * (i + 1));
  }
  throw last;
}
const un = s => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const tag = (xml, t) => { const m = xml.match(new RegExp('<' + t + '[^>]*>([\\s\\S]*?)</' + t + '>')); return m ? un(m[1]).trim() : ''; };

/* ---------- source 1: RSS feed ---------- */
async function fromFeed() {
  const xml = await get('https://www.youtube.com/feeds/videos.xml?channel_id=' + CHANNEL, 2);
  return xml.split('<entry>').slice(1).map(e => e.split('</entry>')[0]).map(e => {
    const link = (e.match(/<link rel="alternate" href="([^"]+)"/) || [])[1] || '';
    const views = (e.match(/<media:statistics views="(\d+)"/) || [])[1];
    return {
      id: tag(e, 'yt:videoId'), title: tag(e, 'title'), date: tag(e, 'published'),
      short: /\/shorts\//.test(link), description: tag(e, 'media:description').slice(0, 400),
      views: views ? +views : undefined, exactDate: true
    };
  }).filter(v => v.id);
}

/* ---------- source 2: channel pages ---------- */
function initialData(html) {
  const m = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/) || html.match(/window\["ytInitialData"\] = (\{[\s\S]*?\});/);
  if (!m) throw new Error('Could not read the channel page');
  return JSON.parse(m[1]);
}
function collect(obj, key, out = []) {
  if (Array.isArray(obj)) obj.forEach(x => collect(x, key, out));
  else if (obj && typeof obj === 'object') {
    if (obj[key]) out.push(obj[key]);
    Object.values(obj).forEach(x => collect(x, key, out));
  }
  return out;
}
function relToDate(text) {
  const t = String(text || '').toLowerCase();
  const m = t.match(/(\d+)\s*(second|minute|hour|day|week|month|year)/);
  if (!m) return null;
  const n = +m[1], unit = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000 }[m[2]];
  return new Date(Date.now() - n * unit * 1000).toISOString();
}
async function fromPages(known) {
  const base = 'https://www.youtube.com/' + HANDLE;
  const items = [];
  const vHtml = await get(base + '/videos?hl=en&gl=AU');
  collect(initialData(vHtml), 'lockupViewModel').forEach(l => {
    if (!l.contentId || !/VIDEO/.test(l.contentType || '')) return;
    const meta = l.metadata && l.metadata.lockupMetadataViewModel;
    const title = meta && meta.title && meta.title.content;
    const parts = collect(meta, 'metadataParts').flat();
    const when = parts.map(p => p.accessibilityLabel || (p.text && p.text.content) || '').find(s => /ago/.test(s));
    items.push({ id: l.contentId, title: title || '', date: relToDate(when) || new Date().toISOString(), short: false });
  });
  try {
    const sHtml = await get(base + '/shorts?hl=en&gl=AU');
    // The Shorts page has no dates, but it lists newest first. Unknown Shorts get a
    // date just older than the Short above them so the order stays right.
    let newer = null;
    collect(initialData(sHtml), 'shortsLockupViewModel').forEach(s => {
      const id = ((s.entityId || '').match(/([A-Za-z0-9_-]{11})$/) || [])[1];
      if (!id) return;
      const title = String(s.accessibilityText || '').replace(/,\s*[^,]*\bviews?\s*[\u2013\u2014-]\s*play Short\s*$/i, '').trim();
      const k = known.get(id);
      const date = k ? k.date : (newer ? new Date(new Date(newer).getTime() - 60000).toISOString() : new Date().toISOString());
      newer = date;
      items.push({ id, title, date, short: true });
    });
  } catch (e) { console.log('Shorts page skipped: ' + e.message); }
  return items.filter(v => v.id && v.title);
}

(async () => {
  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) {}
  const known = new Map((prev && prev.items || []).map(v => [v.id, v]));

  let items = null, source = '';
  try { items = await fromFeed(); source = 'RSS feed'; }
  catch (e) { console.log('RSS feed unavailable (' + e.message + '), reading the channel pages instead'); }
  if (!items || !items.length) {
    try { items = await fromPages(known); source = 'channel pages'; }
    catch (e) {
      console.log('::warning::Could not reach YouTube right now (' + e.message + '). Keeping the current video list; will try again next hour.');
      return;
    }
  }
  if (!items.length) { console.log('::warning::No videos found. Keeping the current list.'); return; }

  // Keep the exact dates and descriptions we already know about
  items = items.map(v => {
    const old = known.get(v.id);
    if (old && !v.exactDate) return Object.assign({}, old, { title: v.title || old.title, short: v.short });
    const out = Object.assign({}, v); delete out.exactDate; return out;
  });
  const seen = new Set(items.map(v => v.id));
  const older = (prev && prev.items || []).filter(v => !seen.has(v.id));
  const all = items.concat(older).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 60);

  const sig = list => JSON.stringify(list.map(v => [v.id, v.title, v.short]));
  if (prev && sig(prev.items || []) === sig(all)) { console.log('No new videos (checked via ' + source + ')'); return; }
  fs.writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), channelId: CHANNEL, items: all }, null, 1) + '\n');
  console.log('youtube.json updated with ' + all.length + ' videos (via ' + source + ')');
})().catch(e => {
  console.log('::warning::YouTube refresh skipped: ' + e.message);
});
