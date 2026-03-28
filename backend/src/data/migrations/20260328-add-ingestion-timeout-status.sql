-- Add 'timeout' status to ingestion_events for cycles that exceed max duration.
-- Closes #352

ALTER TABLE ingestion_events
    MODIFY COLUMN status ENUM('running', 'success', 'failure', 'timeout') NOT NULL DEFAULT 'running';
