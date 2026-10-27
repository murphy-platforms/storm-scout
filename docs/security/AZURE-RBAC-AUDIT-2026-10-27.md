# Azure RBAC Audit — Storm Scout PreProd

**Audit date:** 2026-10-27  
**Status:** Verified  
**Scope:** `/subscriptions/b29c32ef-fe33-4836-affa-cc9cd9e38435/resourceGroups/StormScout-PreProd`

## Principal

| Attribute | Value |
|---|---|
| Principal type | Service principal |
| Application (client) ID supplied for verification | `312b47e3-20f9-4b06-9f19-8654bd0369fe` |
| Resolved principal object ID | `6b604902-fcd6-4a4f-9e90-e820ed0b1573` |

## Effective role assignments

The following Azure RBAC assignments were verified at the exact resource-group scope. Both assignments are unconditional.

| Role | Assignment ID | Effective capability |
|---|---|---|
| Contributor | `26d35f0a-183b-475d-b103-e0c6d4c20aa1` | Create, update, and delete Azure resources in the resource group; does not independently grant RBAC administration. |
| User Access Administrator | `33afac99-5555-408d-8401-23bb2e61d4d0` | Create, update, and remove Azure RBAC role assignments within the resource group. |

Together, these assignments allow the service principal to manage resources and administer Azure RBAC access within `StormScout-PreProd`.

## Verification evidence

- `az role assignment list` for the principal at the resource-group scope, including inherited assignments, returned only the two assignments above.
- Azure deny-assignment enumeration at the resource-group scope returned no deny assignments.
- The User Access Administrator assignment was created on 2026-10-27.

## Limits and review guidance

This audit records Azure RBAC assignments and deny assignments at the stated resource-group scope only. It does not establish application-level permissions, access granted directly on child resources, or tenant-level controls that may affect authentication. Review these roles whenever deployment automation, service ownership, or the least-privilege model changes.
