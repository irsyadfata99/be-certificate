// routes/studentRoutes.js
// Student Management Routes - Phase 1
// Handles routing for all student-related endpoints

const express = require("express");
const router = express.Router();
const { createStudent, getAllStudents, getStudentById, updateStudent, deleteStudent, transferStudent, getStudentStats, searchStudents } = require("../controllers/StudentController");
const { verifyToken, requireAdmin } = require("../auth/AuthMiddleware");

// =====================================================
// ALL ROUTES REQUIRE AUTHENTICATION
// =====================================================
router.use(verifyToken);

// =====================================================
// STUDENT STATISTICS & SEARCH
// =====================================================

// Get student statistics (overall and by branch)
// Accessible by both admin and teachers
router.get("/stats", getStudentStats);

// Search students for autocomplete
// Accessible by both admin and teachers
router.get("/search", searchStudents);

// =====================================================
// STUDENT CRUD OPERATIONS
// =====================================================

// Create new student - Admin only
router.post("/", requireAdmin, createStudent);

// Get all students with pagination and filters
// Accessible by both admin and teachers
router.get("/", getAllStudents);

// Get specific student by ID
// Accessible by both admin and teachers
router.get("/:id", getStudentById);

// Update student - Admin only
router.put("/:id", requireAdmin, updateStudent);

// Delete student (soft delete) - Admin only
router.delete("/:id", requireAdmin, deleteStudent);

// =====================================================
// STUDENT TRANSFER
// =====================================================

// Transfer student to another branch - Admin only
router.post("/:id/transfer", requireAdmin, transferStudent);

module.exports = router;
