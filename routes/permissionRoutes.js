const express = require('express');
const { createPermission, assignPermissionsToRole } = require('../controllers/permissionController');

const router = express.Router();

router.post('/', createPermission);
router.post('/assign-permissions', assignPermissionsToRole);

module.exports = router;