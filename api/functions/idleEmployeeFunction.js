const db = require("../../config/db");
const {
  successResponse,
  errorResponse,
  getPagination,
} = require("../../helpers/responseHelper");
const moment = require("moment");

exports.get_idleEmployee = async (req, res) => {
  try {
    const { user_id, team_id, page = 1, perPage = 10 } = req.query;

    // Ensure page and perPage are integers
    const pageNumber = parseInt(page, 10);
    const perPageNumber = parseInt(perPage, 10);
    const offset = (pageNumber - 1) * perPageNumber;

    // Fetch user details
    const [[user]] = await db.query(
      "SELECT id, role_id, team_id FROM users WHERE id = ?",
      [user_id]
    );
    if (!user) {
      return errorResponse(res, "User not found", "Invalid user", 404);
    }

    let queryParams = [];
    let teamIds = [];

    if (user.role_id === 3) {
      // Fetch teams managed by the user
      const [rows] = await db.query(
        "SELECT id FROM teams WHERE deleted_at IS NULL AND reporting_user_id = ?",
        [user_id]
      );
      teamIds = rows.length > 0 ? rows.map((row) => row.id) : [user.team_id];
    }

    let query = `
        SELECT users.id, users.employee_id,
            COALESCE(CONCAT(COALESCE(users.first_name, ''), ' ', COALESCE(NULLIF(users.last_name, ''), '')), '') AS user_name,
            users.team_id, users.role_id,
            teams.name AS team_name
        FROM users
        LEFT JOIN teams ON users.team_id = teams.id
        WHERE NOT EXISTS (
            SELECT 1
            FROM sub_tasks_user_timeline
            WHERE sub_tasks_user_timeline.user_id = users.id
            AND DATE(sub_tasks_user_timeline.start_time) = CURRENT_DATE
            AND sub_tasks_user_timeline.end_time IS NULL
        )
        AND NOT EXISTS (
            SELECT 1
            FROM employee_leave
            WHERE employee_leave.user_id = users.id
            AND DATE(employee_leave.date) = CURRENT_DATE
        )
    `;

    if (team_id) {
      query += ` AND users.team_id = ?`;
      queryParams.push(team_id);
    } else if (user.role_id === 3) {
      query += ` AND users.id != ${user_id} AND users.team_id IN (${teamIds.map(() => "?").join(",")})`;
      queryParams.push(...teamIds);
    }else if(user.role_id == 2) 
    {
      query += ` AND users.role_id != ${user.role_id} AND users.role_id != 1`;
    }

    // Add pagination
    query += ` ORDER BY users.id DESC LIMIT ? OFFSET ?`;
    queryParams.push(perPageNumber, offset);

    // **Count query for pagination**
    let countQuery = `
        SELECT COUNT(*) AS total_records
        FROM users
        LEFT JOIN teams ON users.team_id = teams.id
        WHERE NOT EXISTS (
            SELECT 1
            FROM sub_tasks_user_timeline
            WHERE sub_tasks_user_timeline.user_id = users.id
            AND DATE(sub_tasks_user_timeline.start_time) = CURRENT_DATE
            AND sub_tasks_user_timeline.end_time IS NULL
        )
        AND NOT EXISTS (
            SELECT 1
            FROM employee_leave
            WHERE employee_leave.user_id = users.id
            AND DATE(employee_leave.date) = CURRENT_DATE
        )
    `;

    let countQueryParams = [];

    if (team_id) {
      countQuery += ` AND users.team_id = ?`;
      countQueryParams.push(team_id);
    } else if (user.role_id === 3) {
      countQuery += ` AND users.id != ${user_id} AND users.team_id IN (${teamIds.map(() => "?").join(",")})`;
      countQueryParams.push(...teamIds);
    } else if(user.role_id == 2) 
    {
      countQuery += ` AND users.role_id != ${user.role_id} AND users.role_id !=1`;
    }

    // Execute queries
    const [result] = await db.query(query, queryParams);
    const [countResult] = await db.query(countQuery, countQueryParams);

    const totalRecords = countResult[0]?.total_records || 0;

    // **Calculate pagination**
    const pagination = getPagination(pageNumber, perPageNumber, totalRecords);

    // **Add serial numbers to results**
    const data = result.map((row, index) => ({
      s_no: offset + index + 1,
      ...row,
    }));

    successResponse(
      res,
      data,
      data.length === 0
        ? "No idle employees found"
        : "Idle employees retrieved successfully",
      200,
      pagination
    );
  } catch (error) {
    console.error("Caught Error:", error);
    return errorResponse(
      res,
      error.message || "An unknown error occurred",
      "Error retrieving idle employees",
      500
    );
  }
};

