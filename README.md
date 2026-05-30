# OGE/EGE English Speaking Trainer

Web trainer for the English speaking part of OGE/EGE-style exams. The app lets students practise full variants or individual tasks, record spoken answers, listen to reference audio, review reference texts, and receive AI feedback.

## Stack

- Frontend: Next.js 16, React 19, Tailwind CSS
- Backend: Express, PostgreSQL/Supabase or local storage, cookie auth
- AI: Groq by default, optional Google Gemini for STT/evaluation/variant generation
- Payments: YooKassa
- Media: local or mounted storage for uploaded/generated audio

## Project Structure

```text
frontend/   Next.js app: practice flow, auth pages, profile, plans, admin UI
backend/    Express API: auth, tests, attempts, billing, AI, media uploads
```

## Local Setup

Install dependencies in both apps:

```bash
cd backend
npm install

cd ../frontend
npm install
```

Create backend env:

```bash
copy backend\.env.example backend\.env
```

Create frontend env:

```bash
echo NEXT_PUBLIC_BACKEND_URL=http://localhost:5000 > frontend\.env.local
```

Start backend first:

```bash
cd backend
npm run dev
```

Start frontend:

```bash
cd frontend
npm run dev
```

Open `http://localhost:3000`.

## Backend Environment

Minimum local `.env`:

```env
NODE_ENV=development
PORT=5000
FRONTEND_ORIGIN=http://localhost:3000

SUPABASE_DB_URL=postgresql://...

AI_PROVIDER=groq
GROQ_API_KEY=your_groq_api_key
GROQ_TTS_API_KEY=your_groq_tts_api_key_optional
GROQ_GENERATE_MODEL=llama-3.3-70b-versatile
GROQ_ANALYZE_MODEL=llama-3.3-70b-versatile

TTS_MODEL=canopylabs/orpheus-v1-english
TTS_VOICE=austin

ADMIN_BOOTSTRAP_ENABLED=true
ADMIN_BOOTSTRAP_KEY=replace_with_long_random_string_at_least_24_chars
MEDIA_SIGNING_SECRET=replace_with_long_random_secret
EVALUATION_TOKEN_SECRET=replace_with_long_random_secret
```

Use `backend/.env.example` for the full list, including storage and YooKassa settings.

## Gemini Mode

To move STT, AI evaluation, and AI variant generation from Groq to Google Gemini:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta
GEMINI_GENERATE_MODEL=gemini-2.5-flash
GEMINI_ANALYZE_MODEL=gemini-2.5-flash
GEMINI_TRANSCRIBE_MODEL=gemini-2.5-flash
```

Groq TTS remains configured separately through `GROQ_TTS_API_KEY` or `GROQ_API_KEY`.

## Core Features

- Full variant practice: tasks 1, 2, and 3 in sequence
- Task-focused practice: choose task 1, 2, or 3 and train a specific variant number
- Reference audio for model answers
- Reference texts collapsed by default
- AI feedback after each task for Pro/admin users
- Final AI scoring and attempt saving
- Admin test editor with manual audio upload and TTS generation
- AI draft generation for new speaking variants
- YooKassa payment flow for Pro access

## Main API Routes

- Auth: `GET /api/auth/me`, `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`
- Bootstrap admin: `GET /api/auth/bootstrap-status`, `POST /api/auth/bootstrap-admin`
- Tests: `GET /api/tests`, `GET /api/tests/:id`
- Speech-to-text: `POST /api/transcribe`
- AI evaluation: `POST /api/evaluate`
- Attempts: `GET /api/attempts`, `POST /api/attempts`
- Billing: `POST /api/billing/yookassa/create-payment`, `GET /api/billing/yookassa/payment/:paymentId/status`, `POST /api/billing/yookassa/webhook`
- Admin tests: `GET /api/admin/tests`, `POST /api/admin/tests`, `PUT /api/admin/tests/:id`, `POST /api/admin/tests/:id/publish`, `POST /api/admin/tests/:id/unpublish`, `DELETE /api/admin/tests/:id`
- Admin AI/media: `POST /api/admin/tests/generate-ai`, `POST /api/admin/tests/generate-full`, `POST /api/admin/tests/:id/generate-audio`, `POST /api/admin/tts/generate`, `POST /api/admin/upload-audio`
- Admin users: `GET /api/admin/users`, `POST /api/admin/users/:id/role`, `POST /api/admin/users/:id/pro`

## Checks

Backend syntax checks:

```bash
cd backend
node --check src\ai.js
node --check src\app.js
node --check src\config.js
```

Frontend checks:

```bash
cd frontend
npm run lint
$env:NEXT_PUBLIC_BACKEND_URL='http://localhost:5000'; npm run build
```

## Deployment Notes

- Set `FRONTEND_ORIGIN` to the deployed frontend origin.
- Set `NEXT_PUBLIC_BACKEND_URL` in the frontend deployment to the backend URL.
- Use persistent storage or `STORAGE_DIR`/`RENDER_DISK_MOUNT_PATH` for media and local data.
- Set `COOKIE_SECURE=true` in production.
- Disable admin bootstrap after creating the first admin:

```env
ADMIN_BOOTSTRAP_ENABLED=false
```
