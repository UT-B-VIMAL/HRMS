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
  if (
    totalSeconds === null ||
    totalSeconds === undefined ||
    isNaN(totalSeconds)
  )
    return "0h 0m 0s";

  const isNegative = totalSeconds < 0;
  const absSeconds = Math.abs(totalSeconds);

  const secondsInDay = 8 * 3600; // 1 day = 8 hours
  const days = Math.floor(absSeconds / secondsInDay);
  const hours = Math.floor((absSeconds % secondsInDay) / 3600);
  const minutes = Math.floor((absSeconds % 3600) / 60);
  const seconds = Math.floor(absSeconds % 60); // 🔧 Fix: floor the seconds

  const timeString = `${
    days > 0 ? days + "d " : ""
  }${hours}h ${minutes}m ${seconds}s`;

  return isNegative ? `-${timeString}` : timeString;
}


// exports.getTeamwiseProductivity = async (req, res) => {
//   try {
//     const {
//       team_id,
//       from_date,
//       to_date,
//       employee_id,
//       search,
//       page = 1,
//       perPage = 10,
//     } = req.query;
//     const offset = (page - 1) * perPage;

//     // Date validation
//     if (from_date && to_date) {
//       if (
//         !moment(from_date, "YYYY-MM-DD", true).isValid() ||
//         !moment(to_date, "YYYY-MM-DD", true).isValid()
//       ) {
//         return errorResponse(
//           res,
//           "Invalid date format",
//           "Dates must be in YYYY-MM-DD format",
//           400
//         );
//       }
//       if (moment(to_date).isBefore(moment(from_date))) {
//         return errorResponse(
//           res,
//           "Invalid date range",
//           "End date must be greater than or equal to Start date",
//           400
//         );
//       }
//     } else if (from_date && !moment(from_date, "YYYY-MM-DD", true).isValid()) {
//       return errorResponse(
//         res,
//         "Invalid from_date format",
//         "Start date must be in YYYY-MM-DD format",
//         400
//       );
//     } else if (to_date && !moment(to_date, "YYYY-MM-DD", true).isValid()) {
//       return errorResponse(
//         res,
//         "Invalid to_date format",
//         "End date must be in YYYY-MM-DD format",
//         400
//       );
//     }

//     const dateCondition =
//       from_date && to_date
//         ? `AND combined.updated_at BETWEEN ? AND ?`
//         : from_date
//         ? `AND combined.updated_at >= ?`
//         : to_date
//         ? `AND combined.updated_at <= ?`
//         : "";

//     // Updated task query
//     const taskQuery = `
//       SELECT
//           t.user_id,
//           t.team_id,
//           TIME_TO_SEC(t.estimated_hours) AS estimated_seconds,
//           TIME_TO_SEC(t.total_hours_worked) AS worked_seconds,
//           CASE
//             WHEN TIME_TO_SEC(t.estimated_hours) > 0 THEN
//               GREATEST(TIME_TO_SEC(t.total_hours_worked) - TIME_TO_SEC(t.estimated_hours), 0)
//             ELSE 0
//           END AS extended_seconds,
//           t.updated_at
//       FROM
//           tasks t
//       WHERE
//           t.deleted_at IS NULL
//           AND NOT EXISTS (
//               SELECT 1 FROM sub_tasks st
//               WHERE st.task_id = t.id
//               AND st.deleted_at IS NULL
//           )
//     `;

//     // Updated subtask query
//     const subtaskQuery = `
//       SELECT
//           st.user_id,
//           st.team_id,
//           TIME_TO_SEC(st.estimated_hours) AS estimated_seconds,
//           TIME_TO_SEC(st.total_hours_worked) AS worked_seconds,
//           CASE
//             WHEN TIME_TO_SEC(st.estimated_hours) > 0 THEN
//               GREATEST(TIME_TO_SEC(st.total_hours_worked) - TIME_TO_SEC(st.estimated_hours), 0)
//             ELSE 0
//           END AS extended_seconds,
//           st.updated_at
//       FROM
//           sub_tasks st
//       WHERE
//           st.deleted_at IS NULL
//     `;

