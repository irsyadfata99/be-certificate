-- =====================================================
-- MIGRATION: Add Regional Hub Support
-- =====================================================
-- Version: 1.0
-- Created: February 2026
-- Description: Add multi-regional hub support to branches
--              Allows multiple head branches (SND, BSD, etc)
--              Each with their own stock management
-- =====================================================

BEGIN;

-- =====================================================
-- STEP 1: Add new columns to branches table
-- =====================================================

ALTER TABLE branches 
ADD COLUMN IF NOT EXISTS is_head_branch BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS regional_hub VARCHAR(10);

-- =====================================================
-- STEP 2: Create indexes for performance
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_branches_regional_hub ON branches(regional_hub);
CREATE INDEX IF NOT EXISTS idx_branches_is_head ON branches(is_head_branch);
CREATE INDEX IF NOT EXISTS idx_branches_hub_active ON branches(regional_hub, is_active);

-- =====================================================
-- STEP 3: Set existing data (SND as head branch)
-- =====================================================

-- Set SND as head branch (self-referencing)
UPDATE branches 
SET 
  is_head_branch = true, 
  regional_hub = 'SND' 
WHERE branch_code = 'SND';

-- Set MKW and KBP under SND regional hub
UPDATE branches 
SET 
  is_head_branch = false, 
  regional_hub = 'SND' 
WHERE branch_code IN ('MKW', 'KBP');

-- =====================================================
-- STEP 4: Add constraints
-- =====================================================

-- Constraint 1: Head branch must reference itself
ALTER TABLE branches 
ADD CONSTRAINT check_head_branch_self_reference 
CHECK (
  (is_head_branch = true AND regional_hub = branch_code) OR 
  (is_head_branch = false AND regional_hub IS NOT NULL)
);

-- Constraint 2: Regional hub must exist and be a head branch
-- Note: This is enforced in application logic for better error messages
-- But we add a foreign key for data integrity
ALTER TABLE branches
ADD CONSTRAINT fk_branches_regional_hub
FOREIGN KEY (regional_hub) 
REFERENCES branches(branch_code)
ON DELETE RESTRICT
ON UPDATE CASCADE;

-- =====================================================
-- STEP 5: Update views to include regional hub info
-- =====================================================

-- Drop and recreate v_teachers_by_branch view
DROP VIEW IF EXISTS v_teachers_by_branch CASCADE;

CREATE OR REPLACE VIEW v_teachers_by_branch AS
SELECT 
  b.branch_code,
  b.branch_name,
  b.is_head_branch,
  b.regional_hub,
  b.is_active,
  COUNT(DISTINCT tb.teacher_id) as teacher_count
FROM branches b
LEFT JOIN teacher_branches tb ON b.id = tb.branch_id
GROUP BY b.branch_code, b.branch_name, b.is_head_branch, b.regional_hub, b.is_active
ORDER BY b.is_head_branch DESC, b.regional_hub, b.branch_code;

-- Drop and recreate v_student_stats view
DROP VIEW IF EXISTS v_student_stats CASCADE;

CREATE OR REPLACE VIEW v_student_stats AS
SELECT 
  b.branch_code,
  b.branch_name,
  b.is_head_branch,
  b.regional_hub,
  COUNT(*) FILTER (WHERE s.status = 'active') as active_students,
  COUNT(*) FILTER (WHERE s.status = 'inactive') as inactive_students,
  COUNT(*) FILTER (WHERE s.status = 'transferred') as transferred_students,
  COUNT(*) as total_students
FROM branches b
LEFT JOIN students s ON b.id = s.branch_id
GROUP BY b.branch_code, b.branch_name, b.is_head_branch, b.regional_hub
ORDER BY b.is_head_branch DESC, b.regional_hub, b.branch_code;

-- =====================================================
-- STEP 6: Create new view for regional hub summary
-- =====================================================

