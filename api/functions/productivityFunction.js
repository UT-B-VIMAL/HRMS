const db = require("../../config/db");
const {
  successResponse,
  errorResponse,
  getPagination,
} = require("../../helpers/responseHelper");
const moment = require("moment");

// function convertSecondsToReadableTime(totalSeconds) {
//   if (!totalSeconds || isNaN(totalSeconds)) return "0h 0m 0s";
//   const days = Math.floor(totalSeconds / 86400);
//   const hours = Math.floor((totalSeconds % 86400) / 3600);
//   const minutes = Math.floor((totalSeconds % 3600) / 60);
//   const seconds = totalSeconds % 60;

//   return `${days > 0 ? days + "d " : ""}${hours}h ${minutes}m ${seconds}s`;
// }
function convertSecondsToReadableTime(totalSeconds) {
  if (!totalSeconds || isNaN(totalSeconds)) return "0h 0m 0s";

  const secondsInDay = 8 * 3600; // 1 day = 8 hours
  const days = Math.floor(totalSeconds / secondsInDay);
  const hours = Math.floor((totalSeconds % secondsInDay) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${days > 0 ? days + "d " : ""}${hours}h ${minutes}m ${seconds}s`;
}

exports.getTeamwiseProductivity = async (req, res) => {
  try {
    const {
      team_id,
      from_date,
      to_date,
      employee_id,
      search,
      page = 1,
      perPage = 10,
    } = req.query;
    const offset = (page - 1) * perPage;

    if (from_date && to_date) {
      if (!moment(from_date, 'YYYY-MM-DD', true).isValid() || !moment(to_date, 'YYYY-MM-DD', true).isValid()) {
        return errorResponse(res, "Invalid date format", "Dates must be in YYYY-MM-DD format", 400);
      }
      if (moment(to_date).isBefore(moment(from_date))) {
        return errorResponse(res, "Invalid date range", "End date must be greater than or equal to Start date", 400);
      }
    } else if (from_date && !moment(from_date, 'YYYY-MM-DD', true).isValid()) {
      return errorResponse(res, "Invalid from_date format", "Start date must be in YYYY-MM-DD format", 400);
    } else if (to_date && !moment(to_date, 'YYYY-MM-DD', true).isValid()) {
      return errorResponse(res, "Invalid to_date format", "End date must be in YYYY-MM-DD format", 400);
    }

    const dateCondition =
      from_date && to_date
        ? `AND combined.updated_at BETWEEN ? AND ?`
        : from_date
          ? `AND combined.updated_at >= ?`
          : to_date
            ? `AND combined.updated_at <= ?`
            : "";
    // Task query
    const taskQuery = `
      SELECT 
          t.user_id,
          t.team_id,
          TIME_TO_SEC(t.estimated_hours) AS estimated_seconds,
          TIME_TO_SEC(t.total_hours_worked) AS worked_seconds,
          TIME_TO_SEC(t.extended_hours) AS extended_seconds,
          t.updated_at
      FROM 
          tasks t
      WHERE 
          t.deleted_at IS NULL
           AND t.estimated_hours != '00:00:00'
          AND NOT EXISTS (
              SELECT 1 FROM sub_tasks st 
              WHERE st.task_id = t.id 
              AND st.deleted_at IS NULL
          )
    `;

    // Subtask query
    const subtaskQuery = `
      SELECT 
          st.user_id,
          st.team_id,
          TIME_TO_SEC(st.estimated_hours) AS estimated_seconds,
          TIME_TO_SEC(st.total_hours_worked) AS worked_seconds,
          TIME_TO_SEC(st.extended_hours) AS extended_seconds,
          st.updated_at
      FROM 
          sub_tasks st
      WHERE 
          st.deleted_at IS NULL
            AND st.estimated_hours != '00:00:00'
    `;

    // Main query
    let query = `
      SELECT 
          MAX(combined.updated_at) AS updated_at,
          u.id AS user_id,
          COALESCE(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(NULLIF(u.last_name, ''), '')), 'Unknown User') AS employee_name,
          u.employee_id,
          combined.team_id,
          COALESCE(SUM(combined.estimated_seconds), 0) AS total_estimated_seconds,
          COALESCE(SUM(combined.worked_seconds), 0) AS total_worked_seconds,
          COALESCE(SUM(combined.extended_seconds), 0) AS total_extended_seconds
      FROM users u
      LEFT JOIN (
          (${taskQuery})
          UNION ALL
          (${subtaskQuery})
      ) AS combined ON u.id = combined.user_id
      WHERE u.deleted_at IS NULL
      ${team_id ? `AND combined.team_id = ?` : ""}
      ${dateCondition}
      ${employee_id ? `AND u.employee_id = ?` : ""}
      ${search
        ? `AND (u.employee_id LIKE ? OR CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(NULLIF(u.last_name, ''), '')) LIKE ?)`
        : ""}
    `;

    const queryParams = [];

    if (team_id) queryParams.push(team_id);
    if (from_date && to_date) {
      queryParams.push(`${from_date} 00:00:00`);
      queryParams.push(`${to_date} 23:59:59`);
    } else if (from_date) {
      queryParams.push(`${from_date} 00:00:00`);
    } else if (to_date) {
      queryParams.push(`${to_date} 23:59:59`);
    }

    if (employee_id) queryParams.push(employee_id);
    if (search) {
      queryParams.push(`%${search}%`);
      queryParams.push(`%${search}%`);
    }

    // Append GROUP BY and ORDER BY
    query += `
      GROUP BY u.id, u.first_name, u.last_name, u.employee_id, combined.team_id
      ORDER BY updated_at DESC
      LIMIT ${parseInt(perPage)} OFFSET ${parseInt(offset)}
    `;

    // Count query (same logic, without LIMIT)
    let countQuery = `
      SELECT COUNT(DISTINCT u.id) AS total_users
      FROM users u
      LEFT JOIN (
          (${taskQuery})
          UNION ALL
          (${subtaskQuery})
      ) AS combined ON u.id = combined.user_id
      WHERE u.deleted_at IS NULL
      ${team_id ? `AND combined.team_id = ?` : ""}
      ${dateCondition}
      ${employee_id ? `AND u.employee_id = ?` : ""}
      ${search
        ? `AND (u.employee_id LIKE ? OR CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(NULLIF(u.last_name, ''), '')) LIKE ?)`
        : ""}
    `;

    const countParams = [];
    if (team_id) countParams.push(team_id);
    if (from_date && to_date) {
      countParams.push(`${from_date} 00:00:00`);
      countParams.push(`${to_date} 23:59:59`);
    } else if (from_date) {
      countParams.push(`${from_date} 00:00:00`);
    } else if (to_date) {
      countParams.push(`${to_date} 23:59:59`);
    }
    if (employee_id) countParams.push(employee_id);
    if (search) {
      countParams.push(`%${search}%`);
      countParams.push(`%${search}%`);
    }

    // Execute queries
    const [results] = await db.query(query, queryParams);
    const [countResults] = await db.query(countQuery, countParams);

    const totalUsers = countResults[0].total_users;

    const data = results.map((item, index) => ({
      s_no: offset + index + 1,
      updated_at: item.updated_at,
      employee_name: item.employee_name,
      employee_id: item.employee_id,
      team_id: item.team_id || null,
      total_estimated_hours: convertSecondsToReadableTime(item.total_estimated_seconds),
      total_worked_hours: convertSecondsToReadableTime(item.total_worked_seconds),
      total_extended_hours: convertSecondsToReadableTime(item.total_extended_seconds),
    }));

    const pagination = getPagination(page, perPage, totalUsers);

    successResponse(
      res,
      data,
      data.length === 0
        ? "No data found"
        : "Teamwise productivity retrieved successfully",
      200,
      pagination
    );
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({
      success: false,
      message: "An error occurred",
      error: error.message,
    });
  }
};


exports.get_individualStatus = async (req, res) => {
  try {
    const {
      team_id,
      from_date,
      to_date,
      search,
      page = 1,
      perPage = 10,
    } = req.query;
    const offset = (page - 1) * perPage;

    if (from_date && to_date) {
      if (!moment(from_date, 'YYYY-MM-DD', true).isValid() || !moment(to_date, 'YYYY-MM-DD', true).isValid()) {
        return errorResponse(res, "Invalid date format", "Dates must be in YYYY-MM-DD format", 400);
      }
      if (moment(to_date).isBefore(moment(from_date))) {
        return errorResponse(res, "Invalid date range", "End date must be greater than or equal to Start date", 400);
      }
    } else if (from_date && !moment(from_date, 'YYYY-MM-DD', true).isValid()) {
      return errorResponse(res, "Invalid from_date format", "Start date must be in YYYY-MM-DD format", 400);
    } else if (to_date && !moment(to_date, 'YYYY-MM-DD', true).isValid()) {
      return errorResponse(res, "Invalid to_date format", "End date must be in YYYY-MM-DD format", 400);
    }

    let baseQuery = `
            SELECT 
                users.id,
                COALESCE(CONCAT(COALESCE(users.first_name, ''), ' ', COALESCE(NULLIF(users.last_name, ''), '')), 'Unknown User') AS employee_name, 
                users.employee_id,
                COUNT(tasks.id) AS assigned_tasks,
                SUM(CASE WHEN tasks.status = 1 THEN 1 ELSE 0 END) AS ongoing_tasks,
                SUM(CASE WHEN tasks.status = 3 THEN 1 ELSE 0 END) AS completed_tasks,
                MIN(tasks.created_at) AS task_created_at
            FROM users
            LEFT JOIN tasks ON tasks.user_id = users.id AND tasks.deleted_at IS NULL
            WHERE users.deleted_at IS NULL
        `;

    let countQuery = `
            SELECT COUNT(DISTINCT users.id) AS total
            FROM users
            LEFT JOIN tasks ON tasks.user_id = users.id AND tasks.deleted_at IS NULL
            WHERE users.deleted_at IS NULL
        `;

    let whereConditions = [];
    const queryParams = [];

    if (team_id) {
      whereConditions.push(`users.team_id = ?`);
      queryParams.push(team_id);
    }

    if (from_date && to_date) {
      const fromDateTime = `${from_date} 00:00:00`;
      const toDateTime = `${to_date} 23:59:59`;
      whereConditions.push('tasks.created_at BETWEEN ? AND ?');
      queryParams.push(fromDateTime, toDateTime);
    } else if (from_date) {
      const fromDateTime = `${from_date} 00:00:00`;
      whereConditions.push(`tasks.created_at >= ?`);
      queryParams.push(fromDateTime);
    } else if (to_date) {
      const toDateTime = `${to_date} 23:59:59`;
      whereConditions.push(`tasks.created_at <= ?`);
      queryParams.push(toDateTime);

    }

    if (search) {
      whereConditions.push(
        `(users.first_name LIKE ? OR users.employee_id LIKE ?)`
      );
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    if (whereConditions.length > 0) {
      const whereClause = ` AND ${whereConditions.join(" AND ")}`;
      baseQuery += whereClause;
      countQuery += whereClause;
    }

    baseQuery += ` GROUP BY users.id LIMIT ? OFFSET ?`;
    queryParams.push(perPage, offset);

    const [results] = await db.query(baseQuery, queryParams);
    const [countResult] = await db.query(countQuery, queryParams.slice(0, -2));
    const totalRecords = countResult[0]?.total || 0;
    const pagination = getPagination(page, perPage, totalRecords);

    const data = results.map((user) => ({
      employee_name: user.employee_name,
      employee_id: user.employee_id,
      assigned_tasks: user.assigned_tasks || 0,
      ongoing_tasks: user.ongoing_tasks || 0,
      completed_tasks: user.completed_tasks || 0,
      task_created_at: user.task_created_at || null,
    }));

    successResponse(
      res,
      data,
      data.length === 0
        ? "No Individual status found"
        : "Individual status retrieved successfully",
      200,
      pagination
    );
  } catch (error) {
    console.error("Error fetching individual status:", error);
    return errorResponse(res, error.message, "Server error", 500);
  }
};