//     // Main query
//     let query = `
//       SELECT
//           MAX(combined.updated_at) AS updated_at,
//           u.id AS user_id,
//           COALESCE(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(NULLIF(u.last_name, ''))), 'Unknown User') AS employee_name,
//           u.employee_id,
//           combined.team_id,
//           COALESCE(SUM(combined.estimated_seconds), 0) AS total_estimated_seconds,
//           COALESCE(SUM(combined.worked_seconds), 0) AS total_worked_seconds,
//           COALESCE(SUM(combined.extended_seconds), 0) AS total_extended_seconds,
//           (COALESCE(SUM(combined.estimated_seconds), 0) - COALESCE(SUM(combined.worked_seconds), 0)) AS difference_seconds
//       FROM users u
//       LEFT JOIN (
//           (${taskQuery})
//           UNION ALL
//           (${subtaskQuery})
//       ) AS combined ON u.id = combined.user_id
//       WHERE u.deleted_at IS NULL
//       ${team_id ? `AND combined.team_id = ?` : ""}
//       ${dateCondition}
//       ${employee_id ? `AND u.employee_id = ?` : ""}
//       ${
//         search
//           ? `AND (u.employee_id LIKE ? OR CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(NULLIF(u.last_name, ''))) LIKE ?)`
//           : ""
//       }
//     `;

//     const queryParams = [];

//     if (team_id) queryParams.push(team_id);
//     if (from_date && to_date) {
//       queryParams.push(`${from_date} 00:00:00`);
//       queryParams.push(`${to_date} 23:59:59`);
//     } else if (from_date) {
//       queryParams.push(`${from_date} 00:00:00`);
//     } else if (to_date) {
//       queryParams.push(`${to_date} 23:59:59`);
//     }

//     if (employee_id) queryParams.push(employee_id);
//     if (search) {
//       queryParams.push(`%${search}%`);
//       queryParams.push(`%${search}%`);
//     }

//     query += `
//       GROUP BY u.id, u.first_name, u.last_name, u.employee_id, combined.team_id
//       ORDER BY updated_at DESC
//       LIMIT ${parseInt(perPage)} OFFSET ${parseInt(offset)}
//     `;

//     // Count query
//     let countQuery = `
//       SELECT COUNT(DISTINCT u.id) AS total_users
//       FROM users u
//       LEFT JOIN (
//           (${taskQuery})
//           UNION ALL
//           (${subtaskQuery})
//       ) AS combined ON u.id = combined.user_id
//       WHERE u.deleted_at IS NULL
//       ${team_id ? `AND combined.team_id = ?` : ""}
//       ${dateCondition}
//       ${employee_id ? `AND u.employee_id = ?` : ""}
//       ${
//         search
//           ? `AND (u.employee_id LIKE ? OR CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(NULLIF(u.last_name, ''))) LIKE ?)`
//           : ""
//       }
//     `;

//     const countParams = [];
//     if (team_id) countParams.push(team_id);
//     if (from_date && to_date) {
//       countParams.push(`${from_date} 00:00:00`);
//       countParams.push(`${to_date} 23:59:59`);
//     } else if (from_date) {
//       countParams.push(`${from_date} 00:00:00`);
//     } else if (to_date) {
//       countParams.push(`${to_date} 23:59:59`);
//     }
//     if (employee_id) countParams.push(employee_id);
//     if (search) {
//       countParams.push(`%${search}%`);
//       countParams.push(`%${search}%`);
//     }

//     // Execute
//     const [results] = await db.query(query, queryParams);
//     const [countResults] = await db.query(countQuery, countParams);

//     const totalUsers = countResults[0].total_users;

//     const data = results.map((item, index) => ({
//       s_no: offset + index + 1,
//       updated_at: item.updated_at,
//       employee_name: item.employee_name,
//       employee_id: item.employee_id,
//       team_id: item.team_id || null,
//       total_estimated_hours: convertSecondsToReadableTime(
//         item.total_estimated_seconds
//       ),
//       total_worked_hours: convertSecondsToReadableTime(
//         item.total_worked_seconds
//       ),
//       total_extended_hours: convertSecondsToReadableTime(
//         item.total_extended_seconds
//       ),
//       difference_hours: convertSecondsToReadableTime(item.difference_seconds),
//     }));

