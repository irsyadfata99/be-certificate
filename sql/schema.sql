-- =====================================================
-- CERTIFICATE MANAGEMENT DATABASE - COMPLETE SQL
-- =====================================================
-- PostgreSQL Database Schema
-- Created: February 2026
-- =====================================================

-- Drop existing tables if they exist (optional - for fresh start)
DROP TABLE IF EXISTS certificate_logs CASCADE;
DROP TABLE IF EXISTS certificates CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- =====================================================
-- 1. USERS TABLE
-- =====================================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add index for faster username lookup
CREATE INDEX idx_users_username ON users(username);

-- =====================================================
-- 2. CERTIFICATES TABLE
-- =====================================================
CREATE TABLE certificates (
    id SERIAL PRIMARY KEY,
    certificate_id VARCHAR(50) UNIQUE NOT NULL,
    
    -- SND (Pusat) - Sertifikat dan Medali
    jumlah_sertifikat_snd INTEGER DEFAULT 0 CHECK (jumlah_sertifikat_snd >= 0),
    jumlah_medali_snd INTEGER DEFAULT 0 CHECK (jumlah_medali_snd >= 0),
    medali_awal_snd INTEGER DEFAULT 0,
    
    -- MKW - Sertifikat dan Medali
    jumlah_sertifikat_mkw INTEGER DEFAULT 0 CHECK (jumlah_sertifikat_mkw >= 0),
    jumlah_medali_mkw INTEGER DEFAULT 0 CHECK (jumlah_medali_mkw >= 0),
    medali_awal_mkw INTEGER DEFAULT 0,
    
    -- KBP - Sertifikat dan Medali
    jumlah_sertifikat_kbp INTEGER DEFAULT 0 CHECK (jumlah_sertifikat_kbp >= 0),
    jumlah_medali_kbp INTEGER DEFAULT 0 CHECK (jumlah_medali_kbp >= 0),
    medali_awal_kbp INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for faster queries
CREATE INDEX idx_certificates_id ON certificates(certificate_id);
CREATE INDEX idx_certificates_created_at ON certificates(created_at DESC);

-- Add constraint: at least one branch must have data
ALTER TABLE certificates ADD CONSTRAINT check_at_least_one_branch 
    CHECK (
        jumlah_sertifikat_snd > 0 OR jumlah_medali_snd > 0 OR
        jumlah_sertifikat_mkw > 0 OR jumlah_medali_mkw > 0 OR
        jumlah_sertifikat_kbp > 0 OR jumlah_medali_kbp > 0
    );

-- =====================================================
-- 3. CERTIFICATE LOGS TABLE (AUDIT TRAIL)
-- =====================================================
CREATE TABLE certificate_logs (
    id SERIAL PRIMARY KEY,
    certificate_id VARCHAR(50) NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    description TEXT,
    
    -- Migration details
    from_branch VARCHAR(10),
    to_branch VARCHAR(10),
    certificate_amount INTEGER DEFAULT 0,
    medal_amount INTEGER DEFAULT 0,
    
    -- JSON fields for detailed tracking
    old_values JSONB,
    new_values JSONB,
    
    -- Audit info
    performed_by VARCHAR(100) DEFAULT 'System',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for faster log queries
CREATE INDEX idx_logs_certificate_id ON certificate_logs(certificate_id);
CREATE INDEX idx_logs_action_type ON certificate_logs(action_type);
CREATE INDEX idx_logs_created_at ON certificate_logs(created_at DESC);
CREATE INDEX idx_logs_performed_by ON certificate_logs(performed_by);

-- Add index for JSON queries (if using PostgreSQL 9.4+)
CREATE INDEX idx_logs_old_values ON certificate_logs USING GIN (old_values);
CREATE INDEX idx_logs_new_values ON certificate_logs USING GIN (new_values);

-- =====================================================
-- 4. SAMPLE DATA - USER
-- =====================================================
-- Password: #Adm1n123
-- Hash generated with bcrypt rounds=10
INSERT INTO users (username, password) VALUES
('admin', '$2b$10$YourBcryptHashHereForAdm1n123');

-- IMPORTANT: Replace the hash above with actual bcrypt hash
-- Generate using: node hashpassword.js
-- Or use online bcrypt generator with password: #Adm1n123

-- =====================================================
-- 5. SAMPLE DATA - CERTIFICATES
-- =====================================================
-- Example: BATCH-001 with mixed distribution
INSERT INTO certificates (
    certificate_id,
    jumlah_sertifikat_snd, jumlah_medali_snd, medali_awal_snd,
    jumlah_sertifikat_mkw, jumlah_medali_mkw, medali_awal_mkw,
    jumlah_sertifikat_kbp, jumlah_medali_kbp, medali_awal_kbp
) VALUES (
    'BATCH-001',
    50, 50, 50,  -- SND: 50 certs, 50 medals
    20, 20, 20,  -- MKW: 20 certs, 20 medals
    30, 30, 30   -- KBP: 30 certs, 30 medals
);

-- Example: BATCH-002 with all in SND
INSERT INTO certificates (
    certificate_id,
    jumlah_sertifikat_snd, jumlah_medali_snd, medali_awal_snd,
    jumlah_sertifikat_mkw, jumlah_medali_mkw, medali_awal_mkw,
    jumlah_sertifikat_kbp, jumlah_medali_kbp, medali_awal_kbp
) VALUES (
    'BATCH-002',
    100, 100, 100,  -- SND: 100 certs, 100 medals
    0, 0, 0,        -- MKW: 0 certs, 0 medals
    0, 0, 0         -- KBP: 0 certs, 0 medals
);

-- =====================================================
-- 6. SAMPLE DATA - LOGS
-- =====================================================
-- Log for BATCH-001 creation
INSERT INTO certificate_logs (
    certificate_id,
    action_type,
    description,
    certificate_amount,
    medal_amount,
    new_values,
    performed_by
) VALUES (
    'BATCH-001',
    'CREATE',
    'Created new certificate batch: SND: 50 certs, 50 medals | MKW: 20 certs, 20 medals | KBP: 30 certs, 30 medals',
    100,
    100,
    '{"jumlah_sertifikat_snd": 50, "jumlah_medali_snd": 50, "jumlah_sertifikat_mkw": 20, "jumlah_medali_mkw": 20, "jumlah_sertifikat_kbp": 30, "jumlah_medali_kbp": 30}',
    'admin'
);

-- Log for BATCH-002 creation
INSERT INTO certificate_logs (
    certificate_id,
    action_type,
    description,
    certificate_amount,
    medal_amount,
    new_values,
    performed_by
) VALUES (
    'BATCH-002',
    'CREATE',
    'Created new certificate batch: SND: 100 certs, 100 medals | MKW: 0 certs, 0 medals | KBP: 0 certs, 0 medals',
    100,
    100,
    '{"jumlah_sertifikat_snd": 100, "jumlah_medali_snd": 100, "jumlah_sertifikat_mkw": 0, "jumlah_medali_mkw": 0, "jumlah_sertifikat_kbp": 0, "jumlah_medali_kbp": 0}',
    'admin'
);

-- =====================================================
-- 7. FUNCTIONS & TRIGGERS
-- =====================================================

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for certificates table
CREATE TRIGGER update_certificates_updated_at
    BEFORE UPDATE ON certificates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for users table
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 8. USEFUL VIEWS
-- =====================================================

-- View: Current Stock Summary
CREATE OR REPLACE VIEW v_stock_summary AS
SELECT 
    COALESCE(SUM(jumlah_sertifikat_snd), 0) as snd_certificates,
    COALESCE(SUM(jumlah_medali_snd), 0) as snd_medals,
    COALESCE(SUM(jumlah_sertifikat_mkw), 0) as mkw_certificates,
    COALESCE(SUM(jumlah_medali_mkw), 0) as mkw_medals,
    COALESCE(SUM(jumlah_sertifikat_kbp), 0) as kbp_certificates,
    COALESCE(SUM(jumlah_medali_kbp), 0) as kbp_medals,
    COALESCE(SUM(jumlah_sertifikat_snd + jumlah_sertifikat_mkw + jumlah_sertifikat_kbp), 0) as total_certificates,
    COALESCE(SUM(jumlah_medali_snd + jumlah_medali_mkw + jumlah_medali_kbp), 0) as total_medals
FROM certificates;

-- View: Certificates with Cumulative Totals
CREATE OR REPLACE VIEW v_certificates_cumulative AS
WITH batch_totals AS (
    SELECT 
        *,
        (COALESCE(jumlah_sertifikat_snd, 0) + COALESCE(jumlah_sertifikat_mkw, 0) + COALESCE(jumlah_sertifikat_kbp, 0)) as batch_total_cert,
        (COALESCE(jumlah_medali_snd, 0) + COALESCE(jumlah_medali_mkw, 0) + COALESCE(jumlah_medali_kbp, 0)) as batch_total_medal
    FROM certificates
)
SELECT 
    *,
    SUM(batch_total_cert) OVER (ORDER BY created_at, id) as cumulative_total_cert,
    SUM(batch_total_medal) OVER (ORDER BY created_at, id) as cumulative_total_medal
FROM batch_totals
ORDER BY created_at DESC;

-- View: Recent Activity Logs (Last 100)
CREATE OR REPLACE VIEW v_recent_logs AS
SELECT 
    id,
    certificate_id,
    action_type,
    description,
    from_branch,
    to_branch,
    certificate_amount,
    medal_amount,
    performed_by,
    created_at
FROM certificate_logs
ORDER BY created_at DESC
LIMIT 100;

-- =====================================================
-- 9. USEFUL QUERIES
-- =====================================================

-- Query 1: Get stock summary
-- SELECT * FROM v_stock_summary;

-- Query 2: Get certificates with cumulative totals
-- SELECT * FROM v_certificates_cumulative;

-- Query 3: Get recent logs
-- SELECT * FROM v_recent_logs;

-- Query 4: Get all migrations
-- SELECT * FROM certificate_logs WHERE action_type = 'MIGRATE' ORDER BY created_at DESC;

-- Query 5: Get stock movements for specific batch
-- SELECT * FROM certificate_logs WHERE certificate_id = 'BATCH-001' ORDER BY created_at;

-- Query 6: Find batches with low stock (< 10)
-- SELECT 
--     certificate_id,
--     jumlah_sertifikat_snd,
--     jumlah_medali_snd,
--     jumlah_sertifikat_mkw,
--     jumlah_medali_mkw,
--     jumlah_sertifikat_kbp,
--     jumlah_medali_kbp
-- FROM certificates
-- WHERE 
--     jumlah_sertifikat_snd < 10 OR
--     jumlah_medali_snd < 10 OR
--     jumlah_sertifikat_mkw < 10 OR
--     jumlah_medali_mkw < 10 OR
--     jumlah_sertifikat_kbp < 10 OR
--     jumlah_medali_kbp < 10;

-- =====================================================
-- 10. MAINTENANCE QUERIES
-- =====================================================

-- Delete logs older than 90 days
-- DELETE FROM certificate_logs WHERE created_at < NOW() - INTERVAL '90 days';

-- Vacuum and analyze tables (for performance)
-- VACUUM ANALYZE certificates;
-- VACUUM ANALYZE certificate_logs;
-- VACUUM ANALYZE users;

-- =====================================================
-- 11. DATABASE INFO
-- =====================================================
-- Check database size
-- SELECT pg_size_pretty(pg_database_size(current_database()));

-- Check table sizes
-- SELECT 
--     schemaname,
--     tablename,
--     pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- =====================================================
-- END OF SQL SCRIPT
-- =====================================================

-- =====================================================
-- NOTES FOR IMPLEMENTATION:
-- =====================================================
-- 1. Make sure to replace the bcrypt hash for admin user
--    Run: node hashpassword.js to generate proper hash
--
-- 2. Database connection info (.env):
--    DB_USER=postgres
--    DB_HOST=localhost
--    DB_DATABASE=certificate_db
--    DB_PASSWORD=admin
--    DB_PORT=5432
--
-- 3. To create database (run as postgres user):
--    CREATE DATABASE certificate_db;
--
-- 4. To run this script:
--    psql -U postgres -d certificate_db -f database.sql
--
-- 5. Verify installation:
--    SELECT * FROM v_stock_summary;
--    SELECT * FROM v_certificates_cumulative;
-- =====================================================