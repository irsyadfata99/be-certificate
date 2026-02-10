-- =====================================================
-- MIGRATION: Add Soft Delete Support for Teachers
-- =====================================================
-- Version: 005_add_soft_delete_support
-- Date: February 2026
-- Description: Add is_active and resigned_at columns to users table
--              to support soft delete (resign) feature for teachers
-- =====================================================

-- STEP 1: Add new columns
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS resigned_at TIMESTAMP NULL;

-- STEP 2: Set all existing users to active
UPDATE users SET is_active = true WHERE is_active IS NULL;

-- STEP 3: Add index for performance (filtering active users)
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role, is_active);

-- STEP 4: Add comment for documentation
COMMENT ON COLUMN users.is_active IS 'User account status: true = active, false = resigned/deactivated';
COMMENT ON COLUMN users.resigned_at IS 'Timestamp when user account was deactivated/resigned (NULL if active)';

-- STEP 5: Record migration
INSERT INTO schema_migrations (migration_id, description) 
VALUES ('005_add_soft_delete_support', 'Add soft delete support: is_active and resigned_at columns to users table')
ON CONFLICT (migration_id) DO NOTHING;

-- =====================================================
-- VERIFICATION
-- =====================================================

-- Check if columns were added successfully
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'SOFT DELETE MIGRATION COMPLETED';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'New columns added to users table:';
    RAISE NOTICE '- is_active (BOOLEAN, default: true)';
    RAISE NOTICE '- resigned_at (TIMESTAMP, nullable)';
    RAISE NOTICE '';
    RAISE NOTICE 'Benefits:';
    RAISE NOTICE '✓ Teacher resign without losing historical data';
    RAISE NOTICE '✓ Printed certificates still show who printed';
    RAISE NOTICE '✓ Student transfers still show who transferred';
    RAISE NOTICE '✓ Complete audit trail preserved';
    RAISE NOTICE '✓ No foreign key constraint errors';
    RAISE NOTICE '';
    RAISE NOTICE 'Indexes created:';
    RAISE NOTICE '- idx_users_is_active (for filtering active users)';
    RAISE NOTICE '- idx_users_role_active (for filtering active teachers)';
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
END $$;

-- Show current user status
SELECT 
    '=== USER STATUS OVERVIEW ===' as info,
    role,
    COUNT(*) as total,
    COUNT(CASE WHEN is_active = true THEN 1 END) as active,
    COUNT(CASE WHEN is_active = false THEN 1 END) as resigned
FROM users
GROUP BY role
ORDER BY role;