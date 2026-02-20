-- Storm Scout: Site corrections and cleanup
-- Generated: 2026-02-20T15:35:09.605Z
-- Updates coordinates for 4 sites verified against physical addresses
-- Removes child site 6753 (parent: 6752, same physical address)

UPDATE sites SET latitude = 33.8579818, longitude = -98.563651, updated_at = NOW() WHERE site_code = '5298';

UPDATE sites SET latitude = 40.7071357, longitude = -74.007455, updated_at = NOW() WHERE site_code = '6752';

UPDATE sites SET latitude = 32.8379303, longitude = -97.0124383, updated_at = NOW() WHERE site_code = '0383';

UPDATE sites SET latitude = 25.7832367, longitude = -80.3003754, ugc_codes = '["FLZ074","FLC086"]', updated_at = NOW() WHERE site_code = '0624';

DELETE FROM sites WHERE site_code = '6753';
