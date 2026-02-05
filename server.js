const express = require("express");
require("dotenv").config();
const authRoutes = require("./routes/authRoutes");
const certificateRoutes = require("./routes/certificateRoutes");
const certificateLogsRoutes = require("./routes/certificateLogsRoutes");

const app = express();

// CORS Middleware - ADD THIS BEFORE OTHER MIDDLEWARE
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*"); // Allow all origins (change to specific domain in production)
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization",
  );

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/certificates", certificateRoutes);
app.use("/api/logs", certificateLogsRoutes);

// Test route
app.get("/", (req, res) => {
  res.json({ message: "API is running" });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
