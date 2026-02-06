-- =====================================================
-- TEACHER MANAGEMENT - DATABASE UPDATES
-- =====================================================
-- Run this after the main schema.sql
-- =====================================================

-- =====================================================
-- 1. UPDATE USERS TABLE - ADD TEACHER FIELDS
-- =====================================================

-- Add role column (default 'admin' for existing users)
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'admin' CHECK (role IN ('admin', 'teacher'));

-- Add teacher-specific fields (nullable for admin users)
ALTER TABLE users ADD COLUMN IF NOT EXISTS teacher_name VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS teacher_division VARCHAR(10) CHECK (teacher_division IN ('JK', 'LK', NULL));
ALTER TABLE users ADD COLUMN IF NOT EXISTS teacher_branch VARCHAR(10) CHECK (teacher_branch IN ('SND', 'MKW', 'KBP', NULL));
ALTER TABLE users ADD COLUMN IF NOT EXISTS default_password VARCHAR(50);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_teacher_branch ON users(teacher_branch);

-- =====================================================
-- 2. ADD CONSTRAINT - TEACHER MUST HAVE REQUIRED FIELDS
-- =====================================================

-- Teachers must have teacher_name, division, and branch
ALTER TABLE users ADD CONSTRAINT check_teacher_fields 
    CHECK (
        (role = 'admin') OR 
        (role = 'teacher' AND teacher_name IS NOT NULL AND teacher_division IS NOT NULL AND teacher_branch IS NOT NULL)
    );

-- =====================================================
-- 3. UPDATE EXISTING ADMIN USER
-- =====================================================

-- Make sure existing admin has role 'admin'
UPDATE users SET role = 'admin' WHERE username = 'admin';

-- =====================================================
-- 4. SAMPLE TEACHER DATA (OPTIONAL)
-- =====================================================

-- Example Teacher 1 - SND, JK
-- Password will be auto-generated: aB3xY7kP9mQ2 (example)
-- Hash: $2b$10$... (generate using bcrypt)
INSERT INTO users (username, password, default_password, role, teacher_name, teacher_division, teacher_branch) 
VALUES (
    'teacher_john',
    '$2b$10$YourBcryptHashHere', -- Replace with actual hash of generated password
    'aB3xY7kP9mQ2', -- Store plaintext for display (will be shown once)
    'teacher',
    'John Doe',
    'JK',
    'SND'
);

-- Example Teacher 2 - MKW, LK
INSERT INTO users (username, password, default_password, role, teacher_name, teacher_division, teacher_branch) 
VALUES (
    'teacher_sarah',
    '$2b$10$YourBcryptHashHere', -- Replace with actual hash
    'xY9mK2pL5nQ8',
    'teacher',
    'Sarah Smith',
    'LK',
    'MKW'
);

-- =====================================================
-- 5. USEFUL VIEWS
-- =====================================================

-- View: All Teachers
CREATE OR REPLACE VIEW v_teachers AS
SELECT 
    id,
    username,
    teacher_name,
    teacher_division,
    teacher_branch,
    default_password,
    created_at,
    updated_at
FROM users
WHERE role = 'teacher'
ORDER BY created_at DESC;

-- View: Teachers by Branch
CREATE OR REPLACE VIEW v_teachers_by_branch AS
SELECT 
    teacher_branch,
    teacher_division,
    COUNT(*) as teacher_count
FROM users
WHERE role = 'teacher'
GROUP BY teacher_branch, teacher_division
ORDER BY teacher_branch, teacher_division;

-- =====================================================
-- 6. USEFUL QUERIES
-- =====================================================

-- Get all teachers
-- SELECT * FROM v_teachers;

-- Get teachers by branch
-- SELECT * FROM users WHERE role = 'teacher' AND teacher_branch = 'SND';

-- Get teachers by division
-- SELECT * FROM users WHERE role = 'teacher' AND teacher_division = 'JK';

-- Count teachers per branch
-- SELECT * FROM v_teachers_by_branch;

-- =====================================================
-- END OF TEACHER SCHEMA UPDATE
-- =====================================================