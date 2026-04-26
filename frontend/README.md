# Frontend (Next.js)

UI for speaking practice flow, authentication, profile history and admin panel.

## Run

```bash
npm install
npm run dev
```

Before starting frontend, run backend on `http://localhost:5000` (`../backend`, `npm run dev`).

Optional env (`.env.local`):

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:5000
```

## Main pages

- `/` - landing
- `/practice` - full 3-task speaking flow
- `/profile` - plan and attempt history
- `/plans` - Free vs Pro
- `/admin` - admin test editor, audio upload, user roles
  - includes form-based test editor, advanced JSON mode, and TTS audio generation tools
- `/login`, `/register`

## Commands

- `npm run dev`
- `npm run build`
- `npm run lint`