//     const pagination = getPagination(page, perPage, totalUsers);

//     successResponse(
//       res,
//       data,
//       data.length === 0
//         ? "No data found"
//         : "Teamwise productivity retrieved successfully",
//       200,
//       pagination
//     );
//   } catch (error) {
//     console.error("Error:", error.message);
//     res.status(500).json({
//       success: false,
//       message: "An error occurred",
//       error: error.message,
//     });
//   }
// };

// exports.get_individualStatus = async (req, res) => {
//   try {
//     const {
//       team_id,
//       from_date,
//       to_date,
//       search,
//       page = 1,
//       perPage = 10,
//     } = req.query;
//     const offset = (page - 1) * perPage;

//     if (from_date && to_date) {
//       if (
//         !moment(from_date, "YYYY-MM-DD", true).isValid() ||
//         !moment(to_date, "YYYY-MM-DD", true).isValid()
//       ) {
//         return errorResponse(
//           res,
//           "Invalid date format",
//           "Dates must be in YYYY-MM-DD format",
//           400
//         );
//       }
//       if (moment(to_date).isBefore(moment(from_date))) {
//         return errorResponse(
//           res,
//           "Invalid date range",
//           "End date must be greater than or equal to Start date",
//           400
//         );
//       }
//     } else if (from_date && !moment(from_date, "YYYY-MM-DD", true).isValid()) {
//       return errorResponse(
//         res,
//         "Invalid from_date format",
//         "Start date must be in YYYY-MM-DD format",
//         400
//       );
//     } else if (to_date && !moment(to_date, "YYYY-MM-DD", true).isValid()) {
//       return errorResponse(
//         res,
//         "Invalid to_date format",
//         "End date must be in YYYY-MM-DD format",
//         400
//       );
//     }

//     let baseQuery = `
//             SELECT
//                 users.id,
//                 COALESCE(CONCAT(COALESCE(users.first_name, ''), ' ', COALESCE(NULLIF(users.last_name, ''), '')), 'Unknown User') AS employee_name,
//                 users.employee_id,
//                 COUNT(tasks.id) AS assigned_tasks,
//                 SUM(CASE WHEN tasks.status = 1 THEN 1 ELSE 0 END) AS ongoing_tasks,
//                 SUM(CASE WHEN tasks.status = 3 THEN 1 ELSE 0 END) AS completed_tasks,
//                 MIN(tasks.created_at) AS task_created_at
//             FROM users
//             LEFT JOIN tasks ON tasks.user_id = users.id AND tasks.deleted_at IS NULL
//             WHERE users.deleted_at IS NULL
//         `;

//     let countQuery = `
//             SELECT COUNT(DISTINCT users.id) AS total
//             FROM users
//             LEFT JOIN tasks ON tasks.user_id = users.id AND tasks.deleted_at IS NULL
//             WHERE users.deleted_at IS NULL
//         `;

//     let whereConditions = [];
//     const queryParams = [];

//     if (team_id) {
//       whereConditions.push(`users.team_id = ?`);
//       queryParams.push(team_id);
//     }

//     if (from_date && to_date) {
//       const fromDateTime = `${from_date} 00:00:00`;
//       const toDateTime = `${to_date} 23:59:59`;
//       whereConditions.push("tasks.created_at BETWEEN ? AND ?");
//       queryParams.push(fromDateTime, toDateTime);
//     } else if (from_date) {
//       const fromDateTime = `${from_date} 00:00:00`;
//       whereConditions.push(`tasks.created_at >= ?`);
//       queryParams.push(fromDateTime);
//     } else if (to_date) {
//       const toDateTime = `${to_date} 23:59:59`;
//       whereConditions.push(`tasks.created_at <= ?`);
//       queryParams.push(toDateTime);
//     }

