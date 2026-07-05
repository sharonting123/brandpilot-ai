const buckets = new Map();

function checkRateLimit(key, options = {}) {
  const now = Date.now();
  const windowMs = options.windowMs || 60 * 1000;
  const limit = Number(options.limit || process.env.AGENT_RATE_LIMIT_PER_MINUTE || 12);
  const bucketKey = key || "anonymous";
  const current = buckets.get(bucketKey);

  if (!current || current.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: Math.max(0, limit - 1), resetAt: now + windowMs };
  }

  current.count += 1;
  if (current.count > limit) {
    return { allowed: false, remaining: 0, resetAt: current.resetAt };
  }

  return { allowed: true, remaining: Math.max(0, limit - current.count), resetAt: current.resetAt };
}

module.exports = {
  checkRateLimit
};
