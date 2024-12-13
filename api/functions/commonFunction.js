const db = require('../../config/db');
const { successResponse, errorResponse } = require('../../helpers/responseHelper');

exports.getAllData = async (payload, res) => {
    const { type, id } = payload;

    let query = "";
    let queryParams = [];

    if (type === "teams") {
        query = "SELECT id,name FROM teams WHERE deleted_at IS NULL";
    } else if (type === "users") {
        query = "SELECT id,first_name as name FROM users WHERE deleted_at IS NULL";
    } else if (type === "products") {
        query = "SELECT id,name FROM products WHERE deleted_at IS NULL";
    }  else if (type === "projects") {
        query = "SELECT id,name FROM projects WHERE deleted_at IS NULL";
    } else if (type === "tasks") {
        query = "SELECT id,name FROM tasks WHERE deleted_at IS NULL";
    }else if (type === "designations") {
        query = "SELECT id,name FROM designations WHERE deleted_at IS NULL";
    } else {
        return res.status(400).json({
            message: "Invalid type provided",
        });
    }

    // If an id is provided, add the WHERE clause to the query
    if (type === "projects" && id) {
        query += " AND product_id = ?";
        queryParams.push(id);
    }
    if (type === "tasks" && id) {
        query += " AND project_id = ?";
        queryParams.push(id);
    }

    query += " ORDER BY `created_at` DESC";

    try {
        const [rows] = await db.query(query, queryParams);

        return successResponse(
            res,
            rows,
            rows.length === 0 ? `${type.charAt(0).toUpperCase() + type.slice(1)} not found` : `${type.charAt(0).toUpperCase() + type.slice(1)} fetched successfully`,
            200,
        );
    } catch (err) {
            return errorResponse(res, err.message, 'Error fetching Data', 500);
    }
};
