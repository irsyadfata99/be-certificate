-- =====================================================
-- CERTIFICATE MANAGEMENT DATABASE - COMPLETE SCHEMA WITH DUMMY DATA
-- =====================================================
-- PostgreSQL Database Schema
-- Version: 3.2 (COMPLETE WITH DUMMY DATA)
-- Updated: February 2026
-- =====================================================
-- Admin: username=gulam, password=admin123
-- Teacher: username=teacher, password=admin123
-- =====================================================

-- =====================================================
-- CLEAN START - DROP ALL TABLES
-- =====================================================
DROP TABLE IF EXISTS printed_certificates CASCADE;
DROP TABLE IF EXISTS module_logs CASCADE;
DROP TABLE IF EXISTS modules CASCADE;
DROP TABLE IF EXISTS certificate_logs CASCADE;
DROP TABLE IF EXISTS certificates CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Drop views
DROP VIEW IF EXISTS v_stock_summary CASCADE;
DROP VIEW IF EXISTS v_certificates_cumulative CASCADE;
DROP VIEW IF EXISTS v_recent_logs CASCADE;
DROP VIEW IF EXISTS v_teachers CASCADE;
DROP VIEW IF EXISTS v_teachers_by_branch CASCADE;
DROP VIEW IF EXISTS v_module_stats CASCADE;

-- =====================================================
-- 1. USERS TABLE (ADMIN & TEACHER)
-- =====================================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    
    -- Role-based access control
    role VARCHAR(20) DEFAULT 'admin' CHECK (role IN ('admin', 'teacher')),
    
    -- Teacher-specific fields (nullable for admin users)
    teacher_name VARCHAR(100),
    teacher_division VARCHAR(10) CHECK (teacher_division IN ('JK', 'LK', NULL)),
    teacher_branch VARCHAR(10) CHECK (teacher_branch IN ('SND', 'MKW', 'KBP', NULL)),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_teacher_branch ON users(teacher_branch);

-- Constraint: Teachers must have required fields
ALTER TABLE users ADD CONSTRAINT check_teacher_fields 
    CHECK (
        (role = 'admin') OR 
        (role = 'teacher' AND teacher_name IS NOT NULL AND teacher_division IS NOT NULL AND teacher_branch IS NOT NULL)
    );

-- =====================================================
-- 2. CERTIFICATES TABLE (MAIN STOCK)
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

-- Indexes
CREATE INDEX idx_certificates_id ON certificates(certificate_id);
CREATE INDEX idx_certificates_created_at ON certificates(created_at DESC);

-- Constraint: at least one branch must have data
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

-- Indexes
CREATE INDEX idx_logs_certificate_id ON certificate_logs(certificate_id);
CREATE INDEX idx_logs_action_type ON certificate_logs(action_type);
CREATE INDEX idx_logs_created_at ON certificate_logs(created_at DESC);
CREATE INDEX idx_logs_performed_by ON certificate_logs(performed_by);
CREATE INDEX idx_logs_old_values ON certificate_logs USING GIN (old_values);
CREATE INDEX idx_logs_new_values ON certificate_logs USING GIN (new_values);

-- =====================================================
-- 4. MODULES TABLE
-- =====================================================
CREATE TABLE modules (
    id SERIAL PRIMARY KEY,
    module_code VARCHAR(50) UNIQUE NOT NULL,
    module_name VARCHAR(100) NOT NULL,
    division VARCHAR(10) NOT NULL CHECK (division IN ('JK', 'LK')),
    min_age INTEGER NOT NULL CHECK (min_age >= 3 AND min_age <= 18),
    max_age INTEGER NOT NULL CHECK (max_age >= 3 AND max_age <= 18),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT check_age_range CHECK (min_age <= max_age)
);

-- Indexes
CREATE INDEX idx_modules_code ON modules(module_code);
CREATE INDEX idx_modules_division ON modules(division);
CREATE INDEX idx_modules_age_range ON modules(min_age, max_age);