CREATE OR REPLACE VIEW v_regional_hub_summary AS
SELECT 
  b.regional_hub,
  MAX(CASE WHEN b.is_head_branch THEN b.branch_name END) as hub_name,
  COUNT(DISTINCT b.id) as total_branches,
  COUNT(DISTINCT CASE WHEN b.is_active THEN b.id END) as active_branches,
  COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'active') as total_students,
  COUNT(DISTINCT tb.teacher_id) as total_teachers,
  COALESCE(SUM(cs.jumlah_sertifikat), 0) as total_stock
FROM branches b
LEFT JOIN students s ON b.id = s.branch_id
LEFT JOIN teacher_branches tb ON b.id = tb.branch_id
LEFT JOIN certificate_stock cs ON b.branch_code = cs.branch_code
GROUP BY b.regional_hub
ORDER BY b.regional_hub;

-- =====================================================
-- STEP 7: Create helper function to get regional hub info
-- =====================================================

CREATE OR REPLACE FUNCTION get_regional_hub_info(p_branch_code VARCHAR(10))
RETURNS TABLE (
  branch_code VARCHAR(10),
  branch_name VARCHAR(100),
  is_head_branch BOOLEAN,
  regional_hub VARCHAR(10),
  hub_name VARCHAR(100)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.branch_code,
    b.branch_name,
    b.is_head_branch,
    b.regional_hub,
    h.branch_name as hub_name
  FROM branches b
  LEFT JOIN branches h ON b.regional_hub = h.branch_code
  WHERE b.branch_code = p_branch_code;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- STEP 8: Create function to validate same regional hub
-- =====================================================

CREATE OR REPLACE FUNCTION validate_same_regional_hub(
  p_source_branch VARCHAR(10),
  p_destination_branch VARCHAR(10)
)
RETURNS BOOLEAN AS $$
DECLARE
  v_source_hub VARCHAR(10);
  v_dest_hub VARCHAR(10);
BEGIN
  -- Get source regional hub
  SELECT regional_hub INTO v_source_hub
  FROM branches
  WHERE branch_code = p_source_branch;
  
  -- Get destination regional hub
  SELECT regional_hub INTO v_dest_hub
  FROM branches
  WHERE branch_code = p_destination_branch;
  
  -- Return true if same hub, false otherwise
  RETURN v_source_hub = v_dest_hub;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- STEP 9: Record migration
-- =====================================================

INSERT INTO schema_migrations (migration_id, description)
VALUES (
  '004_add_regional_hub_support',
  'Add multi-regional hub support: is_head_branch and regional_hub columns'
);

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Verify new columns exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'branches' 
    AND column_name IN ('is_head_branch', 'regional_hub')
  ) THEN
    RAISE NOTICE '✅ New columns added successfully';
  ELSE
    RAISE EXCEPTION '❌ Failed to add new columns';
  END IF;
END $$;

-- Show current branch structure
SELECT 
  branch_code,
  branch_name,
  is_head_branch,
  regional_hub,
  is_active,
  CASE 
    WHEN is_head_branch THEN '🏢 HEAD BRANCH'
    ELSE '📍 Regular Branch'
  END as branch_type
FROM branches
ORDER BY is_head_branch DESC, regional_hub, branch_code;

-- Show regional hub summary
SELECT * FROM v_regional_hub_summary;

COMMIT;

-- =====================================================
-- POST-MIGRATION NOTES
-- =====================================================

-- ✅ Migration complete!
-- 
-- Next steps:
-- 1. Update backend controllers to use is_head_branch
-- 2. Add validation for cross-regional operations
-- 3. Update frontend forms to include head branch option
-- 4. Update JWT tokens to include regional_hub info
-- 
-- Example: Add new regional hub (BSD)
-- INSERT INTO branches (branch_code, branch_name, is_head_branch, regional_hub, is_active)
-- VALUES ('BSD', 'BSD Serpong', true, 'BSD', true);
-- 
-- Example: Add branch under BSD hub
-- INSERT INTO branches (branch_code, branch_name, is_head_branch, regional_hub, is_active)
-- VALUES ('BSD-TNG', 'BSD Tangerang', false, 'BSD', true);
-- =====================================================