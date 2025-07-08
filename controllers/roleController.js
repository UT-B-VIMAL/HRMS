const jwt = require('jsonwebtoken');
const axios = require('axios');
require('dotenv').config();

const db = require('../config/db');
const {
    getAdminToken,
    createGroupInKeycloak,
    updateGroupInKeycloak,
    findGroupInKeycloak,
    deleteGroupInKeycloak,
    assignClientRoleToGroup
} = require('../api/functions/keycloakFunction');

const {
  getAuthUserDetails,
  getUserIdFromAccessToken,
} = require("../api/functions/commonFunction");

const { successResponse, errorResponse } = require('../helpers/responseHelper');

const checkRole = () => {
    return async (req, res, next) => {
        try {
            let currentRequest = req.originalUrl.slice(1);
            const match = currentRequest.match(/\/([^\/?]+)/);
            const method = req.method;

            if (match) {
                currentRequest = match[1];
            } else {
                return res.status(400).json({
                    success: false,
                    error: "Invalid request: No valid match found in the URL."
                });
            }

            const tokenFromHeader = req.headers.authorization?.split(' ')[1];
            if (!tokenFromHeader) {
                return res.status(401).send({ message: "Unauthorized: No token provided" });
            }

            const decodedToken = jwt.decode(tokenFromHeader);
            if (!decodedToken?.sub) {
                return res.status(400).send({ message: "Invalid token, user ID not found" });
            }

            const userId = decodedToken.sub;

            const adminTokens = await getAdminToken();

            const groupsResponse = await axios.get(
                `${process.env.SERVER_URL}admin/realms/${process.env.REALM}/users/${userId}/groups`,
                {
                    headers: {
                        Authorization: `Bearer ${adminTokens}`,
                    },
                }
            );

            if (!groupsResponse.data?.length) {
                return res.status(404).send({ message: "No groups found for this user" });
            }

            const groupid = groupsResponse.data[0].id;

            const groupsRolesResponse = await axios.get(
                `${process.env.SERVER_URL}/admin/realms/${process.env.REALM}/groups/${groupid}/role-mappings`,
                {
                    headers: {
                        Authorization: `Bearer ${adminTokens}`,
                    },
                }
            );

            const clientMappings = groupsRolesResponse.data.clientMappings || {};
            const roleMappings = clientMappings[process.env.CLIENT_ID];

            const exactRoles = roleMappings
                ? roleMappings.mappings.map((r) => r.name)
                : [];

            const isAuthorized = exactRoles.includes(`${currentRequest}{{${method}}}`);

            if (!isAuthorized) {
                return res.status(403).send({ message: "Forbidden: Insufficient permissions" });
            }

            next();
        } catch (error) {
            console.error("Error in checkRole middleware:", error.response?.data || error.message);
            return res.status(500).send({ message: error.response?.data || error.message });
        }
    };
};

const createRole = async (req, res) => {
    try {
        const { name, short_name } = req.body;
        const group = `${name}Group`;
        const accessToken = req.headers.authorization?.split(' ')[1];
          if (!accessToken) {
            return errorResponse(res, 'Access token is required', 401);
          }
        
          const userId = await getUserIdFromAccessToken(accessToken);

        await createGroupInKeycloak(group);

        const [result] = await db.execute(
            `INSERT INTO roles (name, short_name, group_name, created_by, created_at)
             VALUES (?, ?, ?, ?, NOW())`,
            [name, short_name, group, userId]
        );

        return successResponse(res, {
            id: result.insertId,
            name,
            short_name,
            group_name: group,
            userId
        }, "Role created successfully", 201);
    } catch (error) {
        return errorResponse(res, error.message || "Internal Server Error");
    }
};

const getRole = async (req, res) => {
    try {
        const [rows] = await db.execute(
            'SELECT * FROM roles WHERE id = ? AND deleted_at IS NULL',
            [req.params.id]
        );

        if (!rows.length) return errorResponse(res, null, 'Role not found', 404);

        return successResponse(res, rows[0], "Role fetched successfully", 200);
    } catch (error) {
        return errorResponse(res, error.message);
    }
};

const getAllRoles = async (req, res) => {
    try {
        const [rows] = await db.execute(
            'SELECT * FROM roles WHERE deleted_at IS NULL ORDER BY created_at DESC'
        );
        return successResponse(res, rows, "Roles fetched successfully", 200);
    } catch (error) {
        return errorResponse(res, error.message);
    }
};

const updateRole = async (req, res) => {
    try {
        const { name, short_name } = req.body;
        const group = `${name}Group`;

        const [rows] = await db.execute(
            'SELECT * FROM roles WHERE id = ? AND deleted_at IS NULL',
            [req.params.id]
        );

        if (!rows.length) return errorResponse(res, null, 'Role not found', 404);

        const role = rows[0];
        console.log(role);
        const keycloakGroup = await findGroupInKeycloak(role.group_name);

        if (!keycloakGroup) {
            return errorResponse(res, null, 'Group not found in Keycloak', 404);
        }

        await updateGroupInKeycloak(keycloakGroup.id, group);

        await db.execute(
            `UPDATE roles
             SET name = ?, short_name = ?, group_name = ?, updated_at = NOW()
             WHERE id = ?`,
            [name, short_name, group, req.params.id]
        );

        return successResponse(res, null, "Role updated successfully", 200);
    } catch (error) {
        return errorResponse(res, error.message);
    }
};

const deleteRole = async (req, res) => {
    try {
        const [rows] = await db.execute(
            'SELECT * FROM roles WHERE id = ? AND deleted_at IS NULL',
            [req.params.id]
        );

        if (!rows.length) return errorResponse(res, null, 'Role not found', 404);

        const role = rows[0];
        const keycloakGroup = await findGroupInKeycloak(role.group_name);

        if (!keycloakGroup) {
            return errorResponse(res, null, 'Group not found in Keycloak', 404);
        }

        await deleteGroupInKeycloak(keycloakGroup.id);

        await db.execute(
            'UPDATE roles SET deleted_at = NOW() WHERE id = ?',
            [req.params.id]
        );

        return successResponse(res, null, "Role deleted successfully", 200);
    } catch (error) {
        return errorResponse(res, error.message);
    }
};

const assignPermissionsToRole = async (req, res) => {
    try {
        const { role_id, permissions, updated_by } = req.body;

        const [roleRows] = await db.execute(
            'SELECT * FROM roles WHERE id = ? AND deleted_at IS NULL',
            [role_id]
        );

        if (!roleRows.length) return errorResponse(res, null, 'Role not found', 404);

        const role = roleRows[0];

        for (const permission_id of permissions) {
            const [permRows] = await db.execute(
                'SELECT * FROM permissions WHERE id = ? AND deleted_at IS NULL',
                [permission_id]
            );

            if (!permRows.length) {
                return errorResponse(res, null, `Permission ID ${permission_id} not found`, 404);
            }

            const permission = permRows[0];

            await db.execute(
                `INSERT INTO role_has_permissions (role_id, permission_id, updated_by)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE updated_by = VALUES(updated_by), updated_at = NOW()`,
                [role_id, permission_id, updated_by]
            );

            await assignClientRoleToGroup(role.group_name, permission.name);
        }

        return successResponse(res, null, "Permissions assigned to role successfully");
    } catch (error) {
        return errorResponse(res, error.message);
    }
};

module.exports = {
    checkRole,
    createRole,
    getRole,
    getAllRoles,
    updateRole,
    deleteRole,
    assignPermissionsToRole
};
