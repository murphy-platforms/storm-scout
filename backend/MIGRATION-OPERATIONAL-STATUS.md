# Operational Status Migration Guide

**Issue:** API returns legacy 2-3 category operational status (`Open`, `At Risk`, `Closed`) but UIs expect modern 4-category system (`open_normal`, `open_restricted`, `pending`, `closed`).

**Impact:** Operational Status counts show 0 for restricted/pending/closed in both Classic and Beta UIs.

**Solution:** Run production migration to convert legacy values to new 4-category system.

---

## Migration Mapping

| Legacy Value | New Value | Description |
|--------------|-----------|-------------|
| `Open` | `open_normal` | Site operating normally |
| `At Risk` | `open_restricted` | Site open but with restrictions/monitoring |
| `Closed` | `closed` | Site closed due to weather |
| `Pending` | `pending` | Decision pending on operational status |

---

## Running the Migration

### Option 1: Automated Script (Recommended)

From the `backend/` directory:

```bash
cd backend
./scripts/run-production-migration.sh
```

The script will:
1. Load database credentials from `.env`
2. Show current state
3. Ask for confirmation
4. Run the migration
5. Display before/after results

### Option 2: Manual SQL Execution

If you prefer to run the SQL manually:

```bash
cd backend
mysql -h $DB_HOST -u $DB_USER -p $DB_NAME < src/data/migrations/20260214-migrate-operational-status-production.sql
```

### Option 3: Via cPanel phpMyAdmin

1. Log into cPanel
2. Open phpMyAdmin
3. Select `***REDACTED***` database
4. Click "SQL" tab
5. Paste contents of `src/data/migrations/20260214-migrate-operational-status-production.sql`
6. Click "Go"
7. Review the "AFTER MIGRATION" results

---

## Testing Locally First

Before running on production, test locally:

```bash
# 1. Connect to local database
mysql -u root -p storm_scout

# 2. Check current state
SELECT operational_status, COUNT(*) FROM site_status GROUP BY operational_status;

# 3. Run migration (from backend directory)
mysql -u root -p storm_scout < src/data/migrations/20260214-migrate-operational-status-production.sql

# 4. Verify results
SELECT operational_status, COUNT(*) FROM site_status GROUP BY operational_status;

# Expected result: All values should be open_normal, open_restricted, pending, or closed
```

---

## Post-Migration Steps

### 1. Restart Backend (Production)

```bash
# Via SSH to production server
ssh -p 21098 mwqtiakilx@your-domain.example.com
touch ~/storm-scout/tmp/restart.txt
```

Or via cPanel → Node.js app → Restart

### 2. Verify API Response

```bash
curl -s "https://your-domain.example.com/api/status/overview" | jq '.operational_status_counts'
```

**Expected output:**
```json
[
  {"operational_status": "closed", "count": 2},
  {"operational_status": "open_restricted", "count": 5},
  {"operational_status": "pending", "count": 3},
  {"operational_status": "open_normal", "count": 209}
]
```

(Numbers will vary based on actual data)

### 3. Verify Both UIs

**Classic UI:**
- Visit https://your-domain.example.com
- Check "Operational Status" section shows counts for all 4 categories
- Counts should match API response

**Beta UI:**
- Visit https://your-domain.example.com/beta/index.html
- Check "Operational Status" donut chart shows all 4 segments
- Legend should show: Open, Restricted, Pending, Closed

---

## Rollback Plan

If issues occur, the migration is **safe to re-run**. The UPDATE statement only modifies legacy values.

To manually rollback (not recommended unless critical issue):

```sql
UPDATE site_status
SET operational_status = CASE operational_status
    WHEN 'open_normal' THEN 'Open'
    WHEN 'open_restricted' THEN 'At Risk'
    WHEN 'closed' THEN 'Closed'
    WHEN 'pending' THEN 'Pending'
END
WHERE operational_status IN ('open_normal', 'open_restricted', 'closed', 'pending');
```

---

## What's Been Fixed

✅ `backend/src/data/seed.sql` - Updated to use new 4-category system  
✅ `backend/src/data/migrations/20260214-migrate-operational-status-production.sql` - Created  
✅ `backend/scripts/run-production-migration.sh` - Helper script created  
✅ `backend/src/models/siteStatus.js` - Already supports both legacy and new values (no changes needed)

---

## Timeline

- **Estimated Time:** 5-10 minutes total
- **Downtime:** None (migration runs in <1 second, restart takes ~5 seconds)
- **Risk Level:** Low (idempotent migration, no data loss)

---

## Questions?

Contact: [Your contact info or refer to AGENTS.md]

**Co-Authored-By:** Warp <agent@warp.dev>
