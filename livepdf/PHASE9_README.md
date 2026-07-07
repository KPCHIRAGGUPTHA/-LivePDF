# LivePDF — Phase 9: Production Deployment, Stripe Billing, Organisations & Public API

## What Phase 9 covers

Phase 9 is the final phase of LivePDF. It takes the development project built in Phases 1–8 and makes it production-ready. This guide covers:

1. **Dockerising all four services** — server (API), worker (BullMQ), python (FastAPI), and client (React served by Nginx).
2. **Local and Production Docker Compose files** — orchestrating services with Postgres and Redis.
3. **AWS EC2 Setup & PM2** — configuring security groups, starting Docker Compose under PM2.
4. **Nginx Reverse Proxy & SSL Setup** — routing request paths, handling WebSocket upgrades, and automating SSL certificates using Let's Encrypt.
5. **Stripe Billing** — integrating Pro and Enterprise subscription tiers.
6. **Plan Enforcement Middleware** — guarding document counts and AI endpoints.
7. **Organisation Accounts** — implementing teams, member roles (admin, editor, viewer), and shared document libraries.
8. **Public REST API & API Key Auth** — generation, hashing, and Redis sliding-window rate limiting.
9. **DevOps Automation** — secrets manager integration, CloudWatch monitoring, Sentry alerting, and S3-based DB backup cron scripts.
10. **GitHub Actions CI/CD pipeline** — building and deploying on push.

---

## Step 1 — Project Dependency Updates

### Express Backend Packages
```bash
cd server
npm install stripe ioredis express-rate-limit sentry-sdk @sentry/node dotenv aws-sdk
```

### React Frontend Packages
```bash
cd client
npm install @stripe/stripe-js
```

### Python Microservice Packages
No new dependencies are required, but verify your system has the libraries to support PyMuPDF.

---

## Step 2 — New Database Schema (`phase9.sql`)

Create `server/migrations/phase9.sql`:

```sql
-- ─────────────────────────────────────────────────────────────
-- STRIPE BILLING & PLAN COLUMNS
-- ─────────────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan VARCHAR(50) DEFAULT 'FREE'; -- 'FREE', 'PRO', 'ENTERPRISE'

-- ─────────────────────────────────────────────────────────────
-- ORGANISATIONS & TEAMS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organisations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(255) NOT NULL,
  owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organisation_members (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            VARCHAR(50) DEFAULT 'viewer', -- 'admin', 'editor', 'viewer'
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organisation_id, user_id)
);

CREATE TABLE IF NOT EXISTS organisation_documents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organisation_id, document_id)
);

-- Indexes for quick team lookups
CREATE INDEX IF NOT EXISTS idx_org_members_user ON organisation_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_docs_doc ON organisation_documents(document_id);

-- ─────────────────────────────────────────────────────────────
-- PUBLIC API KEYS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(255) NOT NULL,
  key_prefix  VARCHAR(10) NOT NULL DEFAULT 'lpdf_',
  key_hash    VARCHAR(255) NOT NULL UNIQUE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope       VARCHAR(50) DEFAULT 'read_write', -- 'read_only', 'read_write'
  last_used_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
```

Run it locally to apply changes:
```bash
psql -U postgres -d livepdf -f server/migrations/phase9.sql
```

---

## Step 3 — Dockerisation Files

### Node.js Dockerfile (`server/Dockerfile`)
Both the Express API server and the BullMQ worker container share this image.

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["node", "src/index.js"]
```

### Python FastAPI Dockerfile (`python/Dockerfile`)
Installs the necessary system libraries for `PyMuPDF` (`fitz`).

```dockerfile
FROM python:3.11-slim
WORKDIR /app

# Install system-level build tools and MuPDF dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libmupdf-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
EXPOSE 8001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
```

### React Frontend Dockerfile (`client/Dockerfile`)
A multi-stage build that compiles React assets and serves them via a minimal Nginx container.

```dockerfile
# Stage 1: Build static distribution files
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Tiny production server
FROM nginx:1.25-alpine
COPY --from=build /app/dist /usr/share/nginx/html
# Copy custom server block configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### React Nginx Configuration (`client/nginx.conf`)
Required to make React Router single page application routing function properly.

```nginx
server {
    listen 80;
    server_name localhost;

    location / {
        root /usr/share/nginx/html;
        index index.html index.htm;
        try_files $uri $uri/ /index.html;
    }
}
```

---

