const bcrypt = require('bcryptjs');
const db = require('../../config/db');
const axios = require('axios');
const { successResponse, errorResponse } = require('../../helpers/responseHelper');
const getPagination = require('../../helpers/pagination');
const { uploadProfileFileToS3 } = require('../../config/s3');
const { createUserInKeycloak, deleteUserInKeycloak, editUserInKeycloak } = require("../functions/keycloakFunction");
const {
  getAuthUserDetails
} = require("../../api/functions/commonFunction");
const { getUserIdFromAccessToken } = require("../../api/utils/tokenUtils");


// Create User
exports.createUser = async (payload, res, req) => {
  const {
    first_name, last_name, employee_id, email,
    password, team_id, role_id, designation_id,
    created_by, created_at = new Date(), updated_at = new Date(), deleted_at = null
  } = payload;

  try {
    const accessToken = req.headers.authorization?.split(' ')[1];
    if (!accessToken) {
      return errorResponse(res, 'Access token is required', 401);
    }

    const userId = await getUserIdFromAccessToken(accessToken);

    // Format employee_id to 3 digits
    const formattedEmployeeId = String(employee_id).padStart(3, '0');

    const [existingUsers] = await db.query(
      `SELECT id FROM users WHERE employee_id = ? AND deleted_at IS NULL`,
      [formattedEmployeeId]
    );
    if (existingUsers.length > 0) {
      return errorResponse(res, "Employee ID already exists", "Duplicate entry", 400);
    }

    const [existingEmail] = await db.query(
      `SELECT id FROM users WHERE email = ? AND deleted_at IS NULL`,
      [email]
    );
    if (existingEmail.length > 0) {
      return errorResponse(res, "Email already exists", "Duplicate entry", 400);
    }

    const roleName = await getRoleName(role_id);

    const keycloakUserData = {
      username: formattedEmployeeId,
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

    const keycloakId = await createUserInKeycloak(keycloakUserData);
    if (!keycloakId) {
      return errorResponse(res, "Failed to create user in Keycloak", 'Error creating user in Keycloak', 500);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const insertQuery = `
    INSERT INTO users (
      first_name, last_name, employee_id, email,
      password, team_id, role_id, designation_id,
      created_by, keycloak_id, deleted_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
  `;

    const values = [
      first_name, last_name, formattedEmployeeId, email,
      hashedPassword, Array.isArray(team_id) ? team_id.join(',') : team_id, role_id, designation_id,
      userId, keycloakId, deleted_at
    ];

    const [result] = await db.query(insertQuery, values);

    return successResponse(
      res,
      { id: result.insertId, ...payload, employee_id: formattedEmployeeId, keycloakUserId: keycloakId },
      'User created successfully',
      201
    );

  } catch (error) {
    console.error('Error creating user:', error.message);
    return errorResponse(res, error.message, 'Error creating user', 500);
  }

};


// 👇 Upload image from URL
async function uploadImageFromUrlToS3(imageUrl, userId) {
  try {
    // Step 1: Download image as binary
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });

    const fileBuffer = Buffer.from(response.data, 'binary');

    // Step 2: Get file extension
    const extension = imageUrl.split('.').pop().split(/\#|\?/)[0].toLowerCase();
    const allowed = ['jpg', 'jpeg', 'png'];

    if (!allowed.includes(extension)) {
      console.warn(`Invalid file extension: ${extension}`);
      return null;
    }

    // Step 3: Create unique filename
    const filename = `${userId}_${Date.now()}.${extension}`;

    // Step 4: Upload to S3
    const s3Url = await uploadProfileFileToS3(fileBuffer, filename);

    return s3Url;
  } catch (err) {
    console.error('Image download/upload failed:', err.message);
    return null;
  }
}

exports.createUserWithoutRole = async (payload, res, req) => {
  const {
    first_name,
    last_name,
    employee_id,
    email,
    password,
    designation_name,
    gender,
    dob,
    blood_group,
    mobile_no,
    emergency_contact_name,
    emergency_contact_no,
    address,
    permanent_address,
    profile_img,
    created_by = 1,
    deleted_at = null,
  } = payload;

  try {
    const userId = created_by;
    const formattedEmployeeId = String(employee_id).padStart(3, '0');

    // Duplicate Checks
    const [existingUsers] = await db.query(
      `SELECT id FROM users WHERE employee_id = ? AND deleted_at IS NULL`,
      [formattedEmployeeId]
    );
    if (existingUsers.length > 0) {
      return errorResponse(res, 'Employee ID already exists', 'Duplicate entry', 400);
    }

    const [existingEmail] = await db.query(
      `SELECT id FROM users WHERE email = ? AND deleted_at IS NULL`,
      [email]
    );
    if (existingEmail.length > 0) {
      return errorResponse(res, 'Email already exists', 'Duplicate entry', 400);
    }

    // Keycloak registration
    const keycloakUserData = {
      username: formattedEmployeeId,
      email: email,
      firstName: first_name,
      lastName: last_name,
      enabled: true,
      emailVerified: true,
      credentials: [
        {
          type: 'password',
          value: password,
          temporary: false,
        },
      ],
    };

    const keycloakId = await createUserInKeycloak(keycloakUserData);
    if (!keycloakId || typeof keycloakId === 'object') {
      return errorResponse(res, 'Failed to create user in Keycloak', 'Keycloak error', 500);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Upload image if provided
    let uploadedProfileImageUrl = null;
    if (profile_img && profile_img.startsWith('http')) {
      uploadedProfileImageUrl = await uploadImageFromUrlToS3(profile_img, formattedEmployeeId);
    }

    // Insert into `users` table
    const userInsertQuery = `
      INSERT INTO users (
        first_name, last_name, employee_id, email,
        password, designation_id,
        created_by, keycloak_id, deleted_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;

    const userValues = [
      first_name,
      last_name,
      formattedEmployeeId,
      email,
      hashedPassword,
      designation_name,
      userId,
      keycloakId,
      deleted_at,
    ];

    const [userResult] = await db.query(userInsertQuery, userValues);
    const newUserId = userResult.insertId;

    // Insert into `user_profiles` table
    const profileInsertQuery = `
      INSERT INTO user_profiles (
        user_id, dob, gender, mobile_no,
        emergency_contact_name, emergency_contact_no,
        blood_group, address, permanent_address,
        profile_img, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;

    const profileValues = [
      newUserId,
      dob || null,
      gender || null,
      mobile_no || null,
      emergency_contact_name || null,
      emergency_contact_no || null,
      blood_group || null,
      address || null,
      permanent_address || null,
      uploadedProfileImageUrl || null,
    ];

    await db.query(profileInsertQuery, profileValues);

    return successResponse(
      res,
      {
        id: newUserId,
        employee_id: formattedEmployeeId,
        keycloak_user_id: keycloakId,
        profile_img: uploadedProfileImageUrl || null,
      },
      'User and profile created successfully',
      201
    );
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

exports.getAllUsers = async (req, res) => {
  try {
    const { search = '', page = 1, perPage = 10, team_id } = req.query;
    const currentPage = parseInt(page, 10);
    const perPageLimit = parseInt(perPage, 10);
    const offset = (currentPage - 1) * perPageLimit;

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
    `;

    let params = [];
    let searchValue = `%${search}%`;

    if (search.trim() !== '') {
      query += ` AND (
        CONCAT(u.first_name, ' ', u.last_name) LIKE ? OR 
        u.first_name LIKE ? OR 
        u.last_name LIKE ? OR 
        u.email LIKE ? OR 
        r.name LIKE ? OR 
        u.designation_id LIKE ? OR 
        u.employee_id LIKE ? OR 
        t.name LIKE ?
      )`;
      params.push(searchValue, searchValue, searchValue, searchValue, searchValue, searchValue, searchValue, searchValue);
    }

    if (team_id) {
      query += ` AND FIND_IN_SET(?, u.team_id)`;
      params.push(team_id);
    }


    query += ` ORDER BY u.id DESC LIMIT ? OFFSET ?`;
    params.push(perPageLimit, offset);

    let countQuery = `
      SELECT COUNT(*) AS total_records 
      FROM users u
      LEFT JOIN teams t ON t.id = u.team_id
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.deleted_at IS NULL
    `;

    let countParams = [];
    if (search.trim() !== '') {
      countQuery += ` AND (
        CONCAT(u.first_name, ' ', u.last_name) LIKE ? OR 
        u.first_name LIKE ? OR 
        u.last_name LIKE ? OR 
        u.email LIKE ? OR 
        r.name LIKE ? OR 
        u.designation_id LIKE ? OR 
        t.name LIKE ?
      )`;
      countParams.push(searchValue, searchValue, searchValue, searchValue, searchValue, searchValue, searchValue);
    }

    if (team_id) {
      countQuery += ` AND FIND_IN_SET(?, u.team_id)`;
      countParams.push(team_id);
    }


    // Execute the queries
    const [users] = await db.query(query, params);
    const [countResult] = await db.query(countQuery, countParams);

    const totalRecords = countResult[0].total_records;
    const pagination = getPagination(currentPage, perPageLimit, totalRecords);

    const data = users.map((user, index) => ({
      s_no: offset + index + 1,
      ...user,
    }));

    return successResponse(res, data, data.length === 0 ? 'No users found' : 'Users retrieved successfully', 200, pagination);
  } catch (error) {
    console.error('Error retrieving users:', error.message);
    return errorResponse(res, error.message, 'Error retrieving users', 500);
  }
};

exports.updateUser = async (id, payload, res, req) => {
  const {
    first_name,
    last_name,
    keycloak_id,
    email,
    employee_id,
    team_id,
    role_id,
    designation_id,
    updated_by,
    updated_at = new Date(),
  } = payload;

  try {

    const accessToken = req.headers.authorization?.split(' ')[1];
    if (!accessToken) {
      return errorResponse(res, 'Access token is required', 401);
    }
    const userId = await getUserIdFromAccessToken(accessToken);

    const [user] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
    if (user.length === 0) {
      console.log('User not found for ID:', id);
      return errorResponse(res, null, 'User not found', 404);
    }
    const duplicateupdateCheckQuery = `
  SELECT id FROM users 
  WHERE employee_id = ? AND id != ? AND deleted_at IS NULL 
  LIMIT 1
`;
    const [existingUsers] = await db.query(duplicateupdateCheckQuery, [employee_id, id]);

    if (existingUsers.length > 0) {
      return errorResponse(res, "Employee ID already exists", "Duplicate entry", 400);
    }



    // Check for duplicate email
    const duplicateemailCheckQuery = `
  SELECT id FROM users 
  WHERE email = ? AND id != ? AND deleted_at IS NULL 
  LIMIT 1
`;
    const [existingemail] = await db.query(duplicateemailCheckQuery, [email, id]);

    if (existingemail.length > 0) {
      return errorResponse(res, "Email already exists", "Duplicate entry", 400);
    }

    let query = `
    UPDATE users SET
      first_name = ?, last_name = ?, email = ?,employee_id = ?,
      team_id = ?, role_id = ?, designation_id = ?, updated_by = ?, updated_at = NOW() 
    WHERE id = ?
  `;


    let values = [
      first_name,
      last_name,
      email,
      employee_id,
      Array.isArray(team_id) ? team_id.join(',') : team_id,
      role_id,
      designation_id,
      userId,
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
    const userDetails = await getAuthUserDetails(id, res);
    const role_id = userDetails.role_id;

    if (role_id === 3) {
      const [reportingTeams] = await db.query(
        `SELECT COUNT(*) AS team_lead_count FROM teams WHERE reporting_user_id = ? AND deleted_at IS NULL`,
        [id]
      );

      if (reportingTeams[0].team_lead_count > 0) {
        return errorResponse(res, null, 'This user is a Team Lead for one or more teams', 400);
      }
    }

    if (role_id === 2) {
      const [assignedTasks] = await db.query(
        `SELECT COUNT(*) AS task_mgr_count FROM tasks WHERE assigned_user_id = ? AND deleted_at IS NULL`,
        [id]
      );

      const [assignedSubTasks] = await db.query(
        `SELECT COUNT(*) AS subtask_mgr_count FROM sub_tasks WHERE assigned_user_id = ? AND deleted_at IS NULL`,
        [id]
      );

      if (
        assignedTasks[0].task_mgr_count > 0 ||
        assignedSubTasks[0].subtask_mgr_count > 0
      ) {
        return errorResponse(res, null, 'This user is a Manager for tasks or sub-tasks', 400);
      }
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
    const query = "SELECT group_name FROM roles WHERE id = ?";
    const values = [roleId];
    const [result] = await db.query(query, values);


    if (result.length === 0) {
      console.log(`No role found for roleId: ${roleId}`);
      return null;
    }

    return result[0].group_name;
  } catch (error) {
    console.error('Error fetching role name:', error.message);
    return null;
  }
};


