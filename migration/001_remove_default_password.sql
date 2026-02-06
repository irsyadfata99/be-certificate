-- =====================================================
-- MIGRATION: Remove default_password column
-- =====================================================
-- Migration ID: 001
-- Description: Remove default_password column for security
-- Date: February 2026
-- =====================================================

-- Create migrations tracking table if not exists
CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    migration_id VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    rolled_back_at TIMESTAMP NULL
);

-- Check if migration already applied
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM schema_migrations 
        WHERE migration_id = '001_remove_default_password' 
        AND rolled_back_at IS NULL
    ) THEN
        
        -- =====================================================
        -- FORWARD MIGRATION
        -- =====================================================
        
        -- Step 1: Check if column exists
        IF EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            AND column_name = 'default_password'
        ) THEN
            
            -- Step 2: Drop the column
            ALTER TABLE users DROP COLUMN IF EXISTS default_password;
            
            RAISE NOTICE 'Column default_password dropped successfully';
            
        ELSE
            RAISE NOTICE 'Column default_password does not exist, skipping';
        END IF;
        
        -- Step 3: Update views that reference default_password
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
        
        RAISE NOTICE 'View v_teachers updated successfully';
        
        -- Step 4: Record migration
        INSERT INTO schema_migrations (migration_id, description)
        VALUES ('001_remove_default_password', 'Removed default_password column from users table for security');
        
        RAISE NOTICE 'Migration 001_remove_default_password applied successfully';
        
    ELSE
        RAISE NOTICE 'Migration 001_remove_default_password already applied, skipping';
    END IF;
END $$;

-- =====================================================
-- ROLLBACK SCRIPT (if needed)
-- =====================================================
-- To rollback this migration, run:
/*

DO $$
BEGIN
    -- Add column back
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'default_password'
    ) THEN
        ALTER TABLE users ADD COLUMN default_password VARCHAR(50);
        RAISE NOTICE 'Column default_password added back';
    END IF;
    
    -- Update view
    DROP VIEW IF EXISTS v_teachers CASCADE;
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
    
    -- Mark as rolled back
    UPDATE schema_migrations 
    SET rolled_back_at = CURRENT_TIMESTAMP 
    WHERE migration_id = '001_remove_default_password';
    
    RAISE NOTICE 'Migration 001_remove_default_password rolled back successfully';
END $$;

*/

-- =====================================================
-- VERIFICATION
-- =====================================================

-- Verify column is removed
SELECT 
    column_name, 
    data_type 
FROM information_schema.columns 
WHERE table_name = 'users' 
ORDER BY ordinal_position;

-- Verify migration recorded
SELECT * FROM schema_migrations ORDER BY applied_at DESC;

-- Test query on users table (should work without default_password)
SELECT id, username, role, teacher_name FROM users WHERE role = 'teacher';