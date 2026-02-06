-- =====================================================
-- MODULES TABLE - ADD TO DATABASE
-- =====================================================
-- Run this SQL in your PostgreSQL database
-- =====================================================

-- Create modules table
CREATE TABLE IF NOT EXISTS modules (
    id SERIAL PRIMARY KEY,
    module_code VARCHAR(50) UNIQUE NOT NULL,
    module_name VARCHAR(100) NOT NULL,
    module_type VARCHAR(10) NOT NULL CHECK (module_type IN ('JK', 'LK')),
    age_range VARCHAR(20) NOT NULL CHECK (age_range IN ('4-6', '6-8', '8-12', '12-16')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_modules_code ON modules(module_code);
CREATE INDEX IF NOT EXISTS idx_modules_type ON modules(module_type);
CREATE INDEX IF NOT EXISTS idx_modules_age_range ON modules(age_range);

-- Trigger for auto-update updated_at
CREATE TRIGGER update_modules_updated_at
    BEFORE UPDATE ON modules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Sample data (optional)
INSERT INTO modules (module_code, module_name, module_type, age_range) VALUES
('JK-001', 'Introduction to Robotics', 'JK', '4-6'),
('JK-002', 'Basic Programming', 'JK', '6-8'),
('LK-001', 'Advanced Coding', 'LK', '8-12'),
('LK-002', 'Web Development', 'LK', '12-16')
ON CONFLICT (module_code) DO NOTHING;

-- Verify installation
SELECT * FROM modules ORDER BY created_at DESC;

-- =====================================================
-- END OF SQL SCRIPT
-- =====================================================