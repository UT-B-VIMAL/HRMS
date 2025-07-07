const db = require('../../config/db');
const { successResponse, errorResponse } = require('../../helpers/responseHelper');
const { assignClientRoleToGroup, createClientRoleInKeycloak, getAdminToken } = require('../api/functions/keycloakFunction');

const createPermission = async (req, res) => {
    try {
        const { name, description, created_by } = req.body;

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
            `INSERT INTO permissions (name, description, created_by, created_at)
             VALUES (?, ?, ?, NOW())`,
            [name, description, created_by]
        );

        const newPermission = {
            id: result.insertId,
            name,
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

const assignPermissionsToRole = async (req, res) => {
    try {
        const { role_id, permissions, updated_by } = req.body;

        // 1. Check if role exists
        const [roleRows] = await db.execute(
            'SELECT * FROM roles WHERE id = ?',
            [role_id]
        );

        if (roleRows.length === 0) {
            return errorResponse(res, null, 'Role not found', 404);
        }

        const role = roleRows[0];

        // 2. Loop through each permission
        for (const permissionId of permissions) {
            // Check if permission exists
            const [permRows] = await db.execute(
                'SELECT * FROM permissions WHERE id = ?',
                [permissionId]
            );

            if (permRows.length === 0) {
                return errorResponse(res, null, `Permission with ID ${permissionId} not found`, 404);
            }

            const permission = permRows[0];

            // 3. Insert or update role_has_permissions
            await db.execute(`
                INSERT INTO role_has_permissions (role_id, permission_id, updated_by)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE updated_by = ?
            `, [role_id, permissionId, updated_by, updated_by]);

            // 4. Assign role in Keycloak
            await assignClientRoleToGroup(role.group, permission.name);
        }

        return successResponse(res, null, "Permissions assigned to role successfully");
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

module.exports = {
    assignPermissionsToRole,
    createPermission,
    hasPermission
};