## Step 4 — Docker Compose Files

### Local Compose (`docker-compose.yml`)
Binds and launches the entire application locally with PostgreSQL and Redis.

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: livepdf-postgres
    environment:
      POSTGRES_DB: livepdf
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks:
      - livepdf-network

  redis:
    image: redis:7-alpine
    container_name: livepdf-redis
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data
    networks:
      - livepdf-network

  api:
    build:
      context: ./server
      dockerfile: Dockerfile
    container_name: livepdf-api
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=development
      - PORT=5000
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=livepdf
      - DB_USER=postgres
      - DB_PASSWORD=password
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=supersecretjwtkey
      - CLIENT_URL=http://localhost:5173
    depends_on:
      - postgres
      - redis
    networks:
      - livepdf-network

  worker:
    build:
      context: ./server
      dockerfile: Dockerfile
    container_name: livepdf-worker
    command: node worker.js
    environment:
      - NODE_ENV=development
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=livepdf
      - DB_USER=postgres
      - DB_PASSWORD=password
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis
    networks:
      - livepdf-network

  python-diff:
    build:
      context: ./python
      dockerfile: Dockerfile
    container_name: livepdf-python-diff
    ports:
      - "8001:8001"
    environment:
      - PORT=8001
    networks:
      - livepdf-network

  client:
    build:
      context: ./client
      dockerfile: Dockerfile
    container_name: livepdf-client
    ports:
      - "80:80"
    depends_on:
      - api
    networks:
      - livepdf-network

volumes:
  pgdata:
  redisdata:

networks:
  livepdf-network:
    driver: bridge
```

### Production Compose (`docker-compose.prod.yml`)
Utilises pre-built container images, hides database ports from the host, and auto-restarts components on failure.

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    container_name: livepdf-postgres-prod
    environment:
      POSTGRES_DB: livepdf
      POSTGRES_USER_FILE: /run/secrets/db_user
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_user
      - db_password
    volumes:
      - pgdata-prod:/var/lib/postgresql/data
    restart: always
    networks:
      - livepdf-network-prod

  redis:
    image: redis:7-alpine
    container_name: livepdf-redis-prod
    restart: always
    volumes:
      - redisdata-prod:/data
    networks:
      - livepdf-network-prod

  api:
    image: ${API_IMAGE}
    container_name: livepdf-api-prod
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - PORT=5000
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=livepdf
      - DB_USER_FILE=/run/secrets/db_user
      - DB_PASSWORD_FILE=/run/secrets/db_password
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET_FILE=/run/secrets/jwt_secret
      - CLIENT_URL=https://yourdomain.com
    secrets:
      - db_user
      - db_password
      - jwt_secret
    depends_on:
      - postgres
      - redis
    restart: always
    networks:
      - livepdf-network-prod

  worker:
    image: ${API_IMAGE}
    container_name: livepdf-worker-prod
    command: node worker.js
    environment:
      - NODE_ENV=production
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=livepdf
      - DB_USER_FILE=/run/secrets/db_user
      - DB_PASSWORD_FILE=/run/secrets/db_password
      - REDIS_URL=redis://redis:6379
    secrets:
      - db_user
      - db_password
    depends_on:
      - postgres
      - redis
    restart: always
    networks:
      - livepdf-network-prod

  python-diff:
    image: ${PYTHON_IMAGE}
    container_name: livepdf-python-diff-prod
    environment:
      - PORT=8001
    restart: always
    networks:
      - livepdf-network-prod

  client:
    image: ${CLIENT_IMAGE}
    container_name: livepdf-client-prod
    ports:
      - "80:80"
    restart: always
    networks:
      - livepdf-network-prod

volumes:
  pgdata-prod:
  redisdata-prod:

secrets:
  db_user:
    file: ./secrets/db_user.txt
  db_password:
    file: ./secrets/db_password.txt
  jwt_secret:
    file: ./secrets/jwt_secret.txt

networks:
  livepdf-network-prod:
    driver: bridge
```

---

## Step 5 — Host Nginx Configuration & Let's Encrypt

On your EC2 host machine, install Nginx and configure SSL termination:

