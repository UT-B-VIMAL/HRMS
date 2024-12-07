// routes/userRoutes.js
const express = require('express');
const router = express.Router();
const pmdashboardController = require('../controllers/pm/pmController');

// Define routes for user-related actions (insert, update, delete)
router.get('/', pmdashboardController.pmdashboardsection);

module.exports = router;
