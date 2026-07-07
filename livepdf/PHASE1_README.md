# LivePDF — Phase 1 Setup Guide

## Prerequisites
- Node.js 18+
- PostgreSQL 14+ (running locally)
- A Gmail account (for sending OTP emails)

---

## 1. Clone & install

```bash
# Backend
cd server
npm install

# Frontend
cd ../client
npm install
```

---

## 2. PostgreSQL — create database

```bash
psql -U postgres
CREATE DATABASE livepdf;
\q
```

Then run the migration:
```bash
cd server
node migrations/run.js
```

You should see: `✅ Migration complete — all tables created.`

---

## 3. Configure environment

```bash
cd server
cp .env.example .env
```

Edit `.env` and fill in:

| Variable | What to put |
|---|---|
| `DB_PASSWORD` | Your PostgreSQL password |
| `JWT_SECRET` | Any long random string (e.g. 64 random chars) |
| `EMAIL_USER` | Your Gmail address |
| `EMAIL_PASS` | A Gmail **App Password** (not your real password) |

### Getting a Gmail App Password
1. Go to myaccount.google.com → Security
2. Enable 2-Step Verification
3. Search "App passwords" → generate one for "Mail"
4. Paste the 16-character code as `EMAIL_PASS`

---

## 4. Start both servers

Terminal 1 — Backend:
```bash
cd server
npm run dev
# Server running on http://localhost:5000
```

Terminal 2 — Frontend:
```bash
cd client
npm run dev
# App running on http://localhost:5173
```

---

## 5. Test the auth flow

1. Open http://localhost:5173/signup
2. Create an account
3. Check your email for the 6-digit OTP
4. Enter it at /verify-email
5. Log in at /login → lands on /dashboard

---

## API Endpoints (Phase 1)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /api/auth/signup | ❌ | Create account, sends OTP |
| POST | /api/auth/verify-email | ❌ | Verify OTP |
| POST | /api/auth/resend-otp | ❌ | Resend OTP |
| POST | /api/auth/login | ❌ | Returns JWT |
| GET | /api/auth/me | ✅ JWT | Returns current user |
| GET | /health | ❌ | Server health check |

---

## File structure

```
livepdf/
├── server/
│   ├── src/
│   │   ├── index.js              ← Express app entry point
│   │   ├── config/db.js          ← PostgreSQL pool
│   │   ├── controllers/
│   │   │   └── authController.js ← signup, login, verify
│   │   ├── middleware/
│   │   │   └── auth.js           ← JWT middleware
│   │   ├── routes/
│   │   │   └── auth.js           ← Route definitions + validation
│   │   └── utils/
│   │       └── email.js          ← Nodemailer OTP sender
│   └── migrations/
│       ├── schema.sql            ← All 6 tables
│       └── run.js                ← Migration runner
└── client/
    └── src/
        ├── App.jsx               ← Router + routes
        ├── context/AuthContext.jsx ← Global auth state (token in memory)
        ├── components/ProtectedRoute.jsx
        ├── pages/
        │   ├── Signup.jsx
        │   ├── Login.jsx
        │   ├── VerifyEmail.jsx
        │   └── Dashboard.jsx     ← Placeholder for Phase 2
        └── utils/api.js          ← Axios with JWT interceptor
```

---

## What's next — Phase 2

- AWS S3 bucket setup
- PDF upload endpoint (multer → S3 stream)
- Version tracking in PostgreSQL
- React upload UI with progress bar
- Document dashboard with card grid
