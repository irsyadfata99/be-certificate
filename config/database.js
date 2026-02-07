const { Pool } = require("pg");
const logger = require("../utils/logger");
require("dotenv").config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_DATABASE,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  statement_timeout: 30000,
});

pool.on("connect", () => {
  logger.info("✅ Connected to PostgreSQL database");
});

pool.on("error", (err) => {
  logger.error("Unexpected error on idle client", err);
});

// Test connection on startup
pool.query("SELECT NOW()", (err, res) => {
  if (err) {
    logger.error("❌ Database connection test failed:", err);
  } else {
    logger.info("✅ Database connection test successful");
  }
});

module.exports = pool;
