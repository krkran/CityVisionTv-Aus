// Refreshes youtube.json from the CityVision TV YouTube channel feed.
// Run by .github/workflows/youtube.yml every hour. Needs Node 18+ (built-in fetch).
const fs = require('fs');
const path = require('path');
const CHANNEL = process.env.YT_CHANNEL || 'UC_xAWArdrRZYTNfMOwMPtiw';
const OUT = path.join(__dirname, '..', '..', 'youtube.json');

const un = s => String(s || '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const tag = (xml, t) => { const m = xml.match(new RegExp('<' + t + '[^>]*>([\\s\\S]*?)</' + t + '>')); return m ? un(m[1]).trim() : ''; };

(async () => {
  const res = await fetch('https://www.youtube.com/feeds/videos.xml?channel_id=' + CHANNEL, { headers: { 'User-Agent': 'Mozilla/5.0 CityVisionTV-site' } });
  if (!res.ok) throw new Error('YouTube feed returned ' + res.status);
  const xml = await res.text();
  const entries = xml.split('<entry>').slice(1).map(e => e.split('</entry>')[0]);
  const items = entries.map(e => {
    const id = tag(e, 'yt:videoId');
    const link = (e.match(/<link rel="alternate" href="([^"]+)"/) || [])[1] || '';
    const views = (e.match(/<media:statistics views="(\d+)"/) || [])[1];
    return {
      id,
      title: tag(e, 'title'),
      date: tag(e, 'published'),
      short: /\/shorts\//.test(link),
      description: tag(e, 'media:description').slice(0, 400),
      views: views ? +views : undefined
    };
  }).filter(v => v.id);
  if (!items.length) throw new Error('No videos found in feed');

  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) {}
  // Keep older videos that have dropped out of the 15-item feed (up to 60 total)
  const seen = new Set(items.map(v => v.id));
  const older = prev && Array.isArray(prev.items) ? prev.items.filter(v => !seen.has(v.id)) : [];
  const all = items.concat(older).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 60);

  const strip = o => JSON.stringify(o.items.map(v => [v.id, v.title, v.short]));
  if (prev && strip(prev) === strip({ items: all })) { console.log('No new videos'); return; }
  fs.writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), channelId: CHANNEL, items: all }, null, 1) + '\n');
  console.log('youtube.json updated with', all.length, 'videos');
})().catch(e => { console.error(e.message); process.exit(1); });
