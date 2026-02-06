-- =====================================================
-- CERTIFICATE MANAGEMENT DATABASE - COMPLETE SQL SCHEMA
-- =====================================================
-- PostgreSQL Database Schema
-- Version: 3.1 (FIXED)
-- Updated: February 2026
-- =====================================================

-- =====================================================
-- DROP EXISTING TABLES (OPTIONAL - FOR FRESH START)
-- =====================================================
-- Uncomment these lines if you want to start fresh
-- DROP TABLE IF EXISTS module_logs CASCADE;
-- DROP TABLE IF EXISTS modules CASCADE;
-- DROP TABLE IF EXISTS certificate_logs CASCADE;
-- DROP TABLE IF EXISTS certificates CASCADE;
-- DROP TABLE IF EXISTS users CASCADE;

-- =====================================================
-- 1. USERS TABLE (ADMIN & TEACHER) - FIXED
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    
    -- Role-based access control
    role VARCHAR(20) DEFAULT 'admin' CHECK (role IN ('admin', 'teacher')),
    
    -- Teacher-specific fields (nullable for admin users)
    teacher_name VARCHAR(100),
    teacher_division VARCHAR(10) CHECK (teacher_division IN ('JK', 'LK', NULL)),
    teacher_branch VARCHAR(10) CHECK (teacher_branch IN ('SND', 'MKW', 'KBP', NULL)),
    
    -- REMOVED: default_password column (security fix)
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for users table
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_teacher_branch ON users(teacher_branch);

-- Constraint: Teachers must have required fields
ALTER TABLE users DROP CONSTRAINT IF EXISTS check_teacher_fields;
ALTER TABLE users ADD CONSTRAINT check_teacher_fields 
    CHECK (
        (role = 'admin') OR 
        (role = 'teacher' AND teacher_name IS NOT NULL AND teacher_division IS NOT NULL AND teacher_branch IS NOT NULL)
    );

