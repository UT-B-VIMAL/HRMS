// services/userService.js
const db = require('../../config/db'); // Your database connection
const { successResponse, errorResponse } = require('../../helpers/responseHelper');

// Insert user logic
exports.insertUser = async (payload, res) => {
  const { user_name, employee_id } = payload;
  try {
    const query = 'INSERT INTO users (user_name, employee_id) VALUES (?, ?)';
    const values = [user_name, employee_id];
    const [result] = await db.promise().query(query, values);

    return successResponse(res, {
      id: result.insertId,
      user_name,
      employee_id
    }, 'User added successfully', 201);
  } catch (error) {
    return errorResponse(res, error.message, 'Error inserting user', 500);
  }
};

// Update user logic
exports.updateUser = async (payload, res) => {
  const { id, user_name, employee_id } = payload;
  try {
    const query = 'UPDATE users SET user_name = ?, employee_id = ? WHERE id = ?';
    const values = [user_name, employee_id, id];
    const [result] = await db.promise().query(query, values);

    if (result.affectedRows === 0) {
      return errorResponse(res, null, 'User not found', 404);
    }

    return successResponse(res, { id, user_name, employee_id }, 'User updated successfully');
  } catch (error) {
    return errorResponse(res, error, 'Error updating user', 500);
  }
};

// Delete user logic
exports.deleteUser = async (payload, res) => {
  const { id } = payload;
  try {
    const query = 'DELETE FROM users WHERE id = ?';
    const values = [id];
    const [result] = await db.promise().query(query, values);

    if (result.affectedRows === 0) {
      return errorResponse(res, null, 'User not found', 404);
    }

    return successResponse(res, null, 'User deleted successfully');
  } catch (error) {
    return errorResponse(res, error, 'Error deleting user', 500);
  }
};
