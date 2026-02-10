// Certificate Logs Controller - WITH REGIONAL HUB FILTER

const pool = require("../config/database");
const fs = require("fs").promises;
const path = require("path");
const logger = require("../utils/logger");
const CONSTANTS = require("../utils/constants");
const { sendError, sendSuccess } = require("../utils/responseHelper");

// =====================================================
// IMPROVED LOG ACTION WITH ASYNC FILE BACKUP
// =====================================================
async function logAction(data) {
  const { certificateId, actionType, description, fromBranch = null, toBranch = null, certificateAmount = 0, medalAmount = 0, oldValues = null, newValues = null, performedBy = "System" } = data;

  try {
    await pool.query(
      `INSERT INTO certificate_logs 
       (certificate_id, action_type, description, from_branch, to_branch, 
        certificate_amount, medal_amount, old_values, new_values, performed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [certificateId, actionType, description, fromBranch, toBranch, certificateAmount, medalAmount, oldValues ? JSON.stringify(oldValues) : null, newValues ? JSON.stringify(newValues) : null, performedBy],
    );
    logger.info(`Log created: ${actionType} - ${certificateId}`);
  } catch (error) {
    logger.error("CRITICAL: Failed to create log:", error);

    // FIXED: Use async file write instead of sync
    try {
      const logDir = path.join(__dirname, "..", "logs");
      const logFile = path.join(logDir, "failed-logs.jsonl");

      // Create logs directory if it doesn't exist
      try {
        await fs.access(logDir);
      } catch {
        await fs.mkdir(logDir, { recursive: true });
      }

      const failedLog = {
        timestamp: new Date().toISOString(),
        error: error.message,
        errorStack: error.stack,
        logData: {
          certificateId,
          actionType,
          description,
          fromBranch,
          toBranch,
          certificateAmount,
          medalAmount,
          oldValues,
          newValues,
          performedBy,
        },
      };

      // FIXED: Async file append
      await fs.appendFile(logFile, JSON.stringify(failedLog) + "\n");

      logger.info(`Failed log saved to backup file: ${logFile}`);
      logger.warn("WARNING: Audit log failed to write to database! Check failed-logs.jsonl");
    } catch (fileError) {
      logger.error("DOUBLE FAILURE: Could not save to backup file either:", fileError);
    }

    // Don't throw error - logging shouldn't break the main operation
  }
}

// =====================================================
// GET LOGS WITH REGIONAL HUB FILTER
// =====================================================
const getLogs = async (req, res) => {
  try {
    const {
      certificate_id: certificateId,
      action_type: actionType,
      from_date: fromDate,
      to_date: toDate,
      search,
      regional_hub: regionalHub, // NEW: Regional hub filter
      limit = CONSTANTS.PAGINATION.LOGS_DEFAULT_LIMIT,
      offset = CONSTANTS.PAGINATION.DEFAULT_OFFSET,
    } = req.query;

    logger.info("Fetching logs with filters:", req.query);

    // Validate limit and offset
    const validatedLimit = Math.min(Math.max(parseInt(limit) || CONSTANTS.PAGINATION.LOGS_DEFAULT_LIMIT, 1), CONSTANTS.PAGINATION.MAX_LIMIT);
    const validatedOffset = Math.max(parseInt(offset) || CONSTANTS.PAGINATION.DEFAULT_OFFSET, 0);

    let query = `
      SELECT 
        cl.*
      FROM certificate_logs cl
    `;

    // NEW: Join with certificate_stock and branches for regional hub filtering
    let needsJoin = false;
    if (regionalHub && regionalHub.trim()) {
      needsJoin = true;
      query += `
        INNER JOIN certificate_stock cs ON cl.certificate_id = cs.certificate_id
        INNER JOIN branches b ON cs.branch_code = b.branch_code
      `;
    }

    query += " WHERE 1=1";

    const params = [];
    let paramCount = 1;

    // Filter by certificate_id
    if (certificateId && certificateId.trim()) {
      query += ` AND cl.certificate_id = $${paramCount}`;
      params.push(certificateId.trim());
      paramCount++;
    }

    // Filter by action_type
    if (actionType && actionType.trim()) {
      query += ` AND cl.action_type = $${paramCount}`;
      params.push(actionType.trim().toUpperCase());
      paramCount++;
    }

    // Filter by date range
    if (fromDate && fromDate.trim()) {
      query += ` AND cl.created_at >= $${paramCount}`;
      params.push(fromDate.trim());
      paramCount++;
    }

    if (toDate && toDate.trim()) {
      query += ` AND cl.created_at < $${paramCount}::date + interval '1 day'`;
      params.push(toDate.trim());
      paramCount++;
    }

    // Search in certificate_id or description
    if (search && search.trim()) {
      query += ` AND (cl.certificate_id ILIKE $${paramCount} OR cl.description ILIKE $${paramCount})`;
      params.push(`%${search.trim()}%`);
      paramCount++;
    }

    // NEW: Filter by regional hub
    if (regionalHub && regionalHub.trim()) {
      query += ` AND b.regional_hub = $${paramCount}`;
      params.push(regionalHub.trim());
      paramCount++;
    }

    // Group by to avoid duplicates when joining
    if (needsJoin) {
      query += ` GROUP BY cl.id`;
    }

    // Order by most recent first
    query += ` ORDER BY cl.created_at DESC`;

    // Add pagination
    query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(validatedLimit, validatedOffset);

    logger.debug("Query:", query);
    logger.debug("Params:", params);

    const result = await pool.query(query, params);

    // Get total count for pagination
    let countQuery = `SELECT COUNT(DISTINCT cl.id) FROM certificate_logs cl`;

    if (needsJoin) {
      countQuery += `
        INNER JOIN certificate_stock cs ON cl.certificate_id = cs.certificate_id
        INNER JOIN branches b ON cs.branch_code = b.branch_code
      `;
    }

    countQuery += " WHERE 1=1";

    const countParams = [];
    let countParamNum = 1;

    if (certificateId && certificateId.trim()) {
      countQuery += ` AND cl.certificate_id = $${countParamNum}`;
      countParams.push(certificateId.trim());
      countParamNum++;
    }

    if (actionType && actionType.trim()) {
      countQuery += ` AND cl.action_type = $${countParamNum}`;
      countParams.push(actionType.trim().toUpperCase());
      countParamNum++;
    }

    if (fromDate && fromDate.trim()) {
      countQuery += ` AND cl.created_at >= $${countParamNum}`;
      countParams.push(fromDate.trim());
      countParamNum++;
    }

    if (toDate && toDate.trim()) {
      countQuery += ` AND cl.created_at < $${countParamNum}::date + interval '1 day'`;
      countParams.push(toDate.trim());
      countParamNum++;
    }

    if (search && search.trim()) {
      countQuery += ` AND (cl.certificate_id ILIKE $${countParamNum} OR cl.description ILIKE $${countParamNum})`;
      countParams.push(`%${search.trim()}%`);
      countParamNum++;
    }

    if (regionalHub && regionalHub.trim()) {
      countQuery += ` AND b.regional_hub = $${countParamNum}`;
      countParams.push(regionalHub.trim());
      countParamNum++;
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    return sendSuccess(res, "Logs retrieved successfully", result.rows, {
      pagination: {
        total: totalCount,
        limit: validatedLimit,
        offset: validatedOffset,
        hasMore: totalCount > validatedOffset + result.rows.length,
        currentPage: Math.floor(validatedOffset / validatedLimit) + 1,
        totalPages: Math.ceil(totalCount / validatedLimit),
      },
    });
  } catch (error) {
    logger.error("Get logs error:", error);
    return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to retrieve logs", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
  }
};

// Get logs for a specific certificate
const getLogsByCertificate = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !id.trim()) {
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Certificate ID is required", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    const result = await pool.query("SELECT * FROM certificate_logs WHERE certificate_id = $1 ORDER BY created_at DESC", [id.trim()]);

    return sendSuccess(res, "Certificate logs retrieved successfully", result.rows, {
      count: result.rows.length,
    });
  } catch (error) {
    logger.error("Get certificate logs error:", error);
    return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to retrieve certificate logs", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
  }
};

// Delete old logs (cleanup function)
const deleteOldLogs = async (req, res) => {
  try {
    const { days = 90 } = req.query;

    // Validate days parameter
    const validatedDays = Math.min(Math.max(parseInt(days) || 90, 1), 3650);

    const result = await pool.query(
      `DELETE FROM certificate_logs 
       WHERE created_at < NOW() - INTERVAL '1 day' * $1
       RETURNING id`,
      [validatedDays],
    );

    logger.info(`Deleted ${result.rows.length} log entries older than ${validatedDays} days`);

    return sendSuccess(res, `Deleted ${result.rows.length} log entries older than ${validatedDays} days`, {
      deletedCount: result.rows.length,
    });
  } catch (error) {
    logger.error("Delete old logs error:", error);
    return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to delete old logs", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
  }
};

// =====================================================
// RECOVER FAILED LOGS FROM BACKUP FILE
// =====================================================
const recoverFailedLogs = async (req, res) => {
  try {
    const logFile = path.join(__dirname, "..", "logs", "failed-logs.jsonl");

    // Check if file exists
    try {
      await fs.access(logFile);
    } catch {
      return sendSuccess(res, "No failed logs to recover", {
        recovered: 0,
      });
    }

    const fileContent = await fs.readFile(logFile, "utf-8");
    const lines = fileContent.split("\n").filter((line) => line.trim());

    let recovered = 0;
    let failed = 0;

    for (const line of lines) {
      try {
        const failedLog = JSON.parse(line);
        const logData = failedLog.logData;

        await pool.query(
          `INSERT INTO certificate_logs 
           (certificate_id, action_type, description, from_branch, to_branch, 
            certificate_amount, medal_amount, old_values, new_values, performed_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            logData.certificateId,
            logData.actionType,
            logData.description,
            logData.fromBranch,
            logData.toBranch,
            logData.certificateAmount,
            logData.medalAmount,
            logData.oldValues ? JSON.stringify(logData.oldValues) : null,
            logData.newValues ? JSON.stringify(logData.newValues) : null,
            logData.performedBy,
          ],
        );

        recovered++;
      } catch (err) {
        logger.error("Failed to recover log:", err);
        failed++;
      }
    }

    // Rename the file to mark it as processed
    if (recovered > 0) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupFile = path.join(__dirname, "..", "logs", `recovered-${timestamp}.jsonl`);
      await fs.rename(logFile, backupFile);
      logger.info(`Recovered logs backed up to: ${backupFile}`);
    }

    logger.info(`Recovery complete. Recovered: ${recovered}, Failed: ${failed}`);

    return sendSuccess(res, `Recovery complete. Recovered: ${recovered}, Failed: ${failed}`, {
      recovered,
      failed,
    });
  } catch (error) {
    logger.error("Recover failed logs error:", error);
    return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to recover failed logs", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
  }
};

module.exports = {
  logAction,
  getLogs,
  getLogsByCertificate,
  deleteOldLogs,
  recoverFailedLogs,
};
