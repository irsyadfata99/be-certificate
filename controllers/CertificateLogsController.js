// Certificate Logs Controller - IMPROVED WITH QUERY BUILDER

const pool = require("../config/database");
const fs = require("fs").promises;
const path = require("path");
const logger = require("../utils/logger");
const CONSTANTS = require("../utils/constants");
const { sendError, sendSuccess } = require("../utils/responseHelper");

// =====================================================
// QUERY BUILDER HELPER - ELIMINATES DUPLICATION
// =====================================================
class LogsQueryBuilder {
  constructor() {
    this.whereClauses = [];
    this.params = [];
    this.paramCount = 1;
  }

  addCertificateIdFilter(certificateId) {
    if (certificateId && certificateId.trim()) {
      this.whereClauses.push(`cl.certificate_id = $${this.paramCount}`);
      this.params.push(certificateId.trim());
      this.paramCount++;
    }
    return this;
  }

  addActionTypeFilter(actionType) {
    if (actionType && actionType.trim()) {
      this.whereClauses.push(`cl.action_type = $${this.paramCount}`);
      this.params.push(actionType.trim().toUpperCase());
      this.paramCount++;
    }
    return this;
  }

  addDateRangeFilter(fromDate, toDate) {
    if (fromDate && fromDate.trim()) {
      this.whereClauses.push(`cl.created_at >= $${this.paramCount}`);
      this.params.push(fromDate.trim());
      this.paramCount++;
    }

    if (toDate && toDate.trim()) {
      this.whereClauses.push(`cl.created_at < $${this.paramCount}::date + interval '1 day'`);
      this.params.push(toDate.trim());
      this.paramCount++;
    }
    return this;
  }

  addSearchFilter(search) {
    if (search && search.trim()) {
      this.whereClauses.push(`(cl.certificate_id ILIKE $${this.paramCount} OR cl.description ILIKE $${this.paramCount})`);
      this.params.push(`%${search.trim()}%`);
      this.paramCount++;
    }
    return this;
  }

  addRegionalHubFilter(regionalHub) {
    if (regionalHub && regionalHub.trim()) {
      this.whereClauses.push(`EXISTS (
        SELECT 1 FROM certificate_stock cs
        JOIN branches b ON cs.branch_code = b.branch_code
        WHERE cs.certificate_id = cl.certificate_id
        AND b.regional_hub = $${this.paramCount}
      )`);
      this.params.push(regionalHub.trim());
      this.paramCount++;
    }
    return this;
  }

  getWhereClause() {
    return this.whereClauses.length > 0 ? `WHERE ${this.whereClauses.join(" AND ")}` : "";
  }

  getParams() {
    return this.params;
  }

  getCurrentParamCount() {
    return this.paramCount;
  }
}

// =====================================================
// PAGINATION HELPER
// =====================================================
function validatePagination(limit, offset) {
  const validatedLimit = Math.min(Math.max(parseInt(limit) || CONSTANTS.PAGINATION.LOGS_DEFAULT_LIMIT, 1), CONSTANTS.PAGINATION.MAX_LIMIT);
  const validatedOffset = Math.max(parseInt(offset) || CONSTANTS.PAGINATION.DEFAULT_OFFSET, 0);

  return { validatedLimit, validatedOffset };
}

function buildPaginationResponse(totalCount, limit, offset, currentRows) {
  return {
    total: totalCount,
    limit,
    offset,
    hasMore: totalCount > offset + currentRows,
    currentPage: Math.floor(offset / limit) + 1,
    totalPages: Math.ceil(totalCount / limit),
  };
}

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

      await fs.appendFile(logFile, JSON.stringify(failedLog) + "\n");

      logger.info(`Failed log saved to backup file: ${logFile}`);
      logger.warn("WARNING: Audit log failed to write to database! Check failed-logs.jsonl");
    } catch (fileError) {
      logger.error("DOUBLE FAILURE: Could not save to backup file either:", fileError);
    }
  }
}

