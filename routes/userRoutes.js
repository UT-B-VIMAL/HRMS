// routes/userRoutes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const pmdashboardController = require('../controllers/pm/pmController');

// Define routes for user-related actions (insert, update, delete)
router.post('/', userController.processEvent);
router.post('/', pmdashboardController.pmdashboardsection);

module.exports = router;
