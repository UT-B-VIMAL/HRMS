const express = require('express');
const router = express.Router();
const pmdashboardController = require('../controllers/pm/pmController');

// Define routes for PM dashboard-related actions
router.get('/pmproducts', pmdashboardController.pmproductsection);
router.get('/pmutilization', pmdashboardController.pmutilizationsection);
router.get('/pmattendance', pmdashboardController.pmattendancesection);
router.get('/pmdashboard', pmdashboardController.pmdashboardsection);

// Other routes can be added here
module.exports = router;


