// Module Controller
// Handles CRUD operations for modules

const pool = require("../config/database");

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function sendError(res, statusCode, message, error = null) {
  const response = {
    success: false,
    message: message,
  };

  if (error && process.env.NODE_ENV === "development") {
    response.error = error.message;
    response.stack = error.stack;
  }

  console.error(`❌ Error (${statusCode}):`, message, error || "");
  return res.status(statusCode).json(response);
}

function sendSuccess(res, message, data = null, meta = null) {
  const response = {
    success: true,
    message: message,
  };

  if (data !== null) response.data = data;
  if (meta !== null) response.meta = meta;

  return res.json(response);
}

// Validation helpers
function validateModuleCode(code) {
  if (!code || !code.trim()) {
    return { valid: false, error: "Module code is required" };
  }

  const cleanCode = code.trim().toUpperCase();

  if (cleanCode.length < 3) {
    return {
      valid: false,
      error: "Module code must be at least 3 characters",
    };
  }

  if (cleanCode.length > 20) {
    return {
      valid: false,
      error: "Module code must not exceed 20 characters",
    };
  }

  const validFormat = /^[A-Z0-9]+$/;
  if (!validFormat.test(cleanCode)) {
    return {
      valid: false,
      error: "Module code can only contain uppercase letters and numbers",
    };
  }

  return { valid: true, value: cleanCode };
}

function validateModuleName(name) {
  if (!name || !name.trim()) {
    return { valid: false, error: "Module name is required" };
  }

  const cleanName = name.trim();

  if (cleanName.length < 3) {
    return {
      valid: false,
      error: "Module name must be at least 3 characters",
    };
  }

  if (cleanName.length > 100) {
    return {
      valid: false,
      error: "Module name must not exceed 100 characters",
    };
  }

  return { valid: true, value: cleanName };
}

function validateModuleType(type) {
  if (!type || !type.trim()) {
    return { valid: false, error: "Module type is required" };
  }

  const cleanType = type.trim().toUpperCase();

  if (!["JK", "LK"].includes(cleanType)) {
    return { valid: false, error: "Module type must be either JK or LK" };
  }

  return { valid: true, value: cleanType };
}

function validateAgeRange(range) {
  if (!range || !range.trim()) {
    return { valid: false, error: "Age range is required" };
  }

  const cleanRange = range.trim();

  if (!["4-6", "6-8", "8-12", "12-16"].includes(cleanRange)) {
    return {
      valid: false,
      error: "Age range must be one of: 4-6, 6-8, 8-12, 12-16",
    };
  }

  return { valid: true, value: cleanRange };
}

// =====================================================
// 1. CREATE MODULE
// =====================================================
const createModule = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    console.log("📥 Create module request:", req.body);

    const { module_code, module_name, module_type, age_range } = req.body;

    // Validate module_code
    const codeValidation = validateModuleCode(module_code);
    if (!codeValidation.valid) {
      await client.query("ROLLBACK");
      return sendError(res, 400, codeValidation.error);
    }

    // Validate module_name
    const nameValidation = validateModuleName(module_name);
    if (!nameValidation.valid) {
      await client.query("ROLLBACK");
      return sendError(res, 400, nameValidation.error);
    }

    // Validate module_type
    const typeValidation = validateModuleType(module_type);
    if (!typeValidation.valid) {
      await client.query("ROLLBACK");
      return sendError(res, 400, typeValidation.error);
    }

    // Validate age_range
    const ageValidation = validateAgeRange(age_range);
    if (!ageValidation.valid) {
      await client.query("ROLLBACK");
      return sendError(res, 400, ageValidation.error);
    }

    const cleanCode = codeValidation.value;
    const cleanName = nameValidation.value;
    const cleanType = typeValidation.value;
    const cleanRange = ageValidation.value;

    // Check if module code already exists
    const checkExisting = await client.query(
      "SELECT * FROM modules WHERE module_code = $1",
      [cleanCode],
    );

    if (checkExisting.rows.length > 0) {
      await client.query("ROLLBACK");
      return sendError(res, 409, "Module code already exists");
    }

    // Insert module
    const result = await client.query(
      `INSERT INTO modules 
       (module_code, module_name, module_type, age_range) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [cleanCode, cleanName, cleanType, cleanRange],
    );

    await client.query("COMMIT");

    console.log("✅ Module created:", result.rows[0]);

    return sendSuccess(res, "Module created successfully", result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    return sendError(res, 500, "Failed to create module", error);
  } finally {
    client.release();
  }
};

// =====================================================
// 2. GET ALL MODULES (WITH PAGINATION)
// =====================================================
const getAllModules = async (req, res) => {
  try {
    const { limit = 5, offset = 0 } = req.query;

    const validatedLimit = Math.min(Math.max(parseInt(limit) || 5, 1), 100);
    const validatedOffset = Math.max(parseInt(offset) || 0, 0);

    console.log(
      `📥 Get modules: limit=${validatedLimit}, offset=${validatedOffset}`,
    );

    // Get paginated modules
    const query = `
      SELECT * FROM modules
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await pool.query(query, [validatedLimit, validatedOffset]);

    // Get total count
    const countResult = await pool.query("SELECT COUNT(*) FROM modules");
    const totalCount = parseInt(countResult.rows[0].count);

    const pagination = {
      total: totalCount,
      limit: validatedLimit,
      offset: validatedOffset,
      hasMore: totalCount > validatedOffset + result.rows.length,
      currentPage: Math.floor(validatedOffset / validatedLimit) + 1,
      totalPages: Math.ceil(totalCount / validatedLimit),
    };

    console.log(`✅ Returned ${result.rows.length}/${totalCount} modules`);

    return sendSuccess(res, "Modules retrieved successfully", result.rows, {
      pagination,
      count: result.rows.length,
    });
  } catch (error) {
    return sendError(res, 500, "Failed to retrieve modules", error);
  }
};

