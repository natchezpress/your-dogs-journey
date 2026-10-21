# web/ — the dedication maker

Static site built with Vite. Backgrounds are read from `../assets/backgrounds` (served at `/backgrounds/`).

## Run locally
```
cd web
npm install
npm run dev
```

## Cloudflare Pages settings (Connect to Git → this repo)
| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Framework preset | Vite |
| Root directory | `web` |
| Build command | `npm run build` |
| Build output directory | `dist` |

Then **Custom domains → Set up a custom domain** with the subdomain; Cloudflare shows the CNAME target to add in the domain's DNS at Wix.

## Layout
- `index.html` — landing (Jetson's entry No. 1) and the four-step maker
- `src/compose.js` — the canvas composition at 1648×2944 and the three cuts (9:16, 4:5, 1:1)
- `src/windows.js` — date windows (fixed ranges, Easter, Mother's/Father's Day weeks)
- `src/lines.js` — the curated line bank behind "Need help finding the words?"
- `src/main.js` — picker, photo pan/zoom, share and save, request-a-background
