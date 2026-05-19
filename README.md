# OGE/EGE English Speaking Trainer

Monorepo structure:

- `frontend` - Next.js app (practice flow, profile, plans, admin)
- `backend` - Express API (auth, tests, attempts, AI evaluation, admin CRUD)


## Backend start

```bash
cd backend
npm install
npm run dev
```

`npm run dev` starts the API directly (`node server.js`) on port `5000`.

Create `backend/.env`:
(`backend/.env.example` is provided as a full template)

```env
GROQ_API_KEY=your_key_here
PORT=5000
FRONTEND_ORIGIN=http://localhost:3000
SUPABASE_DB_URL=postgresql://...
GROQ_ANALYZE_MODEL=llama-3.3-70b-versatile
GROQ_GENERATE_MODEL=llama-3.3-70b-versatile
TTS_MODEL=playai-tts
TTS_VOICE=Fritz-PlayAI
ADMIN_BOOTSTRAP_KEY=change_me_for_first_admin
ADMIN_BOOTSTRAP_ENABLED=true
MEDIA_SIGNING_SECRET=change_me_media_signing
EVALUATION_TOKEN_SECRET=change_me_eval_proofs
```

Bootstrap works only while there are no admin users yet.
Check availability via `GET /api/auth/bootstrap-status`.

## Frontend start

```bash
cd frontend
npm install
npm run dev
```

Important: start backend first, then frontend.  
If backend is not running, browser requests to `http://localhost:5000/api/*` will fail with `ERR_CONNECTION_REFUSED`.

Optional frontend env (`frontend/.env.local`):

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:5000
```

## Main API routes

- Auth:
  - `GET /api/auth/bootstrap-status`
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `POST /api/auth/refresh`
  - `POST /api/auth/logout`
  - `GET /api/auth/me`
  - `POST /api/auth/bootstrap-admin`
- Billing:
  - `POST /api/billing/yookassa/create-payment`
  - `GET /api/billing/yookassa/payment/:paymentId/status`
  - `POST /api/billing/yookassa/webhook`
- Tests: `GET /api/tests`, `GET /api/tests/:id`
- STT (auth required): `POST /api/transcribe`
- AI evaluation (Pro): `POST /api/evaluate`
- Attempts: `GET /api/attempts`, `POST /api/attempts`
- Admin tests:
  - `GET /api/admin/tests`
  - `POST /api/admin/tests`
  - `PUT /api/admin/tests/:id`
  - `POST /api/admin/tests/:id/publish`
  - `POST /api/admin/tests/:id/unpublish`
  - `POST /api/admin/tests/generate-ai`
  - `POST /api/admin/tests/:id/generate-audio`
  - `POST /api/admin/tts/generate`
  - `POST /api/admin/upload-audio`
- Admin users:
  - `GET /api/admin/users`
  - `POST /api/admin/users/:id/role`
  - `POST /api/admin/users/:id/pro`
# test_upload

