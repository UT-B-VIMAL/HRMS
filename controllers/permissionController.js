const db = require('../config/db');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const keycloakConfig = require('../config/keycloak');
require('dotenv').config();
const { successResponse, errorResponse } = require('../helpers/responseHelper');

const { assignClientRoleToGroup, createClientRoleInKeycloak, deleteClientRoleFromKeycloak, getAdminToken, logoutUserFromKeycloak } = require('../api/functions/keycloakFunction');
const { getUserIdFromAccessToken } = require('../api/utils/tokenUtils');

const createPermission = async (req, res) => {
    try {
        const { name, display_name, description, created_by } = req.body;

        // Check if a permission with the same name already exists
        const [existingRows] = await db.execute(
            'SELECT * FROM permissions WHERE name = ?',
            [name]
        );

        if (existingRows.length > 0) {
            return errorResponse(res, null, 'Permission with this name already exists', 400);
        }

        // Insert the permission
        const [result] = await db.execute(
            `INSERT INTO permissions (name, display_name, description, created_by, created_at)
             VALUES (?, ?, ?, ?, NOW())`,
            [name, display_name, description, created_by]
        );

        const newPermission = {
            id: result.insertId,
            name,
            display_name,
            description,
            created_by
        };

        // Create the client role in Keycloak
        await createClientRoleInKeycloak(name);

        return successResponse(res, newPermission, "Permission created successfully", 201);
    } catch (error) {
        console.error(error);
        return errorResponse(res, error.message || "Internal Server Error");
    }
};

const deletePermission = async (req, res) => {
    try {
        const { id } = req.params;

        // Check if the permission exists
        const [rows] = await db.execute(
            'SELECT * FROM permissions WHERE id = ? AND deleted_at IS NULL',
            [id]
        );

        if (rows.length === 0) {
            return errorResponse(res, null, 'Permission not found or already deleted', 404);
        }

        const permission = rows[0]; // ✅ Extract the permission details

        // Soft delete: update the deleted_at column
        await db.execute(
            'UPDATE permissions SET deleted_at = NOW() WHERE id = ?',
            [id]
        );

        // Now delete the Keycloak role
        await deleteClientRoleFromKeycloak(permission.name);

        return successResponse(res, null, 'Permission deleted successfully');
    } catch (error) {
        console.error(error);
        return errorResponse(res, error.message || 'Internal Server Error');
    }
};


const assignPermissionsToRole = async (req, res) => {
    try {
        const { role_id, permissions } = req.body;

        const accessToken = req.headers.authorization?.split(' ')[1];
        if (!accessToken) return errorResponse(res, 'Access token is required', 401);

        const userId = await getUserIdFromAccessToken(accessToken);

        // 1. Check role exists
        const [roleRows] = await db.execute('SELECT * FROM roles WHERE id = ?', [role_id]);
        if (roleRows.length === 0) return errorResponse(res, null, 'Role not found', 404);

        const role = roleRows[0];

        // 2. If no permissions passed, return current permissions
        if (!permissions || permissions.length === 0) {
            const [assignedPermissions] = await db.execute(
                `SELECT p.id, p.display_name 
                 FROM permissions p
                 JOIN role_has_permissions rp ON p.id = rp.permission_id
                 WHERE rp.role_id = ?`,
                [role_id]
            );
            return successResponse(res, assignedPermissions, "Assigned permissions retrieved successfully");
        }

        // 3. Validate all permission IDs
        const [validPermissions] = await db.query(
            `SELECT * FROM permissions WHERE id IN (${permissions.map(() => '?').join(',')})`,
            permissions
        );

        if (validPermissions.length !== permissions.length) {
            const validIds = validPermissions.map(p => p.id);
            const invalid = permissions.filter(id => !validIds.includes(id));
            return errorResponse(res, null, `Invalid permission IDs: ${invalid.join(', ')}`, 404);
        }

        // 4. Delete existing role-permissions
        await db.execute('DELETE FROM role_has_permissions WHERE role_id = ?', [role_id]);

        // 5. Insert new permissions
        const values = permissions.map(id => [role_id, id, userId]);
        await db.query(
            'INSERT INTO role_has_permissions (role_id, permission_id, updated_by) VALUES ?',
            [values]
        );

        // 6. Sync roles in Keycloak
        const permissionNames = validPermissions.map(p => p.name);
        await assignClientRoleToGroup(role.group_name, permissionNames);


        const [users] = await db.query(
            'SELECT keycloak_id FROM users WHERE role_id = ? AND keycloak_id IS NOT NULL',
            [role_id]
        );

        for (const user of users) {
            try {
                await logoutUserFromKeycloak(user.keycloak_id);
            } catch (logoutErr) {
                console.error(`Failed to logout user ${user.keycloak_id}:`, logoutErr.message);
            }
        }

        return successResponse(res, null, "Permissions updated successfully for role");
    } catch (error) {
        console.error(error);
        return errorResponse(res, error.message || "Internal Server Error");
    }
};






