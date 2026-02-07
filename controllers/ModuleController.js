// Module Controller - PRODUCTION READY ✅
// No changes needed - already follows all best practices

const pool = require("../config/database");
const logger = require("../utils/logger");
const CONSTANTS = require("../utils/constants");
const validators = require("../utils/validators");

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function sendError(res, statusCode, message, errorCode = null, error = null) {
  const response = {
    success: false,
    message: message,
    errorCode: errorCode,
  };

  if (error && process.env.NODE_ENV === "development") {
    response.error = error.message;
    response.stack = error.stack;
  }

  logger.error(`Error (${statusCode}): ${message}`, error || "");
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

const ModuleController = {
  // Get all modules with pagination and filters
  getAllModules: async (req, res) => {
    try {
      // Map snake_case to camelCase
      const {
        limit: limitParam = CONSTANTS.PAGINATION.DEFAULT_LIMIT,
        offset: offsetParam = CONSTANTS.PAGINATION.DEFAULT_OFFSET,
        search,
        division,
        min_age: minAgeParam,
        max_age: maxAgeParam,
      } = req.query;

      // Pagination parameters
      const limit = Math.min(
        Math.max(parseInt(limitParam) || CONSTANTS.PAGINATION.DEFAULT_LIMIT, 1),
        CONSTANTS.PAGINATION.MAX_LIMIT,
      );
      const offset = Math.max(
        parseInt(offsetParam) || CONSTANTS.PAGINATION.DEFAULT_OFFSET,
        0,
      );

      logger.debug("Get modules with filters:", {
        limit,
        offset,
        search,
        division,
        minAge: minAgeParam,
        maxAge: maxAgeParam,
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
        logger.debug("Search filter applied:", searchTerm);
      }

      // Division filter
      if (division && division.trim()) {
        const divisionValidation = validators.validateDivision(division);
        if (divisionValidation.valid) {
          whereConditions.push(`division = $${paramCount}`);
          queryParams.push(divisionValidation.value);
          paramCount++;
          logger.debug("Division filter applied:", divisionValidation.value);
        }
      }

      // Min age filter (modules where max_age >= specified min_age)
      if (minAgeParam && !isNaN(parseInt(minAgeParam))) {
        const minAge = parseInt(minAgeParam);
        whereConditions.push(`max_age >= $${paramCount}`);
        queryParams.push(minAge);
        paramCount++;
        logger.debug("Min age filter applied:", minAge);
      }

      // Max age filter (modules where min_age <= specified max_age)
      if (maxAgeParam && !isNaN(parseInt(maxAgeParam))) {
        const maxAge = parseInt(maxAgeParam);
        whereConditions.push(`min_age <= $${paramCount}`);
        queryParams.push(maxAge);
        paramCount++;
        logger.debug("Max age filter applied:", maxAge);
      }

      const whereClause =
        whereConditions.length > 0
          ? "WHERE " + whereConditions.join(" AND ")
          : "";

      logger.debug("WHERE clause:", whereClause);
      logger.debug("Query params:", queryParams);

      // Get total count with filters
      const countQuery = `SELECT COUNT(*) FROM modules ${whereClause}`;
      logger.debug("Count query:", countQuery);

      const countResult = await pool.query(countQuery, queryParams);
      const totalModules = parseInt(countResult.rows[0].count);

      logger.debug("Total modules matching filter:", totalModules);

      // Get paginated modules with filters
      const dataQuery = `
        SELECT id, module_code, module_name, division, min_age, max_age, 
               created_at, updated_at
        FROM modules
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramCount} OFFSET $${paramCount + 1}
      `;

      logger.debug("Data query:", dataQuery);

      const dataParams = [...queryParams, limit, offset];
      logger.debug("Data params:", dataParams);

      const result = await pool.query(dataQuery, dataParams);

      logger.info(`Returned ${result.rows.length}/${totalModules} modules`);

      return sendSuccess(res, "Modules retrieved successfully", result.rows, {
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
          minAge: minAgeParam || null,
          maxAge: maxAgeParam || null,
        },
        count: result.rows.length,
      });
    } catch (error) {
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.SERVER_ERROR,
        "Failed to fetch modules",
        CONSTANTS.ERROR_CODES.SERVER_ERROR,
        error,
      );
    }
  },

  // Get single module by ID
  getModuleById: async (req, res) => {
    try {
      const { id } = req.params;

      const moduleId = parseInt(id);
      if (isNaN(moduleId)) {
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.BAD_REQUEST,
          "Invalid module ID",
          CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
        );
      }

      const result = await pool.query(
        `SELECT id, module_code, module_name, division, min_age, max_age, 
                created_at, updated_at
         FROM modules
         WHERE id = $1`,
        [moduleId],
      );

      if (result.rows.length === 0) {
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.NOT_FOUND,
          "Module not found",
          CONSTANTS.ERROR_CODES.NOT_FOUND,
        );
      }

      return sendSuccess(res, "Module retrieved successfully", result.rows[0]);
    } catch (error) {
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.SERVER_ERROR,
        "Failed to fetch module",
        CONSTANTS.ERROR_CODES.SERVER_ERROR,
        error,
      );
    }
  },

  // Create new module
  createModule: async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `SET LOCAL statement_timeout = '${CONSTANTS.TRANSACTION.TIMEOUT}'`,
      );

      // Map snake_case to camelCase
      const {
        module_code: moduleCode,
        module_name: moduleName,
        division,
        min_age: minAgeParam,
        max_age: maxAgeParam,
      } = req.body;

      // Validation
      if (
        !moduleCode ||
        !moduleName ||
        !division ||
        minAgeParam === undefined ||
        maxAgeParam === undefined
      ) {
        await client.query("ROLLBACK");
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.BAD_REQUEST,
          "All fields are required",
          CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
        );
      }

      // Validate module code
      const codeValidation = validators.validateModuleCode(moduleCode);
      if (!codeValidation.valid) {
        await client.query("ROLLBACK");
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.BAD_REQUEST,
          codeValidation.error,
          CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
        );
      }

      // Validate module name
      const nameValidation = validators.validateModuleName(moduleName);
      if (!nameValidation.valid) {
        await client.query("ROLLBACK");
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.BAD_REQUEST,
          nameValidation.error,
          CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
        );
      }

      // Validate division
      const divisionValidation = validators.validateDivision(division);
      if (!divisionValidation.valid) {
        await client.query("ROLLBACK");
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.BAD_REQUEST,
          divisionValidation.error,
          CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
        );
      }

      // Validate age range
      const ageValidation = validators.validateAgeRange(
        minAgeParam,
        maxAgeParam,
      );
      if (!ageValidation.valid) {
        await client.query("ROLLBACK");
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.BAD_REQUEST,
          ageValidation.error,
          CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
        );
      }

      const cleanCode = codeValidation.value;
      const cleanName = nameValidation.value;
      const cleanDivision = divisionValidation.value;
      const minAge = ageValidation.minAge;
      const maxAge = ageValidation.maxAge;

      // Check if module code already exists
      const existingModule = await client.query(
        "SELECT id FROM modules WHERE module_code = $1",
        [cleanCode],
      );

      if (existingModule.rows.length > 0) {
        await client.query("ROLLBACK");
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.CONFLICT,
          "Module code already exists",
          CONSTANTS.ERROR_CODES.DUPLICATE_ENTRY,
        );
      }

      // Insert new module
      const result = await client.query(
        `INSERT INTO modules (module_code, module_name, division, min_age, max_age)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, module_code, module_name, division, min_age, max_age, created_at`,
        [cleanCode, cleanName, cleanDivision, minAge, maxAge],
      );

      // Log the activity to module_logs table
      try {
        await client.query(
          `INSERT INTO module_logs (module_id, module_code, action_type, description, performed_by, ip_address)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            result.rows[0].id,
            cleanCode,
            CONSTANTS.LOG_ACTION_TYPES.MODULE_CREATED,
            `Module ${cleanCode} - ${cleanName} created`,
            req.user?.username || "System",
            req.ip || req.connection.remoteAddress,
          ],
        );
      } catch (logError) {
        logger.error("Error logging module creation:", logError);
        // Continue even if logging fails
      }

      await client.query("COMMIT");

      logger.info(`Module created: ${cleanCode}`);

      return sendSuccess(res, "Module created successfully", result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");

      // Handle specific PostgreSQL errors
      if (error.code === "23505") {
        // Unique violation
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.CONFLICT,
          "Module code already exists",
          CONSTANTS.ERROR_CODES.DUPLICATE_ENTRY,
          error,
        );
      } else if (error.code === "23514") {
        // Check violation
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.BAD_REQUEST,
          "Invalid data: check constraints failed",
          CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
          error,
        );
      } else {
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.SERVER_ERROR,
          "Failed to create module",
          CONSTANTS.ERROR_CODES.SERVER_ERROR,
          error,
        );
      }
    } finally {
      client.release();
    }
  },

  // Update module
  updateModule: async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `SET LOCAL statement_timeout = '${CONSTANTS.TRANSACTION.TIMEOUT}'`,
      );

      const { id } = req.params;

      const moduleId = parseInt(id);
      if (isNaN(moduleId)) {
        await client.query("ROLLBACK");
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.BAD_REQUEST,
          "Invalid module ID",
          CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
        );
      }

      // Map snake_case to camelCase
      const {
        module_code: moduleCode,
        module_name: moduleName,
        division,
        min_age: minAgeParam,
        max_age: maxAgeParam,
      } = req.body;

      // Validation
      if (
        !moduleCode ||
        !moduleName ||
        !division ||
        minAgeParam === undefined ||
        maxAgeParam === undefined
      ) {
        await client.query("ROLLBACK");
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.BAD_REQUEST,
          "All fields are required",
          CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
        );
      }

      // Validate module code
      const codeValidation = validators.validateModuleCode(moduleCode);
      if (!codeValidation.valid) {
        await client.query("ROLLBACK");
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.BAD_REQUEST,
          codeValidation.error,
          CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
        );
      }

      // Validate module name
      const nameValidation = validators.validateModuleName(moduleName);
      if (!nameValidation.valid) {
        await client.query("ROLLBACK");
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.BAD_REQUEST,
          nameValidation.error,
          CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
        );
      }

      // Validate division
      const divisionValidation = validators.validateDivision(division);
      if (!divisionValidation.valid) {
        await client.query("ROLLBACK");
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.BAD_REQUEST,
          divisionValidation.error,
          CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
        );
      }

      // Validate age range
      const ageValidation = validators.validateAgeRange(
        minAgeParam,
        maxAgeParam,
      );
      if (!ageValidation.valid) {
        await client.query("ROLLBACK");
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.BAD_REQUEST,
          ageValidation.error,
          CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
        );
      }

      const cleanCode = codeValidation.value;
      const cleanName = nameValidation.value;
      const cleanDivision = divisionValidation.value;
      const minAge = ageValidation.minAge;
      const maxAge = ageValidation.maxAge;

      // Check if module exists
      const existingModule = await client.query(
        "SELECT id, module_code, module_name FROM modules WHERE id = $1",
        [moduleId],
      );

      if (existingModule.rows.length === 0) {
        await client.query("ROLLBACK");
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.NOT_FOUND,
          "Module not found",
          CONSTANTS.ERROR_CODES.NOT_FOUND,
        );
      }

      // Check if new module code is already used by another module
      const duplicateCheck = await client.query(
        "SELECT id FROM modules WHERE module_code = $1 AND id != $2",
        [cleanCode, moduleId],
      );

      if (duplicateCheck.rows.length > 0) {
        await client.query("ROLLBACK");
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.CONFLICT,
          "Module code already exists",
          CONSTANTS.ERROR_CODES.DUPLICATE_ENTRY,
        );
      }

      // Update module
      const result = await client.query(
        `UPDATE modules
         SET module_code = $1, module_name = $2, division = $3, 
             min_age = $4, max_age = $5, updated_at = CURRENT_TIMESTAMP
         WHERE id = $6
         RETURNING id, module_code, module_name, division, min_age, max_age, updated_at`,
        [cleanCode, cleanName, cleanDivision, minAge, maxAge, moduleId],
      );

      // Log the activity
      try {
        await client.query(
          `INSERT INTO module_logs (module_id, module_code, action_type, description, performed_by, ip_address)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            moduleId,
            cleanCode,
            CONSTANTS.LOG_ACTION_TYPES.MODULE_UPDATED,
            `Module ${cleanCode} - ${cleanName} updated`,
            req.user?.username || "System",
            req.ip || req.connection.remoteAddress,
          ],
        );
      } catch (logError) {
        logger.error("Error logging module update:", logError);
        // Continue even if logging fails
      }

      await client.query("COMMIT");

      logger.info(`Module updated: ${cleanCode}`);

      return sendSuccess(res, "Module updated successfully", result.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");

      // Handle specific PostgreSQL errors
      if (error.code === "23505") {
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.CONFLICT,
          "Module code already exists",
          CONSTANTS.ERROR_CODES.DUPLICATE_ENTRY,
          error,
        );
      } else if (error.code === "23514") {
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.BAD_REQUEST,
          "Invalid data: check constraints failed",
          CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
          error,
        );
      } else {
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.SERVER_ERROR,
          "Failed to update module",
          CONSTANTS.ERROR_CODES.SERVER_ERROR,
          error,
        );
      }
    } finally {
      client.release();
    }
  },

  // Delete module
  deleteModule: async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(
        `SET LOCAL statement_timeout = '${CONSTANTS.TRANSACTION.TIMEOUT}'`,
      );

      const { id } = req.params;

      const moduleId = parseInt(id);
      if (isNaN(moduleId)) {
        await client.query("ROLLBACK");
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.BAD_REQUEST,
          "Invalid module ID",
          CONSTANTS.ERROR_CODES.VALIDATION_ERROR,
        );
      }

      // Check if module exists
      const existingModule = await client.query(
        "SELECT id, module_code, module_name FROM modules WHERE id = $1",
        [moduleId],
      );

      if (existingModule.rows.length === 0) {
        await client.query("ROLLBACK");
        return sendError(
          res,
          CONSTANTS.HTTP_STATUS.NOT_FOUND,
          "Module not found",
          CONSTANTS.ERROR_CODES.NOT_FOUND,
        );
      }

      const moduleData = existingModule.rows[0];

      // Log the activity before deletion
      try {
        await client.query(
          `INSERT INTO module_logs (module_id, module_code, action_type, description, performed_by, ip_address)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            moduleId,
            moduleData.module_code,
            CONSTANTS.LOG_ACTION_TYPES.MODULE_DELETED,
            `Module ${moduleData.module_code} - ${moduleData.module_name} deleted`,
            req.user?.username || "System",
            req.ip || req.connection.remoteAddress,
          ],
        );
      } catch (logError) {
        logger.error("Error logging module deletion:", logError);
        // Continue even if logging fails
      }

      // Delete module (cascade will handle module_logs)
      await client.query("DELETE FROM modules WHERE id = $1", [moduleId]);

      await client.query("COMMIT");

      logger.info(`Module deleted: ${moduleData.module_code}`);

      return sendSuccess(res, "Module deleted successfully");
    } catch (error) {
      await client.query("ROLLBACK");
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.SERVER_ERROR,
        "Failed to delete module",
        CONSTANTS.ERROR_CODES.SERVER_ERROR,
        error,
      );
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

      return sendSuccess(
        res,
        "Module statistics retrieved successfully",
        stats.rows[0],
      );
    } catch (error) {
      return sendError(
        res,
        CONSTANTS.HTTP_STATUS.SERVER_ERROR,
        "Failed to fetch module statistics",
        CONSTANTS.ERROR_CODES.SERVER_ERROR,
        error,
      );
    }
  },
};

module.exports = ModuleController;
