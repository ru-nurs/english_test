# Deploy (Demo)

## Where to deploy

- Frontend: **Vercel** (best for Next.js)
- Backend: **Render Web Service** + **Persistent Disk** (needed for SQLite and uploaded audio files)

This combo is fast to set up and good enough to share a stable demo link with a client.

## 1) Backend (Render)

Create a new Web Service from the `backend` directory.

- Build command: `npm install`
- Start command: `npm start`
- Root directory: `backend`

Environment variables:

```env
NODE_ENV=production
FRONTEND_ORIGIN=https://<your-frontend-domain>
GROQ_API_KEY=<your_groq_key>
GROQ_ANALYZE_MODEL=llama-3.3-70b-versatile
GROQ_GENERATE_MODEL=llama-3.3-70b-versatile
TTS_MODEL=canopylabs/orpheus-v1-english
TTS_VOICE=austin
ADMIN_BOOTSTRAP_ENABLED=true
ADMIN_BOOTSTRAP_KEY=<long_random_string_24+>
MEDIA_SIGNING_SECRET=<long_random_string>
EVALUATION_TOKEN_SECRET=<long_random_string>
COOKIE_SECURE=true
COOKIE_SAME_SITE=none
TRUST_PROXY=true
YOOKASSA_API_URL=https://api.yookassa.ru/v3
YOOKASSA_SHOP_ID=<your_shop_id>
YOOKASSA_SECRET_KEY=<your_secret_key>
BILLING_PRO_MONTHLY_PRICE_RUB=490.00
BILLING_PRO_PLAN_CODE=pro-monthly
BILLING_PRO_PLAN_TITLE=Pro subscription
BILLING_RETURN_URL=https://<your-frontend-domain>/profile
```

Notes:

- Attach a persistent disk and mount it for app data/media persistence.
- `PORT` is managed by Render automatically.
- In YooKassa dashboard set webhook URL to:
  `https://<your-backend-domain>/api/billing/yookassa/webhook`
  and subscribe to at least `payment.succeeded` and `payment.canceled`.

## 2) Frontend (Vercel)

Create a new project from the `frontend` directory.

- Build command: `npm run build`
- Install command: `npm install`
- Root directory: `frontend`

Environment variables:

```env
NEXT_PUBLIC_BACKEND_URL=https://<your-backend-domain>
```

## 3) Final checks

- In backend `FRONTEND_ORIGIN` must exactly match Vercel domain.
- In frontend `NEXT_PUBLIC_BACKEND_URL` must point to Render backend.
- After first admin creation, disable bootstrap in backend:

```env
ADMIN_BOOTSTRAP_ENABLED=false
```

- Validate payment flow:
  1. login as normal user;
  2. start PRO payment from `/profile`;
  3. finish payment in YooKassa test/production form;
  4. return to `/profile` and confirm tariff is `PRO`.
