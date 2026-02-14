/**
 * Rate Limiting Middleware
 * Protects API from abuse and ensures fair usage
 */

const rateLimit = require('express-rate-limit');

/**
 * General API rate limiter
 * 100 requests per 15 minutes per IP
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,                   // 100 requests per window
  message: {
    success: false,
    error: 'Too many requests, please try again later',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,      // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false,       // Disable `X-RateLimit-*` headers
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health';
  },
  // Use default keyGenerator (handles IPv6 properly)
  // Behind proxy: set app.set('trust proxy', 1) in app.js
  validate: { xForwardedForHeader: false }  // Disable X-Forwarded-For validation warning
});

/**
 * Stricter limiter for write operations (POST, PUT, DELETE)
 * 20 requests per 15 minutes per IP
 */
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 20,                    // 20 requests per window
  message: {
    success: false,
    error: 'Too many write requests, please try again later',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false }
});

/**
 * Very strict limiter for authentication/sensitive endpoints
 * 10 requests per 15 minutes per IP
 * (Not used currently, but available for future auth endpoints)
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 10,                    // 10 requests per window
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false }
});

module.exports = {
  apiLimiter,
  writeLimiter,
  authLimiter
};
