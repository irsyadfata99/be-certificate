// Teacher Routes
// Handles all teacher-related endpoints (admin only)

const express = require("express");
const router = express.Router();
const {
  createTeacher,
  getAllTeachers,
  getTeacherById,
  updateTeacher,
  deleteTeacher,
} = require("../controllers/TeacherController");
const { verifyToken, requireAdmin } = require("../auth/AuthMiddleware");

console.log("✅ Teacher routes loaded");

// All teacher routes require authentication AND admin role
router.use(verifyToken);
router.use(requireAdmin);

// Create new teacher
router.post("/", createTeacher);

// Get all teachers (with pagination)
router.get("/", getAllTeachers);

// Get specific teacher by ID
router.get("/:id", getTeacherById);

// Update teacher
router.put("/:id", updateTeacher);

// Delete teacher
router.delete("/:id", deleteTeacher);

module.exports = router;
