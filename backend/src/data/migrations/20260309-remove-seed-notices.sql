-- Migration: Remove dev seed notices from notices table
-- Issue: #76 — stale seed notices permanently visible on notices.html
-- These three rows were inserted by seed.sql as development sample data.
-- They represent fabricated emergency declarations and must not appear
-- in any environment (dev or production).

DELETE FROM notices WHERE title IN (
    'Governor declares State of Emergency for Hurricane',
    'Snow Emergency declared for Cook County',
    'Presidential Emergency Declaration for Southeast States'
);
