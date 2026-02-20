-- Migration: Add weather observations support
-- Date: 2026-02-20
-- Description: Add observation_station column to sites table and create site_observations table

-- Add nearest NWS observation station ICAO code to sites table
ALTER TABLE sites ADD COLUMN observation_station VARCHAR(10) DEFAULT NULL;

-- Create site_observations table (one row per site, replaced each ingestion cycle)
CREATE TABLE IF NOT EXISTS site_observations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    site_id INT NOT NULL,
    station_id VARCHAR(10) NOT NULL,            -- ICAO station code (e.g., KORD)
    temperature_c DECIMAL(5,2),                 -- Temperature in °C
    relative_humidity DECIMAL(5,2),             -- Humidity %
    dewpoint_c DECIMAL(5,2),                    -- Dew point in °C
    wind_speed_kmh DECIMAL(6,2),                -- Wind speed in km/h
    wind_direction_deg INT,                     -- Wind direction in degrees
    wind_gust_kmh DECIMAL(6,2),                 -- Wind gust in km/h
    barometric_pressure_pa DECIMAL(10,2),       -- Pressure in Pascals
    visibility_m DECIMAL(10,2),                 -- Visibility in meters
    wind_chill_c DECIMAL(5,2),                  -- Wind chill in °C
    heat_index_c DECIMAL(5,2),                  -- Heat index in °C
    precipitation_last_6h_m DECIMAL(8,6),       -- Precipitation in meters
    cloud_layers TEXT,                          -- JSON string of cloud layer data
    text_description VARCHAR(255),              -- e.g., "Cloudy", "Partly Sunny"
    observed_at DATETIME,                       -- When the station recorded the observation
    ingested_at DATETIME DEFAULT CURRENT_TIMESTAMP,  -- When we fetched it
    UNIQUE INDEX idx_site_observations_site (site_id),
    FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_site_observations_station ON site_observations(station_id);