const hasPermission = async (permissionName, accessToken) => {
    try {
        const decodedToken = jwt.decode(accessToken);

        if (!decodedToken || !decodedToken.sub) {
            console.error("Invalid token, user ID not found");
            return 0; // Permission does not exist
        }

        const userId = decodedToken.sub;

        // Get admin token to fetch user groups
        const adminToken = await getAdminToken();

        // Get user groups from Keycloak
        const groupsResponse = await axios.get(
            `${keycloakConfig.serverUrl}/admin/realms/${keycloakConfig.realm}/users/${userId}/groups`,
            { headers: { Authorization: `Bearer ${adminToken}` } }
        );


        const groups = groupsResponse.data;
        if (!groups || groups.length === 0) {
            console.error("No groups found for this user");
            return 0; // Permission does not exist
        }

        const groupId = groups[0].id;

        // Get group roles from Keycloak
        const groupsRolesResponse = await axios.get(
            `${keycloakConfig.serverUrl}/admin/realms/${keycloakConfig.realm}/groups/${groupId}/role-mappings`,
            { headers: { Authorization: `Bearer ${adminToken}` } }
        );


        const clientMappings = groupsRolesResponse.data.clientMappings || {};
        const realmManagementMapping = clientMappings[keycloakConfig.clientId];
        if (!realmManagementMapping) {
            console.log(`Client not found: ${keycloakConfig.clientId}`);
            return 0; // Permission does not exist
        }

        const exactRoles = realmManagementMapping
            ? realmManagementMapping.mappings.map((mapping) => mapping.name)
            : [];

        const isPresent = exactRoles.includes(permissionName);
        return isPresent ? 1 : 0; // Return 1 if permission exists, otherwise 0
    } catch (error) {
        if (error.response) {
            if (error.response.status === 401) {
                console.error("Unauthorized: Invalid or expired token");
                return 0; // Permission does not exist
            } else if (error.response.status === 403) {
                console.error("Forbidden: Access denied");
                return 0; // Permission does not exist
            }
        }
        throw new Error('Error checking permission: ' + error.message);
    }
};

const getGroupedPermissions = async (req, res) => {
    try {
        const { role_id } = req.query;

        let rows = [];

        if (role_id) {
            // Fetch only permissions assigned to this role
            const [assigned] = await db.query(`
                SELECT p.id, p.name, p.display_name
                FROM permissions p
                JOIN role_has_permissions rp ON p.id = rp.permission_id
                WHERE rp.role_id = ? AND p.deleted_at IS NULL
                ORDER BY p.id
            `, [role_id]);
            rows = assigned;
        } else {
            // Fetch all permissions
            const [all] = await db.query(`
                SELECT id, name, display_name 
                FROM permissions 
                WHERE deleted_at IS NULL
                ORDER BY id
            `);
            rows = all;
        }

        const grouped = {};

        rows.forEach((permission) => {
            const [module] = permission.name.split('.');
            if (!grouped[module]) {
                grouped[module] = [];
            }
            grouped[module].push(permission);
        });

        return successResponse(res, grouped, "Permissions grouped successfully", 200);
    } catch (error) {
        console.error("Error grouping permissions:", error.message);
        return errorResponse(res, error.message, "Error fetching grouped permissions", 500);
    }
};



module.exports = {
    assignPermissionsToRole,
    createPermission,
    hasPermission,
    deletePermission,
    getGroupedPermissions
};
