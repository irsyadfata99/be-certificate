-- =====================================================
-- CERTIFICATE MANAGEMENT DATABASE - CLEAN SCHEMA
-- =====================================================
-- PostgreSQL Database Schema
-- Version: 4.0 (Multi-Branch, Multi-Division, Students)
-- Updated: February 2026
-- =====================================================
-- Admin: username=gulam, password=admin123
-- =====================================================

-- =====================================================
-- CLEAN START - DROP ALL TABLES
-- =====================================================
DROP TABLE IF EXISTS student_transfers CASCADE;
DROP TABLE IF EXISTS student_modules CASCADE;
DROP TABLE IF EXISTS students CASCADE;
DROP TABLE IF EXISTS printed_certificates CASCADE;
DROP TABLE IF EXISTS module_logs CASCADE;
DROP TABLE IF EXISTS modules CASCADE;
DROP TABLE IF EXISTS certificate_logs CASCADE;
DROP TABLE IF EXISTS certificates CASCADE;
DROP TABLE IF EXISTS teacher_divisions CASCADE;
DROP TABLE IF EXISTS teacher_branches CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS branches CASCADE;
DROP TABLE IF EXISTS schema_migrations CASCADE;

-- Drop views
DROP VIEW IF EXISTS v_stock_summary CASCADE;
DROP VIEW IF EXISTS v_certificates_cumulative CASCADE;
DROP VIEW IF EXISTS v_recent_logs CASCADE;
DROP VIEW IF EXISTS v_teachers CASCADE;
DROP VIEW IF EXISTS v_teachers_by_branch CASCADE;
DROP VIEW IF EXISTS v_module_stats CASCADE;
DROP VIEW IF EXISTS v_student_stats CASCADE;
DROP VIEW IF EXISTS v_active_students CASCADE;

-- =====================================================
-- 1. SCHEMA MIGRATIONS TABLE
-- =====================================================
CREATE TABLE schema_migrations (
    id SERIAL PRIMARY KEY,
    migration_id VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    rolled_back_at TIMESTAMP NULL
);

