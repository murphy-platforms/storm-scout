/**
 * Rate Limiting Middleware
 * Protects API from abuse and ensures fair usage
 */

const rateLimit = require('express-rate-limit');

/**
 * General API rate limiter
 * 30,000 requests per 60-minute window per IP.
 * The 60-minute window (vs. the previous 15-minute window) accommodates
 * corporate environments where many users share a single NAT IP address.
 * The per-minute allowance (500 req/min) is unchanged from the prior config
 * (5000/15min = 333/min → 30000/60min = 500/min), providing the same
 * sustained-rate protection with a larger burst tolerance for NAT clients.
 * Configurable via RATE_LIMIT_API_MAX env var for production tuning.
 */
const apiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 60 minutes
    max: parseInt(process.env.RATE_LIMIT_API_MAX) || 30000, // 30,000 requests per window
    message: {
        success: false,
        error: 'Too many requests, please try again later',
        retryAfter: '60 minutes'
    },
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false, // Disable `X-RateLimit-*` headers
    skip: (req) => {
        // Skip rate limiting for health checks
        return req.path === '/health';
    },
    // Log when rate limit is hit (temporary debugging)
    handler: (req, res, next, options) => {
        const clientIp = req.ip || req.connection.remoteAddress;
        const forwardedFor = req.headers['x-forwarded-for'];
        console.error(
            `[RATE LIMIT] IP: ${clientIp} | X-Forwarded-For: ${forwardedFor} | Path: ${req.path} | User-Agent: ${req.headers['user-agent']?.substring(0, 100)}`
        );
        res.status(options.statusCode).json(options.message);
    },
    // Use default keyGenerator (handles IPv6 properly)
    // Behind proxy: set app.set('trust proxy', 1) in app.js
    validate: { xForwardedForHeader: false } // Disable X-Forwarded-For validation warning
});

/**
 * Stricter limiter for write operations (POST, PUT, DELETE)
 * 20 requests per 15 minutes per IP
 */
const writeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 requests per window
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
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 requests per window
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
