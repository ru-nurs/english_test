function defaultKeyResolver(req) {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const userId = req.user?.id ? `user:${req.user.id}` : "";
  return userId || `ip:${ip}`;
}

function createRateLimiter({
  keyPrefix,
  windowMs,
  maxRequests,
  db,
  enabled = true,
  errorMessage = "Слишком много запросов. Попробуйте позже.",
  resolveKey = defaultKeyResolver,
  cleanupIntervalMs = 1000 * 60 * 5,
}) {
  if (!enabled) {
    return function disabledRateLimitMiddleware(req, res, next) {
      return next();
    };
  }

  const buckets = new Map();
  let nextCleanupAt = Date.now() + cleanupIntervalMs;

  function cleanupInMemory(now) {
    if (now < nextCleanupAt) {
      return;
    }

    for (const [bucketKey, state] of buckets.entries()) {
      if (!state || state.resetAt <= now) {
        buckets.delete(bucketKey);
      }
    }
    nextCleanupAt = now + cleanupIntervalMs;
  }

  async function cleanupDb(now) {
    if (!db || now < nextCleanupAt) {
      return;
    }
    await db.run("DELETE FROM rate_limits WHERE reset_at <= ?", [now]);
    nextCleanupAt = now + cleanupIntervalMs;
  }

  function applyHeaders(res, { limit, remaining, resetAt }) {
    const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
    res.setHeader("X-RateLimit-Limit", String(limit));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, remaining)));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));
    return retryAfterSeconds;
  }

  async function useDbLimiter(req, res, next, bucketKey, now) {
    await cleanupDb(now);

    const row = await db.get("SELECT count, reset_at FROM rate_limits WHERE key = ? LIMIT 1", [
      bucketKey,
    ]);

    if (!row || Number(row.reset_at) <= now) {
      const resetAt = now + windowMs;
      await db.run(
        `INSERT INTO rate_limits (key, count, reset_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET count = excluded.count, reset_at = excluded.reset_at`,
        [bucketKey, 1, resetAt]
      );
      applyHeaders(res, { limit: maxRequests, remaining: maxRequests - 1, resetAt });
      return next();
    }

    const used = Number(row.count || 0);
    const resetAt = Number(row.reset_at);
    if (used >= maxRequests) {
      const retryAfter = applyHeaders(res, { limit: maxRequests, remaining: 0, resetAt });
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({
        error: errorMessage,
        retryAfterSeconds: retryAfter,
      });
    }

    await db.run("UPDATE rate_limits SET count = count + 1 WHERE key = ?", [bucketKey]);
    applyHeaders(res, {
      limit: maxRequests,
      remaining: maxRequests - (used + 1),
      resetAt,
    });
    return next();
  }

  function useMemoryLimiter(req, res, next, bucketKey, now) {
    cleanupInMemory(now);

    const state = buckets.get(bucketKey);
    if (!state || state.resetAt <= now) {
      const resetAt = now + windowMs;
      buckets.set(bucketKey, { count: 1, resetAt });
      applyHeaders(res, { limit: maxRequests, remaining: maxRequests - 1, resetAt });
      return next();
    }

    if (state.count >= maxRequests) {
      const retryAfter = applyHeaders(res, {
        limit: maxRequests,
        remaining: 0,
        resetAt: state.resetAt,
      });
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({
        error: errorMessage,
        retryAfterSeconds: retryAfter,
      });
    }

    state.count += 1;
    applyHeaders(res, {
      limit: maxRequests,
      remaining: maxRequests - state.count,
      resetAt: state.resetAt,
    });
    return next();
  }

  return async function rateLimitMiddleware(req, res, next) {
    const now = Date.now();
    const principal = String(resolveKey(req) || "anonymous");
    const bucketKey = `${keyPrefix}:${principal}`;

    if (db) {
      return useDbLimiter(req, res, next, bucketKey, now);
    }
    return useMemoryLimiter(req, res, next, bucketKey, now);
  };
}

module.exports = {
  createRateLimiter,
};
