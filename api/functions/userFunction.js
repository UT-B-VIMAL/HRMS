const bcrypt = require('bcryptjs');
const db = require('../../config/db');
const { successResponse, errorResponse } = require('../../helpers/responseHelper');

// Create User
exports.createUser = async (payload, res) => {
  const {
    name, employee_id, email, phone, email_verified_at,
    password, team_id, role_id, designation_id, remember_token,
    created_by, updated_by, created_at, updated_at, deleted_at
  } = payload;

  try {
    // Hash the password before saving
    const hashedPassword = await bcrypt.hash(password, 10);  // 10 is the saltRounds (higher is more secure)

    const query = `
      INSERT INTO users (
        name, employee_id, email, phone, email_verified_at,
        password, team_id, role_id, designation_id, remember_token,
        created_by, updated_by, deleted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NOW(), NOW())
    `;

    const values = [
      name, employee_id, email, phone, email_verified_at,
      hashedPassword, team_id, role_id, designation_id, remember_token,
      created_by, updated_by, created_at, updated_at, deleted_at
    ];

    const [result] = await db.promise().query(query, values);

    return successResponse(res, { id: result.insertId, ...payload }, 'User created successfully', 201);
  } catch (error) {
    console.error('Error creating user:', error.message);
    return errorResponse(res, error.message, 'Error creating user', 500);
  }
};


// Get User
exports.getUser = async (id, res) => {
  try {
    const query = 'SELECT * FROM users WHERE id = ?';
    const [rows] = await db.promise().query(query, [id]);

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
    const [rows] = await db.promise().query(query);

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

    let values = [
      name, employee_id, email, phone, email_verified_at,
      team_id, role_id, designation_id, remember_token,
      created_by, updated_by, created_at, updated_at, deleted_at, id
    ];

    // If a new password is provided, hash it before saving
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10); // Hash the password
      query = query.replace('password = ?,', 'password = ?,'); // Include password in the query
      values.splice(5, 0, hashedPassword); // Insert the hashed password at the correct index
    }

    const [result] = await db.promise().query(query, values);

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
    const query = `UPDATE users SET deleted_at = NOW() WHERE id = ?`;
    const [result] = await db.promise().query(query, [id]);

    if (result.affectedRows === 0) {
      return errorResponse(res, null, 'User not found', 204);
    }

    return successResponse(res, null, 'User deleted successfully');
  } catch (error) {
    return errorResponse(res, error.message, 'Error deleting user', 500);
  }
};
