-- =====================================================
-- CERTIFICATE MANAGEMENT DATABASE - FRESH CLEAN SCHEMA
-- =====================================================
-- PostgreSQL Database Schema
-- Version: 4.0 (Complete with Dummy Data)
-- Created: February 2026
-- =====================================================
-- DROP AND RECREATE DATABASE
-- =====================================================

-- Instructions:
-- 1. Connect to PostgreSQL: psql -U postgres
-- 2. Run: DROP DATABASE IF EXISTS certificate_db;
-- 3. Run: CREATE DATABASE certificate_db;
-- 4. Run: \c certificate_db
-- 5. Run: \i fresh-schema.sql

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
DROP TABLE IF EXISTS certificate_stock CASCADE;
DROP TABLE IF EXISTS certificates CASCADE;
DROP TABLE IF EXISTS teacher_divisions CASCADE;
DROP TABLE IF EXISTS teacher_branches CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS branches CASCADE;
DROP TABLE IF EXISTS schema_migrations CASCADE;

-- Drop views
DROP VIEW IF EXISTS v_stock_summary CASCADE;
DROP VIEW IF EXISTS v_certificates_with_stock CASCADE;
DROP VIEW IF EXISTS v_certificates_cumulative CASCADE;
DROP VIEW IF EXISTS v_recent_logs CASCADE;
DROP VIEW IF EXISTS v_teachers CASCADE;
DROP VIEW IF EXISTS v_teachers_by_branch CASCADE;
DROP VIEW IF EXISTS v_module_stats CASCADE;
DROP VIEW IF EXISTS v_student_stats CASCADE;
DROP VIEW IF EXISTS v_active_students CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS auto_create_student_module() CASCADE;
DROP FUNCTION IF EXISTS get_certificate_stock(VARCHAR, VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS add_certificate_stock(VARCHAR, VARCHAR, INTEGER, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS migrate_certificate_stock(VARCHAR, VARCHAR, VARCHAR, INTEGER, INTEGER) CASCADE;

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

-- Insert branches
INSERT INTO branches (branch_code, branch_name, is_active) VALUES
('SND', 'Sunda', true),
('MKW', 'Mekarwangi', true),
('KBP', 'Kota Baru Parahyangan', true);

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
    
    -- LEGACY: kept for backward compatibility
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

-- Insert users (bcrypt hash for 'admin123')
-- Admin: gulam / admin123
INSERT INTO users (username, password, role) VALUES
('gulam', '$2b$10$bZDJxWAEZZYF4iZtg2vqRe94qggikyDvQQ/pqKoemSQUUDKtVSrGu', 'admin');

-- Teacher: azhar / admin123
INSERT INTO users (username, password, role, teacher_name, teacher_division, teacher_branch) VALUES
('azhar', '$2b$10$bZDJxWAEZZYF4iZtg2vqRe94qggikyDvQQ/pqKoemSQUUDKtVSrGu', 'teacher', 'Azhar Rivaldi', 'JK', 'SND');

-- =====================================================
-- 4. TEACHER BRANCHES (Many-to-Many)
-- =====================================================
CREATE TABLE teacher_branches (
    id SERIAL PRIMARY KEY,
    teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(teacher_id, branch_id)
);

-- Indexes
CREATE INDEX idx_teacher_branches_teacher ON teacher_branches(teacher_id);
CREATE INDEX idx_teacher_branches_branch ON teacher_branches(branch_id);
CREATE INDEX idx_teacher_branches_primary ON teacher_branches(teacher_id, is_primary);

-- Insert teacher branch assignment (Azhar -> SND)
INSERT INTO teacher_branches (teacher_id, branch_id, is_primary)
SELECT u.id, b.id, true
FROM users u, branches b
WHERE u.username = 'azhar' AND b.branch_code = 'SND';

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

-- Insert teacher division assignment (Azhar -> JK)
INSERT INTO teacher_divisions (teacher_id, division)
SELECT id, 'JK'
FROM users
WHERE username = 'azhar';

-- =====================================================
-- 6. CERTIFICATES TABLE (MAIN BATCHES)
-- =====================================================
CREATE TABLE certificates (
    id SERIAL PRIMARY KEY,
    certificate_id VARCHAR(50) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_certificates_id ON certificates(certificate_id);
CREATE INDEX idx_certificates_created_at ON certificates(created_at DESC);

-- Insert 1 certificate batch
INSERT INTO certificates (certificate_id, created_at) VALUES
('BATCH-2026-001', NOW() - INTERVAL '7 days');

-- =====================================================
-- 7. CERTIFICATE STOCK TABLE (Dynamic per Branch)
-- =====================================================
CREATE TABLE certificate_stock (
    id SERIAL PRIMARY KEY,
    certificate_id VARCHAR(50) NOT NULL REFERENCES certificates(certificate_id) ON DELETE CASCADE,
    branch_code VARCHAR(10) NOT NULL REFERENCES branches(branch_code) ON DELETE RESTRICT,
    jumlah_sertifikat INTEGER DEFAULT 0 CHECK (jumlah_sertifikat >= 0),
    jumlah_medali INTEGER DEFAULT 0 CHECK (jumlah_medali >= 0),
    medali_awal INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(certificate_id, branch_code)
);

-- Indexes
CREATE INDEX idx_certificate_stock_cert_id ON certificate_stock(certificate_id);
CREATE INDEX idx_certificate_stock_branch ON certificate_stock(branch_code);
CREATE INDEX idx_certificate_stock_combined ON certificate_stock(certificate_id, branch_code);

-- Insert stock for BATCH-2026-001 (SND: 100 certs, 100 medals)
INSERT INTO certificate_stock (certificate_id, branch_code, jumlah_sertifikat, jumlah_medali, medali_awal)
VALUES ('BATCH-2026-001', 'SND', 100, 100, 100);

-- =====================================================
-- 8. CERTIFICATE LOGS TABLE (AUDIT TRAIL)
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

-- Insert 1 log entry (batch creation)
INSERT INTO certificate_logs (certificate_id, action_type, description, certificate_amount, medal_amount, new_values, performed_by, created_at)
VALUES (
    'BATCH-2026-001',
    'CREATE',
    'Created certificate batch for SND: 100 certificates, 100 medals',
    100,
    100,
    '{"branch": "SND", "certificates": 100, "medals": 100}'::jsonb,
    'gulam',
    NOW() - INTERVAL '7 days'
);

-- =====================================================
-- 9. MODULES TABLE
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

-- Insert 1 module for JK
INSERT INTO modules (module_code, module_name, division, min_age, max_age) VALUES
('JK-001', 'Scratch Programming untuk Junior Koder', 'JK', 5, 8);

-- Insert 1 module for LK
INSERT INTO modules (module_code, module_name, division, min_age, max_age) VALUES
('LK-001', 'Python Programming untuk Little Koder', 'LK', 9, 12);

-- =====================================================
-- 10. MODULE LOGS TABLE
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

-- Insert module creation logs
INSERT INTO module_logs (module_id, module_code, action_type, description, performed_by, created_at)
SELECT id, module_code, 'MODULE_CREATED', 'Module ' || module_code || ' - ' || module_name || ' created', 'gulam', created_at
FROM modules;

-- =====================================================
-- 11. STUDENTS TABLE
-- =====================================================
CREATE TABLE students (
    id SERIAL PRIMARY KEY,
    student_name VARCHAR(100) NOT NULL,
    branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    division VARCHAR(10) NOT NULL CHECK (division IN ('JK', 'LK')),
    date_of_birth DATE,
    parent_name VARCHAR(100),
    parent_phone VARCHAR(20),
    parent_email VARCHAR(100),
    address TEXT,
    notes TEXT,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'transferred')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_students_name ON students(student_name);
CREATE INDEX idx_students_branch ON students(branch_id);
CREATE INDEX idx_students_status ON students(status);
CREATE INDEX idx_students_branch_status ON students(branch_id, status);
CREATE INDEX idx_students_name_search ON students USING gin(to_tsvector('english', student_name));

-- Insert 1 student
INSERT INTO students (student_name, branch_id, division, date_of_birth, parent_name, parent_phone, status)
SELECT 
    'Budi Santoso',
    b.id,
    'JK',
    '2018-05-15',
    'Ahmad Santoso',
    '081234567890',
    'active'
FROM branches b
WHERE b.branch_code = 'SND';

-- =====================================================
-- 12. STUDENT TRANSFERS TABLE (History)
-- =====================================================
CREATE TABLE student_transfers (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    from_branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    to_branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    transferred_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_student_transfers_student ON student_transfers(student_id);
CREATE INDEX idx_student_transfers_from ON student_transfers(from_branch_id);
CREATE INDEX idx_student_transfers_to ON student_transfers(to_branch_id);
CREATE INDEX idx_student_transfers_date ON student_transfers(transfer_date);

-- No dummy data for transfers (empty table)

-- =====================================================
-- 13. STUDENT MODULES TABLE (Track Modules Completed)
-- =====================================================
CREATE TABLE student_modules (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE RESTRICT,
    branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    completed_date DATE NOT NULL,
    certificate_id VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(student_id, module_id)
);

-- Indexes
CREATE INDEX idx_student_modules_student ON student_modules(student_id);
CREATE INDEX idx_student_modules_module ON student_modules(module_id);
CREATE INDEX idx_student_modules_branch ON student_modules(branch_id);
CREATE INDEX idx_student_modules_date ON student_modules(completed_date);
CREATE INDEX idx_student_modules_certificate ON student_modules(certificate_id);

-- Insert 1 completed module for student
INSERT INTO student_modules (student_id, module_id, branch_id, completed_date, certificate_id)
SELECT 
    s.id,
    m.id,
    s.branch_id,
    NOW()::date - 5,
    'BATCH-2026-001'
FROM students s, modules m
WHERE s.student_name = 'Budi Santoso' AND m.module_code = 'JK-001';

-- =====================================================
-- 14. PRINTED CERTIFICATES TABLE
-- =====================================================
CREATE TABLE printed_certificates (
    id SERIAL PRIMARY KEY,
    certificate_id VARCHAR(50) NOT NULL,
    student_id INTEGER REFERENCES students(id) ON DELETE RESTRICT,
    student_name VARCHAR(100) NOT NULL,
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

-- Insert 1 printed certificate
INSERT INTO printed_certificates (certificate_id, student_id, student_name, module_id, ptc_date, printed_by, branch)
SELECT 
    'BATCH-2026-001',
    s.id,
    s.student_name,
    m.id,
    NOW()::date - 5,
    u.id,
    'SND'
FROM students s, modules m, users u
WHERE s.student_name = 'Budi Santoso' 
  AND m.module_code = 'JK-001'
  AND u.username = 'azhar';

-- =====================================================
-- 15. TRIGGERS
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

CREATE TRIGGER update_certificate_stock_updated_at
    BEFORE UPDATE ON certificate_stock
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
        INSERT INTO student_modules (student_id, module_id, branch_id, completed_date, certificate_id)
        SELECT NEW.student_id, NEW.module_id, b.id, NEW.ptc_date, NEW.certificate_id
        FROM branches b
        WHERE b.branch_code = NEW.branch
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
-- 16. HELPER FUNCTIONS
-- =====================================================

-- Get stock for a specific certificate and branch
CREATE OR REPLACE FUNCTION get_certificate_stock(
    p_certificate_id VARCHAR(50),
    p_branch_code VARCHAR(10)
)
RETURNS TABLE (
    certificates INTEGER,
    medals INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(cs.jumlah_sertifikat, 0)::INTEGER,
        COALESCE(cs.jumlah_medali, 0)::INTEGER
    FROM certificate_stock cs
    WHERE cs.certificate_id = p_certificate_id
        AND cs.branch_code = p_branch_code;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT 0, 0;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Add stock to a branch
CREATE OR REPLACE FUNCTION add_certificate_stock(
    p_certificate_id VARCHAR(50),
    p_branch_code VARCHAR(10),
    p_certificates INTEGER,
    p_medals INTEGER
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO certificate_stock (certificate_id, branch_code, jumlah_sertifikat, jumlah_medali, medali_awal)
    VALUES (p_certificate_id, p_branch_code, p_certificates, p_medals, p_medals)
    ON CONFLICT (certificate_id, branch_code) 
    DO UPDATE SET 
        jumlah_sertifikat = certificate_stock.jumlah_sertifikat + p_certificates,
        jumlah_medali = certificate_stock.jumlah_medali + p_medals,
        updated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Migrate stock between branches
CREATE OR REPLACE FUNCTION migrate_certificate_stock(
    p_certificate_id VARCHAR(50),
    p_from_branch VARCHAR(10),
    p_to_branch VARCHAR(10),
    p_certificates INTEGER,
    p_medals INTEGER
)
RETURNS VOID AS $$
DECLARE
    v_available_certs INTEGER;
    v_available_medals INTEGER;
BEGIN
    -- Check source stock
    SELECT jumlah_sertifikat, jumlah_medali 
    INTO v_available_certs, v_available_medals
    FROM certificate_stock
    WHERE certificate_id = p_certificate_id 
        AND branch_code = p_from_branch;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Source stock not found';
    END IF;
    
    IF v_available_certs < p_certificates THEN
        RAISE EXCEPTION 'Insufficient certificates. Available: %, Requested: %', v_available_certs, p_certificates;
    END IF;
    
    IF v_available_medals < p_medals THEN
        RAISE EXCEPTION 'Insufficient medals. Available: %, Requested: %', v_available_medals, p_medals;
    END IF;
    
    -- Deduct from source
    UPDATE certificate_stock 
    SET jumlah_sertifikat = jumlah_sertifikat - p_certificates,
        jumlah_medali = jumlah_medali - p_medals,
        updated_at = CURRENT_TIMESTAMP
    WHERE certificate_id = p_certificate_id 
        AND branch_code = p_from_branch;
    
    -- Add to destination
    INSERT INTO certificate_stock (certificate_id, branch_code, jumlah_sertifikat, jumlah_medali, medali_awal)
    VALUES (p_certificate_id, p_to_branch, p_certificates, p_medals, p_medals)
    ON CONFLICT (certificate_id, branch_code)
    DO UPDATE SET 
        jumlah_sertifikat = certificate_stock.jumlah_sertifikat + p_certificates,
        jumlah_medali = certificate_stock.jumlah_medali + p_medals,
        updated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 17. VIEWS
-- =====================================================

-- Stock Summary View
CREATE OR REPLACE VIEW v_stock_summary AS
SELECT 
    cs.branch_code,
    b.branch_name,
    COALESCE(SUM(cs.jumlah_sertifikat), 0) as total_certificates,
    COALESCE(SUM(cs.jumlah_medali), 0) as total_medals
FROM certificate_stock cs
JOIN branches b ON cs.branch_code = b.branch_code
GROUP BY cs.branch_code, b.branch_name
ORDER BY cs.branch_code;

-- Certificates with Stock View
CREATE OR REPLACE VIEW v_certificates_with_stock AS
SELECT 
    c.id,
    c.certificate_id,
    c.created_at,
    c.updated_at,
    json_agg(
        json_build_object(
            'branch_code', cs.branch_code,
            'branch_name', b.branch_name,
            'certificates', cs.jumlah_sertifikat,
            'medals', cs.jumlah_medali,
            'initial_medals', cs.medali_awal
        ) ORDER BY cs.branch_code
    ) FILTER (WHERE cs.branch_code IS NOT NULL) as stock_by_branch,
    COALESCE(SUM(cs.jumlah_sertifikat), 0) as total_certificates,
    COALESCE(SUM(cs.jumlah_medali), 0) as total_medals
FROM certificates c
LEFT JOIN certificate_stock cs ON c.certificate_id = cs.certificate_id
LEFT JOIN branches b ON cs.branch_code = b.branch_code
GROUP BY c.id, c.certificate_id, c.created_at, c.updated_at
ORDER BY c.created_at DESC;

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
    ARRAY_AGG(DISTINCT b.branch_code ORDER BY b.branch_code) FILTER (WHERE b.branch_code IS NOT NULL) as branches,
    ARRAY_AGG(DISTINCT td.division ORDER BY td.division) FILTER (WHERE td.division IS NOT NULL) as divisions
FROM users u
LEFT JOIN teacher_branches tb ON u.id = tb.teacher_id
LEFT JOIN branches b ON tb.branch_id = b.id
LEFT JOIN teacher_divisions td ON u.id = td.teacher_id
WHERE u.role = 'teacher'
GROUP BY u.id, u.username, u.teacher_name, u.created_at, u.updated_at
ORDER BY u.created_at DESC;

-- Teachers by Branch View
CREATE OR REPLACE VIEW v_teachers_by_branch AS
SELECT 
    b.branch_code,
    b.branch_name,
    COUNT(DISTINCT tb.teacher_id) as teacher_count
FROM branches b
LEFT JOIN teacher_branches tb ON b.id = tb.branch_id
GROUP BY b.branch_code, b.branch_name
ORDER BY b.branch_code;

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
    b.branch_code,
    b.branch_name,
    COUNT(*) FILTER (WHERE s.status = 'active') as active_students,
    COUNT(*) FILTER (WHERE s.status = 'inactive') as inactive_students,
    COUNT(*) FILTER (WHERE s.status = 'transferred') as transferred_students,
    COUNT(*) as total_students
FROM branches b
LEFT JOIN students s ON b.id = s.branch_id
GROUP BY b.branch_code, b.branch_name
ORDER BY b.branch_code;

-- Active Students View
CREATE OR REPLACE VIEW v_active_students AS
SELECT 
    s.id,
    s.student_name,
    b.branch_code,
    b.branch_name,
    s.division,
    COUNT(sm.id) as modules_completed,
    MAX(sm.completed_date) as last_module_date
FROM students s
JOIN branches b ON s.branch_id = b.id
LEFT JOIN student_modules sm ON s.id = sm.student_id
WHERE s.status = 'active'
GROUP BY s.id, s.student_name, b.branch_code, b.branch_name, s.division
ORDER BY s.student_name;

-- =====================================================
-- 18. RECORD INITIAL MIGRATION
-- =====================================================
INSERT INTO schema_migrations (migration_id, description) VALUES
('001_initial_schema', 'Fresh database schema with all features enabled'),
('002_dynamic_branches', 'Dynamic branch support with certificate_stock table');

-- =====================================================
-- 19. VERIFICATION & SUMMARY
-- =====================================================

-- Show database summary
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'DATABASE CREATED SUCCESSFULLY!';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'CREDENTIALS:';
    RAISE NOTICE '- Admin: gulam / admin123';
    RAISE NOTICE '- Teacher: azhar / admin123';
    RAISE NOTICE '';
    RAISE NOTICE 'DIVISIONS:';
    RAISE NOTICE '- JK (Junior Koder)';
    RAISE NOTICE '- LK (Little Koder)';
    RAISE NOTICE '';
    RAISE NOTICE 'BRANCHES:';
    RAISE NOTICE '- SND (Sunda)';
    RAISE NOTICE '- MKW (Mekarwangi)';
    RAISE NOTICE '- KBP (Kota Baru Parahyangan)';
    RAISE NOTICE '';
    RAISE NOTICE 'DUMMY DATA:';
    RAISE NOTICE '- 1 Admin user';
    RAISE NOTICE '- 1 Teacher (Azhar at SND, division JK)';
    RAISE NOTICE '- 1 Certificate batch (100 certs, 100 medals at SND)';
    RAISE NOTICE '- 2 Modules (JK-001, LK-001)';
    RAISE NOTICE '- 1 Student (Budi Santoso at SND)';
    RAISE NOTICE '- 1 Completed module (Budi completed JK-001)';
    RAISE NOTICE '- 1 Printed certificate';
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
END $$;

-- Show users
SELECT '=== USERS ===' as info;
SELECT id, username, role, teacher_name, teacher_division, teacher_branch FROM users ORDER BY role, username;

-- Show branches
SELECT '=== BRANCHES ===' as info;
SELECT id, branch_code, branch_name, is_active FROM branches ORDER BY branch_code;

-- Show modules
SELECT '=== MODULES ===' as info;
SELECT id, module_code, module_name, division, min_age, max_age FROM modules ORDER BY division, module_code;

-- Show stock summary
SELECT '=== STOCK SUMMARY ===' as info;
SELECT * FROM v_stock_summary;

-- Show students
SELECT '=== STUDENTS ===' as info;
SELECT 
    s.id,
    s.student_name,
    b.branch_code,
    s.division,
    s.status,
    COUNT(sm.id) as modules_completed
FROM students s
JOIN branches b ON s.branch_id = b.id
LEFT JOIN student_modules sm ON s.id = sm.student_id
GROUP BY s.id, s.student_name, b.branch_code, s.division, s.status;

-- Show printed certificates
SELECT '=== PRINTED CERTIFICATES ===' as info;
SELECT 
    pc.id,
    pc.certificate_id,
    pc.student_name,
    m.module_code,
    pc.branch,
    pc.ptc_date,
    u.username as printed_by
FROM printed_certificates pc
JOIN modules m ON pc.module_id = m.id
JOIN users u ON pc.printed_by = u.id;

-- =====================================================
-- END OF SCHEMA
-- =====================================================