### Nginx Configuration File (`/etc/nginx/sites-available/livepdf`)
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Certbot will verify domain validation files under this path
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Redirect all HTTP requests to HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name yourdomain.com www.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # React Frontend Router and files
    location / {
        proxy_pass http://localhost:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Express Node.js Server
    location /api {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSockets / Socket.io Upgrade Routing
    location /socket.io/ {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Certbot commands on EC2 Ubuntu
```bash
sudo apt update
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

---

## Step 6 — Subscription Plans & Stripe Integration

### Backend Stripe Controller (`server/src/controllers/stripeController.js`)
```javascript
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const pool = require('../config/db');

async function createCheckoutSession(req, res) {
  const { plan } = req.body; // 'PRO' or 'ENTERPRISE'
  const userId = req.user.id;

  let priceId = '';
  if (plan === 'PRO') priceId = process.env.STRIPE_PRO_PRICE_ID;
  else if (plan === 'ENTERPRISE') priceId = process.env.STRIPE_ENTERPRISE_PRICE_ID;
  else return res.status(400).json({ error: 'Invalid plan selected' });

  try {
    const userRes = await pool.query('SELECT email, stripe_customer_id FROM users WHERE id = $1', [userId]);
    const user = userRes.rows[0];

    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email });
      customerId = customer.id;
      await pool.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, userId]);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${process.env.CLIENT_URL}/dashboard?billing=success`,
      cancel_url: `${process.env.CLIENT_URL}/dashboard?billing=cancel`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Stripe Checkout Error:', error);
    res.status(500).json({ error: 'Failed to create Stripe session' });
  }
}

async function handleWebhook(req, res) {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const session = event.data.object;

  if (event.type === 'checkout.session.completed' || event.type === 'customer.subscription.updated') {
    const customerId = session.customer;
    const subscriptionId = session.subscription || session.id;
    const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
    
    let plan = 'FREE';
    const priceId = stripeSubscription.items.data[0].price.id;
    if (priceId === process.env.STRIPE_PRO_PRICE_ID) plan = 'PRO';
    else if (priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID) plan = 'ENTERPRISE';

    await pool.query(
      `UPDATE users 
       SET stripe_subscription_id = $1, plan = $2 
       WHERE stripe_customer_id = $3`,
      [subscriptionId, plan, customerId]
    );
  }

  if (event.type === 'customer.subscription.deleted') {
    const customerId = session.customer;
    await pool.query(
      `UPDATE users 
       SET stripe_subscription_id = NULL, plan = 'FREE' 
       WHERE stripe_customer_id = $1`,
      [customerId]
    );
  }

  res.json({ received: true });
}

module.exports = { createCheckoutSession, handleWebhook };
```

---

## Step 7 — Plan Enforcement Middleware

Create `server/src/middleware/planEnforcer.js` to guard limits:

```javascript
const pool = require('../config/db');

async function checkPlanLimits(req, res, next) {
  const userId = req.user.id;

  try {
    const userRes = await pool.query('SELECT plan FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    req.userPlan = userRes.rows[0].plan || 'FREE';
    next();
  } catch (err) {
    console.error('Error fetching plan limits:', err);
    res.status(500).json({ error: 'Failed to verify billing limits' });
  }
}

function restrictToPlan(allowedPlans) {
  return (req, res, next) => {
    if (!allowedPlans.includes(req.userPlan)) {
      return res.status(403).json({
        error: `This action requires a ${allowedPlans.join(' or ')} plan. Please upgrade your subscription.`,
      });
    }
    next();
  };
}

async function enforceDocumentLimit(req, res, next) {
  if (req.userPlan === 'FREE') {
    try {
      const docCountRes = await pool.query('SELECT COUNT(*) FROM documents WHERE owner_id = $1', [req.user.id]);
      const count = parseInt(docCountRes.rows[0].count);
      if (count >= 3) {
        return res.status(403).json({
          error: 'Free tier limits reached (Max 3 documents). Please upgrade to Pro or Enterprise for unlimited files.',
        });
      }
    } catch (err) {
      return res.status(500).json({ error: 'Failed to check document constraints' });
    }
  }
  next();
}

module.exports = { checkPlanLimits, restrictToPlan, enforceDocumentLimit };
```

### Apply middleware in API routes:
```javascript
// Example in server/src/routes/documents.js
const { checkPlanLimits, enforceDocumentLimit } = require('../middleware/planEnforcer');
const auth = require('../middleware/auth');

router.post('/', auth, checkPlanLimits, enforceDocumentLimit, upload.single('pdf'), documentController.upload);
```

---

## Step 8 — Organisation Accounts

Create `server/src/controllers/organisationController.js`:

```javascript
const pool = require('../config/db');

async function createOrganisation(req, res) {
  const { name } = req.body;
  const ownerId = req.user.id;

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const orgRes = await client.query(
        'INSERT INTO organisations (name, owner_id) VALUES ($1, $2) RETURNING *',
        [name, ownerId]
      );
      const org = orgRes.rows[0];

      // Add owner as admin member
      await client.query(
        'INSERT INTO organisation_members (organisation_id, user_id, role) VALUES ($1, $2, $3)',
        [org.id, ownerId, 'admin']
      );

      await client.query('COMMIT');
      res.status(201).json(org);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create organisation' });
  }
}

async function inviteMember(req, res) {
  const { orgId, email, role } = req.body; // role: admin, editor, viewer

  try {
    // Check if user exists
    const userRes = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User with this email not registered yet' });
    }
    const targetUserId = userRes.rows[0].id;

    await pool.query(
      `INSERT INTO organisation_members (organisation_id, user_id, role) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (organisation_id, user_id) DO UPDATE SET role = $3`,
      [orgId, targetUserId, role]
    );

    res.json({ success: true, message: 'Member added to organization.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to add member to organization' });
  }
}

module.exports = { createOrganisation, inviteMember };
```

---

## Step 9 — Public REST API with API Key Auth

### API Key Middleware (`server/src/middleware/apiKeyAuth.js`)
Handles both dashboard-facing cookies/JWTs and developer client APIs inside requests.

```javascript
const crypto = require('crypto');
const pool = require('../config/db');

async function apiKeyAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer lpdf_')) {
    const rawKey = authHeader.split(' ')[1];
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    try {
      const keyRes = await pool.query(
        `SELECT k.*, u.email, u.plan 
         FROM api_keys k 
         JOIN users u ON k.user_id = u.id 
         WHERE k.key_hash = $1 AND k.revoked_at IS NULL`,
        [keyHash]
      );

      if (keyRes.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid or revoked API key' });
      }

      const keyData = keyRes.rows[0];
      req.user = {
        id: keyData.user_id,
        email: keyData.email,
        plan: keyData.plan,
        isApiKey: true,
      };

      // Set last used timestamp asynchronously
      pool.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [keyData.id]).catch(console.error);
      
      return next();
    } catch (err) {
      return res.status(500).json({ error: 'Internal API auth database exception' });
    }
  }

  next(); // fallback to standard JWT middleware downstream
}

module.exports = apiKeyAuth;
```

---

## Step 10 — Redis Sliding Window API Key Rate Limiting

Create `server/src/middleware/rateLimiter.js`:

```javascript
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

async function apiKeyRateLimiter(req, res, next) {
  if (!req.user || !req.user.isApiKey) {
    return next(); // Skip if authenticated via cookie JWT
  }

  const userId = req.user.id;
  const plan = req.user.plan || 'FREE';

  // Apply tiered rate limits per hour
  let hourlyLimit = 100;
  if (plan === 'PRO') hourlyLimit = 1000;
  else if (plan === 'ENTERPRISE') hourlyLimit = 10000;

  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 Hour sliding window
  const key = `ratelimit:${userId}`;
  const clearBefore = now - windowMs;

  try {
    const multi = redis.multi();
    multi.zremrangebyscore(key, 0, clearBefore); // clean logs
    multi.zadd(key, now, now); // log current transaction
    multi.zcard(key); // return total requests count in current frame
    multi.pexpire(key, windowMs);

    const execRes = await multi.exec();
    const currentUsage = execRes[2][1];

    res.setHeader('X-RateLimit-Limit', hourlyLimit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, hourlyLimit - currentUsage));

    if (currentUsage > hourlyLimit) {
      res.setHeader('Retry-After', 3600);
      return res.status(429).json({ error: 'Hourly rate limit exceeded. Try again in an hour.' });
    }

    next();
  } catch (error) {
    console.error('Redis Rate Limiting Error:', error);
    next(); // Fail open for API stability
  }
}

module.exports = apiKeyRateLimiter;
```

Apply this rate limiting config globally in `server/src/index.js` for API routes:
```javascript
const apiKeyAuth = require('./middleware/apiKeyAuth');
const apiKeyRateLimiter = require('./middleware/rateLimiter');

app.use('/api', apiKeyAuth, apiKeyRateLimiter);
```

---

## Step 11 — Host PM2 & Docker Compose Management

Even with Docker, running compose as a system process via `PM2` protects against unexpected container stops, network changes, or host reboot failures.

### Configure a PM2 Ecosystem File (`ecosystem.config.js`)
Create this in the root of the project on the EC2 server:

```javascript
module.exports = {
  apps: [
    {
      name: "livepdf-docker-stack",
      script: "docker-compose",
      args: "-f docker-compose.prod.yml up --build",
      autorestart: true,
      watch: false,
      max_restarts: 5,
      restart_delay: 10000, // wait 10s before retrying
    }
  ]
};
```

Start the daemon process on EC2:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

---

## Step 12 — Sentry Application Logging

Configure error monitoring in `server/src/index.js` using `@sentry/node`:

```javascript
const Sentry = require('@sentry/node');

if (process.env.NODE_ENV === 'production') {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1,
  });

  // The request handler must be the first middleware on the app
  app.use(Sentry.Handlers.requestHandler());
}

// ... rest of express middlewares ...

if (process.env.NODE_ENV === 'production') {
  // The error handler must be before any other error middleware and after all controllers
  app.use(Sentry.Handlers.errorHandler());
}
```

---

## Step 13 — PostgreSQL Database Backups to S3

On your production server, create a script `/home/ubuntu/backup_db.sh` to run PG backups and push to AWS S3 storage:

```bash
#!/bin/bash
# Load environment variables
source /home/ubuntu/.env

TIMESTAMP=$(date +"%Y-%m-%d-%H%M%S")
BACKUP_DIR="/home/ubuntu/db_backups"
BACKUP_FILE="$BACKUP_DIR/livepdf-$TIMESTAMP.sql.gz"

mkdir -p $BACKUP_DIR

# Run PostgreSQL dump using the production credentials
PGPASSWORD=$DB_PASSWORD pg_dump -h 127.0.0.1 -U $DB_USER -d $DB_NAME | gzip > $BACKUP_FILE

# Upload to Amazon S3
aws s3 cp $BACKUP_FILE s3://$AWS_BACKUPS_BUCKET/livepdf-$TIMESTAMP.sql.gz

# Delete local copy
rm $BACKUP_FILE
```

Add a system cron job to automate backups nightly at 2:00 AM:
```bash
crontab -e
# Add line:
0 2 * * * /bin/bash /home/ubuntu/backup_db.sh > /dev/null 2>&1
```

---

## Step 14 — GitHub Actions CI/CD Configuration

Create `.github/workflows/deploy.yml`:

```yaml
name: LivePDF Production Continuous Deployment

on:
  push:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Use Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Run Backend Tests
        run: |
          cd server
          npm ci
          npm test

  build-and-push:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to Amazon ECR
        uses: aws-actions/amazon-ecr-login@v2
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          AWS_REGION: us-east-1

      - name: Build and Push Server Image
        uses: docker/build-push-action@v5
        with:
          context: ./server
          push: true
          tags: ${{ secrets.ECR_REGISTRY }}/livepdf-server:latest

      - name: Build and Push Client Image
        uses: docker/build-push-action@v5
        with:
          context: ./client
          push: true
          tags: ${{ secrets.ECR_REGISTRY }}/livepdf-client:latest

      - name: Build and Push Python Image
        uses: docker/build-push-action@v5
        with:
          context: ./python
          push: true
          tags: ${{ secrets.ECR_REGISTRY }}/livepdf-python:latest

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - name: SSH to EC2 and Deploy
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.ECR_HOST_IP }}
          username: ubuntu
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /home/ubuntu/livepdf
            aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin ${{ secrets.ECR_REGISTRY }}
            docker-compose -f docker-compose.prod.yml pull
            pm2 restart livepdf-docker-stack
```

---

## Step 15 — Verification & Run Manual Checkups

Once deployment is running, perform the following validation actions:

1. **Verify Docker Status**: Run `docker ps` to ensure all containers are running and that their status is shown as healthy.
2. **Check Nginx Logging**: Review raw access logs with `tail -f /var/log/nginx/access.log` to watch the proxy forward requests.
3. **Verify SSL**: Visit `https://yourdomain.com` and inspect the browser certificate lock details to confirm validity.
4. **Trigger Webhooks**: Use Stripe CLI (`stripe trigger checkout.session.completed`) to verify the database updates the plan column to 'PRO'.
5. **Test Rate Limits**: Script 101 requests using an API Key linked to the 'FREE' plan to confirm you receive a `429 Too Many Requests` error on the 101st request.