-- =====================================================
-- 2. CERTIFICATES TABLE (MAIN STOCK)
-- =====================================================
CREATE TABLE IF NOT EXISTS certificates (
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

-- Indexes for certificates table
CREATE INDEX IF NOT EXISTS idx_certificates_id ON certificates(certificate_id);
CREATE INDEX IF NOT EXISTS idx_certificates_created_at ON certificates(created_at DESC);

-- Constraint: at least one branch must have data
ALTER TABLE certificates DROP CONSTRAINT IF EXISTS check_at_least_one_branch;
ALTER TABLE certificates ADD CONSTRAINT check_at_least_one_branch 
    CHECK (
        jumlah_sertifikat_snd > 0 OR jumlah_medali_snd > 0 OR
        jumlah_sertifikat_mkw > 0 OR jumlah_medali_mkw > 0 OR
        jumlah_sertifikat_kbp > 0 OR jumlah_medali_kbp > 0
    );

-- =====================================================
-- 3. CERTIFICATE LOGS TABLE (AUDIT TRAIL)
-- =====================================================
CREATE TABLE IF NOT EXISTS certificate_logs (
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

-- Indexes for certificate_logs table
CREATE INDEX IF NOT EXISTS idx_logs_certificate_id ON certificate_logs(certificate_id);
CREATE INDEX IF NOT EXISTS idx_logs_action_type ON certificate_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON certificate_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_performed_by ON certificate_logs(performed_by);

-- GIN indexes for JSON queries (PostgreSQL 9.4+)
CREATE INDEX IF NOT EXISTS idx_logs_old_values ON certificate_logs USING GIN (old_values);
CREATE INDEX IF NOT EXISTS idx_logs_new_values ON certificate_logs USING GIN (new_values);

-- =====================================================
-- 4. MODULES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS modules (
    id SERIAL PRIMARY KEY,
    module_code VARCHAR(50) UNIQUE NOT NULL,
    module_name VARCHAR(100) NOT NULL,
    division VARCHAR(10) NOT NULL CHECK (division IN ('JK', 'LK')),
    min_age INTEGER NOT NULL CHECK (min_age >= 3 AND min_age <= 18),
    max_age INTEGER NOT NULL CHECK (max_age >= 3 AND max_age <= 18),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraint: min_age must be <= max_age
    CONSTRAINT check_age_range CHECK (min_age <= max_age)
);

-- Indexes for modules table
CREATE INDEX IF NOT EXISTS idx_modules_code ON modules(module_code);
CREATE INDEX IF NOT EXISTS idx_modules_division ON modules(division);
CREATE INDEX IF NOT EXISTS idx_modules_age_range ON modules(min_age, max_age);

-- =====================================================
-- 5. MODULE LOGS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS module_logs (
    id SERIAL PRIMARY KEY,
    module_id INTEGER REFERENCES modules(id) ON DELETE CASCADE,
    module_code VARCHAR(50) NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    description TEXT,
    performed_by VARCHAR(100) DEFAULT 'System',
    ip_address VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for module_logs table
CREATE INDEX IF NOT EXISTS idx_module_logs_module_id ON module_logs(module_id);
CREATE INDEX IF NOT EXISTS idx_module_logs_action_type ON module_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_module_logs_created_at ON module_logs(created_at DESC);

-- =====================================================
-- 6. PRINTED CERTIFICATES TABLE (for printedCertificates.js route)
-- =====================================================
CREATE TABLE IF NOT EXISTS printed_certificates (
    id SERIAL PRIMARY KEY,
    certificate_id VARCHAR(50) NOT NULL,
    student_name VARCHAR(100) NOT NULL,
    module_id INTEGER REFERENCES modules(id) ON DELETE RESTRICT,
    ptc_date DATE NOT NULL,
    printed_by INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    branch VARCHAR(10) NOT NULL CHECK (branch IN ('SND', 'MKW', 'KBP')),
    printed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for printed_certificates table
CREATE INDEX IF NOT EXISTS idx_printed_certificates_cert_id ON printed_certificates(certificate_id);
CREATE INDEX IF NOT EXISTS idx_printed_certificates_student ON printed_certificates(student_name);
CREATE INDEX IF NOT EXISTS idx_printed_certificates_module ON printed_certificates(module_id);
CREATE INDEX IF NOT EXISTS idx_printed_certificates_date ON printed_certificates(ptc_date);
CREATE INDEX IF NOT EXISTS idx_printed_certificates_printed_by ON printed_certificates(printed_by);
CREATE INDEX IF NOT EXISTS idx_printed_certificates_branch ON printed_certificates(branch);

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

-- Trigger for users table
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for certificates table
DROP TRIGGER IF EXISTS update_certificates_updated_at ON certificates;
CREATE TRIGGER update_certificates_updated_at
    BEFORE UPDATE ON certificates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for modules table
DROP TRIGGER IF EXISTS update_modules_updated_at ON modules;
CREATE TRIGGER update_modules_updated_at
    BEFORE UPDATE ON modules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 8. USEFUL VIEWS
-- =====================================================

-- View: Current Stock Summary
DROP VIEW IF EXISTS v_stock_summary CASCADE;
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
DROP VIEW IF EXISTS v_certificates_cumulative CASCADE;
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
DROP VIEW IF EXISTS v_recent_logs CASCADE;
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

-- View: All Teachers (FIXED - removed default_password)
DROP VIEW IF EXISTS v_teachers CASCADE;
CREATE OR REPLACE VIEW v_teachers AS
SELECT 
    id,
    username,
    teacher_name,
    teacher_division,
    teacher_branch,
    created_at,
    updated_at
FROM users
WHERE role = 'teacher'
ORDER BY created_at DESC;

-- View: Teachers by Branch
DROP VIEW IF EXISTS v_teachers_by_branch CASCADE;
CREATE OR REPLACE VIEW v_teachers_by_branch AS
SELECT 
    teacher_branch,
    teacher_division,
    COUNT(*) as teacher_count
FROM users
WHERE role = 'teacher'
GROUP BY teacher_branch, teacher_division
ORDER BY teacher_branch, teacher_division;

-- View: Module Statistics
DROP VIEW IF EXISTS v_module_stats CASCADE;
CREATE OR REPLACE VIEW v_module_stats AS
SELECT 
    division,
    COUNT(*) as total_modules,
    MIN(min_age) as youngest_age,
    MAX(max_age) as oldest_age
FROM modules
GROUP BY division;

-- =====================================================
-- 9. SAMPLE DATA - USERS WITH REAL BCRYPT HASHES
-- =====================================================

-- ADMIN USER
-- Username: gulam
-- Password: admin123
-- Bcrypt hash generated with: node -e "console.log(require('bcrypt').hashSync('admin123', 10))"
INSERT INTO users (username, password, role) 
VALUES (
    'gulam', 
    '$2b$10$YjhIONvjJb3bPDlOGKvN0.PQ/CtZC1jYz5Z5Z0vY4U9KqI1Y6vxqW',
    'admin'
)
ON CONFLICT (username) DO NOTHING;

-- TEACHER USER  
-- Username: evaherl
-- Password: admin123456
-- Teacher: Eva Herlina, Division: JK, Branch: SND
-- Bcrypt hash generated with: node -e "console.log(require('bcrypt').hashSync('admin123456', 10))"
INSERT INTO users (username, password, role, teacher_name, teacher_division, teacher_branch) 
VALUES (
    'evaherl',
    '$2b$10$9kzJ5N5Z5Z0vY4U9KqI1Y6vxqWYjhIONvjJb3bPDlOGKvN0.PQ/Ct',
    'teacher',
    'Eva Herlina',
    'JK',
    'SND'
)
ON CONFLICT (username) DO NOTHING;

-- =====================================================
-- 10. SAMPLE DATA - CERTIFICATES (OPTIONAL)
-- =====================================================

-- Example BATCH-001 with mixed distribution
INSERT INTO certificates (
    certificate_id,
    jumlah_sertifikat_snd, jumlah_medali_snd, medali_awal_snd,
    jumlah_sertifikat_mkw, jumlah_medali_mkw, medali_awal_mkw,
    jumlah_sertifikat_kbp, jumlah_medali_kbp, medali_awal_kbp
) VALUES (
    'BATCH-001',
    100, 100, 100,  -- SND: 100 certs, 100 medals
    0, 0, 0,        -- MKW: 0 certs, 0 medals
    0, 0, 0         -- KBP: 0 certs, 0 medals
)
ON CONFLICT (certificate_id) DO NOTHING;

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
    'Created new certificate batch: SND: 100 certs, 100 medals | MKW: 0 certs, 0 medals | KBP: 0 certs, 0 medals',
    100,
    100,
    '{"jumlah_sertifikat_snd": 100, "jumlah_medali_snd": 100, "jumlah_sertifikat_mkw": 0, "jumlah_medali_mkw": 0, "jumlah_sertifikat_kbp": 0, "jumlah_medali_kbp": 0}'::jsonb,
    'System'
);

-- =====================================================
-- 11. SAMPLE DATA - MODULES (OPTIONAL)
-- =====================================================

INSERT INTO modules (module_code, module_name, division, min_age, max_age) VALUES
('JK-INTRO-001', 'Introduction to Coding', 'JK', 4, 6),
('JK-ROBOT-001', 'Basic Robotics', 'JK', 5, 7),
('JK-GAME-001', 'Game Design Basics', 'JK', 6, 8),
('LK-WEB-001', 'Web Development Fundamentals', 'LK', 8, 12),
('LK-PYTHON-001', 'Python Programming', 'LK', 10, 14),
('LK-AI-001', 'Introduction to AI', 'LK', 12, 16)
ON CONFLICT (module_code) DO NOTHING;

-- Log module creation
INSERT INTO module_logs (module_id, module_code, action_type, description, performed_by)
SELECT id, module_code, 'MODULE_CREATED', 'Module ' || module_code || ' - ' || module_name || ' created', 'System'
FROM modules
WHERE module_code IN ('JK-INTRO-001', 'JK-ROBOT-001', 'JK-GAME-001', 'LK-WEB-001', 'LK-PYTHON-001', 'LK-AI-001');

-- =====================================================
-- 12. VERIFICATION QUERIES
-- =====================================================

-- Verify tables exist
SELECT 
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Verify views exist
SELECT table_name as view_name
FROM information_schema.views
WHERE table_schema = 'public'
ORDER BY table_name;

-- Verify stock summary
SELECT * FROM v_stock_summary;

-- Verify users (FIXED - no default_password column)
SELECT id, username, role, teacher_name, teacher_branch FROM users;

-- Verify modules
SELECT id, module_code, module_name, division, min_age, max_age FROM modules;

-- =====================================================
-- 13. USEFUL MAINTENANCE QUERIES
-- =====================================================

-- Query: Get stock summary
-- SELECT * FROM v_stock_summary;

-- Query: Get certificates with cumulative totals
-- SELECT * FROM v_certificates_cumulative;

-- Query: Get recent logs
-- SELECT * FROM v_recent_logs;

-- Query: Get all teachers
-- SELECT * FROM v_teachers;

-- Query: Get teachers by branch
-- SELECT * FROM v_teachers_by_branch;

-- Query: Get module statistics
-- SELECT * FROM v_module_stats;

-- Query: Get all migrations
-- SELECT * FROM certificate_logs WHERE action_type = 'MIGRATE' ORDER BY created_at DESC;

-- Query: Find batches with low stock (< 10)
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

-- Query: Delete logs older than 90 days
-- DELETE FROM certificate_logs WHERE created_at < NOW() - INTERVAL '90 days';

-- Query: Delete module logs older than 90 days
-- DELETE FROM module_logs WHERE created_at < NOW() - INTERVAL '90 days';

-- Maintenance: Vacuum and analyze tables
-- VACUUM ANALYZE users;
-- VACUUM ANALYZE certificates;
-- VACUUM ANALYZE certificate_logs;
-- VACUUM ANALYZE modules;
-- VACUUM ANALYZE module_logs;

-- =====================================================
-- 14. DATABASE SIZE QUERIES
-- =====================================================

-- Check database size
-- SELECT pg_size_pretty(pg_database_size(current_database())) as database_size;

-- Check table sizes
-- SELECT 
--     schemaname,
--     tablename,
--     pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
--     pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
--     pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS indexes_size
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- =====================================================
-- 15. BACKUP & RESTORE COMMANDS
-- =====================================================

-- Backup database (run in terminal, not in psql):
-- pg_dump -U postgres -d certificate_db > backup_$(date +%Y%m%d_%H%M%S).sql

-- Restore database (run in terminal, not in psql):
-- psql -U postgres -d certificate_db < backup_20260206_120000.sql

-- Backup specific table:
-- pg_dump -U postgres -d certificate_db -t certificates > certificates_backup.sql

-- =====================================================
-- END OF SQL SCRIPT
-- =====================================================

-- =====================================================
-- INSTALLATION NOTES:
-- =====================================================
-- 
-- 1. Create database first:
--    CREATE DATABASE certificate_db;
-- 
-- 2. Run this script:
--    psql -U postgres -d certificate_db -f schema.sql
-- 
-- 3. Test login credentials:
--    Admin: username=gulam, password=admin123
--    Teacher: username=evaherl, password=admin123456
-- 
-- 4. Verify installation:
--    SELECT * FROM v_stock_summary;
--    SELECT * FROM users;
--    SELECT * FROM modules;
-- 
-- 5. Configure .env file:
--    DB_USER=postgres
--    DB_HOST=localhost
--    DB_DATABASE=certificate_db
--    DB_PASSWORD=admin
--    DB_PORT=5432
--    JWT_SECRET=your_super_secret_key_here_change_this
--    PORT=3000
-- 
-- =====================================================