// =====================================================
// 3. GET MODULE BY ID
// =====================================================
const getModuleById = async (req, res) => {
  try {
    const { id } = req.params;

    const moduleId = parseInt(id);
    if (isNaN(moduleId)) {
      return sendError(res, 400, "Invalid module ID");
    }

    const result = await pool.query("SELECT * FROM modules WHERE id = $1", [
      moduleId,
    ]);

    if (result.rows.length === 0) {
      return sendError(res, 404, "Module not found");
    }

    return sendSuccess(res, "Module retrieved successfully", result.rows[0]);
  } catch (error) {
    return sendError(res, 500, "Failed to retrieve module", error);
  }
};

// =====================================================
// 4. UPDATE MODULE
// =====================================================
const updateModule = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { id } = req.params;
    const { module_code, module_name, module_type, age_range } = req.body;

    const moduleId = parseInt(id);
    if (isNaN(moduleId)) {
      await client.query("ROLLBACK");
      return sendError(res, 400, "Invalid module ID");
    }

    console.log("📝 Update module request:", { id: moduleId, ...req.body });

    // Check if module exists
    const checkModule = await client.query(
      "SELECT * FROM modules WHERE id = $1",
      [moduleId],
    );

    if (checkModule.rows.length === 0) {
      await client.query("ROLLBACK");
      return sendError(res, 404, "Module not found");
    }

    const currentModule = checkModule.rows[0];

    // Validate fields if provided
    let cleanCode = currentModule.module_code;
    if (module_code !== undefined) {
      const codeValidation = validateModuleCode(module_code);
      if (!codeValidation.valid) {
        await client.query("ROLLBACK");
        return sendError(res, 400, codeValidation.error);
      }
      cleanCode = codeValidation.value;

      // Check if new code already exists (for other modules)
      if (cleanCode !== currentModule.module_code) {
        const checkExisting = await client.query(
          "SELECT * FROM modules WHERE module_code = $1 AND id != $2",
          [cleanCode, moduleId],
        );

        if (checkExisting.rows.length > 0) {
          await client.query("ROLLBACK");
          return sendError(res, 409, "Module code already exists");
        }
      }
    }

    let cleanName = currentModule.module_name;
    if (module_name !== undefined) {
      const nameValidation = validateModuleName(module_name);
      if (!nameValidation.valid) {
        await client.query("ROLLBACK");
        return sendError(res, 400, nameValidation.error);
      }
      cleanName = nameValidation.value;
    }

    let cleanType = currentModule.module_type;
    if (module_type !== undefined) {
      const typeValidation = validateModuleType(module_type);
      if (!typeValidation.valid) {
        await client.query("ROLLBACK");
        return sendError(res, 400, typeValidation.error);
      }
      cleanType = typeValidation.value;
    }

    let cleanRange = currentModule.age_range;
    if (age_range !== undefined) {
      const ageValidation = validateAgeRange(age_range);
      if (!ageValidation.valid) {
        await client.query("ROLLBACK");
        return sendError(res, 400, ageValidation.error);
      }
      cleanRange = ageValidation.value;
    }

    // Update module
    const result = await client.query(
      `UPDATE modules 
       SET module_code = $1, 
           module_name = $2, 
           module_type = $3, 
           age_range = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING *`,
      [cleanCode, cleanName, cleanType, cleanRange, moduleId],
    );

    await client.query("COMMIT");

    console.log("✅ Module updated:", result.rows[0]);

    return sendSuccess(res, "Module updated successfully", result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    return sendError(res, 500, "Failed to update module", error);
  } finally {
    client.release();
  }
};

// =====================================================
// 5. DELETE MODULE
// =====================================================
const deleteModule = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { id } = req.params;

    const moduleId = parseInt(id);
    if (isNaN(moduleId)) {
      await client.query("ROLLBACK");
      return sendError(res, 400, "Invalid module ID");
    }

    console.log("🗑️ Delete module request:", moduleId);

    // Check if module exists
    const checkModule = await client.query(
      "SELECT * FROM modules WHERE id = $1",
      [moduleId],
    );

    if (checkModule.rows.length === 0) {
      await client.query("ROLLBACK");
      return sendError(res, 404, "Module not found");
    }

    const module = checkModule.rows[0];

    // Delete module
    await client.query("DELETE FROM modules WHERE id = $1", [moduleId]);

    await client.query("COMMIT");

    console.log("✅ Module deleted:", module.module_code);

    return sendSuccess(res, "Module deleted successfully", {
      id: module.id,
      module_code: module.module_code,
      module_name: module.module_name,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return sendError(res, 500, "Failed to delete module", error);
  } finally {
    client.release();
  }
};

module.exports = {
  createModule,
  getAllModules,
  getModuleById,
  updateModule,
  deleteModule,
};