-- =====================================================
-- 5. MODULE LOGS TABLE
-- =====================================================
CREATE TABLE module_logs (
    id SERIAL PRIMARY KEY,
    module_id INTEGER REFERENCES modules(id) ON DELETE CASCADE,
    module_code VARCHAR(50) NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    description TEXT,
    performed_by VARCHAR(100) DEFAULT 'System',
    ip_address VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_module_logs_module_id ON module_logs(module_id);
CREATE INDEX idx_module_logs_action_type ON module_logs(action_type);
CREATE INDEX idx_module_logs_created_at ON module_logs(created_at DESC);

-- =====================================================
-- 6. PRINTED CERTIFICATES TABLE
-- =====================================================
CREATE TABLE printed_certificates (
    id SERIAL PRIMARY KEY,
    certificate_id VARCHAR(50) NOT NULL,
    student_name VARCHAR(100) NOT NULL,
    module_id INTEGER REFERENCES modules(id) ON DELETE RESTRICT,
    ptc_date DATE NOT NULL,
    printed_by INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    branch VARCHAR(10) NOT NULL CHECK (branch IN ('SND', 'MKW', 'KBP')),
    printed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_printed_certificates_cert_id ON printed_certificates(certificate_id);
CREATE INDEX idx_printed_certificates_student ON printed_certificates(student_name);
CREATE INDEX idx_printed_certificates_module ON printed_certificates(module_id);
CREATE INDEX idx_printed_certificates_date ON printed_certificates(ptc_date);
CREATE INDEX idx_printed_certificates_printed_by ON printed_certificates(printed_by);
CREATE INDEX idx_printed_certificates_branch ON printed_certificates(branch);
CREATE INDEX idx_printed_certificates_printed_by_branch ON printed_certificates(printed_by, branch);
CREATE INDEX idx_printed_certificates_ptc_date_branch ON printed_certificates(ptc_date, branch);

-- =====================================================
-- 7. TRIGGERS
-- =====================================================

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_certificates_updated_at
    BEFORE UPDATE ON certificates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_modules_updated_at
    BEFORE UPDATE ON modules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 8. VIEWS
-- =====================================================

-- Stock Summary View
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

-- Certificates with Cumulative Totals View
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

-- Recent Logs View
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

-- Teachers View
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

-- Teachers by Branch View
CREATE OR REPLACE VIEW v_teachers_by_branch AS
SELECT 
    teacher_branch,
    teacher_division,
    COUNT(*) as teacher_count
FROM users
WHERE role = 'teacher'
GROUP BY teacher_branch, teacher_division
ORDER BY teacher_branch, teacher_division;

-- Module Statistics View
CREATE OR REPLACE VIEW v_module_stats AS
SELECT 
    division,
    COUNT(*) as total_modules,
    MIN(min_age) as youngest_age,
    MAX(max_age) as oldest_age
FROM modules
GROUP BY division;

-- =====================================================
-- 9. INSERT USERS (WITH BCRYPT HASHES)
-- =====================================================

-- ADMIN USER
-- Username: gulam
-- Password: admin123
-- Hash generated with bcrypt, rounds=10
INSERT INTO users (username, password, role) VALUES
('gulam', '$2b$10$YjhIONvjJb3bPDlOGKvN0.PQ/CtZC1jYz5Z5Z0vY4U9KqI1Y6vxqW', 'admin');

-- TEACHER USER
-- Username: teacher
-- Password: admin123
-- Teacher: Eva Herlina, Division: JK, Branch: SND
INSERT INTO users (username, password, role, teacher_name, teacher_division, teacher_branch) VALUES
('teacher', '$2b$10$YjhIONvjJb3bPDlOGKvN0.PQ/CtZC1jYz5Z5Z0vY4U9KqI1Y6vxqW', 'teacher', 'Eva Herlina', 'JK', 'SND');

-- Additional teacher users for testing
INSERT INTO users (username, password, role, teacher_name, teacher_division, teacher_branch) VALUES
('teacher_lk_snd', '$2b$10$YjhIONvjJb3bPDlOGKvN0.PQ/CtZC1jYz5Z5Z0vY4U9KqI1Y6vxqW', 'teacher', 'Budi Santoso', 'LK', 'SND'),
('teacher_jk_mkw', '$2b$10$YjhIONvjJb3bPDlOGKvN0.PQ/CtZC1jYz5Z5Z0vY4U9KqI1Y6vxqW', 'teacher', 'Siti Nurhaliza', 'JK', 'MKW'),
('teacher_lk_mkw', '$2b$10$YjhIONvjJb3bPDlOGKvN0.PQ/CtZC1jYz5Z5Z0vY4U9KqI1Y6vxqW', 'teacher', 'Ahmad Dhani', 'LK', 'MKW'),
('teacher_jk_kbp', '$2b$10$YjhIONvjJb3bPDlOGKvN0.PQ/CtZC1jYz5Z5Z0vY4U9KqI1Y6vxqW', 'teacher', 'Dewi Lestari', 'JK', 'KBP'),
('teacher_lk_kbp', '$2b$10$YjhIONvjJb3bPDlOGKvN0.PQ/CtZC1jYz5Z5Z0vY4U9KqI1Y6vxqW', 'teacher', 'Rina Susanti', 'LK', 'KBP');

-- =====================================================
-- 10. INSERT MODULES (DUMMY DATA)
-- =====================================================

INSERT INTO modules (module_code, module_name, division, min_age, max_age) VALUES
-- JK Modules (Junior Kids)
('JK-001', 'Dasar Coding untuk Anak', 'JK', 4, 6),
('JK-002', 'Robotika Sederhana', 'JK', 5, 7),
('JK-003', 'Desain Game Pemula', 'JK', 6, 8),
('JK-004', 'Animasi Digital Dasar', 'JK', 5, 7),
('JK-005', 'Logika & Problem Solving', 'JK', 4, 6),
('JK-006', 'Scratch Programming', 'JK', 5, 8),
('JK-007', 'LEGO Robotics', 'JK', 6, 8),
('JK-008', 'Digital Storytelling', 'JK', 5, 7),

-- LK Modules (Lanjutan Kids)
('LK-001', 'Web Development Dasar', 'LK', 8, 12),
('LK-002', 'Python Programming', 'LK', 9, 13),
('LK-003', 'Game Development Unity', 'LK', 10, 14),
('LK-004', 'Mobile App Development', 'LK', 11, 15),
('LK-005', 'Data Science untuk Remaja', 'LK', 12, 16),
('LK-006', 'Artificial Intelligence Intro', 'LK', 12, 16),
('LK-007', 'Cyber Security Basics', 'LK', 11, 15),
('LK-008', 'JavaScript Advanced', 'LK', 10, 14),
('LK-009', 'Arduino Programming', 'LK', 9, 13),
('LK-010', '3D Modeling & Printing', 'LK', 10, 14);

-- =====================================================
-- 11. INSERT CERTIFICATES (DUMMY DATA)
-- =====================================================

-- Batch 1 - Initial stock (3 months ago)
INSERT INTO certificates (certificate_id, jumlah_sertifikat_snd, jumlah_medali_snd, medali_awal_snd, jumlah_sertifikat_mkw, jumlah_medali_mkw, medali_awal_mkw, jumlah_sertifikat_kbp, jumlah_medali_kbp, medali_awal_kbp, created_at) VALUES
('BATCH-2025-001', 500, 500, 500, 0, 0, 0, 0, 0, 0, NOW() - INTERVAL '90 days');

-- Batch 2 - Restock (2 months ago)
INSERT INTO certificates (certificate_id, jumlah_sertifikat_snd, jumlah_medali_snd, medali_awal_snd, jumlah_sertifikat_mkw, jumlah_medali_mkw, medali_awal_mkw, jumlah_sertifikat_kbp, jumlah_medali_kbp, medali_awal_kbp, created_at) VALUES
('BATCH-2025-002', 300, 300, 300, 0, 0, 0, 0, 0, 0, NOW() - INTERVAL '60 days');

-- Batch 3 - Mixed distribution (1 month ago)
INSERT INTO certificates (certificate_id, jumlah_sertifikat_snd, jumlah_medali_snd, medali_awal_snd, jumlah_sertifikat_mkw, jumlah_medali_mkw, medali_awal_mkw, jumlah_sertifikat_kbp, jumlah_medali_kbp, medali_awal_kbp, created_at) VALUES
('BATCH-2025-003', 200, 200, 200, 100, 100, 100, 50, 50, 50, NOW() - INTERVAL '30 days');

-- Batch 4 - Recent (1 week ago)
INSERT INTO certificates (certificate_id, jumlah_sertifikat_snd, jumlah_medali_snd, medali_awal_snd, jumlah_sertifikat_mkw, jumlah_medali_mkw, medali_awal_mkw, jumlah_sertifikat_kbp, jumlah_medali_kbp, medali_awal_kbp, created_at) VALUES
('BATCH-2026-001', 400, 400, 400, 0, 0, 0, 0, 0, 0, NOW() - INTERVAL '7 days');

-- Batch 5 - Today
INSERT INTO certificates (certificate_id, jumlah_sertifikat_snd, jumlah_medali_snd, medali_awal_snd, jumlah_sertifikat_mkw, jumlah_medali_mkw, medali_awal_mkw, jumlah_sertifikat_kbp, jumlah_medali_kbp, medali_awal_kbp, created_at) VALUES
('BATCH-2026-002', 250, 250, 250, 150, 150, 150, 100, 100, 100, NOW());

-- =====================================================
-- 12. INSERT CERTIFICATE LOGS (DUMMY DATA)
-- =====================================================

-- Logs for BATCH-2025-001 creation
INSERT INTO certificate_logs (certificate_id, action_type, description, certificate_amount, medal_amount, new_values, performed_by, created_at) VALUES
('BATCH-2025-001', 'CREATE', 'Created initial certificate batch for SND branch', 500, 500, '{"jumlah_sertifikat_snd": 500, "jumlah_medali_snd": 500}'::jsonb, 'gulam', NOW() - INTERVAL '90 days');

-- Logs for BATCH-2025-002 creation
INSERT INTO certificate_logs (certificate_id, action_type, description, certificate_amount, medal_amount, new_values, performed_by, created_at) VALUES
('BATCH-2025-002', 'CREATE', 'Restock sertifikat SND', 300, 300, '{"jumlah_sertifikat_snd": 300, "jumlah_medali_snd": 300}'::jsonb, 'gulam', NOW() - INTERVAL '60 days');

-- Migration example: SND -> MKW (45 days ago)
INSERT INTO certificate_logs (certificate_id, action_type, description, from_branch, to_branch, certificate_amount, medal_amount, old_values, new_values, performed_by, created_at) VALUES
('BATCH-2025-001', 'MIGRATE', 'Migrated stock from SND to MKW', 'SND', 'MKW', 100, 100, '{"snd_cert": 500, "snd_medal": 500, "mkw_cert": 0, "mkw_medal": 0}'::jsonb, '{"snd_cert": 400, "snd_medal": 400, "mkw_cert": 100, "mkw_medal": 100}'::jsonb, 'gulam', NOW() - INTERVAL '45 days');

-- Logs for BATCH-2025-003 creation
INSERT INTO certificate_logs (certificate_id, action_type, description, certificate_amount, medal_amount, new_values, performed_by, created_at) VALUES
('BATCH-2025-003', 'CREATE', 'Created multi-branch distribution', 350, 350, '{"jumlah_sertifikat_snd": 200, "jumlah_medali_snd": 200, "jumlah_sertifikat_mkw": 100, "jumlah_medali_mkw": 100, "jumlah_sertifikat_kbp": 50, "jumlah_medali_kbp": 50}'::jsonb, 'gulam', NOW() - INTERVAL '30 days');

-- Migration example: SND -> KBP (15 days ago)
INSERT INTO certificate_logs (certificate_id, action_type, description, from_branch, to_branch, certificate_amount, medal_amount, old_values, new_values, performed_by, created_at) VALUES
('BATCH-2025-002', 'MIGRATE', 'Migrated stock from SND to KBP', 'SND', 'KBP', 50, 50, '{"snd_cert": 300, "snd_medal": 300, "kbp_cert": 0, "kbp_medal": 0}'::jsonb, '{"snd_cert": 250, "snd_medal": 250, "kbp_cert": 50, "kbp_medal": 50}'::jsonb, 'gulam', NOW() - INTERVAL '15 days');

-- Logs for recent batches
INSERT INTO certificate_logs (certificate_id, action_type, description, certificate_amount, medal_amount, new_values, performed_by, created_at) VALUES
('BATCH-2026-001', 'CREATE', 'New batch for February 2026', 400, 400, '{"jumlah_sertifikat_snd": 400, "jumlah_medali_snd": 400}'::jsonb, 'gulam', NOW() - INTERVAL '7 days'),
('BATCH-2026-002', 'CREATE', 'Latest multi-branch batch', 500, 500, '{"jumlah_sertifikat_snd": 250, "jumlah_medali_snd": 250, "jumlah_sertifikat_mkw": 150, "jumlah_medali_mkw": 150, "jumlah_sertifikat_kbp": 100, "jumlah_medali_kbp": 100}'::jsonb, 'gulam', NOW());

-- =====================================================
-- 13. INSERT MODULE LOGS (DUMMY DATA)
-- =====================================================

INSERT INTO module_logs (module_id, module_code, action_type, description, performed_by, created_at)
SELECT id, module_code, 'MODULE_CREATED', 'Module ' || module_code || ' - ' || module_name || ' created', 'gulam', created_at
FROM modules;

-- =====================================================
-- 14. INSERT PRINTED CERTIFICATES (DUMMY DATA)
-- =====================================================

-- Get teacher IDs for reference
DO $$
DECLARE
    teacher_id INT;
    module_jk_1 INT;
    module_jk_2 INT;
    module_lk_1 INT;
    module_lk_2 INT;
BEGIN
    -- Get teacher ID
    SELECT id INTO teacher_id FROM users WHERE username = 'teacher' LIMIT 1;
    
    -- Get module IDs
    SELECT id INTO module_jk_1 FROM modules WHERE module_code = 'JK-001';
    SELECT id INTO module_jk_2 FROM modules WHERE module_code = 'JK-002';
    SELECT id INTO module_lk_1 FROM modules WHERE module_code = 'LK-001';
    SELECT id INTO module_lk_2 FROM modules WHERE module_code = 'LK-002';
    
    -- Insert printed certificates samples (last 30 days)
    INSERT INTO printed_certificates (certificate_id, student_name, module_id, ptc_date, printed_by, branch, printed_at) VALUES
    -- Recent prints (last week)
    ('CERT-2026-0001', 'Andi Wijaya', module_jk_1, NOW() - INTERVAL '2 days', teacher_id, 'SND', NOW() - INTERVAL '2 days'),
    ('CERT-2026-0002', 'Budi Santoso', module_jk_1, NOW() - INTERVAL '2 days', teacher_id, 'SND', NOW() - INTERVAL '2 days'),
    ('CERT-2026-0003', 'Citra Dewi', module_jk_2, NOW() - INTERVAL '3 days', teacher_id, 'SND', NOW() - INTERVAL '3 days'),
    ('CERT-2026-0004', 'Dina Puspita', module_jk_2, NOW() - INTERVAL '4 days', teacher_id, 'SND', NOW() - INTERVAL '4 days'),
    ('CERT-2026-0005', 'Eko Prasetyo', module_lk_1, NOW() - INTERVAL '5 days', teacher_id, 'SND', NOW() - INTERVAL '5 days'),
    
    -- Last 2 weeks
    ('CERT-2026-0006', 'Fitri Handayani', module_lk_1, NOW() - INTERVAL '10 days', teacher_id, 'SND', NOW() - INTERVAL '10 days'),
    ('CERT-2026-0007', 'Gani Firmansyah', module_lk_2, NOW() - INTERVAL '12 days', teacher_id, 'SND', NOW() - INTERVAL '12 days'),
    ('CERT-2026-0008', 'Hana Rahmawati', module_jk_1, NOW() - INTERVAL '14 days', teacher_id, 'SND', NOW() - INTERVAL '14 days'),
    
    -- Last month
    ('CERT-2026-0009', 'Indra Gunawan', module_jk_2, NOW() - INTERVAL '20 days', teacher_id, 'SND', NOW() - INTERVAL '20 days'),
    ('CERT-2026-0010', 'Joko Widodo Jr', module_lk_1, NOW() - INTERVAL '25 days', teacher_id, 'SND', NOW() - INTERVAL '25 days');
END $$;

-- =====================================================
-- 15. VERIFICATION & SUMMARY
-- =====================================================

-- Show users
SELECT '=== USERS ===' as info;
SELECT id, username, role, teacher_name, teacher_branch FROM users ORDER BY role, username;

-- Show modules count
SELECT '=== MODULES SUMMARY ===' as info;
SELECT division, COUNT(*) as total FROM modules GROUP BY division;

-- Show certificates summary
SELECT '=== CERTIFICATES SUMMARY ===' as info;
SELECT * FROM v_stock_summary;

-- Show certificate batches
SELECT '=== CERTIFICATE BATCHES ===' as info;
SELECT 
    certificate_id,
    jumlah_sertifikat_snd as snd_cert,
    jumlah_medali_snd as snd_medal,
    jumlah_sertifikat_mkw as mkw_cert,
    jumlah_medali_mkw as mkw_medal,
    jumlah_sertifikat_kbp as kbp_cert,
    jumlah_medali_kbp as kbp_medal,
    created_at::date as created
FROM certificates
ORDER BY created_at DESC;

-- Show recent logs
SELECT '=== RECENT CERTIFICATE LOGS ===' as info;
SELECT 
    certificate_id,
    action_type,
    description,
    performed_by,
    created_at::date as date
FROM certificate_logs
ORDER BY created_at DESC
LIMIT 10;

-- Show printed certificates count
SELECT '=== PRINTED CERTIFICATES ===' as info;
SELECT COUNT(*) as total_printed FROM printed_certificates;

-- =====================================================
-- END OF SCHEMA
-- =====================================================

-- =====================================================
-- LOGIN CREDENTIALS
-- =====================================================
-- 
-- ADMIN:
--   Username: gulam
--   Password: admin123
-- 
-- TEACHER:
--   Username: teacher
--   Password: admin123
-- 
-- ALL OTHER TEACHERS:
--   Password: admin123
-- 
-- =====================================================
-- INSTALLATION
-- =====================================================
-- 
-- 1. Drop existing database (if any):
--    DROP DATABASE IF EXISTS certificate_management;
-- 
-- 2. Create new database:
--    CREATE DATABASE certificate_management;
-- 
-- 3. Run this script:
--    psql -U postgres -d certificate_management -f schema-complete-with-dummy-data.sql
-- 
-- 4. Verify:
--    psql -U postgres -d certificate_management
--    SELECT * FROM users;
--    SELECT * FROM v_stock_summary;
-- 
-- =====================================================