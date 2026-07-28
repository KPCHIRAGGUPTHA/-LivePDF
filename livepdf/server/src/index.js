require('dotenv').config();
const Sentry = require('@sentry/node');

// ─── Sentry Initialization ─────────────────────────────────────
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}

// Load file-based secrets (Docker Secrets) into standard environment variables
const fs = require('fs');
['DB_USER', 'DB_PASSWORD', 'JWT_SECRET'].forEach((key) => {
  const fileKey = `${key}_FILE`;
  if (process.env[fileKey] && fs.existsSync(process.env[fileKey])) {
    try {
      process.env[key] = fs.readFileSync(process.env[fileKey], 'utf8').trim();
    } catch (err) {
      console.error(`Error reading secret from ${process.env[fileKey]}:`, err);
    }
  }
});
process.env.JWT_SECRET = process.env.JWT_SECRET || 'livepdf_production_fallback_jwt_secret_key_2026';

const http = require('http');
const express = require('express');
const { initSocket } = require('./socket');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const stripeRoutes = require('./routes/stripe');
const organisationRoutes = require('./routes/organisation');
const apiKeyRoutes = require('./routes/apiKey');

const apiKeyAuth = require('./middleware/apiKeyAuth');
const apiKeyRateLimiter = require('./middleware/rateLimiter');

const app = express();
app.set('trust proxy', 1); // Trust first proxy (Nginx) for rate-limiting client IPs




// ─── Security middleware ──────────────────────────────────────
app.use(helmet());

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server or requests without origin header (e.g. mobile apps/curl)
    if (!origin) return callback(null, true);
    // Allow any duckdns.org subdomain, localhost, or configured CLIENT_URL
    if (
      origin.includes('duckdns.org') ||
      origin.includes('localhost') ||
      origin === process.env.CLIENT_URL
    ) {
      return callback(null, true);
    }
    return callback(null, true); // Fallback allow for production flexibility
  },
  credentials: true,
}));

// Rate limiting — 100 requests per 15 minutes per IP (for browser users)
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later.' },
}));

// Stricter limit on auth endpoints
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many auth attempts, please try again later.' },
}));

// ─── Body parsing ─────────────────────────────────────────────
// Note: Stripe webhook endpoint requires raw payload. It handles parsing on its own.
app.use((req, res, next) => {
  if (req.originalUrl === '/api/stripe/webhook') {
    next();
  } else {
    express.json({ limit: '10kb' })(req, res, next);
  }
});
app.use(express.urlencoded({ extended: true }));

// ─── API Key Authentication & Rate Limiting (Applied globally for API endpoints) ───
app.use('/api', apiKeyAuth, apiKeyRateLimiter);

// ─── Routes ──────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/organisations', organisationRoutes);
app.use('/api/keys', apiKeyRoutes);

const documentRoutes = require('./routes/documents');
app.use('/api/documents', documentRoutes);

const shareRoutes = require('./routes/share');
app.use('/api/share', shareRoutes);

const qaRoutes = require('./routes/qa');
app.use('/api/qa', qaRoutes);

const notificationRoutes = require('./routes/notifications');
app.use('/api/notifications', notificationRoutes);

const commentRoutes = require('./routes/comments');
app.use('/api/documents/:docId/comments', commentRoutes);

const redlineRoutes = require('./routes/redlines');
app.use('/api/documents/:docId/redlines', redlineRoutes);

const approvalRoutes = require('./routes/approvals');
app.use('/api/documents/:docId/approval', approvalRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Sentry Error Handler
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start ───────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const httpServer = http.createServer(app);
initSocket(httpServer);

httpServer.listen(PORT, () => {
  console.log(`LivePDF server running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});

module.exports = { app, httpServer };

