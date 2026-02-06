// controllers/moduleController.js - FIXED VERSION
const pool = require("../config/database");

// =====================================================
// GET ALL MODULES (with pagination)
// =====================================================
exports.getAllModules = async (req, res) => {
  try {
    const { limit = 10, offset = 0 } = req.query;

    // Get total count
    const countResult = await pool.query("SELECT COUNT(*) FROM modules");
    const total = parseInt(countResult.rows[0].count);

    // Get modules with pagination
    const result = await pool.query(
      `SELECT id, module_code, module_name, division, min_age, max_age, created_at, updated_at
       FROM modules 
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [parseInt(limit), parseInt(offset)],
    );

    const totalPages = Math.ceil(total / parseInt(limit));
    const currentPage = Math.floor(parseInt(offset) / parseInt(limit)) + 1;

    res.json({
      success: true,
      data: result.rows,
      meta: {
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          totalPages,
          currentPage,
        },
      },
    });
  } catch (error) {
    console.error("Error getting modules:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch modules",
      error: error.message,
    });
  }
};

// =====================================================
// GET MODULE BY ID
// =====================================================
exports.getModuleById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query("SELECT * FROM modules WHERE id = $1", [
      id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Module not found",
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error getting module:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch module",
      error: error.message,
    });
  }
};

// =====================================================
// CREATE MODULE - FIXED VALIDATION
// =====================================================
exports.createModule = async (req, res) => {
  const client = await pool.connect();

  try {
    const { module_code, module_name, division, min_age, max_age } = req.body;

    // ✅ FLEXIBLE VALIDATION - Allow custom module codes
    const validations = [];

    if (!module_code || module_code.trim() === "") {
      validations.push("Module code is required");
    } else if (module_code.trim().length > 50) {
      validations.push("Module code cannot exceed 50 characters");
    }

    if (!module_name || module_name.trim() === "") {
      validations.push("Module name is required");
    }

    if (!division || !["JK", "LK"].includes(division)) {
      validations.push("Division must be either JK or LK");
    }

    if (
      min_age === undefined ||
      min_age === null ||
      isNaN(min_age) ||
      min_age < 3 ||
      min_age > 18
    ) {
      validations.push("Minimum age must be between 3 and 18");
    }

    if (
      max_age === undefined ||
      max_age === null ||
      isNaN(max_age) ||
      max_age < 3 ||
      max_age > 18
    ) {
      validations.push("Maximum age must be between 3 and 18");
    }

    if (parseInt(min_age) > parseInt(max_age)) {
      validations.push("Minimum age cannot be greater than maximum age");
    }

    if (validations.length > 0) {
      return res.status(400).json({
        success: false,
        message: validations.join(", "),
        errors: validations,
      });
    }

    await client.query("BEGIN");

    // Check for duplicate module_code
    const duplicateCheck = await client.query(
      "SELECT id FROM modules WHERE module_code = $1",
      [module_code.trim().toUpperCase()],
    );

    if (duplicateCheck.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "Module code already exists",
      });
    }

    // Insert new module (keep uppercase for consistency)
    const result = await client.query(
      `INSERT INTO modules (module_code, module_name, division, min_age, max_age)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        module_code.trim().toUpperCase(), // Still uppercase for consistency
        module_name.trim(),
        division.toUpperCase(),
        parseInt(min_age),
        parseInt(max_age),
      ],
    );

    // Log the action
    await client.query(
      `INSERT INTO certificate_logs (action, details, user_id)
       VALUES ($1, $2, $3)`,
      ["MODULE_CREATED", `Module ${module_code} created`, req.user?.id || null],
    );

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: "Module created successfully",
      data: result.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error creating module:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create module",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

// =====================================================
// UPDATE MODULE - FIXED VALIDATION
// =====================================================
exports.updateModule = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { module_code, module_name, division, min_age, max_age } = req.body;

    // ✅ FLEXIBLE VALIDATION - Allow custom module codes
    const validations = [];

    if (!module_code || module_code.trim() === "") {
      validations.push("Module code is required");
    } else if (module_code.trim().length > 50) {
      validations.push("Module code cannot exceed 50 characters");
    }

    if (!module_name || module_name.trim() === "") {
      validations.push("Module name is required");
    }

    if (!division || !["JK", "LK"].includes(division)) {
      validations.push("Division must be either JK or LK");
    }

    if (
      min_age === undefined ||
      min_age === null ||
      isNaN(min_age) ||
      min_age < 3 ||
      min_age > 18
    ) {
      validations.push("Minimum age must be between 3 and 18");
    }

    if (
      max_age === undefined ||
      max_age === null ||
      isNaN(max_age) ||
      max_age < 3 ||
      max_age > 18
    ) {
      validations.push("Maximum age must be between 3 and 18");
    }

    if (parseInt(min_age) > parseInt(max_age)) {
      validations.push("Minimum age cannot be greater than maximum age");
    }

    if (validations.length > 0) {
      return res.status(400).json({
        success: false,
        message: validations.join(", "),
        errors: validations,
      });
    }

    await client.query("BEGIN");

    // Check if module exists
    const moduleCheck = await client.query(
      "SELECT * FROM modules WHERE id = $1",
      [id],
    );

    if (moduleCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Module not found",
      });
    }

    // Check for duplicate module_code (excluding current module)
    const duplicateCheck = await client.query(
      "SELECT id FROM modules WHERE module_code = $1 AND id != $2",
      [module_code.trim().toUpperCase(), id],
    );

    if (duplicateCheck.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        success: false,
        message: "Module code already exists",
      });
    }

    // Update module
    const result = await client.query(
      `UPDATE modules 
       SET module_code = $1, module_name = $2, division = $3, 
           min_age = $4, max_age = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [
        module_code.trim().toUpperCase(),
        module_name.trim(),
        division.toUpperCase(),
        parseInt(min_age),
        parseInt(max_age),
        id,
      ],
    );

    // Log the action
    await client.query(
      `INSERT INTO certificate_logs (action, details, user_id)
       VALUES ($1, $2, $3)`,
      ["MODULE_UPDATED", `Module ${module_code} updated`, req.user?.id || null],
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Module updated successfully",
      data: result.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error updating module:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update module",
      error: error.message,
    });
  } finally {
    client.release();
  }
};

// =====================================================
// DELETE MODULE
// =====================================================
exports.deleteModule = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    await client.query("BEGIN");

    // Check if module exists
    const moduleCheck = await client.query(
      "SELECT * FROM modules WHERE id = $1",
      [id],
    );

    if (moduleCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Module not found",
      });
    }

    const module = moduleCheck.rows[0];

    // Delete module
    await client.query("DELETE FROM modules WHERE id = $1", [id]);

    // Log the action
    await client.query(
      `INSERT INTO certificate_logs (action, details, user_id)
       VALUES ($1, $2, $3)`,
      [
        "MODULE_DELETED",
        `Module ${module.module_code} deleted`,
        req.user?.id || null,
      ],
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Module deleted successfully",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error deleting module:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete module",
      error: error.message,
    });
  } finally {
    client.release();
  }
};
