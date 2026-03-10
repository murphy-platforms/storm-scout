# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in Storm Scout, please report it responsibly.

### For Internal Team Members

1. **Do not** create a public GitHub issue for security vulnerabilities
2. Create a **private** GitHub Security Advisory:
   - Go to the repository's Security tab
   - Click "Report a vulnerability"
   - Provide details of the vulnerability
3. Alternatively, contact the project maintainers directly

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if known)

### Response Timeline

- **Acknowledgment**: Within 2 business days
- **Initial Assessment**: Within 5 business days
- **Resolution Target**: Based on severity
  - Critical: 24-48 hours
  - High: 1 week
  - Medium: 2 weeks
  - Low: Next release cycle

## Security Update Process

Security updates will be:
1. Developed and tested in a private branch
2. Deployed to production after verification
3. Documented in the security assessments folder

## Known Security Contacts

- Project Maintainers (via GitHub)
- Organization Security Team (per internal directory)

---

For the internal vulnerability tracking table, dependency override documentation, and secret rotation policy, see [`docs/security/README.md`](../docs/security/README.md).
