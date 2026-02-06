const pool = require("../config/database");

const ModuleController = {
  // Get all modules with pagination and filters
  getAllModules: async (req, res) => {
    try {
      // Pagination parameters (consistent with certificates)
      const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);
      const offset = Math.max(parseInt(req.query.offset) || 0, 0);

      // Filter parameters
      const { search, division, min_age, max_age } = req.query;

      console.log("📥 Get modules with filters:", {
        limit,
        offset,
        search,
        division,
        min_age,
        max_age,
      });

      // Build WHERE clause
      let whereConditions = [];
      let queryParams = [];
      let paramCount = 1;

      // Search filter (module_code OR module_name) - CASE INSENSITIVE
      if (search && search.trim()) {
        const searchTerm = `%${search.trim().toLowerCase()}%`;
        whereConditions.push(
          `(LOWER(module_code) LIKE $${paramCount} OR LOWER(module_name) LIKE $${paramCount})`,
        );
        queryParams.push(searchTerm);
        paramCount++;
        console.log("🔍 Search filter applied:", searchTerm);
      }

      // Division filter
      if (division && division.trim()) {
        const divisionUpper = division.trim().toUpperCase();
        if (["JK", "LK"].includes(divisionUpper)) {
          whereConditions.push(`division = $${paramCount}`);
          queryParams.push(divisionUpper);
          paramCount++;
          console.log("📊 Division filter applied:", divisionUpper);
        }
      }

      // Min age filter (modules where max_age >= specified min_age)
      if (min_age && !isNaN(parseInt(min_age))) {
        whereConditions.push(`max_age >= $${paramCount}`);
        queryParams.push(parseInt(min_age));
        paramCount++;
        console.log("📈 Min age filter applied:", min_age);
      }

      // Max age filter (modules where min_age <= specified max_age)
      if (max_age && !isNaN(parseInt(max_age))) {
        whereConditions.push(`min_age <= $${paramCount}`);
        queryParams.push(parseInt(max_age));
        paramCount++;
        console.log("📉 Max age filter applied:", max_age);
      }

      const whereClause =
        whereConditions.length > 0
          ? "WHERE " + whereConditions.join(" AND ")
          : "";

      console.log("🔧 WHERE clause:", whereClause);
      console.log("🔧 Query params:", queryParams);

      // Get total count with filters
      const countQuery = `SELECT COUNT(*) FROM modules ${whereClause}`;
      console.log("🔢 Count query:", countQuery);

      const countResult = await pool.query(countQuery, queryParams);
      const totalModules = parseInt(countResult.rows[0].count);

      console.log("📊 Total modules matching filter:", totalModules);

      // Get paginated modules with filters
      const dataQuery = `
        SELECT id, module_code, module_name, division, min_age, max_age, 
               created_at, updated_at
        FROM modules
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramCount} OFFSET $${paramCount + 1}
      `;

      console.log("📋 Data query:", dataQuery);

      const dataParams = [...queryParams, limit, offset];
      console.log("📋 Data params:", dataParams);

      const result = await pool.query(dataQuery, dataParams);

      console.log(`✅ Returned ${result.rows.length}/${totalModules} modules`);

      res.json({
        success: true,
        data: result.rows,
        meta: {
          pagination: {
            total: totalModules,
            limit: limit,
            offset: offset,
            hasMore: totalModules > offset + result.rows.length,
            currentPage: Math.floor(offset / limit) + 1,
            totalPages: Math.ceil(totalModules / limit),
          },
          filters: {
            search: search || null,
            division: division || null,
            min_age: min_age || null,
            max_age: max_age || null,
          },
          count: result.rows.length,
        },
      });
    } catch (error) {
      console.error("❌ Error fetching modules:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch modules",
        error: error.message,
      });
    }
  },

  // Get single module by ID
  getModuleById: async (req, res) => {
    try {
      const { id } = req.params;

      const result = await pool.query(
        `SELECT id, module_code, module_name, division, min_age, max_age, 
                created_at, updated_at
         FROM modules
         WHERE id = $1`,
        [id],
      );

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
      console.error("Error fetching module:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch module",
        error: error.message,
      });
    }
  },

  // Create new module
  createModule: async (req, res) => {
    const client = await pool.connect();

    try {
      const { module_code, module_name, division, min_age, max_age } = req.body;

      // Validation
      if (
        !module_code ||
        !module_name ||
        !division ||
        min_age === undefined ||
        max_age === undefined
      ) {
        return res.status(400).json({
          success: false,
          message: "All fields are required",
        });
      }

      // Validate division
      if (!["JK", "LK"].includes(division)) {
        return res.status(400).json({
          success: false,
          message: "Division must be either JK or LK",
        });
      }

      // Validate age range
      const minAge = parseInt(min_age);
      const maxAge = parseInt(max_age);

      if (isNaN(minAge) || isNaN(maxAge)) {
        return res.status(400).json({
          success: false,
          message: "Age values must be valid numbers",
        });
      }

      if (minAge < 3 || minAge > 18 || maxAge < 3 || maxAge > 18) {
        return res.status(400).json({
          success: false,
          message: "Age range must be between 3 and 18",
        });
      }

      if (minAge > maxAge) {
        return res.status(400).json({
          success: false,
          message: "Minimum age cannot be greater than maximum age",
        });
      }

      await client.query("BEGIN");

      // Check if module code already exists
      const existingModule = await client.query(
        "SELECT id FROM modules WHERE module_code = $1",
        [module_code],
      );

      if (existingModule.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          success: false,
          message: "Module code already exists",
        });
      }

      // Insert new module
      const result = await client.query(
        `INSERT INTO modules (module_code, module_name, division, min_age, max_age)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, module_code, module_name, division, min_age, max_age, created_at`,
        [module_code, module_name, division, minAge, maxAge],
      );

      // Log the activity to module_logs table
      try {
        await client.query(
          `INSERT INTO module_logs (module_id, module_code, action_type, description, performed_by, ip_address)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            result.rows[0].id,
            module_code,
            "MODULE_CREATED",
            `Module ${module_code} - ${module_name} created`,
            req.user?.username || "System",
            req.ip || req.connection.remoteAddress,
          ],
        );
      } catch (logError) {
        console.error("Error logging module creation:", logError);
        // Continue even if logging fails
      }

      await client.query("COMMIT");

      res.status(201).json({
        success: true,
        message: "Module created successfully",
        data: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error creating module:", error);

      // Handle specific PostgreSQL errors
      if (error.code === "23505") {
        // Unique violation
        res.status(409).json({
          success: false,
          message: "Module code already exists",
        });
      } else if (error.code === "23514") {
        // Check violation
        res.status(400).json({
          success: false,
          message: "Invalid data: check constraints failed",
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Failed to create module",
          error: error.message,
        });
      }
    } finally {
      client.release();
    }
  },

  // Update module
  updateModule: async (req, res) => {
    const client = await pool.connect();

    try {
      const { id } = req.params;
      const { module_code, module_name, division, min_age, max_age } = req.body;

      // Validation
      if (
        !module_code ||
        !module_name ||
        !division ||
        min_age === undefined ||
        max_age === undefined
      ) {
        return res.status(400).json({
          success: false,
          message: "All fields are required",
        });
      }

      // Validate division
      if (!["JK", "LK"].includes(division)) {
        return res.status(400).json({
          success: false,
          message: "Division must be either JK or LK",
        });
      }

      // Validate age range
      const minAge = parseInt(min_age);
      const maxAge = parseInt(max_age);

      if (isNaN(minAge) || isNaN(maxAge)) {
        return res.status(400).json({
          success: false,
          message: "Age values must be valid numbers",
        });
      }

      if (minAge < 3 || minAge > 18 || maxAge < 3 || maxAge > 18) {
        return res.status(400).json({
          success: false,
          message: "Age range must be between 3 and 18",
        });
      }

      if (minAge > maxAge) {
        return res.status(400).json({
          success: false,
          message: "Minimum age cannot be greater than maximum age",
        });
      }

      await client.query("BEGIN");

      // Check if module exists
      const existingModule = await client.query(
        "SELECT id, module_code, module_name FROM modules WHERE id = $1",
        [id],
      );

      if (existingModule.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          message: "Module not found",
        });
      }

      // Check if new module code is already used by another module
      const duplicateCheck = await client.query(
        "SELECT id FROM modules WHERE module_code = $1 AND id != $2",
        [module_code, id],
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
         RETURNING id, module_code, module_name, division, min_age, max_age, updated_at`,
        [module_code, module_name, division, minAge, maxAge, id],
      );

      // Log the activity
      try {
        await client.query(
          `INSERT INTO module_logs (module_id, module_code, action_type, description, performed_by, ip_address)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            id,
            module_code,
            "MODULE_UPDATED",
            `Module ${module_code} - ${module_name} updated`,
            req.user?.username || "System",
            req.ip || req.connection.remoteAddress,
          ],
        );
      } catch (logError) {
        console.error("Error logging module update:", logError);
        // Continue even if logging fails
      }

      await client.query("COMMIT");

      res.json({
        success: true,
        message: "Module updated successfully",
        data: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error updating module:", error);

      // Handle specific PostgreSQL errors
      if (error.code === "23505") {
        res.status(409).json({
          success: false,
          message: "Module code already exists",
        });
      } else if (error.code === "23514") {
        res.status(400).json({
          success: false,
          message: "Invalid data: check constraints failed",
        });
      } else {
        res.status(500).json({
          success: false,
          message: "Failed to update module",
          error: error.message,
        });
      }
    } finally {
      client.release();
    }
  },

  // Delete module
  deleteModule: async (req, res) => {
    const client = await pool.connect();

    try {
      const { id } = req.params;

      await client.query("BEGIN");

      // Check if module exists
      const existingModule = await client.query(
        "SELECT id, module_code, module_name FROM modules WHERE id = $1",
        [id],
      );

      if (existingModule.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({
          success: false,
          message: "Module not found",
        });
      }

      const moduleData = existingModule.rows[0];

      // Log the activity before deletion
      try {
        await client.query(
          `INSERT INTO module_logs (module_id, module_code, action_type, description, performed_by, ip_address)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            id,
            moduleData.module_code,
            "MODULE_DELETED",
            `Module ${moduleData.module_code} - ${moduleData.module_name} deleted`,
            req.user?.username || "System",
            req.ip || req.connection.remoteAddress,
          ],
        );
      } catch (logError) {
        console.error("Error logging module deletion:", logError);
        // Continue even if logging fails
      }

      // Delete module (cascade will handle module_logs)
      await client.query("DELETE FROM modules WHERE id = $1", [id]);

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
  },

  // Get module statistics
  getModuleStats: async (req, res) => {
    try {
      const stats = await pool.query(`
        SELECT 
          COUNT(*) as total_modules,
          COUNT(CASE WHEN division = 'JK' THEN 1 END) as jk_modules,
          COUNT(CASE WHEN division = 'LK' THEN 1 END) as lk_modules,
          MIN(min_age) as youngest_age,
          MAX(max_age) as oldest_age
        FROM modules
      `);

      res.json({
        success: true,
        data: stats.rows[0],
      });
    } catch (error) {
      console.error("Error fetching module stats:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch module statistics",
        error: error.message,
      });
    }
  },
};

module.exports = ModuleController;
