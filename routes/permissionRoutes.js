const express = require('express');
const { createPermission, deletePermission, assignPermissionsToRole } = require('../controllers/permissionController');

const router = express.Router();

router.post('/create-permissions', createPermission);
router.delete('/delete-permissions/:id', deletePermission);

router.post('/assign-permissions', assignPermissionsToRole);

module.exports = router;