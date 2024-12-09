const bcrypt = require('bcryptjs');
const db = require('../../config/db');
const { errorResponse, successResponse } = require('../../helpers/responseHelper');

exports.changePassword = async (id, payload, res) => {
    const { current_password, new_password } = payload;

    try {
        const query = `SELECT id, name, email, password FROM users WHERE id = ?`;
        const [user] = await db.query(query, [id]);

        if (!user || user.length === 0) {
            return errorResponse(res, null, 'User not found', 404);
        }

        const currentUser = user[0]; 
  
  const isPasswordCorrect = await bcrypt.compare(current_password, currentUser.password);

  if (!isPasswordCorrect) {
      return errorResponse(res, null, 'The current password is incorrect', 400);
  }

        const hashedPassword = await bcrypt.hash(new_password, 10);

        const updateQuery = `UPDATE users SET password = ? WHERE id = ?`;
        const [result] = await db.query(updateQuery, [hashedPassword, id]);

        if (result.affectedRows === 0) {
            return errorResponse(res, null, 'User not found or password not updated', 500);
        }

        return successResponse(res, { id, ...payload }, 'Password updated successfully');
    } catch (error) {
        return errorResponse(res, error.message, 'Error updating password', 500);
    }
};
