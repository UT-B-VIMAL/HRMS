const bcrypt = require('bcryptjs');
const db = require('../../config/db');
const { successResponse, errorResponse } = require('../../helpers/responseHelper');
const getPagination = require('../../helpers/pagination');
const { createUserInKeycloak,deleteUserInKeycloak,editUserInKeycloak } = require("../functions/keycloakFunction");

// Create User
exports.createUser = async (payload, res) => {
  const {
    first_name, last_name, employee_id, role_name, email, phone,
    password, team_id, role_id, designation_id,
    created_by = 1, updated_by = 1, created_at = new Date(), updated_at = new Date(), deleted_at = null
  } = payload;

  try {
    const hashedPassword = await bcrypt.hash(password, 10); // Hash the password

    const query = `
      INSERT INTO users (
        first_name, last_name, employee_id, email, phone,
        password, team_id, role_id, designation_id,
        created_by, updated_by, deleted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;

    const values = [
      first_name, last_name, employee_id, email, phone,
      hashedPassword, team_id, role_id, designation_id,
      created_by, updated_by, deleted_at, created_at, updated_at
    ];

    const [result] = await db.query(query, values); // Insert user into the database

    // const keycloakUserData = {
    //   username: employee_id,
    //   email: email,
    //   firstName: first_name, 
    //   lastName: last_name,
    //   enabled: true,
    //   emailVerified: true,
    //   credentials: [
    //     {
    //       type: "password",
    //       value: password,
    //       temporary: false
    //     }
    //   ],
    //   roleName: role_name
    // };

    // const userId = await createUserInKeycloak(keycloakUserData); // Create user in Keycloak

    // if (!userId) {
    //   return errorResponse(res, "Failed to create user in Keycloak", 'Error creating user in Keycloak', 500);
    // }

    // Update the user's Keycloak ID
    // const updateQuery = `UPDATE users SET keycloak_id = ? WHERE id = ?`;
    // const updateValues = [userId, result.insertId];
    // await db.query(updateQuery, updateValues);

    // Return success response
    return successResponse(res, { id: result.insertId, ...payload, keycloakUserId: /*userId*/null }, 'User created successfully', 201);

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

    const values = search ? [`%${search}%`, `%${search}%`, parseInt(perPage), parseInt(offset)] : [parseInt(perPage), parseInt(offset)];
    const countValues = search ? [`%${search}%`, `%${search}%`] : [];

    const [rows] = await db.query(query, values);
    const [countResult] = await db.query(countQuery, countValues);

    // Get total records and pagination details
    const totalRecords = countResult[0].total_records;
    const pagination = await getPagination(page, perPage, totalRecords);

    // Add serial numbers to each row
    const data = rows.map((row, index) => ({
      s_no: offset + index + 1,
      ...row,
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
    first_name,
    last_name,
    employee_id,
    email,
    phone,
    password,
    team_id,
    role_id,
    designation_id,
    updated_by = 1,
    updated_at = new Date(),
  } = payload;

  try {
    // Update query without updating created_at, deleted_at, remember_token, email_verified_at
    let query = `
      UPDATE users SET
        first_name = ?, last_name = ?, employee_id = ?, email = ?, phone = ?,
        team_id = ?, role_id = ?, designation_id = ?, updated_by = ?, updated_at = ? 
      WHERE id = ?
    `;

    // Values for the update, excluding the fields that should not be updated
    let values = [
      first_name,
      last_name,
      employee_id,
      email,
      phone,
      team_id,
      role_id,
      designation_id,
      updated_by,
      updated_at,
      id,
    ];

    // If password is provided, hash it and modify the query to update it
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      query = query.replace('first_name = ?,', 'first_name = ?, password = ?,');
      values.splice(5, 0, hashedPassword);  // Insert hashed password at the correct index
    }

    // Execute the update query
    const [result] = await db.query(query, values);

    // Prepare Keycloak user payload
    // const userPayload = {
    //   firstName: first_name, 
    //   lastName: last_name,  
    //   email: email,
    //   ...(password && { credentials: [{ type: "password", value: password, temporary: false }] }) // Add password if provided
    // };

    // Update user details in Keycloak
    // await editUserInKeycloak(keycloak_id, userPayload);

    // Check if any row was affected (i.e., if the user was found and updated)
    if (result.affectedRows === 0) {
      return errorResponse(res, null, 'User not found or no changes made', 404);
    }

    return successResponse(res, { id, ...payload }, 'User updated successfully');
  } catch (error) {
    console.error(error);
    return errorResponse(res, error.message, 'Error updating user', 500);
  }
};




// Delete User
exports.deleteUser = async (id, res) => {
  try {
    const selectQuery = `SELECT keycloak_id FROM users WHERE id = ?`;
    const [rows] = await db.query(selectQuery, [id]);

    // if (rows.length === 0 || !rows[0].keycloak_id) {
    //   return errorResponse(res, null, 'User not found or Keycloak ID missing', 404);
    // }

    // const keycloakId = rows[0].keycloak_id;

    const updateQuery = `UPDATE users SET deleted_at = NOW() WHERE id = ?`;
    const [result] = await db.query(updateQuery, [id]);

    if (result.affectedRows === 0) {
      return errorResponse(res, null, 'User not found', 204);
    }

    // await deleteUserInKeycloak(keycloakId);

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

