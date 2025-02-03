const bcrypt = require('bcryptjs');
const db = require('../../config/db');
const { successResponse, errorResponse } = require('../../helpers/responseHelper');
const getPagination = require('../../helpers/pagination');
const { createUserInKeycloak, deleteUserInKeycloak, editUserInKeycloak } = require("../functions/keycloakFunction");

// Create User
exports.createUser = async (payload, res) => {
  const {
    first_name, last_name, employee_id, email, phone,
    password, team_id, role_id, designation_id,
    created_by, created_at = new Date(), updated_at = new Date(), deleted_at = null
  } = payload;

  try {

    const duplicateCheckQuery = `SELECT id FROM users WHERE employee_id = ? AND deleted_at IS NULL`;
    const [existingUsers] = await db.query(duplicateCheckQuery, [employee_id]);

    if (existingUsers.length > 0) {
      return errorResponse(res, "Employee ID already exists", "Duplicate entry", 400);
    }

    const duplicateemailCheckQuery = `SELECT id FROM users WHERE email = ? AND deleted_at IS NULL`;
    const [existingemail] = await db.query(duplicateemailCheckQuery, [email]);

    if (existingemail.length > 0) {
      return errorResponse(res, "Email already exists", "Duplicate entry", 400);
    }
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert the user into the database
    const query = `  
      INSERT INTO users (
        first_name, last_name, employee_id, email, phone,
        password, team_id, role_id, designation_id,
        created_by, deleted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;

    const values = [
      first_name, last_name, employee_id, email, phone,
      hashedPassword, team_id, role_id, designation_id,
      created_by, deleted_at
    ];
    const [result] = await db.query(query, values);
    
    const roleName = await getRoleName(role_id);

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
      roleName: roleName
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

    // Construct the query with proper handling of search terms
    let query = `
      SELECT 
        u.id, 
        u.employee_id, 
        u.first_name, u.last_name, 
        u.role_id,
        r.name AS role_name, 
        u.designation_id, 
        u.email,
        u.team_id,
        u.keycloak_id, 
        t.name AS team_name
      FROM users u
      LEFT JOIN teams t ON t.id = u.team_id
      LEFT JOIN roles r ON r.id = u.role_id
      LEFT JOIN designations d ON d.id = u.designation_id
      WHERE u.deleted_at IS NULL
      ${search ? `AND (
        CONCAT(u.first_name, ' ', u.last_name) LIKE ? OR 
        u.first_name LIKE ? OR 
        u.last_name LIKE ? OR 
        u.email LIKE ? OR 
        r.name LIKE ? OR 
        u.designation_id LIKE ? OR 
        t.name LIKE ?
      )` : ''}
      ORDER BY u.id DESC
      LIMIT ? OFFSET ?
    `;

    // Query to count the total records
    let countQuery = `
      SELECT COUNT(*) AS total_records 
      FROM users u
      LEFT JOIN teams t ON t.id = u.team_id
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.deleted_at IS NULL
      ${search ? `AND (
        CONCAT(u.first_name, ' ', u.last_name) LIKE ? OR 
        u.first_name LIKE ? OR 
        u.last_name LIKE ? OR 
        u.email LIKE ? OR 
        r.name LIKE ? OR 
        u.designation_id LIKE ? OR 
        t.name LIKE ?
      )` : ''}
    `;

    // Prepare the values to be used in the query
    const values = search 
      ? [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, parseInt(perPage), parseInt(offset)]
      : [parseInt(perPage), parseInt(offset)];

    const countValues = search 
      ? [`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`]
      : [];

    // Execute the queries
    const [rows] = await db.query(query, values);
    const [countResult] = await db.query(countQuery, countValues);

    const totalRecords = countResult[0].total_records;
    const pagination = await getPagination(page, perPage, totalRecords);

    // Map the rows with serial number
    const data = rows.map((row, index) => ({
      s_no: offset + index + 1,
      ...row,
    }));

    // Send the response
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
    employee_id,
    team_id,
    role_id,
    designation_id,
    updated_by,
    updated_at = new Date(),
  } = payload;

  try {
    // Check if the user exists
    const [user] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
  if (user.length === 0) {
    console.log('User not found for ID:', id);
    return errorResponse(res, null, 'User not found', 404);
  }

  const duplicateCheckQuery = `SELECT id FROM users WHERE employee_id = ? AND id != ? AND deleted_at IS NULL`;
    const [existingUsers] = await db.query(duplicateCheckQuery, [employee_id, id]);

    if (existingUsers.length > 0) {
      return errorResponse(res, "Employee ID already exists", "Duplicate entry", 400);
    }

    const duplicateemailCheckQuery = `SELECT id FROM users WHERE email = ? AND id != ? AND deleted_at IS NULL`;
    const [existingemail] = await db.query(duplicateemailCheckQuery, [email, id]);

    if (existingemail.length > 0) {
      return errorResponse(res, "Email already exists", "Duplicate entry", 400);
    }

  let query = `
    UPDATE users SET
      first_name = ?, last_name = ?, email = ?, phone = ?,employee_id = ?,
      team_id = ?, role_id = ?, designation_id = ?, updated_by = ?, updated_at = NOW() 
    WHERE id = ?
  `;


  let values = [
    first_name,
    last_name,
    email,
    phone,
    employee_id,
    team_id,
    role_id,
    designation_id,
    updated_by,
    id,
  ];


  const result = await db.query(query, values);
  const roleName = await getRoleName(role_id);

  if (result.affectedRows === 0) {
    return errorResponse(res, null, 'No rows were updated. Please check the provided ID.', 404);
  }

    const userPayload = {
      username: employee_id,
      firstName: first_name,
      lastName: last_name,
      email: email,
      roleName: roleName
    };

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

    const checkTasksQuery = `SELECT COUNT(*) AS task_count FROM tasks WHERE user_id = ? AND deleted_at IS NULL`;
    const [taskRows] = await db.query(checkTasksQuery, [id]);

    if (taskRows[0].task_count > 0) {
      return errorResponse(res, null, 'User has tasks', 400);
    }

    const checkSubTasksQuery = `SELECT COUNT(*) AS subtask_count FROM sub_tasks WHERE user_id = ? AND deleted_at IS NULL`;
    const [subTaskRows] = await db.query(checkSubTasksQuery, [id]);

    if (subTaskRows[0].subtask_count > 0) {
      return errorResponse(res, null, 'User has sub-tasks', 400);
    }

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
  try {
    const query = "SELECT role FROM roles WHERE id = ?"; // Select 'role' column
    const values = [roleId];
    const [result] = await db.query(query, values);

    console.log("Query Result:", result); // Log the result for debugging

    if (result.length === 0) {
      console.log(`No role found for roleId: ${roleId}`);
      return null;  // Or you can return a default role or throw an error
    }

    return result[0].role;
  } catch (error) {
    console.error('Error fetching role name:', error.message);
    return null;  // Or handle error as needed
  }
};


