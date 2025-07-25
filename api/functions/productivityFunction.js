const db = require("../../config/db");
const {
  successResponse,
  errorResponse,
  getPagination,
} = require("../../helpers/responseHelper");
const moment = require("moment");


function convertSecondsToReadableTime(totalSeconds) {
  if (
    totalSeconds === null ||
    totalSeconds === undefined ||
    isNaN(totalSeconds)
  )
    return "0h 0m 0s";

  const absSeconds = Math.abs(totalSeconds); 

  const secondsInDay = 8 * 3600; // 1 day = 8 hours
  const days = Math.floor(absSeconds / secondsInDay);
  const hours = Math.floor((absSeconds % secondsInDay) / 3600);
  const minutes = Math.floor((absSeconds % 3600) / 60);
  const seconds = Math.floor(absSeconds % 60);

  return `${days > 0 ? days + "d " : ""}${hours}h ${minutes}m ${seconds}s`;
}


exports.get_individualStatus = async (req, res) => {

  console.log(`[API Start] ${new Date().toISOString()}`);
  console.time('Get Individual Status Start Execution Time');

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


   console.timeEnd('Get Individual Status Start Execution Time');
    console.log(`[API End] ${new Date().toISOString()}`);

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

  console.log(`[API Start] ${new Date().toISOString()}`);
  console.time('Get Teamwise Productivity Start Execution Time');
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
    const whereClauses = [];

    if (team_id) {
      whereClauses.push("u.team_id = ?");
      params.push(team_id);
    }

    if (search) {
      whereClauses.push(
        "(u.employee_id LIKE ? OR CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) LIKE ?)"
      );
      params.push(`%${search}%`, `%${search}%`);
    }

    let dateFilterSql = "";
    const dateParams = [];

    if (from_date && to_date) {
      dateFilterSql = "WHERE DATE(utu.start_time) BETWEEN ? AND ?";
      dateParams.push(from_date, to_date);
    } else if (from_date) {
      dateFilterSql = "WHERE DATE(utu.start_time) = ?";
      dateParams.push(from_date);
    }

    const whereSql = whereClauses.length
      ? "AND " + whereClauses.join(" AND ")
      : "";

    // Total count query
    const countQuery = `
      WITH UserTimeline AS (
        SELECT 
          utu.id,
          utu.task_id,
          utu.subtask_id,
          utu.user_id,
          TIMESTAMPDIFF(SECOND, utu.start_time, COALESCE(utu.end_time, NOW())) AS session_seconds,
          utu.start_time
        FROM sub_tasks_user_timeline utu
        ${dateFilterSql}
      ),
      TimelineOrdered AS (
        SELECT 
          *,
          ROW_NUMBER() OVER (PARTITION BY task_id, subtask_id ORDER BY start_time) AS rn
        FROM UserTimeline
      ),
      EstimatedTimes AS (
        SELECT
          st.id AS subtask_id,
          NULL AS task_id,
          TIME_TO_SEC(COALESCE(st.estimated_hours, '00:00:00')) AS estimated_seconds
        FROM sub_tasks st
        UNION ALL
        SELECT
          NULL AS subtask_id,
          t.id AS task_id,
          TIME_TO_SEC(COALESCE(t.estimated_hours, '00:00:00')) AS estimated_seconds
        FROM tasks t
      ),
      AccumulatedWork AS (
        SELECT 
          tlo.*,
          et.estimated_seconds,
          SUM(session_seconds) OVER (
            PARTITION BY tlo.task_id, tlo.subtask_id 
            ORDER BY tlo.start_time ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS cumulative_seconds
        FROM TimelineOrdered tlo
        LEFT JOIN EstimatedTimes et 
          ON (tlo.subtask_id = et.subtask_id AND tlo.subtask_id IS NOT NULL)
           OR (tlo.task_id = et.task_id AND tlo.subtask_id IS NULL)
      ),
      FinalCalc AS (
        SELECT 
          *,
          CASE 
            WHEN estimated_seconds > 0 
            THEN LEAST(GREATEST(estimated_seconds - (cumulative_seconds - session_seconds), 0), session_seconds)
            ELSE session_seconds
          END AS valid_seconds,

          CASE 
            WHEN estimated_seconds > 0 
            THEN GREATEST(cumulative_seconds - estimated_seconds, 0) 
                 - GREATEST(cumulative_seconds - estimated_seconds - session_seconds, 0)
            ELSE 0
          END AS exceed_seconds
        FROM AccumulatedWork
      )
      SELECT COUNT(DISTINCT u.id) AS total_users
      FROM users u
      LEFT JOIN FinalCalc fc ON fc.user_id = u.id
      WHERE u.deleted_at IS NULL
      ${whereSql}
    `;

    const [countRows] = await db.query(countQuery, [...dateParams, ...params]);
    const totalUsers = countRows[0]?.total_users || 0;

    // Data query
    const dataQuery = `
      WITH UserTimeline AS (
        SELECT 
          utu.id,
          utu.task_id,
          utu.subtask_id,
          utu.user_id,
          TIMESTAMPDIFF(SECOND, utu.start_time, COALESCE(utu.end_time, NOW())) AS session_seconds,
          utu.start_time
        FROM sub_tasks_user_timeline utu
        ${dateFilterSql}
      ),
      TimelineOrdered AS (
        SELECT 
          *,
          ROW_NUMBER() OVER (PARTITION BY task_id, subtask_id ORDER BY start_time) AS rn
        FROM UserTimeline
      ),
      EstimatedTimes AS (
        SELECT
          st.id AS subtask_id,
          NULL AS task_id,
          TIME_TO_SEC(COALESCE(st.estimated_hours, '00:00:00')) AS estimated_seconds
        FROM sub_tasks st
        UNION ALL
        SELECT
          NULL AS subtask_id,
          t.id AS task_id,
          TIME_TO_SEC(COALESCE(t.estimated_hours, '00:00:00')) AS estimated_seconds
        FROM tasks t
      ),
      AccumulatedWork AS (
        SELECT 
          tlo.*,
          et.estimated_seconds,
          SUM(session_seconds) OVER (
            PARTITION BY tlo.task_id, tlo.subtask_id 
            ORDER BY tlo.start_time ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS cumulative_seconds
        FROM TimelineOrdered tlo
        LEFT JOIN EstimatedTimes et 
          ON (tlo.subtask_id = et.subtask_id AND tlo.subtask_id IS NOT NULL)
           OR (tlo.task_id = et.task_id AND tlo.subtask_id IS NULL)
      ),
      FinalCalc AS (
        SELECT 
          *,
          CASE 
            WHEN estimated_seconds > 0 
            THEN LEAST(GREATEST(estimated_seconds - (cumulative_seconds - session_seconds), 0), session_seconds)
            ELSE session_seconds
          END AS valid_seconds,

          CASE 
            WHEN estimated_seconds > 0 
            THEN GREATEST(cumulative_seconds - estimated_seconds, 0) 
                 - GREATEST(cumulative_seconds - estimated_seconds - session_seconds, 0)
            ELSE 0
          END AS exceed_seconds
        FROM AccumulatedWork
      )
      SELECT 
        u.id AS user_id,
        COALESCE(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(NULLIF(u.last_name, ''), '')), 'Unknown') AS employee_name,
        u.employee_id,
        u.team_id,
        COALESCE(SUM(fc.session_seconds), 0) AS total_worked_seconds,
        COALESCE(SUM(fc.valid_seconds), 0) AS within_estimate_seconds,
        COALESCE(SUM(fc.exceed_seconds), 0) AS exceed_seconds,
        COALESCE(MAX(fc.estimated_seconds), 0) AS estimated_seconds
      FROM users u
      LEFT JOIN FinalCalc fc ON fc.user_id = u.id
      WHERE u.deleted_at IS NULL
      ${whereSql}
      GROUP BY u.id, u.first_name, u.last_name, u.employee_id
      ORDER BY employee_name
      LIMIT ? OFFSET ?
    `;

    const dataParams = [...dateParams, ...params, perPage, offset];
    const [rows] = await db.query(dataQuery, dataParams);

      const pagination = getPagination(currentPage, perPage, totalUsers);

    // Return seconds directly, your existing helper can convert on frontend/backend
    const data = rows.map((item, index) => ({
      s_no: offset + index + 1,
      user_id: item.user_id,
      employee_name: item.employee_name,
      employee_id: item.employee_id,
      team_id: item.team_id,
      total_estimated_hours: convertSecondsToReadableTime(
        item.estimated_seconds
      ),
        total_worked_hours: convertSecondsToReadableTime(
        item.total_worked_seconds
      ),
       total_extended_hours: convertSecondsToReadableTime(item.exceed_seconds),
       difference_hours: convertSecondsToReadableTime(
        item.total_worked_seconds - item.estimated_seconds
      ),
    }));

    console.timeEnd('Get Teamwise Productivity Start Execution Time');
    console.log(`[API End] ${new Date().toISOString()}`);
    res.status(200).json({
      status: 200,
      message: data.length
        ? "Teamwise productivity retrieved successfully"
        : "No data found",
      data,
      pagination,
    });
  } catch (error) {
    console.error("Error in getTeamwiseProductivity:", error);
    res.status(500).json({
      status: 500,
      message: "Internal server error",
      error: error.message,
    });
  }
};
