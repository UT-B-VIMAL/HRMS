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

    const [result] = await db.query(query, values);

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
  
    await db.query(updateQuery, updateValues);
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
const getPagination = (page, perPage, totalRecords) => {
  page = parseInt(page, 10);
  const totalPages = Math.ceil(totalRecords / perPage);
  const nextPage = page < totalPages ? page + 1 : null;
  const prevPage = page > 1 ? page - 1 : null;

  return {
      total_records: totalRecords,
      total_pages: totalPages,
      current_page: page,
      per_page: perPage,
      range_from: `Showing ${(page - 1) * perPage + 1}-${Math.min(page * perPage, totalRecords)} of ${totalRecords} entries`,
      next_page: nextPage,
      prev_page: prevPage,
  };
};

exports.getAllUsers = async (req, res) => {
  try {
    const { search = '', page = 1, perPage = 10 } = req.query; // Default values for query parameters
    const offset = (page - 1) * perPage;

    // Query to fetch paginated data
    let query = `
      SELECT 
        id, first_name, last_name, keycloak_id, employee_id, email, phone,
        email_verified_at, password, team_id, role_id, designation_id 
      FROM users 
      WHERE deleted_at IS NULL
      ${search ? 'AND (first_name LIKE ? OR email LIKE ?)' : ''}
      LIMIT ? OFFSET ?
    `;

    // Query to count total records
    let countQuery = `
      SELECT COUNT(*) AS total_records 
      FROM users 
      WHERE deleted_at IS NULL
      ${search ? 'AND (first_name LIKE ? OR email LIKE ?)' : ''}
    `;

    // Prepare query values
    const values = search ? [`%${search}%`, `%${search}%`, parseInt(perPage), parseInt(offset)] : [parseInt(perPage), parseInt(offset)];
    const countValues = search ? [`%${search}%`, `%${search}%`] : [];

    // Execute queries
    const [rows] = await db.query(query, values);
    const [countResult] = await db.query(countQuery, countValues);

    // Get total records and pagination details
    const totalRecords = countResult[0].total_records;
    const pagination = getPagination(page, perPage, totalRecords);

    // Add serial numbers to each row
    const data = rows.map((row, index) => ({
      s_no: offset + index + 1, // Calculate serial number
      ...row, // Include all user data
    }));

    // Send success response
    successResponse(res, data, data.length === 0 ? 'No users found' : 'Users retrieved successfully', 200, pagination);
  } catch (error) {
    console.error('Error retrieving users:', error.message);
    // Send error response
    return errorResponse(res, error.message, 'Error retrieving users', 500);
  }
};



// Update User
exports.updateUser = async (id, payload, res) => {
  const {
    first_name,last_name, employee_id, email, phone, email_verified_at,
    password, team_id, role_id, designation_id, remember_token,
    created_by, updated_by, created_at, updated_at, deleted_at
  } = payload;

  try {
    let query = `
      UPDATE users SET
        first_name = ?,last_name = ?, employee_id = ?, email = ?, phone = ?, email_verified_at = ?,
        team_id = ?, role_id = ?, designation_id = ?, remember_token = ?,
        created_by = ?, updated_by = ?, created_at = ?, updated_at = ?, deleted_at = ?
      WHERE id = ?
    `;

    const roleName = await getRoleName(role_id);

    let values = [
      first_name,last_name, employee_id, email, phone, email_verified_at,
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
    const [rows] = await db.query(selectQuery, [id]);

    if (rows.length === 0 || !rows[0].keycloak_id) {
      return errorResponse(res, null, 'User not found or Keycloak ID missing', 404);
    }

    const keycloakId = rows[0].keycloak_id;

    const updateQuery = `UPDATE users SET deleted_at = NOW() WHERE id = ?`;
    const [result] = await db.query(updateQuery, [id]);

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
  const [result] = await db.query(query, values);
  return result.length > 0 ? result[0].name : null;
};
