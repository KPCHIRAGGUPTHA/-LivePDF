const IORedis = require('ioredis');

const redis = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

redis.on('error', (err) => {
  console.error('Rate Limiter Redis connection error:', err.message);
});

async function apiKeyRateLimiter(req, res, next) {
  if (!req.user || !req.user.isApiKey) {
    return next(); // Skip rate limit if authenticated via dashboard JWT/Cookie
  }

  const userId = req.user.id;
  const plan = req.user.plan || 'FREE';

  // Rate limits per hour
  let hourlyLimit = 100;
  if (plan === 'PRO') hourlyLimit = 1000;
  else if (plan === 'ENTERPRISE') hourlyLimit = 10000;

  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 Hour sliding window
  const key = `ratelimit:${userId}`;
  const clearBefore = now - windowMs;

  try {
    const multi = redis.multi();
    multi.zremrangebyscore(key, 0, clearBefore); // Clean old requests
    multi.zadd(key, now, now); // Add current request timestamp
    multi.zcard(key); // Count active requests in current window
    multi.pexpire(key, windowMs); // Auto-expire window key

    const execRes = await multi.exec();
    
    // zcard result is in execRes[2][1]
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
