# Hobden Game Center

Installable PWA mini-game hub for **Keira** and **Luke**. Same games for both kids — profile switch only changes theme, art, and copy.

## Stack

- Next.js App Router + TypeScript + Tailwind CSS + shadcn-style UI primitives
- Web App Manifest + service worker (`public/sw.js`) for install / offline shell
- Game registry with dynamic `import()` per title
- Hosted on **Vercel** (standard Next.js deploy — no custom Node server)

## Playable now

- Snake
- Flappy
- Minesweeper

Other titles appear in the menu as **Coming soon**.

## Local development

```bash
npm install
npm run dev -- --port 43127
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

## Deploy on Vercel

1. Import this GitHub repo in the [Vercel dashboard](https://vercel.com/new) (or link via `vercel` CLI).
2. Framework preset: **Next.js** (defaults — no `vercel.json` required).
3. Build command: `next build` · Output: Next defaults.
4. Deploy. PWA install and the service worker need **HTTPS** (Vercel production provides this).

Optional CLI:

```bash
npx vercel
```

## Profiles

| Profile | Theme |
| --- | --- |
| Keira | Unicorns, rainbows, fairies, mermaids, princesses (original art — no Disney IP) |
| Luke | Rockets, reefs, race tracks — boy-friendly counterpart pack |

Choice is stored in `localStorage` only. No auth or database.
