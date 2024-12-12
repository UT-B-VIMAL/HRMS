const bcrypt = require('bcryptjs');
const db = require('../../config/db');
const { successResponse, errorResponse } = require('../../helpers/responseHelper');
const getPagination = require('../../helpers/pagination');
const { createUserInKeycloak, deleteUserInKeycloak, editUserInKeycloak } = require("../functions/keycloakFunction");

// Create User
exports.createUser = async (payload, res) => {
  const {
    first_name, last_name, employee_id, role_name, email, phone,
    password, team_id, role_id, designation_id,
    created_by = 1, updated_by = 1, created_at = new Date(), updated_at = new Date(), deleted_at = null
  } = payload;

  try {
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert the user into the database
    const query = `
  INSERT INTO users (
    first_name, last_name, employee_id, email, phone,
    password, team_id, role_id, designation_id,
    created_by, updated_by, deleted_at, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NOW(), NOW())
`;

    const values = [
      first_name, last_name, employee_id, email, phone,
      hashedPassword, team_id, role_id, designation_id,
      created_by, updated_by
    ];
    const [result] = await db.query(query, values);

    // Prepare Keycloak user data
    const keycloakUserData = {
      username: employee_id,
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
      ],
      roleName: role_name
    };

    // Create the user in Keycloak
    const userId = await createUserInKeycloak(keycloakUserData);

    // If Keycloak user creation fails
    if (!userId) {
      return errorResponse(res, "Failed to create user in Keycloak", 'Error creating user in Keycloak', 500);
    }

    // Update the user in the database with the Keycloak ID
    const updateQuery = `UPDATE users SET keycloak_id = ? WHERE id = ?`;
    const updateValues = [userId, result.insertId];
    await db.query(updateQuery, updateValues); // Execute the update query

    // Respond with success
    return successResponse(res, { id: result.insertId, ...payload, keycloakUserId: userId }, 'User created successfully', 201);

  } catch (error) {
    // Handle errors and respond accordingly
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
    const { search = '', page = 1, perPage = 10 } = req.query;
    const offset = (page - 1) * perPage;

    let query = `
      SELECT 
        id, first_name, last_name, keycloak_id, employee_id, email, phone,
        email_verified_at, password, team_id, role_id, designation_id 
      FROM users 
      WHERE deleted_at IS NULL
      ${search ? 'AND (first_name LIKE ? OR email LIKE ?)' : ''}
      LIMIT ? OFFSET ?
    `;

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

    const totalRecords = countResult[0].total_records;
    const pagination = await getPagination(page, perPage, totalRecords);

    const data = rows.map((row, index) => ({
      s_no: offset + index + 1,
      ...row,
    }));

    successResponse(res, data, data.length === 0 ? 'No users found' : 'Users retrieved successfully', 200, pagination);
  } catch (error) {
    console.error('Error retrieving users:', error.message);
    return errorResponse(res, error.message, 'Error retrieving users', 500);
  }
};



// Update User
exports.updateUser = async (id, payload, res) => {
  const {
    first_name,
    last_name,
    keycloak_id,
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
    // Check if the user exists
    const [user] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
  if (user.length === 0) {
    console.log('User not found for ID:', id);
    return errorResponse(res, null, 'User not found', 404);
  }

  let query = `
    UPDATE users SET
      first_name = ?, last_name = ?, email = ?, phone = ?,
      team_id = ?, role_id = ?, designation_id = ?, updated_by = ?, updated_at = NOW() 
    WHERE id = ?
  `;


  let values = [
    first_name,
    last_name,
    email,
    phone,
    team_id,
    role_id,
    designation_id,
    updated_by,
    id,
  ];

  if (password) {
    const hashedPassword = await bcrypt.hash(password, 10);
    query = `
      UPDATE users SET
        first_name = ?, last_name = ?, password = ?, email = ?, phone = ?,
        team_id = ?, role_id = ?, designation_id = ?, updated_by = ?, updated_at = NOW() 
      WHERE id = ?
    `;
    values.splice(2, 0, hashedPassword);
  }

  console.log('Update query:', query);
  console.log('Values:', values);

  const result = await db.query(query, values);
  console.log('Query result:', result);

  if (result.affectedRows === 0) {
    return errorResponse(res, null, 'No rows were updated. Please check the provided ID.', 404);
  }

    // Prepare the payload for Keycloak
    const userPayload = {
      firstName: first_name,
      lastName: last_name,
      email: email,
      ...(password && { credentials: [{ type: "password", value: password, temporary: false }] })
    };

    // Update user in Keycloak
    await editUserInKeycloak(keycloak_id, userPayload);

    return successResponse(res, { id, ...payload }, 'User updated successfully');
  } catch (error) {
    console.error('Error:', error.message);
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

