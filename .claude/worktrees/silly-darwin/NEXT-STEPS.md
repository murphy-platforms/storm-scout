# Storm Scout: Next Steps & Recommendations

**Date**: February 13, 2026  
**Current Status**: Phase 1 Complete ✅

---

## Phase 1: COMPLETE ✅

### What Was Accomplished

1. **External ID Deduplication Logic Deployed**
   - Primary deduplication on `external_id`
   - Secondary fallback to `vtec_event_id`
   - Better logging and visibility

2. **Current State Verified**
   - **No duplicate external_ids exist** in database
   - Site 2703: 39 alerts, all with unique external_ids
   - Multiple alerts per type are **legitimate** (multi-zone coverage)

3. **Tools Created**
   - Cleanup script: `fix-external-id-duplicates.js`
   - Analysis script: `analyze-duplicates.js`
   - Migration ready: `20260213-add-external-id-constraint.sql`

### Key Insight

**The "duplicates" you're seeing are NOT actual duplicates.**

They are legitimate multi-zone weather coverage:
- Anchorage (site 2703) sits near boundaries of 3+ NWS forecast zones
- Each NWS office (PAFG, PAFC, PAJK) issues alerts for their zones
- All have unique `external_id` values from NOAA
- **This is working as designed**

---

## Option B: Add Unique Constraint (RECOMMENDED NEXT)

### Why Do This

Even though no duplicates exist now, adding the unique constraint will:
- **Prevent future duplicates** at database level
- **Enforce data integrity** permanently
- **Provide immediate feedback** if ingestion tries to create duplicates

### How to Add Constraint

**Option 1: Via MySQL Command (When Database Access is Available)**
```sql
ALTER TABLE advisories 
ADD UNIQUE INDEX idx_external_id_unique (external_id);
```

**Option 2: Via Application Script** (Create this):
```javascript
// backend/scripts/add-external-id-constraint.js
const { initDatabase, getDatabase } = require('../src/config/database');

async function addConstraint() {
    await initDatabase();
    const db = getDatabase();
    
    console.log('Adding unique constraint on external_id...');
    
    try {
        await db.query(`
            ALTER TABLE advisories 
            ADD UNIQUE INDEX idx_external_id_unique (external_id)
        `);
        console.log('✅ Unique constraint added successfully');
    } catch (error) {
        if (error.code === 'ER_DUP_KEYNAME') {
            console.log('⚠️  Constraint already exists');
        } else {
            console.error('❌ Error:', error);
        }
    }
    
    process.exit(0);
}

addConstraint();
```

### Risk

**Low** - No duplicates exist, so constraint will not fail.

### Estimated Time

**5 minutes**

---

## Option C: Phase 2 - Zone Filtering (OPTIONAL)

### Should You Do This?

**Ask yourself:**
- Are 39 alerts for Anchorage too many for users?
- Do users understand that multiple alerts are from different zones?
- Would reducing to 1-2 "preferred" alerts per type improve UX?

**If YES to all three** → Proceed with Phase 2

**If NO or UNSURE** → Monitor user feedback first

### Phase 2 Overview

**Goal**: Add optional filtering to show only preferred NWS office per site

**Components**:
1. Add `preferred_nws_offices` to sites.json (3-4 hours research)
2. Create zone filtering utility (1.5 hours)
3. Add API query parameter `?zone_filter=preferred` (45 min)
4. Add UI toggle for filtering (1 hour)
5. Admin interface for office mapping (2-3 hours)
6. Testing (1.5 hours)
7. Documentation (1 hour)

**Total Estimated Time**: 10-12 hours

### Phase 2 Trade-offs

**Pros**:
- Cleaner UI (fewer alerts displayed)
- Reduces from ~39 to ~7-10 alerts per site
- User can toggle filter on/off

**Cons**:
- Requires researching NWS office mappings for 219 sites
- Risk of missing alerts if wrong office chosen
- Adds complexity to system
- Users might not understand why some alerts are hidden

---

## Recommended Approach

### Immediate (Today)

1. ✅ **Add Unique Constraint** (Option B - 5 minutes)
   - Prevents future issues
   - No downside
   - Easy rollback if needed

2. ✅ **Monitor for 24-48 Hours**
   - Watch next ingestion cycles
   - Check logs for "Updating existing advisory via external_id" messages
   - Verify no errors

### Short Term (Next Week)

3. 📊 **Gather User Feedback**
   - Ask IMT/Operations: "Are 39 alerts per site too many?"
   - Show them site 2703 as example
   - Explain multi-zone coverage concept

4. 🎯 **Decision Point**
   - **If users say it's fine** → Phase 2 not needed, focus on other features
   - **If users want fewer alerts** → Proceed with Phase 2 implementation

### Long Term (Future)

5. Consider alternative solutions:
   - **UI Grouping**: Group alerts by type with expand/collapse
   - **Smart Defaults**: Show most severe alert per type by default
   - **Map View**: Visual display showing which zones/offices cover each site
   - **Priority Alerts Only**: Filter to show only highest severity

---

## Implementation Priority

### Must Do
- [x] Deploy Phase 1 (DONE)
- [ ] Add unique constraint on external_id (5 min)
- [ ] Monitor for 24-48 hours

### Should Do (If Users Request)
- [ ] Implement Phase 2 zone filtering (10-12 hours)
- [ ] Add UI explanation of multi-zone alerts

### Nice to Have
- [ ] Map visualization of alert zones
- [ ] Alert grouping/expansion UI
- [ ] Historical alert analytics

---

## Questions to Consider

1. **Are the current 39 alerts for site 2703 a real problem for users?**
   - Or is it acceptable given they represent different geographic zones?

2. **Would users rather see:**
   - All alerts (current: comprehensive but verbose)
   - Filtered alerts (cleaner but might miss information)
   - Grouped/expandable alerts (middle ground)

3. **What's the priority relative to other features?**
   - Zone filtering: 10-12 hours
   - vs. other ROADMAP items (Redis caching, tests, etc.)

---

## Next Actions

### For You

1. **Decide on unique constraint**:
   - Add it now (recommended), or
   - Wait for database access

2. **Get user feedback**:
   - Show stakeholders site 2703 with 39 alerts
   - Ask: "Is this too many? Or is it helpful to see all zones?"

3. **Prioritize Phase 2**:
   - If users want fewer alerts → Schedule Phase 2
   - If users are satisfied → Focus on other ROADMAP items

### For Me (When Ready)

**If you want to proceed with Phase 2**, I can:
1. Research NWS office mappings for top 20 sites
2. Implement zone filtering backend
3. Add UI toggle
4. Deploy and test

**Estimated**: 10-12 hours of development time

---

## Files Reference

- **Plan**: `.warp/plans/610135d3-3d92-4e0d-ba38-aae2f3ead49b.md`
- **Analysis**: `DUPLICATE-ADVISORY-ANALYSIS.md`
- **Phase 1 Results**: `PHASE1-DEPLOYMENT-RESULTS.md`
- **Commits**: 6fa3a59, 5a7a3f6

---

## Conclusion

**Phase 1 is complete and successful**. The system is clean with no duplicates.

**The path forward depends on user feedback**:
- If satisfied → Add constraint and move to other priorities
- If want fewer alerts → Invest 10-12 hours in Phase 2

**My recommendation**: Add the unique constraint, then **wait for user feedback** before committing to Phase 2.

The multiple alerts are actually **working correctly** - they represent real geographic coverage from multiple NWS offices. Phase 2 would hide some of this information, which may or may not be what users want.

---

**Prepared By**: AI Agent (Warp)  
**Last Updated**: February 13, 2026