-- =====================================================
-- 2. BRANCHES TABLE (Dynamic Branches)
-- =====================================================
CREATE TABLE branches (
    id SERIAL PRIMARY KEY,
    branch_code VARCHAR(10) UNIQUE NOT NULL,
    branch_name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_branches_code ON branches(branch_code);
CREATE INDEX idx_branches_active ON branches(is_active);

-- Insert default branches
INSERT INTO branches (branch_code, branch_name, is_active) VALUES
('SND', 'Senopati', true),
('MKW', 'Mekarsari', true),
('KBP', 'Kebon Pala', true);

-- =====================================================
-- 3. USERS TABLE (ADMIN & TEACHER)
-- =====================================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    
    -- Role-based access control
    role VARCHAR(20) DEFAULT 'admin' CHECK (role IN ('admin', 'teacher')),
    
    -- Teacher-specific fields (nullable for admin users)
    teacher_name VARCHAR(100),
    
    -- DEPRECATED: kept for backward compatibility, use teacher_divisions & teacher_branches tables
    teacher_division VARCHAR(10),
    teacher_branch VARCHAR(10),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_teacher_branch ON users(teacher_branch);

-- Constraint: Teachers must have teacher_name
ALTER TABLE users ADD CONSTRAINT check_teacher_name 
    CHECK (
        (role = 'admin') OR 
        (role = 'teacher' AND teacher_name IS NOT NULL)
    );

-- =====================================================
-- 4. TEACHER BRANCHES (Many-to-Many)
-- =====================================================
CREATE TABLE teacher_branches (
    id SERIAL PRIMARY KEY,
    teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    branch_code VARCHAR(10) NOT NULL REFERENCES branches(branch_code) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(teacher_id, branch_code)
);

-- Indexes
CREATE INDEX idx_teacher_branches_teacher ON teacher_branches(teacher_id);
CREATE INDEX idx_teacher_branches_branch ON teacher_branches(branch_code);
CREATE INDEX idx_teacher_branches_primary ON teacher_branches(teacher_id, is_primary);

-- =====================================================
-- 5. TEACHER DIVISIONS (Many-to-Many)
-- =====================================================
CREATE TABLE teacher_divisions (
    id SERIAL PRIMARY KEY,
    teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    division VARCHAR(10) NOT NULL CHECK (division IN ('JK', 'LK')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(teacher_id, division)
);

-- Indexes
CREATE INDEX idx_teacher_divisions_teacher ON teacher_divisions(teacher_id);
CREATE INDEX idx_teacher_divisions_division ON teacher_divisions(division);

-- =====================================================
-- 6. CERTIFICATES TABLE (MAIN STOCK)
-- =====================================================
CREATE TABLE certificates (
    id SERIAL PRIMARY KEY,
    certificate_id VARCHAR(50) UNIQUE NOT NULL,
    
    -- SND (Senopati) - Sertifikat dan Medali
    jumlah_sertifikat_snd INTEGER DEFAULT 0 CHECK (jumlah_sertifikat_snd >= 0),
    jumlah_medali_snd INTEGER DEFAULT 0 CHECK (jumlah_medali_snd >= 0),
    medali_awal_snd INTEGER DEFAULT 0,
    
    -- MKW (Mekarsari) - Sertifikat dan Medali
    jumlah_sertifikat_mkw INTEGER DEFAULT 0 CHECK (jumlah_sertifikat_mkw >= 0),
    jumlah_medali_mkw INTEGER DEFAULT 0 CHECK (jumlah_medali_mkw >= 0),
    medali_awal_mkw INTEGER DEFAULT 0,
    
    -- KBP (Kebon Pala) - Sertifikat dan Medali
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
-- 7. CERTIFICATE LOGS TABLE (AUDIT TRAIL)
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
-- 8. MODULES TABLE
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
-- 9. MODULE LOGS TABLE
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
-- 10. STUDENTS TABLE
-- =====================================================
CREATE TABLE students (
    id SERIAL PRIMARY KEY,
    student_name VARCHAR(100) NOT NULL,
    branch_code VARCHAR(10) NOT NULL REFERENCES branches(branch_code) ON DELETE RESTRICT,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'transferred')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_students_name ON students(student_name);
CREATE INDEX idx_students_branch ON students(branch_code);
CREATE INDEX idx_students_status ON students(status);
CREATE INDEX idx_students_branch_status ON students(branch_code, status);
CREATE INDEX idx_students_name_search ON students USING gin(to_tsvector('english', student_name));

-- =====================================================
-- 11. STUDENT TRANSFERS TABLE (History)
-- =====================================================
CREATE TABLE student_transfers (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    from_branch VARCHAR(10) NOT NULL,
    to_branch VARCHAR(10) NOT NULL,
    transferred_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_student_transfers_student ON student_transfers(student_id);
CREATE INDEX idx_student_transfers_from ON student_transfers(from_branch);
CREATE INDEX idx_student_transfers_to ON student_transfers(to_branch);
CREATE INDEX idx_student_transfers_date ON student_transfers(transfer_date);

-- =====================================================
-- 12. STUDENT MODULES TABLE (Track Modules Completed)
-- =====================================================
CREATE TABLE student_modules (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE RESTRICT,
    branch_code VARCHAR(10) NOT NULL REFERENCES branches(branch_code) ON DELETE RESTRICT,
    completed_date DATE NOT NULL,
    certificate_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(student_id, module_id)
);

-- Indexes
CREATE INDEX idx_student_modules_student ON student_modules(student_id);
CREATE INDEX idx_student_modules_module ON student_modules(module_id);
CREATE INDEX idx_student_modules_branch ON student_modules(branch_code);
CREATE INDEX idx_student_modules_date ON student_modules(completed_date);
CREATE INDEX idx_student_modules_certificate ON student_modules(certificate_id);

-- =====================================================
-- 13. PRINTED CERTIFICATES TABLE (Updated)
-- =====================================================
CREATE TABLE printed_certificates (
    id SERIAL PRIMARY KEY,
    certificate_id VARCHAR(50) NOT NULL,
    student_id INTEGER REFERENCES students(id) ON DELETE RESTRICT,
    student_name VARCHAR(100) NOT NULL, -- Kept for backward compatibility & manual entries
    module_id INTEGER REFERENCES modules(id) ON DELETE CASCADE,
    ptc_date DATE NOT NULL,
    printed_by INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    branch VARCHAR(10) NOT NULL,
    printed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_printed_certificates_cert_id ON printed_certificates(certificate_id);
CREATE INDEX idx_printed_certificates_student_id ON printed_certificates(student_id);
CREATE INDEX idx_printed_certificates_student_name ON printed_certificates(student_name);
CREATE INDEX idx_printed_certificates_module ON printed_certificates(module_id);
CREATE INDEX idx_printed_certificates_date ON printed_certificates(ptc_date);
CREATE INDEX idx_printed_certificates_printed_by ON printed_certificates(printed_by);
CREATE INDEX idx_printed_certificates_branch ON printed_certificates(branch);
CREATE INDEX idx_printed_certificates_printed_by_branch ON printed_certificates(printed_by, branch);
CREATE INDEX idx_printed_certificates_ptc_date_branch ON printed_certificates(ptc_date, branch);

-- =====================================================
-- 14. TRIGGERS
-- =====================================================

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
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

CREATE TRIGGER update_branches_updated_at
    BEFORE UPDATE ON branches
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_students_updated_at
    BEFORE UPDATE ON students
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Auto-create student_modules entry when printed_certificates is created
CREATE OR REPLACE FUNCTION auto_create_student_module()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.student_id IS NOT NULL THEN
        INSERT INTO student_modules (student_id, module_id, branch_code, completed_date, certificate_id)
        VALUES (NEW.student_id, NEW.module_id, NEW.branch, NEW.ptc_date, NEW.certificate_id)
        ON CONFLICT (student_id, module_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_create_student_module
    AFTER INSERT ON printed_certificates
    FOR EACH ROW
    EXECUTE FUNCTION auto_create_student_module();

-- =====================================================
-- 15. VIEWS
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

-- Teachers View (with assigned branches and divisions)
CREATE OR REPLACE VIEW v_teachers AS
SELECT 
    u.id,
    u.username,
    u.teacher_name,
    u.created_at,
    u.updated_at,
    ARRAY_AGG(DISTINCT tb.branch_code ORDER BY tb.branch_code) FILTER (WHERE tb.branch_code IS NOT NULL) as branches,
    ARRAY_AGG(DISTINCT td.division ORDER BY td.division) FILTER (WHERE td.division IS NOT NULL) as divisions
FROM users u
LEFT JOIN teacher_branches tb ON u.id = tb.teacher_id
LEFT JOIN teacher_divisions td ON u.id = td.teacher_id
WHERE u.role = 'teacher'
GROUP BY u.id, u.username, u.teacher_name, u.created_at, u.updated_at
ORDER BY u.created_at DESC;

-- Teachers by Branch View
CREATE OR REPLACE VIEW v_teachers_by_branch AS
SELECT 
    tb.branch_code,
    COUNT(DISTINCT tb.teacher_id) as teacher_count
FROM teacher_branches tb
GROUP BY tb.branch_code
ORDER BY tb.branch_code;

-- Module Statistics View
CREATE OR REPLACE VIEW v_module_stats AS
SELECT 
    division,
    COUNT(*) as total_modules,
    MIN(min_age) as youngest_age,
    MAX(max_age) as oldest_age
FROM modules
GROUP BY division;

-- Student Statistics View
CREATE OR REPLACE VIEW v_student_stats AS
SELECT 
    s.branch_code,
    COUNT(*) FILTER (WHERE s.status = 'active') as active_students,
    COUNT(*) FILTER (WHERE s.status = 'inactive') as inactive_students,
    COUNT(*) FILTER (WHERE s.status = 'transferred') as transferred_students,
    COUNT(*) as total_students
FROM students s
GROUP BY s.branch_code
ORDER BY s.branch_code;

-- Active Students View
CREATE OR REPLACE VIEW v_active_students AS
SELECT 
    s.id,
    s.student_name,
    s.branch_code,
    b.branch_name,
    COUNT(sm.id) as modules_completed,
    MAX(sm.completed_date) as last_module_date
FROM students s
JOIN branches b ON s.branch_code = b.branch_code
LEFT JOIN student_modules sm ON s.id = sm.student_id
WHERE s.status = 'active'
GROUP BY s.id, s.student_name, s.branch_code, b.branch_name
ORDER BY s.student_name;

-- =====================================================
-- 16. INSERT ADMIN USER
-- =====================================================

-- ADMIN USER
-- Username: gulam
-- Password: admin123
-- Hash generated with bcrypt, rounds=10
INSERT INTO users (username, password, role) VALUES
('gulam', '$2b$10$bZDJxWAEZZYF4iZtg2vqRe94qggikyDvQQ/pqKoemSQUUDKtVSrGu', 'admin');

-- =====================================================
-- 17. RECORD INITIAL MIGRATION
-- =====================================================
INSERT INTO schema_migrations (migration_id, description) VALUES
('001_initial_schema', 'Initial database schema with multi-branch, multi-division, and students support');

-- =====================================================
-- 18. VERIFICATION
-- =====================================================

-- Show all tables
SELECT 
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Show all views
SELECT table_name as view_name
FROM information_schema.views
WHERE table_schema = 'public'
ORDER BY table_name;

-- Show branches
SELECT * FROM branches ORDER BY branch_code;

-- Show admin user
SELECT id, username, role FROM users WHERE role = 'admin';

-- Show foreign key constraints
SELECT 
    conname AS constraint_name,
    conrelid::regclass AS table_name,
    confrelid::regclass AS foreign_table,
    CASE confdeltype
        WHEN 'c' THEN 'CASCADE'
        WHEN 'r' THEN 'RESTRICT'
        WHEN 'n' THEN 'NO ACTION'
        WHEN 'a' THEN 'SET NULL'
        WHEN 'd' THEN 'SET DEFAULT'
    END AS delete_action
FROM pg_constraint
WHERE contype = 'f' 
ORDER BY conrelid::regclass::text, conname;

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
-- =====================================================
-- INSTALLATION INSTRUCTIONS
-- =====================================================
-- 
-- 1. Drop existing database (if any):
--    DROP DATABASE IF EXISTS certificate_db;
-- 
-- 2. Create new database:
--    CREATE DATABASE certificate_db;
-- 
-- 3. Run this script:
--    psql -U postgres -d certificate_db -f schema_clean.sql
-- 
-- 4. Verify:
--    psql -U postgres -d certificate_db
--    SELECT * FROM users;
--    SELECT * FROM branches;
--    SELECT * FROM v_stock_summary;
-- 
-- =====================================================