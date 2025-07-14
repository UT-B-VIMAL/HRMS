const jwt = require('jsonwebtoken');
const axios = require('axios');
require('dotenv').config();

const db = require('../config/db');
const {
    getAdminToken,
    createGroupInKeycloak,
    updateGroupInKeycloak,
    findGroupInKeycloak,
    deleteGroupInKeycloak
  } = require('../api/functions/keycloakFunction');

const {
  getAuthUserDetails,
  getUserIdFromAccessToken,
} = require("../api/functions/commonFunction");

const { successResponse, errorResponse } = require('../helpers/responseHelper');

const checkRole = (requiredPermissions = []) => {
  return async (req, res, next) => {
    try {
      if (!Array.isArray(requiredPermissions) || requiredPermissions.length === 0) {
        return res.status(400).json({ message: "Permissions list is required in checkRole()" });
      }

      const tokenFromHeader = req.headers.authorization?.split(" ")[1];
      if (!tokenFromHeader) {
        return res.status(401).json({ message: "Unauthorized: No token provided" });
      }

      const decodedToken = jwt.decode(tokenFromHeader);
      if (!decodedToken?.sub) {
        return res.status(400).json({ message: "Invalid token, user ID not found" });
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
        return res.status(404).json({ message: "No groups found for this user" });
      }

      const groupId = groupsResponse.data[0].id;

      const rolesResponse = await axios.get(
        `${process.env.SERVER_URL}/admin/realms/${process.env.REALM}/groups/${groupId}/role-mappings`,
        {
          headers: {
            Authorization: `Bearer ${adminTokens}`,
          },
        }
      );

      const clientMappings = rolesResponse.data.clientMappings || {};
      const roleMappings = clientMappings[process.env.CLIENT_ID];

      const userPermissions = roleMappings
        ? roleMappings.mappings.map((r) => r.name)
        : [];

      const hasPermission = requiredPermissions.some((perm) =>
        userPermissions.includes(perm)
      );

      if (!hasPermission) {
        return res.status(403).json({ message: "Forbidden: Insufficient permissions" });
      }

      next();
    } catch (error) {
      console.error("Error in checkRole middleware:", error.response?.data || error.message);
      return res.status(500).json({ message: error.response?.data || error.message });
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

    // 🔍 Check if role with same name & short_name exists
    const [existing] = await db.execute(
      `SELECT * FROM roles WHERE name = ? AND short_name = ?`,
      [name, short_name]
    );

    if (existing.length > 0) {
      const existingRole = existing[0];
      if (existingRole.deleted_at) {
        // 🛠️ Restore the soft-deleted role
        await db.execute(
          `UPDATE roles SET deleted_at = NULL, updated_at = NOW(), created_by = ? WHERE id = ?`,
          [userId, existingRole.id]
        );
        await createGroupInKeycloak(existingRole.group_name);
        return successResponse(res, {
          id: existingRole.id,
          name,
          short_name,
          group_name: existingRole.group_name,
          userId
        }, "Role created successfully", 200);
      } else {
        return errorResponse(res, null, 'Role with this name and short name already exists', 400);
      }
    }

    // ✅ Create group in Keycloak
    await createGroupInKeycloak(group);

    // ✅ Insert new role
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
    console.error("Error in createRole:", error.message);
    return errorResponse(res, error.message || "Internal Server Error", 500);
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




module.exports = {
    checkRole,
    createRole,
    getRole,
    getAllRoles,
    updateRole,
    deleteRole
};
