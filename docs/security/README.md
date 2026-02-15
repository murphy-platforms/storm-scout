# Security Documentation

This folder contains security-related documentation for the Storm Scout project.

## Classification

**Internal Use Only** - This documentation is intended for authorized team members only.

## Contents

### `/assessments`
Point-in-time security assessments and vulnerability reports.

| File | Date | Type | Status |
|------|------|------|--------|
| `2026-02-15-security-assessment.html` | Feb 15, 2026 | Application Security Review | Active |

### Active Vulnerability Tracking

| Issue | CVE | Severity | Package | Status |
|-------|-----|----------|---------|--------|
| [#1](https://github.com/Prometric-Site-Engineering/storm-scout/issues/1) | N/A | Critical | Backend Auth | Open |
| [#2](https://github.com/Prometric-Site-Engineering/storm-scout/issues/2) | N/A | High | Frontend XSS | Open |
| [#3](https://github.com/Prometric-Site-Engineering/storm-scout/issues/3) | N/A | Medium | Security Headers | Open |
| [#4](https://github.com/Prometric-Site-Engineering/storm-scout/issues/4) | N/A | Medium | CDN SRI | Open |
| [#5](https://github.com/Prometric-Site-Engineering/storm-scout/issues/5) | N/A | Medium | Rate Limiting | Open |
| [#6](https://github.com/Prometric-Site-Engineering/storm-scout/issues/6) | CVE-2026-2391 | Low | qs (dependency) | Open |

### `/policies` (Future)
Security policies and procedures specific to Storm Scout.

## Access Control

Access to this documentation is controlled through GitHub repository permissions. Only users with access to the `storm-scout` repository can view these files.

## Related Resources

- **GitHub Issues**: Security findings are tracked as GitHub Issues with the `security` label
- **SECURITY.md**: See `/.github/SECURITY.md` for vulnerability reporting procedures

## Document Retention

Security assessments should be retained for a minimum of 3 years or as required by organizational policy. Assessments may be archived (not deleted) after all findings have been remediated and verified.

## Questions

For questions about security documentation, contact the Storm Scout project maintainers or your organization's security team.
