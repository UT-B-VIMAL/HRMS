const express = require('express');
const {
    createRole,
    getAllRoles,
    getRole,
    updateRole,
    deleteRole
} = require('../controllers/roleController');

const router = express.Router();

// Create a new role
router.post('/create-role', createRole);

// Get all roles
router.get('/roles', getAllRoles);

// Get a role by ID
router.get('/roles/:id', getRole);

// Update a role
router.put('/update-role/:id', updateRole);

// Delete (soft delete) a role
router.delete('/delete-role/:id', deleteRole);

module.exports = router;