//     if (search) {
//       whereConditions.push(
//         `(users.first_name LIKE ? OR users.employee_id LIKE ?)`
//       );
//       queryParams.push(`%${search}%`, `%${search}%`);
//     }

//     if (whereConditions.length > 0) {
//       const whereClause = ` AND ${whereConditions.join(" AND ")}`;
//       baseQuery += whereClause;
//       countQuery += whereClause;
//     }

//     baseQuery += ` GROUP BY users.id LIMIT ? OFFSET ?`;
//     queryParams.push(perPage, offset);

//     const [results] = await db.query(baseQuery, queryParams);
//     const [countResult] = await db.query(countQuery, queryParams.slice(0, -2));
//     const totalRecords = countResult[0]?.total || 0;
//     const pagination = getPagination(page, perPage, totalRecords);

//     const data = results.map((user) => ({
//       employee_name: user.employee_name,
//       employee_id: user.employee_id,
//       assigned_tasks: user.assigned_tasks || 0,
//       ongoing_tasks: user.ongoing_tasks || 0,
//       completed_tasks: user.completed_tasks || 0,
//       task_created_at: user.task_created_at || null,
//     }));

//     successResponse(
//       res,
//       data,
//       data.length === 0
//         ? "No Individual status found"
//         : "Individual status retrieved successfully",
//       200,
//       pagination
//     );
//   } catch (error) {
//     console.error("Error fetching individual status:", error);
//     return errorResponse(res, error.message, "Server error", 500);
//   }
// };

