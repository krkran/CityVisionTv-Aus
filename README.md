# CityVision TV website

The new cityvisiontv.com.au. A static site hosted on GitHub Pages, with a built-in newsroom for publishing.

## Going live (one time)

1. In the GitHub repo **krkran/CityVisionTv-Aus**, replace the old files with everything in this folder (keep `CNAME`). The old `images/` folder can stay or go; the new site uses `assets/`.
2. Make sure GitHub Pages is on: repo **Settings → Pages → Deploy from a branch → main / root**.
3. Wait a minute or two, then open https://cityvisiontv.com.au.

## Publishing a story

1. Go to **cityvisiontv.com.au/admin.html** (there is also a small "Newsroom" link in the footer).
2. The first time on each device, paste a GitHub token (the page walks you through creating one).
3. Click **+ New article**, **+ Video** or **+ Quick update**, write, add a photo, and press **Publish**.
4. The story is live in about a minute. It appears on the homepage, in its section and show page, in the ticker, in the "What's new" bell, on the Updates page, and in the RSS feed.

Tips:

- **Lead story** puts a story at the top of the homepage (only one at a time).
- **Breaking** adds a red label and puts the story in the ticker for 3 days.
- **Save draft** keeps a story private until you publish it.
- Paste straight from Word or Google Docs; formatting is cleaned automatically.
- Photos are resized automatically, so upload them straight from your phone or camera.
- Your work is backed up in the browser as you type, so a closed tab won't lose it.

## YouTube videos

The homepage Watch section, the Shorts row, show pages and the sidebar player all come from your YouTube channel automatically. A GitHub Action (`.github/workflows/youtube.yml`) checks the channel every hour and updates `youtube.json`, so new uploads appear on the site on their own. Videos are matched to shows by their title (for example, anything with "Hamro Story" in the title appears on the Hamro Story page). You can run it straight away from the repo's **Actions** tab → Refresh YouTube videos → Run workflow.

## Changing shows, sections or social links

Edit `assets/config.js`. Show logos live in `assets/logos/`. Each show's `yt` list sets which words in a YouTube title link a video to that show.

## How it works

| File | What it is |
|---|---|
| `articles.json` | List of every story (the site reads this) |
| `posts/<id>.json` | Full text of each story (the newsroom edits this) |
| `stories/<id>.html` | Shareable page for each story, with Facebook/WhatsApp previews |
| `media/` | Uploaded photos |
| `feed.xml`, `sitemap.xml` | RSS feed and Google sitemap, rebuilt on every publish |

Every publish is a single commit to GitHub, so the full history is kept and anything can be rolled back.
