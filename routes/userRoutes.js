// routes/userRoutes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

// Define routes for user-related actions (insert, update, delete)
router.post('/', userController.userEvent);

module.exports = router;
