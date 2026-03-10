# Trust Proxy Configuration

This document describes Storm Scout's Express trust proxy configuration for proper client IP detection behind reverse proxies.

## The Problem

Storm Scout runs behind a reverse proxy. Without proper configuration:

1. **Rate limiting fails** - All requests appear to come from the proxy's IP, not real clients
2. **Logging is inaccurate** - `req.ip` returns the proxy IP, not the actual user
3. **Security controls are bypassed** - IP-based restrictions don't work correctly

## The Solution

Express's `trust proxy` setting tells the app to use the `X-Forwarded-For` header for client IP detection:

```javascript
// In app.js, before any middleware
app.set('trust proxy', 1);  // Trust first proxy hop
```

## Configuration Values

| Value | Meaning | Use Case |
|-------|---------|----------|
| `false` | Disable (default) | Direct connections, no proxy |
| `true` | Trust all proxies | **DANGEROUS** - allows IP spoofing |
| `1` | Trust first proxy | Single proxy (our setup) |
| `2` | Trust first two proxies | Load balancer + proxy |
| `'loopback'` | Trust loopback addresses | localhost proxies only |

## Storm Scout Configuration

**Setting:** `trust proxy = 1`

**Reason:** Shared hosting typically uses a single reverse proxy layer. Setting `1` means:
- Express trusts the first (and only) `X-Forwarded-For` value
- The rate limiter sees real client IPs
- Spoofed headers from clients are ignored

## Security Considerations

### Why not `trust proxy = true`?

Setting `true` trusts ALL proxies in the chain, including any the client might inject. A malicious user could send:

```
X-Forwarded-For: fake-ip, real-ip
```

With `trust proxy = true`, Express would use `fake-ip`, allowing rate limit bypass.

With `trust proxy = 1`, Express uses only the rightmost (proxy-added) value.

### Verification

After enabling, verify the rate limiter sees real IPs:

```javascript
// Temporary logging in rateLimiter.js
console.log('Client IP:', req.ip);
```

Check logs show varied client IPs, not just `127.0.0.1` or the server IP.

## Affected Components

- **Rate Limiter** (`middleware/rateLimiter.js`) - Uses `req.ip` for tracking
- **Request Logging** - Development logging shows real client IPs
- **Security Headers** - Any future IP-based access controls

## Infrastructure Context

```
Client → Reverse Proxy → Node.js/Express
         adds X-Forwarded-For   reads header with trust proxy
```

## References

- [Express behind proxies](https://expressjs.com/en/guide/behind-proxies.html)
- [OWASP: Logging and Monitoring](https://owasp.org/Top10/A09_2021-Security_Logging_and_Monitoring_Failures/)
