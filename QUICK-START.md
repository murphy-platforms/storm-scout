# Storm Scout - Quick Start Guide
## Fix Severity Bug & Run Database Tests

---

## 🚀 Run This Now

You have requested to:
1. **Retrieve DB password from Keychain** and run database tests
2. **Fix the "Unknown" severity bug** in production

**Single command to do both:**

```bash
./fix-severity-bug.sh
```

This script will:
1. Prompt you for the database password (secure hidden input)
2. Test the database connection
3. Check for "Unknown" severity advisories
4. Show you the affected advisories
5. Ask for confirmation before fixing
6. Run the SQL UPDATE to fix the bug
7. Verify the fix was successful
8. Run comprehensive database tests (`test-database.sh`)

---

## 📋 What You'll Need

**Database password** - You can find it in Keychain:

### Option 1: Keychain Access App (GUI)
```bash
open "/System/Applications/Utilities/Keychain Access.app"
```
Then search for: `stormscout`, `teammurphy`, or `mwqtiakilx`

### Option 2: Command Line (may require authorization)
```bash
# Try these commands:
security find-generic-password -s "stormscout_db" -w
security find-generic-password -s "teammurphy_db" -w
security find-generic-password -a "mwqtiakilx_stormscout" -w

# Or browse all entries:
security dump-keychain | grep -i "murphy\|storm"
```

### Option 3: Check cPanel
Log into https://server37.shared.spaceship.host:2083 and check the database section

---

## 🔍 What the Fix Does

### The Bug (BUG-PROD-001)
- **Found**: 1 advisory with `severity: "Unknown"`
- **Location**: Site 1701 (Air Quality Alert)
- **Impact**: Breaks UI filtering, dashboard counts incorrect

### The Fix
```sql
UPDATE advisories 
SET severity = 'Minor' 
WHERE severity = 'Unknown';
```

This changes the severity from "Unknown" to "Minor" so the UI can properly classify and filter the advisory.

### Why "Minor"?
- "Minor" is the most conservative classification
- Preserves the data (doesn't delete the advisory)
- Allows it to appear in UI filters
- Better than "Unknown" which breaks the system

---

## 📊 What to Expect

### When You Run `./fix-severity-bug.sh`

**Step 1: Password Entry**
```
==================================
Storm Scout - Fix Severity Bug
==================================

Enter database password for mwqtiakilx_stormscout:
(Password will not be displayed as you type)
```
→ Type your password and press Enter

**Step 2: Connection Test**
```
Testing database connection...
✓ Database connection successful
```

**Step 3: Check for Bug**
```
Step 1: Checking for 'Unknown' severity advisories...
⚠ Found 1 advisories with 'Unknown' severity

Details of affected advisories:
  id    site_id    advisory_type        severity    source
  123   1701       Air Quality Alert    Unknown     NOAA/NWS State College PA

Do you want to fix these advisories by setting severity='Minor'? (y/n)
```
→ Type `y` and press Enter

**Step 4: Apply Fix**
```
Executing fix: UPDATE advisories SET severity='Minor' WHERE severity='Unknown';
✓ Fixed 1 advisories

Verifying fix...
✓ Verification successful: No more 'Unknown' severity advisories
```

**Step 5: Run Database Tests**
```
Step 2: Running comprehensive database tests...

Running test-database.sh...

==================================
Storm Scout Database Test Suite
==================================

Test 1: Database Connection
✓ Database connection successful

Test 2: Table Structure Validation
✓ Table exists: advisories
✓ Table exists: advisory_history
✓ Table exists: notices
✓ Table exists: sites
✓ Table exists: site_status
...
(many more tests)
```

---

## ⚠️ Important Notes

### Safety
- The script asks for confirmation before making changes
- Original data is preserved (just changing severity value)
- No advisories are deleted
- You can always revert by running: `UPDATE advisories SET severity='Unknown' WHERE id=123;`

### What If You Don't Want to Fix It?
- When prompted `Do you want to fix... (y/n)`, just type `n`
- The script will skip the fix and proceed to database tests
- You can review the test results and decide later

### After the Fix
- The advisory will now appear in UI with "Minor" severity
- UI filtering will work correctly
- Dashboard counts will be accurate
- The advisory is still linked to site 1701

---

## 🔄 If You Need to Run Tests Again

**Just database tests (no fix):**
```bash
./test-database.sh YOUR_PASSWORD_HERE
```

**Just the SSH tests (no DB password needed):**
```bash
./test-production-ssh.sh
```

---

## 📝 Documentation

All findings and recommendations are documented in:

- **QA-REVIEW-LIVE-FINDINGS.md** - Comprehensive bug report with all P0/P1/P2 issues
- **SSH-TESTING-GUIDE.md** - Complete guide for SSH-based testing
- **test-production-ssh.sh** - Automated tests (no DB password required)
- **test-database.sh** - Database validation tests
- **fix-severity-bug.sh** - This fix script

---

## 🎯 Next Steps After Fix

1. **Monitor Production** (24 hours)
   - Check dashboard at https://teammurphy.rocks
   - Verify site 1701 now shows correctly
   - Confirm no new "Unknown" severity advisories appear

2. **Deploy Validation Code** (This Week)
   - Edit `backend/src/ingestion/utils/normalizer.js`
   - Add severity validation (see QA-REVIEW-LIVE-FINDINGS.md section 9.2)
   - Deploy to prevent future "Unknown" values

3. **Performance Improvements** (Next Sprint)
   - Add database indexes
   - Implement Redis caching
   - Add foreign key constraints

---

## ❓ Troubleshooting

**"Database connection failed"**
→ Check password is correct
→ Try connecting via SSH: `ssh -p 21098 mwqtiakilx@teammurphy.rocks "mysql -u mwqtiakilx_stormscout -p"`

**"Permission denied: ./fix-severity-bug.sh"**
→ Run: `chmod +x fix-severity-bug.sh`

**"Can't find password in Keychain"**
→ Use cPanel to retrieve it or check local `.env` file if you have one

---

## 🚀 Ready to Go!

Run this command when you're ready:

```bash
./fix-severity-bug.sh
```

The script will guide you through each step with clear prompts.
