/**
 * =====================================================
 * QUICK SETUP: Branches Table
 * =====================================================
 * Simple script to create branches table with initial data
 *
 * Usage:
 *   node quickSetupBranches.js
 * =====================================================
 */

const { Pool } = require("pg");
require("dotenv").config();

// Database configuration
const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "certificate_management",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
});

const createBranchesTableSQL = `
-- Drop table if exists
DROP TABLE IF EXISTS branches CASCADE;

-- Create branches table
CREATE TABLE branches (
    id SERIAL PRIMARY KEY,
    branch_code VARCHAR(10) NOT NULL UNIQUE,
    branch_name VARCHAR(100) NOT NULL,
    is_central BOOLEAN DEFAULT FALSE,
    address TEXT,
    phone VARCHAR(20),
    email VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_branches_code ON branches(branch_code);
CREATE INDEX idx_branches_active ON branches(is_active);
CREATE INDEX idx_branches_central ON branches(is_central);

-- Insert initial data
INSERT INTO branches (branch_code, branch_name, is_central, address, phone, email, is_active) VALUES
('SND', 'Sinar Dunia', TRUE, 'Jl. Contoh No. 1, Jakarta', '021-1234567', 'snd@example.com', TRUE),
('MKW', 'Mekar Wangi', FALSE, 'Jl. Contoh No. 2, Bandung', '022-2234567', 'mkw@example.com', TRUE),
('KBP', 'Kebun Pala', FALSE, 'Jl. Contoh No. 3, Bogor', '0251-3234567', 'kbp@example.com', TRUE);
`;

async function quickSetup() {
  console.log("🚀 Starting Quick Setup for Branches Table...\n");

  try {
    // Test connection
    console.log("📡 Testing database connection...");
    await pool.query("SELECT NOW()");
    console.log("✅ Database connection successful!\n");

    // Execute setup
    console.log("📄 Creating branches table...");
    await pool.query(createBranchesTableSQL);
    console.log("✅ Branches table created!\n");

    // Verify data
    console.log("🔍 Verifying data...");
    const result = await pool.query("SELECT * FROM branches ORDER BY id");

    console.log("\n📊 Branches Created:");
    console.log("═══════════════════════════════════════════════════════════");

    result.rows.forEach((branch) => {
      const centralBadge = branch.is_central ? "⭐ CENTRAL" : "📍 BRANCH";
      const activeBadge = branch.is_active ? "✅" : "❌";

      console.log(`\n${activeBadge} ${centralBadge}`);
      console.log(`   Code: ${branch.branch_code}`);
      console.log(`   Name: ${branch.branch_name}`);
      console.log(`   Address: ${branch.address || "N/A"}`);
      console.log(`   Phone: ${branch.phone || "N/A"}`);
      console.log(`   Email: ${branch.email || "N/A"}`);
    });

    console.log(
      "\n═══════════════════════════════════════════════════════════",
    );
    console.log(`\n✨ Success! Created ${result.rows.length} branches\n`);

    // Show next steps
    console.log("🎯 Next Steps:");
    console.log("   1. Restart your backend server");
    console.log("   2. Test the API: GET http://localhost:3000/api/branches");
    console.log("   3. Start implementing your UI!\n");
  } catch (error) {
    console.error("\n❌ Setup Failed!\n");
    console.error("Error:", error.message);

    if (error.code === "ECONNREFUSED") {
      console.error("\n💡 Tip: Make sure PostgreSQL is running!");
      console.error("   - Windows: Check Services");
      console.error("   - Mac: brew services start postgresql");
      console.error("   - Linux: sudo systemctl start postgresql\n");
    } else if (error.code === "3D000") {
      console.error("\n💡 Tip: Database does not exist!");
      console.error("   Run: CREATE DATABASE certificate_management;\n");
    } else if (error.code === "28P01") {
      console.error(
        "\n💡 Tip: Check your database credentials in .env file!\n",
      );
    }

    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the setup
quickSetup();
