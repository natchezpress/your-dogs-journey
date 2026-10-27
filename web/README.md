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

`wrangler.jsonc` points the Worker at `dist/` as static assets. Then **Settings → Domains & Routes → Add → Custom domain** with the subdomain; Cloudflare shows the CNAME target to add in the domain's DNS at Wix.

## Layout
- `index.html` — landing (Jetson's entry No. 1) and the four-step maker
- `src/compose.js` — the canvas composition at 1648×2944 and the three cuts (9:16, 4:5, 1:1)
- `src/windows.js` — date windows (fixed ranges, Easter, Mother's/Father's Day weeks)
- `src/lines.js` — the curated line bank behind "Need help finding the words?"
- `src/main.js` — picker, photo pan/zoom, share and save, request-a-background
