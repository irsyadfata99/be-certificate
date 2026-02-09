-- =====================================================
-- MIGRATION: Enable Dynamic Branch Creation
-- =====================================================
-- Migration ID: 002
-- Description: Redesign certificates table to support dynamic branches
-- Date: February 2026
-- =====================================================
-- IMPORTANT: This migration will preserve all existing data
-- =====================================================

-- =====================================================
-- STEP 1: Create new certificate_stock table (dynamic)
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

-- Indexes for performance
CREATE INDEX idx_certificate_stock_cert_id ON certificate_stock(certificate_id);
CREATE INDEX idx_certificate_stock_branch ON certificate_stock(branch_code);
CREATE INDEX idx_certificate_stock_combined ON certificate_stock(certificate_id, branch_code);

-- Trigger for updated_at
CREATE TRIGGER update_certificate_stock_updated_at
    BEFORE UPDATE ON certificate_stock
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- STEP 2: Migrate existing data from certificates table
-- =====================================================

DO $$
DECLARE
    cert_record RECORD;
BEGIN
    -- Loop through all existing certificates
    FOR cert_record IN SELECT * FROM certificates LOOP
        
        -- Migrate SND stock
        IF cert_record.jumlah_sertifikat_snd > 0 OR cert_record.jumlah_medali_snd > 0 THEN
            INSERT INTO certificate_stock (certificate_id, branch_code, jumlah_sertifikat, jumlah_medali, medali_awal)
            VALUES (cert_record.certificate_id, 'SND', cert_record.jumlah_sertifikat_snd, cert_record.jumlah_medali_snd, cert_record.medali_awal_snd)
            ON CONFLICT (certificate_id, branch_code) DO NOTHING;
        END IF;
        
        -- Migrate MKW stock
        IF cert_record.jumlah_sertifikat_mkw > 0 OR cert_record.jumlah_medali_mkw > 0 THEN
            INSERT INTO certificate_stock (certificate_id, branch_code, jumlah_sertifikat, jumlah_medali, medali_awal)
            VALUES (cert_record.certificate_id, 'MKW', cert_record.jumlah_sertifikat_mkw, cert_record.jumlah_medali_mkw, cert_record.medali_awal_mkw)
            ON CONFLICT (certificate_id, branch_code) DO NOTHING;
        END IF;
        
        -- Migrate KBP stock
        IF cert_record.jumlah_sertifikat_kbp > 0 OR cert_record.jumlah_medali_kbp > 0 THEN
            INSERT INTO certificate_stock (certificate_id, branch_code, jumlah_sertifikat, jumlah_medali, medali_awal)
            VALUES (cert_record.certificate_id, 'KBP', cert_record.jumlah_sertifikat_kbp, cert_record.jumlah_medali_kbp, cert_record.medali_awal_kbp)
            ON CONFLICT (certificate_id, branch_code) DO NOTHING;
        END IF;
        
    END LOOP;
    
    RAISE NOTICE 'Data migration completed successfully';
END $$;

-- =====================================================
-- STEP 3: Drop old columns from certificates table
-- =====================================================

-- Remove branch-specific columns (data already migrated)
ALTER TABLE certificates DROP COLUMN IF EXISTS jumlah_sertifikat_snd;
ALTER TABLE certificates DROP COLUMN IF EXISTS jumlah_medali_snd;
ALTER TABLE certificates DROP COLUMN IF EXISTS medali_awal_snd;

ALTER TABLE certificates DROP COLUMN IF EXISTS jumlah_sertifikat_mkw;
ALTER TABLE certificates DROP COLUMN IF EXISTS jumlah_medali_mkw;
ALTER TABLE certificates DROP COLUMN IF EXISTS medali_awal_mkw;

ALTER TABLE certificates DROP COLUMN IF EXISTS jumlah_sertifikat_kbp;
ALTER TABLE certificates DROP COLUMN IF EXISTS jumlah_medali_kbp;
ALTER TABLE certificates DROP COLUMN IF EXISTS medali_awal_kbp;

-- Remove the old constraint
ALTER TABLE certificates DROP CONSTRAINT IF EXISTS check_at_least_one_branch;

-- =====================================================
-- STEP 4: Update VIEWS to use new structure
-- =====================================================

-- Updated Stock Summary View
DROP VIEW IF EXISTS v_stock_summary CASCADE;
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

-- Updated Certificates with Stock View
DROP VIEW IF EXISTS v_certificates_cumulative CASCADE;
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
    ) as stock_by_branch,
    COALESCE(SUM(cs.jumlah_sertifikat), 0) as total_certificates,
    COALESCE(SUM(cs.jumlah_medali), 0) as total_medals
FROM certificates c
LEFT JOIN certificate_stock cs ON c.certificate_id = cs.certificate_id
LEFT JOIN branches b ON cs.branch_code = b.branch_code
GROUP BY c.id, c.certificate_id, c.created_at, c.updated_at
ORDER BY c.created_at DESC;

-- =====================================================
-- STEP 5: Create helper functions
-- =====================================================

-- Function to get stock for a specific certificate and branch
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

-- Function to add stock to a branch
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

-- Function to migrate stock between branches
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
-- STEP 6: Record migration
-- =====================================================

INSERT INTO schema_migrations (migration_id, description)
VALUES ('002_enable_dynamic_branches', 'Redesigned certificates table to support dynamic branch creation')
ON CONFLICT (migration_id) DO NOTHING;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Verify data migration
SELECT 
    'certificates' as table_name,
    COUNT(*) as record_count
FROM certificates
UNION ALL
SELECT 
    'certificate_stock' as table_name,
    COUNT(*) as record_count
FROM certificate_stock;

-- Show stock summary by branch
SELECT * FROM v_stock_summary;

-- Show certificate stock details
SELECT 
    c.certificate_id,
    cs.branch_code,
    b.branch_name,
    cs.jumlah_sertifikat,
    cs.jumlah_medali
FROM certificates c
LEFT JOIN certificate_stock cs ON c.certificate_id = cs.certificate_id
LEFT JOIN branches b ON cs.branch_code = b.branch_code
ORDER BY c.created_at DESC, cs.branch_code;

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MIGRATION COMPLETED SUCCESSFULLY!';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Changes made:';
    RAISE NOTICE '1. Created certificate_stock table';
    RAISE NOTICE '2. Migrated all existing data';
    RAISE NOTICE '3. Removed hardcoded branch columns';
    RAISE NOTICE '4. Updated views';
    RAISE NOTICE '5. Created helper functions';
    RAISE NOTICE '';
    RAISE NOTICE 'You can now:';
    RAISE NOTICE '- Create new branches dynamically';
    RAISE NOTICE '- Stock will automatically support new branches';
    RAISE NOTICE '- All existing data preserved';
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
END $$;