// =====================================================
// GET LOGS WITH REGIONAL HUB FILTER (IMPROVED)
// =====================================================
const getLogs = async (req, res) => {
  try {
    const {
      certificate_id: certificateId,
      action_type: actionType,
      from_date: fromDate,
      to_date: toDate,
      search,
      regional_hub: regionalHub,
      limit = CONSTANTS.PAGINATION.LOGS_DEFAULT_LIMIT,
      offset = CONSTANTS.PAGINATION.DEFAULT_OFFSET,
    } = req.query;

    logger.info("Fetching logs with filters:", req.query);

    // Validate pagination
    const { validatedLimit, validatedOffset } = validatePagination(limit, offset);

    // Build query using QueryBuilder - NO DUPLICATION!
    const queryBuilder = new LogsQueryBuilder();
    queryBuilder.addCertificateIdFilter(certificateId).addActionTypeFilter(actionType).addDateRangeFilter(fromDate, toDate).addSearchFilter(search).addRegionalHubFilter(regionalHub);

    const whereClause = queryBuilder.getWhereClause();
    const filterParams = queryBuilder.getParams();

    // Main query with pagination
    const query = `
      SELECT cl.*
      FROM certificate_logs cl
      ${whereClause}
      ORDER BY cl.created_at DESC
      LIMIT $${queryBuilder.getCurrentParamCount()} 
      OFFSET $${queryBuilder.getCurrentParamCount() + 1}
    `;

    logger.debug("Query:", query);
    logger.debug("Params:", [...filterParams, validatedLimit, validatedOffset]);

    const result = await pool.query(query, [...filterParams, validatedLimit, validatedOffset]);

    // Count query - REUSES SAME FILTERS!
    const countQuery = `
      SELECT COUNT(*) 
      FROM certificate_logs cl
      ${whereClause}
    `;

    const countResult = await pool.query(countQuery, filterParams);
    const totalCount = parseInt(countResult.rows[0].count);

    logger.info(`Logs retrieved: ${result.rows.length}/${totalCount} records ${regionalHub ? `(filtered by ${regionalHub} regional hub)` : ""}`);

    // IMPORTANT: Wrap pagination and filters in 'meta' object for consistency
    return sendSuccess(res, "Logs retrieved successfully", result.rows, {
      pagination: buildPaginationResponse(totalCount, validatedLimit, validatedOffset, result.rows.length),
      filters: {
        certificate_id: certificateId || null,
        action_type: actionType || null,
        from_date: fromDate || null,
        to_date: toDate || null,
        search: search || null,
        regional_hub: regionalHub || null,
      },
    });
  } catch (error) {
    logger.error("Get logs error:", error);
    return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to retrieve logs", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
  }
};

// =====================================================
// GET LOGS BY CERTIFICATE - NOW WITH PAGINATION!
// =====================================================
const getLogsByCertificate = async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = CONSTANTS.PAGINATION.LOGS_DEFAULT_LIMIT, offset = CONSTANTS.PAGINATION.DEFAULT_OFFSET } = req.query;

    if (!id || !id.trim()) {
      return sendError(res, CONSTANTS.HTTP_STATUS.BAD_REQUEST, "Certificate ID is required", CONSTANTS.ERROR_CODES.VALIDATION_ERROR);
    }

    // Validate pagination
    const { validatedLimit, validatedOffset } = validatePagination(limit, offset);

    // Main query with pagination
    const query = `
      SELECT * 
      FROM certificate_logs 
      WHERE certificate_id = $1 
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(query, [id.trim(), validatedLimit, validatedOffset]);

    // Count query
    const countResult = await pool.query("SELECT COUNT(*) FROM certificate_logs WHERE certificate_id = $1", [id.trim()]);
    const totalCount = parseInt(countResult.rows[0].count);

    logger.info(`Certificate logs retrieved: ${result.rows.length}/${totalCount} for certificate ${id}`);

    return sendSuccess(res, "Certificate logs retrieved successfully", result.rows, {
      pagination: buildPaginationResponse(totalCount, validatedLimit, validatedOffset, result.rows.length),
      certificate_id: id.trim(),
    });
  } catch (error) {
    logger.error("Get certificate logs error:", error);
    return sendError(res, CONSTANTS.HTTP_STATUS.SERVER_ERROR, "Failed to retrieve certificate logs", CONSTANTS.ERROR_CODES.SERVER_ERROR, error);
  }
};

// =====================================================
// DELETE OLD LOGS (CLEANUP FUNCTION)
// =====================================================
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
      daysThreshold: validatedDays,
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
        failed: 0,
      });
    }

    const fileContent = await fs.readFile(logFile, "utf-8");
    const lines = fileContent.split("\n").filter((line) => line.trim());

    let recovered = 0;
    let failed = 0;
    const failedEntries = [];

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
        failedEntries.push({
          line,
          error: err.message,
        });
      }
    }

    // Rename the file to mark it as processed
    if (recovered > 0) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupFile = path.join(__dirname, "..", "logs", `recovered-${timestamp}.jsonl`);
      await fs.rename(logFile, backupFile);
      logger.info(`Recovered logs backed up to: ${backupFile}`);
    }

    // If there are still failed entries, write them back
    if (failedEntries.length > 0) {
      const stillFailedContent = failedEntries.map((entry) => entry.line).join("\n") + "\n";
      await fs.writeFile(logFile, stillFailedContent);
      logger.warn(`${failedEntries.length} entries could not be recovered and remain in failed-logs.jsonl`);
    }

    logger.info(`Recovery complete. Recovered: ${recovered}, Failed: ${failed}`);

    return sendSuccess(res, `Recovery complete. Recovered: ${recovered}, Failed: ${failed}`, {
      recovered,
      failed,
      totalProcessed: lines.length,
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
