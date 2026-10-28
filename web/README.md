# web/ — the dedication maker

Static site built with Vite. Backgrounds are read from `../assets/backgrounds` (served at `/backgrounds/`).

## Run locally
```
cd web
npm install
npm run dev
```

## Cloudflare settings (Workers & Pages → Create → Connect GitHub → this repo)
| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | `web` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |

`wrangler.jsonc` points the Worker at `dist/` as static assets.

## Domain
Live at **https://dedication.jetsonsjourney.com** (Worker → Domains → Add Domain). A Worker custom domain needs the whole zone on Cloudflare, so jetsonsjourney.com's nameservers were moved from Wix to Cloudflare on 2026-10-28 (martin/maya.ns.cloudflare.com); its old records (GitHub Pages bounce to brockalston.com/jetsonsjourney, www CNAME, MX, SPF) were copied over as DNS-only. brockalston.com stays on Wix untouched. Test URL: https://your-dogs-journey.brock-535.workers.dev.

## Layout
- `index.html` — landing (Jetson's entry No. 1) and the four-step maker
- `src/compose.js` — the canvas composition at 1648×2944 and the three cuts (9:16, 4:5, 1:1)
- `src/windows.js` — date windows (fixed ranges, Easter, Mother's/Father's Day weeks)
- `src/lines.js` — the curated line bank behind "Need help finding the words?"
- `src/main.js` — picker, photo pan/zoom, share and save, request-a-background
