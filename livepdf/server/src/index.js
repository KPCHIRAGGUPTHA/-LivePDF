require('dotenv').config();
const http = require('http');
const express = require('express');
const { initSocket } = require('./socket');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Sentry = require('@sentry/node');

const authRoutes = require('./routes/auth');
const stripeRoutes = require('./routes/stripe');
const organisationRoutes = require('./routes/organisation');
const apiKeyRoutes = require('./routes/apiKey');

const apiKeyAuth = require('./middleware/apiKeyAuth');
const apiKeyRateLimiter = require('./middleware/rateLimiter');

const app = express();

// ─── Sentry Initialization ─────────────────────────────────────
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
  app.use(Sentry.Handlers.requestHandler());
}

// ─── Security middleware ──────────────────────────────────────
app.use(helmet());

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Sentry Error Handler
if (process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler());
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

