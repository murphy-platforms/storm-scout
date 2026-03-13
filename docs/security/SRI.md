# Subresource Integrity (SRI)

This document describes Storm Scout's implementation of Subresource Integrity for CDN-hosted resources.

## What is SRI?

Subresource Integrity (SRI) is a security feature that allows browsers to verify that files fetched from CDNs haven't been tampered with. By adding a cryptographic hash to `<script>` and `<link>` tags, the browser checks that the downloaded file matches the expected hash before executing it.

## Why It Matters

If a CDN gets compromised (or a malicious actor performs a supply-chain attack), they could inject malicious code into third-party libraries. Without SRI, the browser would blindly execute that code. With SRI, the browser blocks execution when the hash doesn't match.

**OWASP Reference**: A08:2021 - Software and Data Integrity Failures

## Protected Resources

Storm Scout uses SRI for all CDN-hosted resources:

### Bootstrap CSS (5.3.8)
```html
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css" 
      rel="stylesheet"
      integrity="sha384-sRIl4kxILFvY47J16cr9ZwB07vP4J8+LH7qKQnuqkuIAvNWLzeN8tE5YBujZqJLB"
      crossorigin="anonymous">
```

### Bootstrap JS Bundle (5.3.8)
```html
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js"
        integrity="sha384-FKyoEForCGlyvwx9Hj09JcYn3nv7wiPVlz7YYwJrWVcXK/BmnVDxM+D2scQbITxI"
        crossorigin="anonymous"></script>
```

### Bootstrap Icons (1.13.1)
```html
<link rel="stylesheet" 
      href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.13.1/font/bootstrap-icons.min.css"
      integrity="sha384-CK2SzKma4jA5H/MXDUU7i1TqZlCFaD4T01vtyDFvPlD97JQyS+IsSh1nI2EFbpyk"
      crossorigin="anonymous">
```

### Leaflet CSS (1.9.4)
```html
<link rel="stylesheet" 
      href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      integrity="sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H"
      crossorigin="anonymous">
```

### Leaflet.js (1.9.4)
```html
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
        integrity="sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH"
        crossorigin="anonymous"></script>
```

## Hash Verification

SRI hashes were generated using SHA-384 (recommended algorithm):

```bash
# Generate hash for any CDN resource
curl -s <URL> | openssl dgst -sha384 -binary | openssl base64 -A
```

## Updating Dependencies

When upgrading Bootstrap or other CDN resources:

1. **Update the URL** to the new version
2. **Generate new hash** using the command above
3. **Update all HTML files** with the new integrity hash
4. **Test in browser** - check console for SRI errors
5. **Update this document** with the new hash values

## Files Using SRI

All frontend HTML files include SRI attributes:
- `frontend/index.html`
- `frontend/advisories.html`
- `frontend/offices.html`
- `frontend/office-detail.html`
- `frontend/notices.html`
- `frontend/filters.html`
- `frontend/map.html`
- `frontend/sources.html`
- `frontend/disclaimer.html`

## Browser Support

SRI is supported in all modern browsers. Older browsers that don't support SRI will ignore the `integrity` attribute and load the resource normally (graceful degradation).

## Related Security Controls

- **Content-Security-Policy**: Restricts which domains can serve scripts/styles
- **helmet.js**: Adds security headers including CSP (Issue #3)
- **XSS Prevention**: Secure `html` tagged templates (Issue #2)

## References

- [MDN: Subresource Integrity](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity)
- [OWASP: SRI](https://owasp.org/www-community/controls/SubresourceIntegrity)
- [SRI Hash Generator](https://www.srihash.org/)
