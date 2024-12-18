const db = require('../../config/db');
const { successResponse, errorResponse } = require('../../helpers/responseHelper');

exports.getAllData = async (payload, res) => {
    const { type, id } = payload;

    let query = "";
    let queryParams = [];

    if (type === "teams") {
        query = "SELECT id, name FROM teams WHERE deleted_at IS NULL";
    } else if (type === "users") {
        query = "SELECT id, first_name AS name FROM users WHERE deleted_at IS NULL";
    } else if (type === "products") {
        query = "SELECT id, name FROM products WHERE deleted_at IS NULL";
    } else if (type === "projects") {
        query = "SELECT id, name FROM projects WHERE deleted_at IS NULL";
    } else if (type === "tasks") {
        query = "SELECT id, name FROM tasks WHERE deleted_at IS NULL";
    } else if (type === "designations") {
        query = "SELECT id, name FROM designations WHERE deleted_at IS NULL";
    } else if (type === "roles") {
        query = "SELECT id, name FROM roles";
    } else if (type === "owners") {
        query = "SELECT id, first_name AS name FROM users WHERE deleted_at IS NULL AND role_id != 4";
    } else if (type === "assignee") {
        query = "SELECT id, first_name AS name FROM users WHERE deleted_at IS NULL";
    } else {
        return res.status(400).json({
            message: "Invalid type provided",
        });
    }

    // Append additional conditions based on `id`
    if (type === "projects" && id) {
        query += " AND product_id = ?";
        queryParams.push(id);
    }
    if (type === "assignee" && id) {
        query += " AND team_id = ?";
        queryParams.push(id);
    }
    if (type === "tasks" && id) {
        query += " AND project_id = ?";
        queryParams.push(id);
    }

    query += " ORDER BY `id` DESC";

    try {
        const [rows] = await db.query(query, queryParams);

        return successResponse(
            res,
            rows,
            rows.length === 0
                ? `${type.charAt(0).toUpperCase() + type.slice(1)} not found`
                : `${type.charAt(0).toUpperCase() + type.slice(1)} fetched successfully`,
            200
        );
    } catch (err) {
        return errorResponse(res, err.message, "Error fetching Data", 500);
    }
};
exports.getAuthUserDetails = async (authUserId, res) => {
    try {
      const authUserQuery = "SELECT * FROM users WHERE deleted_at IS NULL AND id = ?";
      const [authUserDetails] = await db.query(authUserQuery, [authUserId]);
  
      if (!authUserDetails || authUserDetails.length === 0) {
        // Send error response and return immediately
        return errorResponse(
          res,
          "User not found",
          'User not found',
          404 // Return a 404 as user is not found
        );
      }
  
      // Return the first user object if found
      return authUserDetails[0];
    } catch (error) {
      // Catch any error and return error response
      return errorResponse(res, error.message, 'Error fetching User', 500);
    }
  };
  
  
  
  