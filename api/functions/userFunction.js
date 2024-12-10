const bcrypt = require('bcryptjs');
const db = require('../../config/db');
const { successResponse, errorResponse } = require('../../helpers/responseHelper');
const { createUserInKeycloak,deleteUserInKeycloak } = require("../functions/keycloakFunction");

// Create User
exports.createUser = async (payload, res) => {
  const {
    first_name,last_name, employee_id, email, phone, email_verified_at,
    password, team_id, role_id, designation_id, remember_token,
    created_by, updated_by, created_at, updated_at, deleted_at
  } = payload;

  try {
    const hashedPassword = await bcrypt.hash(password, 10); 
    const roleName = await getRoleName(role_id);

    const query = `
      INSERT INTO users (
        first_name,last_name, employee_id, email, phone, email_verified_at,
        password, team_id, role_id, designation_id, remember_token,
        created_by, updated_by, deleted_at, created_at, updated_at
      ) VALUES (?,?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NOW(), NOW())
    `;

    const values = [
      first_name,last_name, employee_id, email, phone, email_verified_at,
      hashedPassword, team_id, role_id, designation_id, remember_token,
      created_by, updated_by, created_at, updated_at, deleted_at
    ];

    const [result] = await db.promise().query(query, values);

    const keycloakUserData = {
      username: first_name,
      email: email,
      firstName: first_name, 
      lastName: last_name,
      enabled: true,
      emailVerified: true,
      credentials: [
        {
          type: "password",
          value: password,
          temporary: false
        }
      ]
    };

    const userId = await createUserInKeycloak(keycloakUserData);

    const updateQuery = `UPDATE users SET keycloak_id = ? WHERE id = ?`;
    const updateValues = [userId, result.insertId];
  
    await db.promise().query(updateQuery, updateValues);
    if (userId) {
      return successResponse(res, { id: result.insertId, ...payload, keycloakUserId: userId }, 'User created successfully', 201);
    } else {
      return errorResponse(res, "Failed to create user in Keycloak", 'Error creating user in Keycloak', 500);
    }
  } catch (error) {
    console.error('Error creating user:', error.message);
    return errorResponse(res, error.message, 'Error creating user', 500);
  }
};


// Get User
exports.getUser = async (id, res) => {
  try {
    const query = 'SELECT * FROM users WHERE id = ?';
    const [rows] = await db.query(query, [id]);

    if (rows.length === 0) {
      return errorResponse(res, null, 'User not found', 204);
    }

    return successResponse(res, rows[0], 'User retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 'Error retrieving user', 500);
  }
};

// Get All Users
exports.getAllUsers = async (res) => {
  try {
    const query = 'SELECT * FROM users WHERE deleted_at IS NULL';
    const [rows] = await db.query(query);

    if (rows.length === 0) {
      return errorResponse(res, null, 'No users found', 204);
    }

    return successResponse(res, rows, 'Users retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 'Error retrieving users', 500);
  }
};

// Update User
exports.updateUser = async (id, payload, res) => {
  const {
    name, employee_id, email, phone, email_verified_at,
    password, team_id, role_id, designation_id, remember_token,
    created_by, updated_by, created_at, updated_at, deleted_at
  } = payload;

  try {
    let query = `
      UPDATE users SET
        name = ?, employee_id = ?, email = ?, phone = ?, email_verified_at = ?,
        team_id = ?, role_id = ?, designation_id = ?, remember_token = ?,
        created_by = ?, updated_by = ?, created_at = ?, updated_at = ?, deleted_at = ?
      WHERE id = ?
    `;

    const roleName = await getRoleName(role_id);

    let values = [
      name, employee_id, email, phone, email_verified_at,
      team_id, role_id, designation_id, remember_token,
      created_by, updated_by, created_at, updated_at, deleted_at, id
    ];

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10); 
      query = query.replace('password = ?,', 'password = ?,'); 
      values.splice(5, 0, hashedPassword); 
    }

    const [result] = await db.query(query, values);

    if (result.affectedRows === 0) {
      return errorResponse(res, null, 'User not found', 204);
    }

    return successResponse(res, { id, ...payload }, 'User updated successfully');
  } catch (error) {
    return errorResponse(res, error.message, 'Error updating user', 500);
  }
};

// Delete User
exports.deleteUser = async (id, res) => {
  try {
    const selectQuery = `SELECT keycloak_id FROM users WHERE id = ?`;
    const [rows] = await db.promise().query(selectQuery, [id]);

    if (rows.length === 0 || !rows[0].keycloak_id) {
      return errorResponse(res, null, 'User not found or Keycloak ID missing', 404);
    }

    const keycloakId = rows[0].keycloak_id;

    const updateQuery = `UPDATE users SET deleted_at = NOW() WHERE id = ?`;
    const [result] = await db.promise().query(updateQuery, [id]);

    if (result.affectedRows === 0) {
      return errorResponse(res, null, 'User not found', 204);
    }

    await deleteUserInKeycloak(keycloakId);

    return successResponse(res, null, 'User deleted successfully');
  } catch (error) {
    console.error('Error deleting user:', error.message);
    return errorResponse(res, error.message, 'Error deleting user', 500);
  }
};


const getRoleName = async (roleId) => {
  const query = "SELECT name FROM roles WHERE id = ?";
  const values = [roleId];
  const [result] = await db.promise().query(query, values);
  return result.length > 0 ? result[0].name : null;
};