exports.get_individualStatus = async (req, res) => {
  try {
    const {
      team_id,
      search,
      from_date,
      to_date,
      page = 1,
      perPage = 10,
    } = req.query;

    const offset = (page - 1) * perPage;

    // Validate date formats if provided
    if (from_date && to_date) {
      if (
        !moment(from_date, "YYYY-MM-DD", true).isValid() ||
        !moment(to_date, "YYYY-MM-DD", true).isValid()
      ) {
        return errorResponse(
          res,
          "Invalid date format",
          "Dates must be in YYYY-MM-DD format",
          400
        );
      }
      if (moment(to_date).isBefore(moment(from_date))) {
        return errorResponse(
          res,
          "Invalid date range",
          "End date must be greater than or equal to Start date",
          400
        );
      }
    } else if (from_date && !moment(from_date, "YYYY-MM-DD", true).isValid()) {
      return errorResponse(
        res,
        "Invalid from_date format",
        "Start date must be in YYYY-MM-DD format",
        400
      );
    } else if (to_date && !moment(to_date, "YYYY-MM-DD", true).isValid()) {
      return errorResponse(
        res,
        "Invalid to_date format",
        "End date must be in YYYY-MM-DD format",
        400
      );
    }

    // Prepare user filtering conditions
    let queryParams = [];
    let whereUserConditions = [`users.deleted_at IS NULL`];

    if (team_id) {
      whereUserConditions.push(`users.team_id = ?`);
      queryParams.push(team_id);
    }

    if (search) {
      whereUserConditions.push(
        `(users.first_name LIKE ? OR users.employee_id LIKE ?)`
      );
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    const whereUserClause = whereUserConditions.length
      ? `WHERE ${whereUserConditions.join(" AND ")}`
      : "";

    // Prepare date filters for tasks and subtasks separately
    let whereTaskDateCondition = [];
    let taskDateParams = [];

    let whereSubtaskDateCondition = [];
    let subtaskDateParams = [];

    if (from_date && to_date) {
      const fromDateTime = `${from_date} 00:00:00`;
      const toDateTime = `${to_date} 23:59:59`;
      whereTaskDateCondition.push(`t.created_at BETWEEN ? AND ?`);
      taskDateParams.push(fromDateTime, toDateTime);

      whereSubtaskDateCondition.push(`st.created_at BETWEEN ? AND ?`);
      subtaskDateParams.push(fromDateTime, toDateTime);
    } else if (from_date) {
      const fromDateTime = `${from_date} 00:00:00`;
      const toDateTime = `${from_date} 23:59:59`;

      whereTaskDateCondition.push(`t.created_at BETWEEN ? AND ?`);
      taskDateParams.push(fromDateTime, toDateTime);

      whereSubtaskDateCondition.push(`st.created_at BETWEEN ? AND ?`);
      subtaskDateParams.push(fromDateTime, toDateTime);
    } else if (to_date) {
      const toDateTime = `${to_date} 23:59:59`;
      whereTaskDateCondition.push(`t.created_at <= ?`);
      taskDateParams.push(toDateTime);

      whereSubtaskDateCondition.push(`st.created_at <= ?`);
      subtaskDateParams.push(toDateTime);
    }

    // Helper to repeat params for multiple occurrences of the same condition
    const repeatParams = (params, times) => {
      let arr = [];
      for (let i = 0; i < times; i++) {
        arr = arr.concat(params);
      }
      return arr;
    };

    // Count how many times date filters appear in the query for subtasks and tasks:
    // Each subtasks date filter used 3 times in your query (assigned, ongoing, completed, earliest)
    const subtaskDateFilterCount = whereSubtaskDateCondition.length ? 4 : 0;
    // Each tasks date filter used 3 times similarly
    const taskDateFilterCount = whereTaskDateCondition.length ? 4 : 0;

    // Compose the full query with separate date filters on tasks and subtasks
    const baseQuery = `
      SELECT
        users.id,
        COALESCE(CONCAT(COALESCE(users.first_name, ''), ' ', COALESCE(NULLIF(users.last_name, ''), '')), 'Unknown User') AS employee_name,
        users.employee_id,

        -- Assigned tasks count:
        (
          SELECT COUNT(*)
          FROM sub_tasks st
          JOIN tasks t ON st.task_id = t.id
          WHERE st.user_id = users.id
            AND st.deleted_at IS NULL
            AND t.deleted_at IS NULL
            AND st.status = 0 AND st.reopen_status = 0 AND st.active_status = 0
            ${
              whereSubtaskDateCondition.length
                ? `AND ${whereSubtaskDateCondition.join(" AND ")}`
                : ""
            }
        )
        +
        (
          SELECT COUNT(*)
          FROM tasks t
          WHERE t.user_id = users.id
            AND t.deleted_at IS NULL
            AND t.status = 0 AND t.reopen_status = 0 AND t.active_status = 0
            AND NOT EXISTS (
              SELECT 1 FROM sub_tasks st WHERE st.task_id = t.id AND st.deleted_at IS NULL
            )
            ${
              whereTaskDateCondition.length
                ? `AND ${whereTaskDateCondition.join(" AND ")}`
                : ""
            }
        ) AS assigned_tasks,

        -- Ongoing tasks count:
        (
          SELECT COUNT(*)
          FROM sub_tasks st
          JOIN tasks t ON st.task_id = t.id
          WHERE st.user_id = users.id
            AND st.deleted_at IS NULL
            AND t.deleted_at IS NULL
            AND st.status = 1 AND st.reopen_status = 0 AND st.active_status = 1
            ${
              whereSubtaskDateCondition.length
                ? `AND ${whereSubtaskDateCondition.join(" AND ")}`
                : ""
            }
        )
        +
        (
          SELECT COUNT(*)
          FROM tasks t
          WHERE t.user_id = users.id
            AND t.deleted_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM sub_tasks st WHERE st.task_id = t.id AND st.deleted_at IS NULL
            )
            AND t.status = 1 AND t.reopen_status = 0 AND t.active_status = 1
            ${
              whereTaskDateCondition.length
                ? `AND ${whereTaskDateCondition.join(" AND ")}`
                : ""
            }
        ) AS ongoing_tasks,

        -- Completed tasks count:
        (
          SELECT COUNT(*)
          FROM sub_tasks st
          JOIN tasks t ON st.task_id = t.id
          WHERE st.user_id = users.id
            AND st.deleted_at IS NULL
            AND t.deleted_at IS NULL
            AND st.status = 3
            ${
              whereSubtaskDateCondition.length
                ? `AND ${whereSubtaskDateCondition.join(" AND ")}`
                : ""
            }
        )
        +
        (
          SELECT COUNT(*)
          FROM tasks t
          WHERE t.user_id = users.id
            AND t.deleted_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM sub_tasks st WHERE st.task_id = t.id AND st.deleted_at IS NULL
            )
            AND t.status = 3
            ${
              whereTaskDateCondition.length
                ? `AND ${whereTaskDateCondition.join(" AND ")}`
                : ""
            }
        ) AS completed_tasks,

        -- Earliest created_at for subtasks (if any)
        (
          SELECT MIN(st.created_at)
          FROM sub_tasks st
          JOIN tasks t ON st.task_id = t.id
          WHERE st.user_id = users.id
            AND st.deleted_at IS NULL
            AND t.deleted_at IS NULL
            ${
              whereSubtaskDateCondition.length
                ? `AND ${whereSubtaskDateCondition.join(" AND ")}`
                : ""
            }
        ) AS subtask_created_at,

        -- Earliest created_at for tasks without subtasks
        (
          SELECT MIN(t.created_at)
          FROM tasks t
          WHERE t.user_id = users.id
            AND t.deleted_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM sub_tasks st WHERE st.task_id = t.id AND st.deleted_at IS NULL
            )
            ${
              whereTaskDateCondition.length
                ? `AND ${whereTaskDateCondition.join(" AND ")}`
                : ""
            }
        ) AS task_created_at

      FROM users
      ${whereUserClause}
      ORDER BY users.first_name ASC
      LIMIT ? OFFSET ?;
    `;

    const queryParamsFinal = [
      ...repeatParams(subtaskDateParams, subtaskDateFilterCount),
      ...repeatParams(taskDateParams, taskDateFilterCount),
      ...queryParams,
      perPage,
      offset,
    ];
    // Total count query (for pagination)
    const countQuery = `
      SELECT COUNT(*) AS total FROM users
      ${whereUserClause};
    `;

    // Execute queries
    const [results] = await db.query(baseQuery, queryParamsFinal);
    const [countResult] = await db.query(countQuery, queryParams);

    const totalRecords = countResult[0]?.total || 0;
    const pagination = getPagination(page, perPage, totalRecords);

    // Map response data
    const data = results.map((user) => ({
      employee_name: user.employee_name,
      employee_id: user.employee_id,
      assigned_tasks: Number(user.assigned_tasks) || 0,
      ongoing_tasks: Number(user.ongoing_tasks) || 0,
      completed_tasks: Number(user.completed_tasks) || 0,
      task_created_at: user.subtask_created_at || user.task_created_at || null,
    }));

    return successResponse(
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

exports.getTeamwiseProductivity = async (req, res) => {
  try {
    const {
      team_id,
      from_date,
      to_date,
      search = "",
      page = 1,
      perpage = 10,
    } = req.query;

    const perPage = parseInt(perpage, 10) || 10;
    const currentPage = parseInt(page, 10) || 1;
    const offset = (currentPage - 1) * perPage;

    const params = [];
    let dateFilter = "";
    let searchFilter = "";
    let teamFilter = "";

    // Date filter
    if (from_date && to_date) {
      dateFilter = "AND DATE(utu.start_time) BETWEEN ? AND ?";
      params.push(from_date, to_date);
    }else if (from_date) {
      dateFilter = "AND DATE(utu.start_time) = ?";
      params.push(from_date);
    }

    // Search filter
    if (search) {
      searchFilter = `AND (u.employee_id LIKE ? OR CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    // Team filter
    if (team_id) {
      teamFilter = "AND u.team_id = ?";
      params.push(team_id);
    }

    // Pagination
    params.push(perPage, offset);

    const sql = `
      WITH TaskWork AS (
        SELECT
          utu.task_id,
          utu.subtask_id,
          utu.user_id,
          SUM(TIMESTAMPDIFF(SECOND, utu.start_time, COALESCE(utu.end_time, NOW()))) AS user_worked_seconds
        FROM sub_tasks_user_timeline utu
        WHERE 1=1
          ${dateFilter}
        GROUP BY utu.task_id, utu.subtask_id, utu.user_id
      ),
      TaskTotals AS (
        SELECT
          task_id,
          subtask_id,
          SUM(user_worked_seconds) AS total_worked_seconds
        FROM TaskWork
        GROUP BY task_id, subtask_id
      ),
      EstimatedSubtaskTimes AS (
        SELECT
          st.id AS subtask_id,
          TIME_TO_SEC(COALESCE(st.estimated_hours, '00:00:00')) AS estimated_seconds
        FROM sub_tasks st
      ),
      EstimatedTaskTimes AS (
        SELECT
          t.id AS task_id,
          TIME_TO_SEC(COALESCE(t.estimated_hours, '00:00:00')) AS estimated_seconds
        FROM tasks t
      ),
      ExtendedWork AS (
        SELECT
          tw.user_id,
          tw.task_id,
          tw.subtask_id,
          tw.user_worked_seconds,
          tt.total_worked_seconds,
          COALESCE(ets.estimated_seconds, ett.estimated_seconds, 0) AS estimated_seconds,
          CASE
            WHEN COALESCE(ets.estimated_seconds, ett.estimated_seconds, 0) = 0 THEN 0
            WHEN tt.total_worked_seconds <= COALESCE(ets.estimated_seconds, ett.estimated_seconds, 0) THEN 0
            ELSE tw.user_worked_seconds - (tw.user_worked_seconds / tt.total_worked_seconds) * COALESCE(ets.estimated_seconds, ett.estimated_seconds, 0)
          END AS user_extended_seconds
        FROM TaskWork tw
        JOIN TaskTotals tt ON tw.task_id = tt.task_id AND ((tw.subtask_id = tt.subtask_id) OR (tw.subtask_id IS NULL AND tt.subtask_id IS NULL))
        LEFT JOIN EstimatedSubtaskTimes ets ON tw.subtask_id IS NOT NULL AND ets.subtask_id = tw.subtask_id
        LEFT JOIN EstimatedTaskTimes ett ON tw.subtask_id IS NULL AND ett.task_id = tw.task_id
      )
      SELECT
        u.id AS user_id,
        COALESCE(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(NULLIF(u.last_name, ''), '')), 'Unknown User') AS employee_name,
        u.employee_id,
         u.team_id,
        COALESCE(SUM(COALESCE(ets.estimated_seconds, ett.estimated_seconds, 0)), 0) AS total_estimated_seconds,
        COALESCE(SUM(ew.user_worked_seconds), 0) AS total_worked_seconds,
        COALESCE(SUM(ew.user_extended_seconds), 0) AS total_extended_seconds
      FROM users u
      LEFT JOIN ExtendedWork ew ON u.id = ew.user_id
      LEFT JOIN EstimatedSubtaskTimes ets ON ew.subtask_id = ets.subtask_id
      LEFT JOIN EstimatedTaskTimes ett ON ew.subtask_id IS NULL AND ew.task_id = ett.task_id
      WHERE u.deleted_at IS NULL
        ${searchFilter}
        ${teamFilter}
      GROUP BY u.id, u.first_name, u.last_name, u.employee_id
      ORDER BY employee_name
      LIMIT ? OFFSET ?
    `;

    const [rows] = await db.query(sql, params);

    const totalUsers = rows.length;
    const pagination = getPagination(currentPage, perPage, totalUsers);

    const data = rows.map((item, index) => ({
      s_no: offset + index + 1,
      employee_name: item.employee_name,
      employee_id: item.employee_id,
      team_id: item.team_id,
      total_estimated_hours: convertSecondsToReadableTime(
        item.total_estimated_seconds
      ),
      total_worked_hours: convertSecondsToReadableTime(
        item.total_worked_seconds
      ),
      total_extended_hours: convertSecondsToReadableTime(
        item.total_extended_seconds
      ),
      difference_hours: convertSecondsToReadableTime(
        item.total_worked_seconds - item.total_estimated_seconds
      ),
    }));

    res.status(200).json({
      status: 200,
      message: data.length
        ? "Productivity retrieved successfully"
        : "No data found",
      data,
      pagination,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};
