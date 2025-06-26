const db = require("../../config/db");
const {
  successResponse,
  errorResponse,
  getPagination,
} = require("../../helpers/responseHelper");
const moment = require("moment");
const {getUserIdFromAccessToken} = require("../../api/functions/commonFunction");

exports.get_idleEmployee = async (req, res) => {
  try {
    const { team_id, page = 1, perPage = 10 } = req.query;

    const accessToken = req.headers.authorization?.split(' ')[1];
        if (!accessToken) {
            return errorResponse(res, 'Access token is required', 401);
        }

    const user_id = await getUserIdFromAccessToken(accessToken);
    const pageNumber = parseInt(page, 10);
    const perPageNumber = parseInt(perPage, 10);
    const offset = (pageNumber - 1) * perPageNumber;

    // Fetch user details
    const [[user]] = await db.query(
      "SELECT id, role_id, team_id FROM users WHERE id = ? AND deleted_at IS NULL",
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
      if(rows.length == 0) {
          return errorResponse(res, null, "You are not currently assigned a reporting TL for your team.", 400);
      }
      teamIds = rows.length > 0 ? rows.map((row) => row.id) : [user.team_id];
    }

    let query = `
        SELECT users.id, users.employee_id,
            COALESCE(CONCAT(COALESCE(users.first_name, ''), ' ', COALESCE(NULLIF(users.last_name, ''), '')), '') AS user_name,
            users.team_id, users.role_id,
            teams.name AS team_name
        FROM users
        LEFT JOIN teams ON users.team_id = teams.id
        WHERE users.deleted_at IS NULL
        AND NOT EXISTS (
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
            AND DATE(CONVERT_TZ(date, '+00:00', '+05:30')) = DATE(CONVERT_TZ(NOW(), '+00:00', '+05:30'))
      AND (
          day_type != 2
          OR (
              day_type = 2
              AND (
                  (half_type = 1 AND TIME(CONVERT_TZ(NOW(), '+00:00', '+05:30')) BETWEEN '09:00:00' AND '13:30:00')
                  OR
                  (half_type = 2 AND TIME(CONVERT_TZ(NOW(), '+00:00', '+05:30')) BETWEEN '13:31:00' AND '18:00:00')
              )
          )
          )
        )
            AND users.role_id NOT IN (1, 2, 3)

    `;

    if (team_id) {
      query += ` AND users.team_id = ?`;
      queryParams.push(team_id);
    } else if (user.role_id == 3) {
      query += ` AND users.id != ? AND users.team_id IN (${teamIds
        .map(() => "?")
        .join(",")})`;
      queryParams.push(user_id, ...teamIds);
    } else if (user.role_id == 2) {
      query += ` AND users.role_id != ? AND users.role_id != 1`;
      queryParams.push(user.role_id);
    }

    // Add pagination
    query += ` ORDER BY users.id DESC LIMIT ? OFFSET ?`;
    queryParams.push(perPageNumber, offset);

    // **Count query for pagination**
    let countQuery = `
        SELECT COUNT(*) AS total_records
        FROM users
        LEFT JOIN teams ON users.team_id = teams.id
        WHERE users.deleted_at IS NULL
        AND NOT EXISTS (
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
        AND DATE(CONVERT_TZ(date, '+00:00', '+05:30')) = DATE(CONVERT_TZ(NOW(), '+00:00', '+05:30'))
      AND (
          day_type != 2
          OR (
              day_type = 2
              AND (
                  (half_type = 1 AND TIME(CONVERT_TZ(NOW(), '+00:00', '+05:30')) BETWEEN '09:00:00' AND '13:30:00')
                  OR
                  (half_type = 2 AND TIME(CONVERT_TZ(NOW(), '+00:00', '+05:30')) BETWEEN '13:31:00' AND '18:00:00')
              )
          )
          )
        )
           AND users.role_id NOT IN (1, 2, 3)

    `;

    let countQueryParams = [];

    if (team_id) {
      countQuery += ` AND users.team_id = ?`;
      countQueryParams.push(team_id);
    } else if (user.role_id === 3) {
      countQuery += ` AND users.id != ? AND users.team_id IN (${teamIds
        .map(() => "?")
        .join(",")})`;
      countQueryParams.push(user_id, ...teamIds);
    } else if (user.role_id == 2) {
      countQuery += ` AND users.role_id != ? AND users.role_id != 1`;
      countQueryParams.push(user.role_id);
    }

    // Execute queries
    const [result] = await db.query(query, queryParams);
    const [countResult] = await db.query(countQuery, countQueryParams);

    const totalRecords = countResult[0]?.total_records || 0;

    // **Calculate pagination**
    const pagination = getPagination(pageNumber, perPageNumber, totalRecords);

    // **Add serial numbers to results**
    const data = await Promise.all(
      result.map(async (row, index) => ({
        s_no: offset + index + 1,
        ...row,
        pending_tasks: await getPendingTasksCount(row.id), // Fetch pending task count
        idle_reason: await getIdleReason(row.id),
        
      }))
    );

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

const getPendingTasksCount = async (userId) => {
  try {
    let toDoCount = 0;
    let reopenedCount = 0;
    let pausedCount = 0;

    const [subTasks] = await db.query(
      `SELECT status, active_status, reopen_status, hold_status
       FROM sub_tasks
       WHERE user_id = ?
       AND deleted_at IS NULL`,
      [userId]
    );

    // 2. Get all tasks for the user
    const [tasks] = await db.query(
      `SELECT id, status, active_status, reopen_status, hold_status
       FROM tasks
       WHERE user_id = ?
       AND deleted_at IS NULL`,
      [userId]
    );

    // 3. Process subtasks
    for (const task of subTasks) {
      if (task.status === 1 && task.active_status === 0 && task.hold_status === 0) {
        pausedCount++;
      } else if (task.status === 0 && task.reopen_status === 1) {
        reopenedCount++;
      } else if (task.status === 0 && task.active_status === 0 && task.hold_status === 0) {
        toDoCount++;
      }
    }

    // 4. Process tasks only if no subtasks
    for (const task of tasks) {
      const [subTaskCheck] = await db.query(
        `SELECT COUNT(*) AS count FROM sub_tasks
         WHERE task_id = ? AND deleted_at IS NULL`,
        [task.id]
      );

      const hasSubTasks = parseInt(subTaskCheck[0]?.count || 0) > 0;

      if (!hasSubTasks) {
        if (task.status === 1 && task.active_status === 0 && task.hold_status === 0) {
          pausedCount++;
        } else if (task.status === 0 && task.reopen_status === 1) {
          reopenedCount++;
        } else if (task.status === 0 && task.active_status === 0 && task.hold_status === 0) {
          toDoCount++;
        }
      }
    }

    // 5. Return priority reason
    if (pausedCount > 0) {
      return {
        reason: "On Break",
        count: pausedCount,
      };
    }

    if (reopenedCount > 0) {
      return {
        reason: "Inactive",
        count: reopenedCount,
      };
    }

    if (toDoCount > 0) {
      return {
        reason: "Inactive",
        count: toDoCount,
      };
    }

    return {
      reason: "Work Unassigned",
      count: 0,
    };
  } catch (error) {
    console.error("Error in getPendingTasksCount:", error);
    return {
      reason: "Error retrieving data",
      count: 0,
    };
  }
};


const getIdleReason = async (userId) => {
  try {
    const [subTasks] = await db.query(
      `SELECT status, active_status, reopen_status, hold_status
       FROM sub_tasks 
       WHERE user_id = ?`,
      [userId]
    );

    const [tasks] = await db.query(
      `SELECT status, active_status, reopen_status, hold_status 
       FROM tasks 
       WHERE user_id = ?`,
      [userId]
    );

    const allTasks = [...subTasks, ...tasks];

    if (
      allTasks.some((task) => task.status === 1 && task.active_status === 0 && task.hold_status === 0)
    ) {
      return "On Break";
    }
    

    if (allTasks.length === 0 || allTasks.every((task) => task.status === 3)) {
      return "Work Unassigned";
    }

    // if (
    //   allTasks.some((task) => task.status === 1 && task.active_status === 0 && task.hold_status === 1)
    // ) {
    //   return "On Hold";
    // }

    if (
      allTasks.some((task) => task.status === 0 && task.reopen_status === 1)
    ) {
      return "Inactive";
    }

    if (
      allTasks.some((task) => task.status === 0 && task.active_status === 0 && task.hold_status === 0)
    ) {
      return "Inactive";
    }

    return "Work Unassigned";
  } catch (error) {
    console.error("Error in getIdleReason:", error);
    return "Error retrieving idle reason";
  }
};
