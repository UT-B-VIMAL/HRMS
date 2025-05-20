const db = require("../../config/db");
const moment = require("moment-timezone");
const timeago = require("timeago.js");
const mysql = require("mysql2");
const {
  successResponse,
  errorResponse,
  getPagination,
  calculateNewWorkedTime,
  convertSecondsToHHMMSS,
  convertToSeconds,
  calculateRemainingHours,
  calculatePercentage,
} = require("../../helpers/responseHelper");
const {
  getAuthUserDetails,
  processStatusData,
  formatTimeDHMS,
  getISTTime,
  checkUpdatePermission,
  commonStatusGroup,
  getColorForProduct
} = require("../../api/functions/commonFunction");
// const moment = require("moment");
const { updateTimelineShema } = require("../../validators/taskValidator");
const { Parser } = require("json2csv");
const { userSockets } = require("../../helpers/notificationHelper");

// Insert Task
exports.createTask = async (payload, res) => {
  const {
    product_id,
    project_id,
    user_id,
    name,
    estimated_hours,
    start_date,
    end_date,
    extended_status = "00:00:00",
    extended_hours = "00:00:00",
    active_status = 0,
    status = 0,
    total_hours_worked = "00:00:00",
    rating,
    command,
    assigned_user_id,
    remark,
    reopen_status = 0,
    description,
    team_id,
    priority,
    created_by,
    updated_by,
    deleted_at,
    created_at,
    updated_at,
  } = payload;

  try {
    const [product] = await db.query(
      "SELECT id FROM products WHERE id = ? AND deleted_at IS NULL",
      [product_id]
    );
    if (product.length === 0) {
      return errorResponse(
        res,
        null,
        "Product not found or has been deleted",
        404
      );
    }

    const [project] = await db.query(
      "SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL",
      [project_id]
    );
    if (project.length === 0) {
      return errorResponse(
        res,
        null,
        "Project not found or has been deleted",
        404
      );
    }

    const [assigned_user] = await db.query(
      "SELECT id FROM users WHERE id = ? AND deleted_at IS NULL",
      [assigned_user_id]
    );
    if (assigned_user.length === 0) {
      return errorResponse(
        res,
        null,
        "Assigned User not found or has been deleted",
        404
      );
    }

    const [user] = await db.query(
      "SELECT id FROM users WHERE id = ? AND deleted_at IS NULL",
      [user_id]
    );
    if (user.length === 0) {
      return errorResponse(
        res,
        null,
        "User not found or has been deleted",
        404
      );
    }

    const [team] = await db.query(
      "SELECT id FROM teams WHERE id = ? AND deleted_at IS NULL",
      [team_id]
    );
    if (team.length === 0) {
      return errorResponse(
        res,
        null,
        "Team not found or has been deleted",
        404
      );
    }

    if (estimated_hours) {
      const timeMatch = estimated_hours.match(
        /^((\d+)d\s*)?((\d+)h\s*)?((\d+)m\s*)?((\d+)s)?$/
      );

      if (!timeMatch) {
        return errorResponse(
          res,
          null,
          'Invalid format for estimated_hours. Use formats like "1d 2h 30m", "2h 30m", or "45m".',
          400
        );
      }

      const days = parseInt(timeMatch[2] || "0", 10);
      const hours = parseInt(timeMatch[4] || "0", 10);
      const minutes = parseInt(timeMatch[6] || "0", 10);
      const seconds = parseInt(timeMatch[8] || "0", 10);

      if (
        days < 0 ||
        hours < 0 ||
        minutes < 0 ||
        seconds < 0 ||
        minutes >= 60 ||
        seconds >= 60
      ) {
        return errorResponse(
          res,
          null,
          "Invalid time values in estimated_hours",
          400
        );
      }

      // Validate date span for estimated days
      if (start_date && end_date) {
        const start = moment(start_date, "YYYY-MM-DD");
        const end = moment(end_date, "YYYY-MM-DD");

        if (!start.isValid() || !end.isValid()) {
          return errorResponse(
            res,
            null,
            "Invalid start_date or end_date format",
            400
          );
        }

        const diffDays = end.diff(start, "days") + 1;

        const totalEstimatedHours =
          days * 8 + hours + minutes / 60 + seconds / 3600;
        const effectiveDays = Math.ceil(totalEstimatedHours / 8);

        if (diffDays < effectiveDays) {
          return errorResponse(
            res,
            null,
            `Estimated duration is ${effectiveDays} day(s) based on total estimated time, but selected date range spans only ${diffDays} day(s). Please extend the end_date.`,
            400
          );
        }
      }

      // Convert total estimated time to HH:MM:SS
      const totalHours = days * 8 + hours;

      payload.estimated_hours = `${String(totalHours).padStart(
        2,
        "0"
      )}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
        2,
        "0"
      )}`;
    }

    const query = `
        INSERT INTO tasks (
          product_id, project_id, user_id, name, estimated_hours,
          start_date, end_date, extended_status, extended_hours,
          active_status, status, total_hours_worked, rating, command,
          assigned_user_id, remark, reopen_status, description,
          team_id, priority, created_by, updated_by, deleted_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, NOW(),NOW())
      `;

    const values = [
      product_id,
      project_id,
      user_id,
      name,
      payload.estimated_hours,
      start_date,
      end_date,
      extended_status,
      extended_hours,
      active_status,
      status,
      total_hours_worked,
      rating,
      command,
      assigned_user_id,
      remark,
      reopen_status,
      description,
      team_id,
      priority,
      created_by,
      updated_by,
      deleted_at,
      created_at,
      updated_at,
    ];

    const [result] = await db.query(query, values);

    return successResponse(
      res,
      { id: result.insertId, ...payload },
      "Task added successfully",
      201
    );
  } catch (error) {
    console.error("Error inserting task:", error.message);
    return errorResponse(res, error.message, "Error inserting task", 500);
  }
};

exports.getTask = async (queryParams, res) => {
  try {
    const { id, user_id } = queryParams;

    if (!user_id) {
      return errorResponse(
        res,
        "User ID is required",
        "Missing user_id in query parameters",
        400
      );
    }

    const userDetails = await getAuthUserDetails(user_id, res);
    if (!userDetails || userDetails.id === undefined) {
      return errorResponse(res, "User not found", "Invalid user ID", 404);
    }

    // Base Task Query
    let taskQuery = `
      SELECT 
        t.*, 
        te.name AS team_name, 
        COALESCE(CONCAT(COALESCE(owner.first_name, ''), ' ', COALESCE(NULLIF(owner.last_name, ''), '')), 'Unknown Owner') AS owner_name, 
        COALESCE(CONCAT(COALESCE(assignee.first_name, ''), ' ', COALESCE(NULLIF(assignee.last_name, ''), '')), 'Unknown Assignee') AS assignee_name, 
        p.name AS product_name, 
        pj.name AS project_name,
        CONVERT_TZ(t.start_date, '+00:00', '+05:30') AS start_date,
        CONVERT_TZ(t.end_date, '+00:00', '+05:30') AS end_date
      FROM tasks t 
      LEFT JOIN teams te ON t.team_id = te.id 
      LEFT JOIN users assignee ON t.user_id = assignee.id 
      LEFT JOIN users owner ON t.assigned_user_id = owner.id 
      LEFT JOIN products p ON t.product_id = p.id 
      LEFT JOIN projects pj ON t.project_id = pj.id 
      WHERE t.id = ?
      AND t.deleted_at IS NULL
    `;

    let taskParams = [id];

    // Role-based filtering
    if (userDetails.role_id === 3) {
      taskQuery += ` AND t.team_id = ?`;
      taskParams.push(userDetails.team_id);
    }

    const [task] = await db.query(taskQuery, taskParams);
    if (!task || task.length === 0) {
      return errorResponse(res, "Task not found", "Error retrieving task", 404);
    }
    // Subtasks query
    let subtaskQuery = `
      SELECT 
        st.*, 
        COALESCE(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(NULLIF(u.last_name, ''), '')), 'Unknown Assignee') AS assignee_name 
      FROM sub_tasks st
      LEFT JOIN users u ON st.user_id = u.id 
      WHERE st.task_id = ?
      AND st.deleted_at IS NULL
    `;

    let subtaskParams = [id];

    if (userDetails.role_id === 3) {
      subtaskQuery += ` AND (
    st.team_id = ? OR (
      st.user_id IS NULL AND EXISTS (
        SELECT 1 FROM tasks t
        WHERE t.id = st.task_id AND t.team_id = ?
      )
    )
  )`;
      subtaskParams.push(userDetails.team_id, userDetails.team_id);
    } else if (userDetails.role_id === 4) {
      // subtaskQuery += ` AND (st.user_id = ?)`;
      // subtaskParams.push(user_id);
      subtaskQuery += ` AND (st.user_id = ? OR (st.user_id IS NULL AND ? = (SELECT user_id FROM tasks WHERE id = ?)))`;
      subtaskParams.push(user_id, user_id, id);
    }

    // if (userDetails.role_id === 3) {
    //   subtaskQuery += ` AND st.team_id = ?`;
    //   subtaskParams.push(userDetails.team_id);
    // } else if (userDetails.role_id === 4) {
    //   subtaskQuery += ` AND (st.user_id = ?)`;
    //   subtaskParams.push(user_id);
    // }

    const subtasks = await db.query(subtaskQuery, subtaskParams);

    const historiesQuery = `
      SELECT h.*, 
        COALESCE(
          CASE 
            WHEN u.first_name IS NOT NULL AND (u.last_name IS NOT NULL AND u.last_name <> '') THEN 
              UPPER(CONCAT(SUBSTRING(u.first_name, 1, 1), SUBSTRING(u.last_name, 1, 1)))
            WHEN u.first_name IS NOT NULL THEN 
              UPPER(SUBSTRING(u.first_name, 1, 2))
            ELSE 
              'UNKNOWN'
          END, 
          ' '
        ) AS short_name, 
        COALESCE(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(NULLIF(u.last_name, ''), '')), 'Unknown User') AS updated_by,  
        s.description as status_description
      FROM task_histories h
      LEFT JOIN users u ON h.updated_by = u.id
      LEFT JOIN task_status_flags s ON h.status_flag = s.id
      WHERE h.task_id = ? 
        AND h.deleted_at IS NULL
      ORDER BY h.id DESC;
    `;
    const histories = await db.query(historiesQuery, [id]);

    // // Comments query
    const commentsQuery = `
      SELECT c.*,  COALESCE(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(NULLIF(u.last_name, ''), '')), 'Unknown User') AS updated_by
      FROM task_comments c
      LEFT JOIN users u ON c.updated_by = u.id
      WHERE c.task_id = ? AND c.subtask_id IS NULL
      AND c.deleted_at IS NULL
      ORDER BY c.id DESC;
    `;

    const comments = await db.query(commentsQuery, [id]);

    // // Status mapping
    // const statusMap = {
    //   0: "To Do",
    //   1: "In Progress",
    //   2: "In Review",
    //   3: "Done",
    // };

    // Prepare task data
    const taskData = task.map((task) => {
      const totalEstimatedHours = task.estimated_hours || "00:00:00"; // Ensure default format as "HH:MM:SS"
      const timeTaken = task.total_hours_worked || "00:00:00"; // Ensure default format as "HH:MM:SS"

      // Calculate remaining hours and ensure consistent formatting
      const remainingHours = calculateRemainingHours(
        totalEstimatedHours,
        timeTaken
      );

      // Calculate percentage for hours
      const estimatedInSeconds = convertToSeconds(totalEstimatedHours);
      const timeTakenInSeconds = convertToSeconds(timeTaken);
      const remainingInSeconds = convertToSeconds(remainingHours);

      return {
        task_id: task.id || "",
        name: task.name || "",
        status: task.status,
        active_status: task.active_status,
        reopen_status: task.reopen_status,
        project_id: task.project_id || "",
        project: task.project_name || "",
        product_id: task.product_id || "",
        product: task.product_name || "",
        owner_id: task.assigned_user_id || "",
        owner: task.owner_name || "",
        team_id: task.team_id || "",
        team: task.team_name || "",
        assignee_id: task.user_id || "",
        assignee: task.assignee_name || "",
        estimated_hours: formatTimeDHMS(totalEstimatedHours),
        estimated_hours_percentage: calculatePercentage(
          estimatedInSeconds,
          estimatedInSeconds
        ),
        time_taken: formatTimeDHMS(timeTaken),
        time_taken_percentage: calculatePercentage(
          timeTakenInSeconds,
          estimatedInSeconds
        ),
        remaining_hours: formatTimeDHMS(remainingHours),
        remaining_hours_percentage: calculatePercentage(
          remainingInSeconds,
          estimatedInSeconds
        ),
        start_date: task.start_date,
        end_date: task.end_date,
        priority: task.priority,
        description: task.description,
        // status_text: statusMap[task.status] || "Unknown",
        status_text: commonStatusGroup(
          task.status,
          task.reopen_status,
          task.active_status
        ),

        is_exceed: timeTakenInSeconds > estimatedInSeconds ? true : false,
      };
    });

    // Prepare subtasks data
    const subtasksData =
      Array.isArray(subtasks) && subtasks[0].length > 0
        ? subtasks[0].map((subtask) => ({
          subtask_id: subtask.id,
          owner_id: subtask.user_id || "",
          name: subtask.name || "",
          status: subtask.status,
          active_status: subtask.active_status,
          reopen_status: subtask.reopen_status,
          assignee: subtask.user_id,
          assigneename: subtask.assignee_name || "",
          short_name: (subtask.assignee_name || "").substr(0, 2),
          // status_text: statusMap[subtask.status] || "Unknown",
          status_text: commonStatusGroup(
            subtask.status,
            subtask.reopen_status,
            subtask.active_status
          ),
        }))
        : [];

    const historiesData =
      Array.isArray(histories) && histories[0].length > 0
        ? await Promise.all(
          histories[0].map(async (history) => ({
            old_data: history.old_data,
            new_data: history.new_data,
            description: history.status_description || "Changed the status",
            updated_by: history.updated_by,
            shortName: history.short_name,
            time_date: moment
              .utc(history.updated_at)
              .tz("Asia/Kolkata")
              .format("YYYY-MM-DD HH:mm:ss"),
            time_utc: history.updated_at,
            time: moment.utc(history.updated_at).tz("Asia/Kolkata").fromNow(),
          }))
        )
        : [];

    const commentsData =
      Array.isArray(comments) && comments[0].length > 0
        ? comments[0].map((comment) => ({
          comment_id: comment.id,
          comments: comment.comments,
          user_id: comment.user_id,
          is_edited: comment.is_edited,
          updated_by: comment.updated_by || "",
          shortName: comment.updated_by.substr(0, 2),
          time_date: moment
            .utc(comment.updated_at)
            .tz("Asia/Kolkata")
            .format("YYYY-MM-DD HH:mm:ss"),
          time_utc: comment.updated_at,
          time: moment.utc(comment.updated_at).tz("Asia/Kolkata").fromNow(),
        }))
        : [];

    // Final response
    const data = {
      task: taskData,
      subtasks: subtasksData,
      histories: historiesData,
      comments: commentsData,
    };

    return successResponse(
      res,
      data,
      "Task details retrieved successfully",
      200
    );
  } catch (error) {
    console.error("Error retrieving task:", error.message);
    return errorResponse(res, error.message, "Error retrieving task", 500);
  }
};

// Get All Tasks

exports.getAllTasks = async (res) => {
  try {
    const query = "SELECT * FROM tasks ORDER BY id DESC";
    const [rows] = await db.query(query);

    if (rows.length === 0) {
      return errorResponse(res, null, "No tasks found", 204);
    }

    return successResponse(res, rows, "Tasks retrieved successfully");
  } catch (error) {
    return errorResponse(res, error.message, "Error retrieving tasks", 500);
  }
};

exports.updateTask = async (id, payload, res) => {
  try {
    const {
      product_id,
      project_id,
      user_id,
      assigned_user_id,
      updated_by,
      estimated_hours,
      start_date,
      end_date,
      team_id,
    } = payload;

    // Validate updated_by
    if (updated_by) {
      const [updatduser] = await db.query(
        "SELECT id FROM users WHERE id = ? AND deleted_at IS NULL",
        [updated_by]
      );
      if (updatduser.length === 0) {
        return errorResponse(
          res,
          null,
          "Updated User not found or has been deleted",
          404
        );
      }
    }

    // Validate product
    if (product_id) {
      const [product] = await db.query(
        "SELECT id FROM products WHERE id = ? AND deleted_at IS NULL",
        [product_id]
      );
      if (product.length === 0) {
        return errorResponse(
          res,
          null,
          "Product not found or has been deleted",
          404
        );
      }
    }

    // Validate project
    if (project_id) {
      const [project] = await db.query(
        "SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL",
        [project_id]
      );
      if (project.length === 0) {
        return errorResponse(
          res,
          null,
          "Project not found or has been deleted",
          404
        );
      }
    }

    // Validate assigned user
    if (assigned_user_id) {
      const [assigned_user] = await db.query(
        "SELECT id FROM users WHERE id = ? AND deleted_at IS NULL",
        [assigned_user_id]
      );
      if (assigned_user.length === 0) {
        return errorResponse(
          res,
          null,
          "Assigned User not found or has been deleted",
          404
        );
      }
    }

    // Validate user
    if (user_id) {
      const [user] = await db.query(
        "SELECT id FROM users WHERE id = ? AND deleted_at IS NULL",
        [user_id]
      );
      if (user.length === 0) {
        return errorResponse(
          res,
          null,
          "User not found or has been deleted",
          404
        );
      }
    }

    // Validate team
    if (team_id) {
      const [team] = await db.query(
        "SELECT id FROM teams WHERE id = ? AND deleted_at IS NULL",
        [team_id]
      );
      if (team.length === 0) {
        return errorResponse(
          res,
          null,
          "Team not found or has been deleted",
          404
        );
      }
    }

    // Fetch existing task
    const [currentTask] = await db.query(
      "SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL",
      [id]
    );

    if (currentTask.length === 0) {
      return errorResponse(res, null, "Task not found", 200);
    }

    const existingTask = currentTask[0];

    // If estimated_hours is passed, validate and convert it
    if (estimated_hours) {
      const timeMatch = estimated_hours.match(
        /^((\d+)d\s*)?((\d+)h\s*)?((\d+)m\s*)?((\d+)s)?$/
      );

      if (!timeMatch) {
        return errorResponse(
          res,
          null,
          'Invalid format for estimated_hours. Use formats like "1d 2h 30m", "2h 30m", or "45m".',
          400
        );
      }

      const days = parseInt(timeMatch[2] || "0", 10);
      const hours = parseInt(timeMatch[4] || "0", 10);
      const minutes = parseInt(timeMatch[6] || "0", 10);
      const seconds = parseInt(timeMatch[8] || "0", 10);

      if (
        days < 0 ||
        hours < 0 ||
        minutes < 0 ||
        seconds < 0 ||
        minutes >= 60 ||
        seconds >= 60
      ) {
        return errorResponse(
          res,
          null,
          "Invalid time values in estimated_hours",
          400
        );
      }

      // Validate date span for estimated days
      if (start_date && end_date) {
        const start = moment(start_date, "YYYY-MM-DD");
        const end = moment(end_date, "YYYY-MM-DD");

        if (!start.isValid() || !end.isValid()) {
          return errorResponse(
            res,
            null,
            "Invalid start_date or end_date format",
            400
          );
        }

        const diffDays = end.diff(start, "days") + 1;

        const totalEstimatedHours =
          days * 8 + hours + minutes / 60 + seconds / 3600;
        const effectiveDays = Math.ceil(totalEstimatedHours / 8);

        if (diffDays < effectiveDays) {
          return errorResponse(
            res,
            null,
            `Estimated duration is ${effectiveDays} day(s) based on total estimated time, but selected date range spans only ${diffDays} day(s). Please extend the end_date.`,
            400
          );
        }
      }

      // Convert total estimated time to HH:MM:SS
      const totalHours = days * 8 + hours;

      payload.estimated_hours = `${String(totalHours).padStart(
        2,
        "0"
      )}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
        2,
        "0"
      )}`;
    }
    // Merge payload with existing task
    const updatedData = {
      ...existingTask,
      ...payload,
      updated_at: new Date(),
    };

    // Update query
    const query = `
      UPDATE tasks SET
        product_id = ?,
        project_id = ?,
        user_id = ?,
        name = ?,
        estimated_hours = ?,
        start_date = ?,
        end_date = ?,
        extended_status = ?,
        extended_hours = ?,
        total_hours_worked = ?,
        rating = ?,
        command = ?,
        assigned_user_id = ?,
        remark = ?,
        reopen_status = ?,
        description = ?,
        team_id = ?,
        priority = ?,
        created_by = ?,
        updated_by = ?,
        deleted_at = ?,
        created_at = ?,
        updated_at = NOW()
      WHERE id = ?
    `;

    const values = [
      updatedData.product_id,
      updatedData.project_id,
      updatedData.user_id,
      updatedData.name,
      updatedData.estimated_hours,
      updatedData.start_date,
      updatedData.end_date,
      updatedData.extended_status,
      updatedData.extended_hours,
      updatedData.total_hours_worked,
      updatedData.rating,
      updatedData.command,
      updatedData.assigned_user_id,
      updatedData.remark,
      updatedData.reopen_status,
      updatedData.description,
      updatedData.team_id,
      updatedData.priority,
      updatedData.created_by,
      updatedData.updated_by,
      updatedData.deleted_at,
      updatedData.created_at,
      id,
    ];

    const [result] = await db.query(query, values);

    if (result.affectedRows === 0) {
      return errorResponse(res, null, "No changes made to the task", 200);
    }

    return successResponse(
      res,
      { id, ...updatedData },
      "Task updated successfully"
    );
  } catch (error) {
    return errorResponse(res, error.message, "Error updating task", 500);
  }
};

exports.updateTaskData = async (id, payload, res, req) => {
  const {
    status,
    active_status,
    reopen_status,
    assigned_user_id,
    user_id,
    team_id,
    estimated_hours,
    start_date,
    due_date,
    priority,
    updated_by,
    updated_at,
  } = payload;

  const statusFlagMapping = {
    status: 1,
    active_status: 1,
    reopen_status: 1,
    assigned_user_id: 2,
    user_id: 9,
    estimated_hours: 3,
    due_date: 4,
    start_date: 5,
    description: 6,
    team_id: 10,
    priority: 11,
  };

  const fieldMapping = {
    due_date: "end_date",
  };
  try {
    const userDetails = await getAuthUserDetails(updated_by, res);
    const role_id = userDetails.role_id;


    const [tasks] = await db.query(
      "SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL",
      [id]
    );
    const [sub_task_counts] = await db.query(
      "SELECT * FROM sub_tasks WHERE task_id = ? AND deleted_at IS NULL",
      [id]
    );
    const currentTask = tasks[0];
    const assignee_id = currentTask.user_id;

    if (status && active_status && reopen_status) {
      if (!assignee_id && sub_task_counts.length === 0) {
        return errorResponse(
          res,
          null,
          "Task is not assigned to any user",
          400
        );
      }
      const result = await checkUpdatePermission({
        id,
        type: "task",
        status,
        active_status,
        reopen_status,
        role_id,
        res,
      });

      if (!result.allowed) {
        return res.status(403).json({ message: result.message });
      }
    }

    if (user_id) {
      const [assigned_user] = await db.query(
        "SELECT id, team_id FROM users WHERE id = ? AND deleted_at IS NULL",
        [user_id]
      );
      if (assigned_user.length === 0) {
        return errorResponse(
          res,
          null,
          "Assigned User not found or has been deleted",
          404
        );
      }
      payload.team_id = assigned_user[0].team_id;

      const notificationPayload = {
        title: "New Task Assigned",
        body: "A new task has been assigned to you. Check your dashboard for details.",
      };
      const socketIds = userSockets[user_id];
      if (Array.isArray(socketIds)) {
        socketIds.forEach((socketId) => {
          req.io
            .of("/notifications")
            .to(socketId)
            .emit("push_notification", notificationPayload);
        });
      }
      await db.execute(
        "INSERT INTO notifications (user_id, title, body, read_status, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())",
        [user_id, notificationPayload.title, notificationPayload.body, 0]
      );
    }

    if (assigned_user_id) {
      const [user] = await db.query(
        "SELECT id FROM users WHERE id = ? AND deleted_at IS NULL",
        [assigned_user_id]
      );
      if (user.length === 0) {
        return errorResponse(
          res,
          null,
          "Owner not found or has been deleted",
          404
        );
      }
    }

    if (team_id) {
      const [team] = await db.query(
        "SELECT id FROM teams WHERE id = ? AND deleted_at IS NULL",
        [team_id]
      );
      if (team.length === 0) {
        return errorResponse(
          res,
          null,
          "Team not found or has been deleted",
          404
        );
      }
    }


    if (!currentTask) {
      return errorResponse(
        res,
        null,
        "Task not found or has been deleted",
        404
      );
    }
    if (sub_task_counts.length === 0) {
      if (active_status == 1 && status == 1) {
        if (!userDetails || userDetails.id == undefined) {
          return;
        }
        if (userDetails.role_id == 4) {
          await this.startTask(currentTask, "task", currentTask.id, res);
        } else {
          return errorResponse(res, "You are not allowed to start task", 400);
        }
      } else if (active_status == 0 && status == 1) {
        const [existingSubtaskSublime] = await db.query(
          "SELECT * FROM sub_tasks_user_timeline WHERE end_time IS NULL AND user_id = ?",
          [updated_by]
        );
        if (existingSubtaskSublime.length > 0) {
          const timeline = existingSubtaskSublime[0];
          if (userDetails.role_id == 4) {
            await this.pauseTask(
              currentTask,
              "task",
              currentTask.id,
              timeline.start_time,
              timeline.id,
              res
            );
          } else {
            return errorResponse(res, "You are not allowed to pause task", 400);
          }
        }
      } else if (active_status == 0 && status == 2) {
        const [existingSubtaskSublime] = await db.query(
          "SELECT * FROM sub_tasks_user_timeline WHERE end_time IS NULL AND user_id = ?",
          [updated_by]
        );
        if (existingSubtaskSublime.length > 0) {
          const timeline = existingSubtaskSublime[0];
          if (userDetails.role_id == 4) {
            await this.endTask(
              currentTask,
              "task",
              currentTask.id,
              timeline.start_time,
              timeline.id,
              "completed",
              res
            );
          } else {
            return errorResponse(res, "You are not allowed to end task", 400);
          }
        }
      }
    }

    if (
      currentTask.status == 1 &&
      currentTask.active_status == 1 &&
      currentTask.reopen_status == 0 &&
      user_id &&
      user_id != currentTask.user_id
    ) {
      return errorResponse(
        res,
        null,
        "Assigned user cannot be changed while task is active and in progress.",
        400
      );
    }

    //   if(payload.status !== "NULL" && payload.status !== undefined) {

    //  const currentStatusGroup = commonStatusGroup(
    //     currentTask.status,
    //     currentTask.reopen_status,
    //     currentTask.active_status
    //   );
    //   // Block updates if current status is InProgress, Done, or InReview
    //   if (
    //     ["InProgress", "Done","Pending Approval"].includes(currentStatusGroup) &&
    //     payload.status !== currentTask.status // only block if trying to change status
    //   ) {
    //     return errorResponse(
    //       res,
    //       null,
    //       `Status change is not allowed when the task status in '${currentStatusGroup}'.`,
    //       400
    //     );
    //   }
    // }
    if (estimated_hours) {
      const timeMatch = estimated_hours.match(
        /^((\d+)d\s*)?((\d+)h\s*)?((\d+)m\s*)?((\d+)s)?$/
      );
      if (!timeMatch) {
        return errorResponse(
          res,
          null,
          'Invalid format for estimated_hours. Use formats like "1d 2h 30m 30s", "2h 30m", or "45m 15s".',
          400
        );
      }
      const days = parseInt(timeMatch[2] || "0", 10);
      const hours = parseInt(timeMatch[4] || "0", 10);
      const minutes = parseInt(timeMatch[6] || "0", 10);
      const seconds = parseInt(timeMatch[8] || "0", 10);
      if (
        days < 0 ||
        hours < 0 ||
        minutes < 0 ||
        seconds < 0 ||
        minutes >= 60 ||
        seconds >= 60
      ) {
        return errorResponse(
          res,
          null,
          "Invalid time values in estimated_hours",
          400
        );
      }
      // Convert days to hours and calculate total hours
      const totalHours = days * 8 + hours;
      // Format as "HH:MM:SS"
      payload.estimated_hours = `${String(totalHours).padStart(
        2,
        "0"
      )}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
        2,
        "0"
      )}`;
      // Validate range only if both dates are present
      const startDateToCheck = payload.start_date || currentTask.start_date;
      const dueDateToCheck = payload.end_date || currentTask.end_date;

      if (startDateToCheck && dueDateToCheck) {
        const start = new Date(startDateToCheck);
        const end = new Date(dueDateToCheck);

        // Normalize to remove time
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);

        if (start > end) {
          return errorResponse(
            res,
            null,
            "Start date cannot be after due date.",
            400
          );
        }

        const diffMs = end - start;
        const diffDays = diffMs / (1000 * 60 * 60 * 24) + 1; // inclusive
        const maxAllowedHours = diffDays * 8;

        if (totalHours > maxAllowedHours) {
          return errorResponse(
            res,
            null,
            `Estimated hours (${totalHours.toFixed(
              2
            )}h) exceed available working hours (${maxAllowedHours}h) between start and due date.`,
            400
          );
        }
      }
    }

    if (payload.due_date) {
      const startDateToCheck = payload.start_date || currentTask.start_date;
      const dueDateToCheck = payload.due_date || currentTask.due_date;
      const estimatedHoursToCheck = (
        payload.estimated_hours ||
        currentTask.estimated_hours ||
        ""
      ).trim();
      if (startDateToCheck && dueDateToCheck && estimatedHoursToCheck) {
        let totalHours = 0;
        const durationMatch = estimatedHoursToCheck.match(
          /^((\d+)\s*d\s*)?((\d+)\s*h\s*)?((\d+)\s*m\s*)?((\d+)\s*s\s*)?$/i
        );
        if (durationMatch) {
          const days = parseInt(durationMatch[2] || "0", 10);
          const hours = parseInt(durationMatch[4] || "0", 10);
          const minutes = parseInt(durationMatch[6] || "0", 10);
          const seconds = parseInt(durationMatch[8] || "0", 10);
          totalHours = days * 8 + hours + minutes / 60 + seconds / 3600;
        } else {
          const [h = "0", m = "0", s = "0"] = estimatedHoursToCheck.split(":");
          totalHours =
            parseInt(h, 10) + parseInt(m, 10) / 60 + parseInt(s, 10) / 3600;
        }
        // Normalize both dates (remove time & timezone)
        const start = new Date(startDateToCheck);
        const end = new Date(dueDateToCheck);
        const localStart = new Date(
          start.getFullYear(),
          start.getMonth(),
          start.getDate()
        );
        const localEnd = new Date(
          end.getFullYear(),
          end.getMonth(),
          end.getDate()
        );
        const diffMs = localEnd - localStart;
        const diffDays = diffMs / (1000 * 60 * 60 * 24) + 1;
        const requiredDays = Math.ceil(totalHours / 8);
        if (diffDays < requiredDays) {
          return errorResponse(
            res,
            null,
            `End date must be at least ${requiredDays} day(s) after start date for estimated hours of ${estimatedHoursToCheck}`,
            400
          );
        }
      }
    }

    const getStatusGroup = (status, reopenStatus, activeStatus) => {
      status = Number(status);
      reopenStatus = Number(reopenStatus);
      activeStatus = Number(activeStatus);
      if (status === 0 && reopenStatus === 0 && activeStatus === 0) {
        return "To Do";
      } else if (status === 1 && reopenStatus === 0 && activeStatus === 0) {
        return "On Hold";
      } else if (status === 2 && reopenStatus === 0) {
        return "Pending Approval";
      } else if (reopenStatus === 1 && activeStatus === 0) {
        return "Reopen";
      } else if (status === 1 && activeStatus === 1) {
        return "InProgress";
      } else if (status === 3) {
        return "Done";
      }
      return "";
    };

    const getUsername = async (userId) => {
      try {
        const [user] = await db.query(
          "SELECT first_name, last_name FROM users WHERE id = ?",
          [userId]
        );
        return user.length > 0
          ? `${user[0].first_name} ${user[0].last_name}`
          : "";
      } catch (error) {
        console.error("Error fetching user:", error);
        return "Error fetching user";
      }
    };

    const getTeamName = async (teamId) => {
      try {
        const [team] = await db.query("SELECT name FROM teams WHERE id = ?", [
          teamId,
        ]);
        return team.length > 0 ? team[0].name : "";
      } catch (error) {
        console.error("Error fetching team:", error);
        return "Error fetching team";
      }
    };

    async function processStatusData(statusFlag, data, taskId, subtaskId) {
      let task_data;

      if (!subtaskId) {
        task_data = await db.query("SELECT * FROM tasks WHERE id = ?", [
          taskId,
        ]);
      } else {
        task_data = await db.query("SELECT * FROM sub_tasks WHERE id = ?", [
          subtaskId,
        ]);
      }

      if (!task_data || task_data.length === 0) {
        return "Task/Subtask not found";
      }

      const task = task_data[0][0];

      switch (statusFlag) {
        case 0:
          return getStatusGroup(data, task.reopen_status, task.active_status);
        case 1:
          return getStatusGroup(data, task.reopen_status, task.active_status);
        case 2:
          return getUsername(data);
        case 9:
          return getUsername(data);
        case 10:
          return getTeamName(data);
        default:
          return data;
      }
    }

    async function processStatusData1(statusFlag, data) {
      switch (statusFlag) {
        case 0:
          return getStatusGroup(status, reopen_status, active_status);
        case 1:
          return getStatusGroup(status, reopen_status, active_status);
        case 2:
          return getUsername(data);
        case 9:
          return getUsername(data);
        case 10:
          return getTeamName(data);
        default:
          return data;
      }
    }

    const fieldsToRemove = ["updated_by", "reopen_status", "active_status"];
    const cleanedPayload = Object.fromEntries(
      Object.entries(payload).filter(([key]) => !fieldsToRemove.includes(key))
    );
    const taskHistoryEntries = [];
    for (const key in cleanedPayload) {
      if (payload[key] !== undefined && payload[key] !== currentTask[key]) {
        const flag = statusFlagMapping[key] || null;
        taskHistoryEntries.push([
          await processStatusData(flag, currentTask[key], id, null),
          await processStatusData1(flag, payload[key]),

          // currentTask[key],
          // payload[key],
          id,
          null, // subtask_id (optional)
          `Changed ${key}`,
          updated_by,
          flag,
          new Date(),
          new Date(),
          null,
        ]);
      }
    }
    payload.updated_by = updated_by;
    payload.reopen_status = reopen_status;
    payload.active_status = active_status;

    const updateFields = [];
    const updateValues = [];

    for (const key in payload) {
      if (payload[key] !== undefined && payload[key] !== currentTask[key]) {
        const fieldName = fieldMapping[key] || key;
        updateFields.push(`${fieldName} = ?`);
        updateValues.push(payload[key]);
      }
    }

    // if (updateFields.length === 0) {
    //   return errorResponse(res, null, "No fields to update", 400);
    // }

    updateFields.push(`updated_at = NOW()`);

    const updateQuery = `UPDATE tasks SET ${updateFields.join(
      ", "
    )} WHERE id = ?`;
    updateValues.push(id);

    const [updateResult] = await db.query(updateQuery, updateValues);

    if (updateResult.affectedRows === 0) {
      return errorResponse(res, null, "Task not updated", 400);
    }

    // Insert task history entries into the task_histories table
    if (taskHistoryEntries.length > 0) {
      // const historyQuery = `
      //   INSERT INTO task_histories (
      //     old_data, new_data, task_id, subtask_id, text,
      //     updated_by, status_flag, created_at, updated_at, deleted_at
      //   ) VALUES ?;
      // `;
      // await db.query(historyQuery, [taskHistoryEntries]);
      const historyQuery = `
  INSERT INTO task_histories (
    old_data, new_data, task_id, subtask_id, text,
    updated_by, status_flag, created_at, updated_at, deleted_at
  ) VALUES ${taskHistoryEntries
          .map(() => "(?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NULL)")
          .join(", ")}
`;

      await db.query(historyQuery, taskHistoryEntries.flat());
    }

    if (currentTask.user_id) {
      let notificationTitle = "";
      let notificationBody = "";

      if (reopen_status == 1) {
        notificationTitle = "Task Reopened";
        notificationBody =
          "Your task has been reopened for further review. Please check the updates.";
      } else if (status == 3) {
        notificationTitle = "Task Approved";
        notificationBody =
          "Your submitted task has been successfully approved.";
      }

      if (notificationTitle && notificationBody) {
        const notificationPayload = {
          title: notificationTitle,
          body: notificationBody,
        };
        const socketIds = userSockets[currentTask.user_id];

        if (Array.isArray(socketIds)) {
          socketIds.forEach((socketId) => {
            req.io
              .of("/notifications")
              .to(socketId)
              .emit("push_notification", notificationPayload);
          });
        }

        await db.execute(
          "INSERT INTO notifications (user_id, title, body, read_status, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())",
          [
            currentTask.user_id,
            notificationPayload.title,
            notificationPayload.body,
            0,
          ]
        );
      }
    }
    return successResponse(
      res,
      { id, ...payload },
      "Task updated successfully"
    );
  } catch (error) {
    return errorResponse(res, error.message, "Error updating task", 500);
  }
};

// exports.deleteTask = async (id, res) => {
//   try {
//     const subtaskQuery =
//       "SELECT COUNT(*) as subtaskCount FROM sub_tasks WHERE task_id = ? AND deleted_at IS NULL";
//     const [subtaskResult] = await db.query(subtaskQuery, [id]);

//     if (subtaskResult[0].subtaskCount > 0) {
//       return errorResponse(
//         res,
//         null,
//         "Task has associated subtasks and cannot be deleted",
//         400
//       );
//     }

//     const query = "UPDATE tasks SET deleted_at = NOW() WHERE id = ?";
//     const [result] = await db.query(query, [id]);

//     if (result.affectedRows === 0) {
//       return errorResponse(res, null, "Task not found", 404);
//     }

//     return successResponse(res, null, "Task deleted successfully");
//   } catch (error) {
//     return errorResponse(res, error.message, "Error deleting task", 500);
//   }
// };

exports.deleteTask = async (id, res) => {
  try {
    // Check if any subtasks exist
    const subtaskQuery =
      "SELECT COUNT(*) as subtaskCount FROM sub_tasks WHERE task_id = ? AND deleted_at IS NULL";
    const [subtaskResult] = await db.query(subtaskQuery, [id]);

    if (subtaskResult[0].subtaskCount > 0) {
      return errorResponse(
        res,
        null,
        "Task has associated subtasks and cannot be deleted",
        400
      );
    }

    // Get task status details
    const statusQuery =
      "SELECT status, reopen_status, active_status FROM tasks WHERE id = ? AND deleted_at IS NULL";
    const [taskStatusResult] = await db.query(statusQuery, [id]);

    if (taskStatusResult.length === 0) {
      return errorResponse(res, null, "Task not found", 404);
    }

    const { status, reopen_status, active_status } = taskStatusResult[0];

    // Prevent deletion if task is "InProgress"
    const currentGroup = commonStatusGroup(
      status,
      reopen_status,
      active_status
    );
    if (currentGroup === "InProgress") {
      return errorResponse(
        res,
        null,
        "Task is InProgress and cannot be deleted",
        400
      );
    }

    // Soft delete the task
    const deleteQuery = "UPDATE tasks SET deleted_at = NOW() WHERE id = ?";
    const [deleteResult] = await db.query(deleteQuery, [id]);

    if (deleteResult.affectedRows === 0) {
      return errorResponse(res, null, "Task not found", 404);
    }

    return successResponse(res, null, "Task deleted successfully");
  } catch (error) {
    return errorResponse(res, error.message, "Error deleting task", 500);
  }
};

const lastActiveTask = async (userId) => {
  try {
    const query = `
        SELECT stut.*, s.name as subtask_name, s.estimated_hours as subtask_estimated_hours,s.priority as subtask_priority,t.priority as task_priority,
               s.total_hours_worked as subtask_total_hours_worked, t.name as task_name,pr.name as project_name, pd.name as product_name,
               t.estimated_hours as task_estimated_hours, t.total_hours_worked as task_total_hours_worked,u1.first_name AS subtask_assigned_to,
                u2.first_name AS subtask_assigned_by,
                u3.first_name AS task_assigned_to,
                u4.first_name AS task_assigned_by
        FROM sub_tasks_user_timeline stut
        LEFT JOIN sub_tasks s ON stut.subtask_id = s.id
        LEFT JOIN products pd ON stut.product_id = pd.id
        LEFT JOIN projects pr ON stut.project_id = pr.id
        LEFT JOIN tasks t ON stut.task_id = t.id
        LEFT JOIN 
            users u1 ON s.user_id = u1.id
        LEFT JOIN 
            users u2 ON s.assigned_user_id = u2.id
        LEFT JOIN 
            users u3 ON t.user_id = u3.id
        LEFT JOIN 
            users u4 ON t.assigned_user_id = u4.id
        WHERE stut.user_id = ? AND stut.end_time IS NULL
        AND t.deleted_at IS NULL AND s.deleted_at IS NULL
        ORDER BY stut.start_time DESC
        LIMIT 1;
    `;

    // Use db.query for mysql2 promises and destructure result
    const [lastActiveTaskRows] = await db.query(query, [userId]);

    // If no active task is found, return null
    if (lastActiveTaskRows.length === 0) return null;

    const task = lastActiveTaskRows[0];

    const lastStartTime = moment(task.start_time);
    const now = moment();
    const timeDifference = now.diff(lastStartTime, "seconds"); // Calculate the difference in seconds
    const totalWorkedTime = task.subtask_id
      ? moment.duration(task.subtask_total_hours_worked).asSeconds()
      : moment.duration(task.task_total_hours_worked).asSeconds();
    const totaltimeTaken = totalWorkedTime + timeDifference;
    const timeTaken = convertSecondsToHHMMSS(totaltimeTaken);
    // Calculate the time left based on whether it's a subtask or task
    const timeLeft = calculateTimeLeft(
      task.subtask_id
        ? task.subtask_estimated_hours
        : task.task_estimated_hours,
      task.subtask_id
        ? task.subtask_total_hours_worked
        : task.task_total_hours_worked,
      timeDifference
    );
    task.timeline_id = task.id;
    // Add time left to the task or subtask object
    task.time_left = timeLeft;
    task.type = task.subtask_id ? "subtask" : "task";
    task.priority = task.subtask_id
      ? task.subtask_priority
      : task.task_priority;
    task.estimated_hours = task.subtask_id
      ? task.subtask_estimated_hours
      : task.task_estimated_hours;
    task.total_hours_worked = task.subtask_id
      ? task.subtask_total_hours_worked
      : task.task_total_hours_worked;
    task.id = task.subtask_id || task.task_id;
    task.time_exceed_status = task.subtask_id
      ? task.subtask_total_hours_worked > task.subtask_estimated_hours
        ? true
        : false
      : task.task_total_hours_worked > task.estimated_hours
        ? true
        : false;
    task.assignedTo = task.subtask_id
      ? task.subtask_assigned_to
      : task.task_assigned_to;
    task.assignedBy = task.subtask_id
      ? task.subtask_assigned_by
      : task.task_assigned_by;
    task.timeTaken = timeTaken;
    const keysToRemove = [
      "subtask_priority",
      "task_priority",
      "subtask_estimated_hours",
      "subtask_total_hours_worked",
      "task_total_hours_worked",
      "task_estimated_hours",
      "subtask_assigned_to",
      "task_assigned_to",
      "subtask_assigned_by",
      "task_assigned_by",
      "task_id",
      "subtask_id",
    ];

    keysToRemove.forEach((key) => delete task[key]);
    return task;
  } catch (err) {
    console.error("Error fetching last active task:", err.message);
    return null;
  }
};

const formatTime = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0"
  )}:${String(remainingSeconds).padStart(2, "0")}`;
};

exports.getTaskList = async (queryParams, res) => {
  try {
    const { user_id, product_id, project_id, team_id, priority, search, member_id, dropdown_products, dropdown_projects } = queryParams;

    // Validate if user_id exists
    if (!user_id) {
      console.log("Missing user_id in query parameters");
      return errorResponse(
        res,
        "User ID is required",
        "Missing user_id in query parameters",
        400
      );
    }

    // Get user details
    const userDetails = await getAuthUserDetails(user_id, res);

    if (!userDetails || userDetails.id == undefined) {
      return;
    }
    const { role_id, team_id: userTeamId } = userDetails;
    // Base query for tasks
    let baseQuery = `
      SELECT 
        tasks.id AS task_id, 
        tasks.name AS task_name,
        user_id,
        tasks.priority,
        tasks.estimated_hours,
        tasks.total_hours_worked,
        tasks.status AS task_status,
        tasks.reopen_status,
        tasks.assigned_user_id,
        tasks.updated_at,
        tasks.created_at,
        tasks.created_by,
        tasks.active_status,
        tasks.product_id,
        tasks.project_id,
        u.team_id,
        projects.name AS project_name,
        asu.first_name AS assigned_user,
        products.name AS product_name,
        u.first_name AS assignee_name,
        teams.name AS team_name,
        teams.id AS team_id
      FROM tasks
      LEFT JOIN projects ON tasks.project_id = projects.id
      LEFT JOIN products ON tasks.product_id = products.id
      LEFT JOIN users u ON tasks.user_id = u.id
      LEFT JOIN users AS asu ON tasks.assigned_user_id = asu.id
      LEFT JOIN teams ON u.team_id = teams.id
      WHERE tasks.deleted_at IS NULL
    `;

    const params = [];
    if(role_id !== 3) {
    if (team_id) {
      baseQuery += ` AND (
        u.team_id = ? OR EXISTS (
          SELECT 1 FROM sub_tasks 
          LEFT JOIN users su ON sub_tasks.user_id = su.id
          WHERE sub_tasks.task_id = tasks.id 
          AND su.team_id = ?
          AND sub_tasks.deleted_at IS NULL
        )
      )`;
      params.push(team_id, team_id);
    }
  }
    if (role_id === 3) {
      const queryteam =
        "SELECT id FROM teams WHERE deleted_at IS NULL AND reporting_user_id = ?";
      const [rowteams] = await db.query(queryteam, [user_id]);
      let teamIds = [];
      if (rowteams.length > 0) {
        teamIds = rowteams.map((row) => row.id);
        baseQuery += ` AND u.team_id IN (?)`;
        params.push(teamIds);
        baseQuery += ` AND (
          -- 1. If the task is assigned to the user but has no subtasks, return it
          (NOT EXISTS (
              SELECT 1 FROM sub_tasks 
              WHERE sub_tasks.task_id = tasks.id 
              AND sub_tasks.deleted_at IS NULL
          ) 
          AND tasks.team_id IN (?))
           OR
  
          -- 2. If at least one subtask is assigned to the user OR 
          --    all subtasks are unassigned and the main task is assigned to the user, return it
          EXISTS (
              SELECT 1 FROM sub_tasks 
              WHERE sub_tasks.task_id = tasks.id 
              AND (
                  sub_tasks.team_id IN (?) 
                  OR (tasks.team_id IN (?) AND NOT EXISTS (
                      SELECT 1 FROM sub_tasks 
                      WHERE sub_tasks.task_id = tasks.id 
                      AND sub_tasks.user_id IS NOT NULL
                  ))
              )
              AND sub_tasks.deleted_at IS NULL
          )
  
          OR
  
          -- 3. If all subtasks have NULL user_id but the main task is assigned to the user, return them
          (
              tasks.team_id IN (?)
              AND EXISTS (
                  SELECT 1 FROM sub_tasks 
                  WHERE sub_tasks.task_id = tasks.id 
                  AND sub_tasks.user_id IS NULL
                  AND sub_tasks.deleted_at IS NULL
              )
          )
      )`;
        params.push(teamIds, teamIds, teamIds, teamIds);
        console.log("teamIds", teamIds);
      } else {
        return errorResponse(
          res,
          "No Teams assigned for this Team leader",
          500
        );
      }
    }

    if (role_id === 4) {
      baseQuery += ` AND (
          -- 1. If the task is assigned to the user but has no subtasks, return it
          (NOT EXISTS (
              SELECT 1 FROM sub_tasks 
              WHERE sub_tasks.task_id = tasks.id 
              AND sub_tasks.deleted_at IS NULL
          ) 
          AND tasks.user_id = ?)
  
          OR
  
          -- 2. If at least one subtask is assigned to the user OR 
          --    all subtasks are unassigned and the main task is assigned to the user, return it
          EXISTS (
              SELECT 1 FROM sub_tasks 
              WHERE sub_tasks.task_id = tasks.id 
              AND (
                  sub_tasks.user_id = ? 
                  OR (tasks.user_id = ? AND NOT EXISTS (
                      SELECT 1 FROM sub_tasks 
                      WHERE sub_tasks.task_id = tasks.id 
                      AND sub_tasks.user_id IS NOT NULL
                  ))
              )
              AND sub_tasks.deleted_at IS NULL
          )
  
          OR
  
          -- 3. If all subtasks have NULL user_id but the main task is assigned to the user, return them
          (
              tasks.user_id = ?
              AND EXISTS (
                  SELECT 1 FROM sub_tasks 
                  WHERE sub_tasks.task_id = tasks.id 
                  AND sub_tasks.user_id IS NULL
                  AND sub_tasks.deleted_at IS NULL
              )
          )
      )`;

      params.push(user_id, user_id, user_id, user_id);
    }
    if (role_id === 3) {
      if (member_id) {
        baseQuery += `
          AND (
            tasks.user_id = ?
            OR EXISTS (
              SELECT 1 FROM sub_tasks 
              WHERE sub_tasks.task_id = tasks.id 
                AND sub_tasks.user_id = ?
                AND sub_tasks.deleted_at IS NULL
            )
          )`;
        params.push(member_id, member_id);
      }
    }
    // Additional filters
    if (product_id) {
      baseQuery += ` AND tasks.product_id = ?`;
      params.push(product_id);
    }

    if (project_id) {
      baseQuery += ` AND tasks.project_id = ?`;
      params.push(project_id);
    }

    if (priority) {
      baseQuery += ` AND (
        tasks.priority = ? OR EXISTS (
          SELECT 1 FROM sub_tasks 
          WHERE sub_tasks.task_id = tasks.id 
          AND sub_tasks.priority = ?
          AND sub_tasks.deleted_at IS NULL
        )
      )`;
      params.push(priority, priority);
    }

    if (dropdown_products) {
      const dropDownProducts = dropdown_products
        .split(",")
        .map((id) => id.trim());
      if (dropDownProducts.length > 0) {
        baseQuery += `AND tasks.product_id IN (${dropDownProducts
          .map(() => "?")
          .join(",")})`;
        params.push(...dropDownProducts);
      }
    }
    if (dropdown_projects) {
      const dropDownProjects = dropdown_projects
        .split(",")
        .map((id) => id.trim());
      if (dropDownProjects.length > 0) {
        baseQuery += `AND tasks.project_id IN (${dropDownProjects
          .map(() => "?")
          .join(",")})`;
        params.push(...dropDownProjects);
      }
    }

    if (search) {
      const searchTerm = `%${search}%`;
      baseQuery += `
        AND (
          tasks.name LIKE ?
          OR EXISTS (
            SELECT 1 
            FROM sub_tasks
            WHERE sub_tasks.task_id = tasks.id 
              AND sub_tasks.name LIKE ? 
              AND sub_tasks.deleted_at IS NULL
          )
          OR projects.name LIKE ?
          OR products.name LIKE ?
          OR u.first_name LIKE ?
          OR u.last_name LIKE ?
          OR teams.name LIKE ?
          OR tasks.priority LIKE ?
        )`;
      params.push(
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm
      );
    }

    if (role_id === 2) {
      baseQuery += `
          ORDER BY
        CASE WHEN tasks.assigned_user_id = ? THEN 0 ELSE 1 END,
        CASE tasks.priority
          WHEN 'High' THEN 1
          WHEN 'Medium' THEN 2
          WHEN 'Low' THEN 3
          ELSE 4
        END,
        tasks.updated_at DESC
        `;
      params.push(user_id);
    } else {
      baseQuery += ` ORDER BY tasks.updated_at DESC`;
    }

    // Execute the base query for tasks
    const [tasks] = await db.query(baseQuery, params);
    let allSubtasks = [];
    if (tasks.length > 0) {
      const taskIds = tasks.map((task) => task.task_id);
      console.log("taskIds", taskIds);
      let query = `
        SELECT 
          sub_tasks.id AS subtask_id, 
          sub_tasks.name AS subtask_name,
          sub_tasks.user_id As assignee_id, 
          sub_tasks.assigned_user_id AS assigned_user_id,
          tasks.user_id AS task_user_id,
          task_id,
          subtask_assignee_team.name AS subtask_user_team_name,
          sub_tasks.user_id AS subtask_user_id,
          sub_tasks.estimated_hours AS estimated_hours, 
          sub_tasks.total_hours_worked AS total_hours_worked, 
          sub_tasks.status AS status, 
          sub_tasks.reopen_status AS reopen_status, 
          sub_tasks.active_status AS active_status,
          assigned_u.first_name AS assigned_user,
          sub_tasks.updated_at,
          sub_tasks.priority
        FROM sub_tasks
        LEFT JOIN users AS assigned_u ON sub_tasks.assigned_user_id = assigned_u.id
        LEFT JOIN teams AS subtask_user_team ON assigned_u.team_id = subtask_user_team.id
        LEFT JOIN tasks ON sub_tasks.task_id = tasks.id
         LEFT JOIN users AS subtask_user ON sub_tasks.user_id = subtask_user.id
          LEFT JOIN teams AS subtask_assignee_team ON subtask_user.team_id = subtask_assignee_team.id
        LEFT JOIN users AS task_user ON tasks.user_id = task_user.id
        WHERE task_id IN (?)
          AND sub_tasks.deleted_at IS NULL
      `;
      const queryParams = [taskIds];
      if (role_id === 2) {
        query += `
          ORDER BY
            CASE WHEN sub_tasks.assigned_user_id = ? THEN 0 ELSE 1 END,
            CASE sub_tasks.priority
            WHEN 'High' THEN 1
            WHEN 'Medium' THEN 2
            WHEN 'Low' THEN 3
            ELSE 4
        END,
            sub_tasks.updated_at DESC
        `;
        queryParams.push(user_id);
      } else {
        baseQuery += ` ORDER BY tasks.updated_at DESC`;
      }

      // Add user_id filter only if role_id is 4
      if (role_id === 4) {
        query +=
          " AND sub_tasks.user_id = ? OR (sub_tasks.user_id IS NULL AND tasks.user_id = ? AND sub_tasks.deleted_at IS NULL)";
        queryParams.push(user_id, user_id);
      }else if (role_id === 3) {
        const queryteam =
        "SELECT id FROM teams WHERE deleted_at IS NULL AND reporting_user_id = ?";
      const [rowteams] = await db.query(queryteam, [user_id]);
      let teamIds = [];
      if (rowteams.length > 0) {
        teamIds = rowteams.map((row) => row.id);
      }

  query += " AND sub_tasks.deleted_at IS NULL AND (sub_tasks.user_id IS NULL AND tasks.team_id IN (?)) OR (sub_tasks.user_id IS NOT NULL AND subtask_user.team_id IN (?) AND sub_tasks.deleted_at IS NULL)";
   queryParams.push(teamIds, teamIds);  
      }
        [allSubtasks] = await db.query(query, queryParams);


    } 

    // Group subtasks by task_id
    const subtasksByTaskId = allSubtasks.reduce((acc, subtask) => {
      if (!acc[subtask.task_id]) acc[subtask.task_id] = [];
      acc[subtask.task_id].push(subtask);
      return acc;
    }, {});
    // Define the task sections (groups)
    const groups = {
      To_Do: [],
      On_Hold: [],
      Pending_Approval: [],
      Reopen: [],
      In_Progress: [],
      Done: [],
    };

    // Helper function to determine the status group
    const getStatusGroup = (status, reopenStatus, activeStatus) => {
      if (status === 0 && reopenStatus === 0 && activeStatus === 0) {
        return "To_Do";
      } else if (status === 1 && reopenStatus === 0 && activeStatus === 0) {
        return "On_Hold";
      } else if (status === 2 && reopenStatus === 0) {
        return "Pending_Approval";
      } else if (reopenStatus === 1 && activeStatus === 0) {
        return "Reopen";
      } else if (status === 1 && activeStatus === 1) {
        return "In_Progress";
      } else if (status === 3) {
        return "Done";
      }
      return null; // Default case if status doesn't match any known group
    };
    // Iterate through tasks and categorize
    tasks.forEach((task) => {
      const taskDetails = {
        task_id: task.task_id,
        user_id: task.user_id,
        task_name: task.task_name,
        project_name: task.project_name,
        product_name: task.product_name,
        product_color: getColorForProduct(task.product_name),
        priority: task.priority,
        estimated_hours: formatTimeDHMS(task.estimated_hours),
        assignee_name: task.assignee_name,
        team_name: task.team_name,
        team_id: task.team_id,
        assigned_by: task.assigned_user,
        assigned_by_id: task.assigned_user_id,
        created_by: task.created_by,
        created_at: task.created_at,
        updated_at: task.updated_at,
      };

      const subtasks = subtasksByTaskId[task.task_id] || [];
      const groupedSubtasks = {};
      // If the task has subtasks, group them by subtask status
      if (subtasks.length > 0) {
        subtasks.forEach((subtask) => {
          const group = getStatusGroup(
            subtask.status,
            subtask.reopen_status,
            subtask.active_status
          );
          if (group) {
            if (!groupedSubtasks[group]) {
              groupedSubtasks[group] = [];
            }
            groupedSubtasks[group].push({
              subtask_id: subtask.subtask_id,
              user_id: subtask.user_id,
              subtask_name: subtask.subtask_name,
              team_name: subtask.subtask_user_team_name,
              estimated_hours: formatTimeDHMS(subtask.estimated_hours),
              assigned_by: subtask.assigned_user,
              assigned_by_id: subtask.assigned_user_id,
              assignee_id: subtask.assignee_id,
              updated_at: subtask.updated_at,
              status: subtask.status,
              priority: subtask.priority,
              reopen_status: subtask.reopen_status,
              active_status: subtask.active_status,
            });
          }
        });
      } else {
        // If no subtasks, classify based on task status
        const group = getStatusGroup(
          task.task_status,
          task.reopen_status,
          task.active_status
        );
        if (group) {
          groupedSubtasks[group] = [];
        }
      }
      // Add task to respective groups
      Object.keys(groupedSubtasks).forEach((group) => {
        groups[group].push({
          task_details: taskDetails,
          subtask_details: groupedSubtasks[group],
        });
      });
    });

    // Sort tasks within each group
    Object.keys(groups).forEach((groupKey) => {
      // groups[groupKey].sort((a, b) => {
      //   const aAssigned = a.task_details.assigned_by_id === user_id ? 0 : 1;
      //   const bAssigned = b.task_details.assigned_by_id === user_id ? 0 : 1;

      //   if (aAssigned !== bAssigned) {
      //     return aAssigned - bAssigned; // Prioritize tasks assigned to the user
      //   }

      //   // If both have the same assignment status, sort by updated_at descending
      //   return new Date(b.task_details.updated_at) - new Date(a.task_details.updated_at);
      // });

      // Sort subtasks within each task group
      if (role_id === 2) {
        groups[groupKey].forEach((taskGroup) => {
          taskGroup.subtask_details.sort((a, b) => {
            const aAssigned = a.assigned_by_id === user_id ? 0 : 1;
            const bAssigned = b.assigned_by_id === user_id ? 0 : 1;

            if (aAssigned !== bAssigned) {
              return aAssigned - bAssigned; // Prioritize subtasks assigned to the user
            }

            // If both have the same assignment status, sort by updated_at descending
            // return new Date(a.updated_at) - new Date(b.updated_at);
          });
        });
      }
    });

    const lastActiveTaskData = await lastActiveTask(user_id);

    const data = {
      groups: groups,
      taskCounts: Object.values(groups).map((group) => group.length),
      lastActiveTask: lastActiveTaskData,
    };

    console.log("Sending success response");
    return successResponse(res, data, "Task data retrieved successfully", 200);
  } catch (error) {
    console.error(error);
    return errorResponse(res, error.message, "Error fetching task data", 500);
  }
};

// Utility function for calculating time left
function calculateTimeLeft(estimatedHours, totalHoursWorked, timeDifference) {
  const timeLeft =
    convertToSeconds(estimatedHours) - convertToSeconds(totalHoursWorked);
  const times = timeLeft - timeDifference;
  const time = convertSecondsToHHMMSS(times);
  return times > 0 ? `${time}` : "Completed";
}

exports.doneTaskList = async (req, res) => {
  try {
    const {
      user_id,
      product_id,
      project_id,
      search,
      page = 1,
      perPage = 10,
    } = req.query;
    const offset = (page - 1) * perPage;

    const taskConditions = [];
    const taskValues = [];

    const subtaskConditions = [];
    const subtaskValues = [];

    // Task-specific filters
    if (product_id) {
      taskConditions.push("t.product_id = ?");
      taskValues.push(product_id);
    }
    if (project_id) {
      taskConditions.push("t.project_id = ?");
      taskValues.push(project_id);
    }
    if (user_id) {
      taskConditions.push("t.user_id = ?");
      taskValues.push(user_id);
    }

    if (search) {
      const searchTerm = `%${search}%`;
      taskConditions.push(
        `(t.name LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR pr.name LIKE ? OR tm.name LIKE ?)`
      );
      taskValues.push(
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm
      );
    }

    // Subtask-specific filters
    if (product_id) {
      subtaskConditions.push("st.product_id = ?");
      subtaskValues.push(product_id);
    }
    if (project_id) {
      subtaskConditions.push("st.project_id = ?");
      subtaskValues.push(project_id);
    }
    if (user_id) {
      subtaskConditions.push("st.user_id = ?");
      subtaskValues.push(user_id);
    }

    if (search) {
      const searchTerm = `%${search}%`;
      subtaskConditions.push(
        `(t.name LIKE ? OR st.name LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR pr.name LIKE ? OR tm.name LIKE ?)`
      );
      subtaskValues.push(
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm
      );
    }

    const taskWhereClause =
      taskConditions.length > 0 ? `AND ${taskConditions.join(" AND ")}` : "";
    const subtaskWhereClause =
      subtaskConditions.length > 0
        ? `AND ${subtaskConditions.join(" AND ")}`
        : "";

    // Query to fetch subtasks with status = 2
    const subtasksQuery = `
      SELECT 
        p.name AS product_name,
        pr.name AS project_name,
        t.name AS task_name,
        st.name AS subtask_name,
        st.estimated_hours AS estimated_time,
        st.total_hours_worked AS time_taken,
        st.rating AS subtask_rating,
        tm.name AS team_name,
        'Subtask' AS type,
        t.id AS task_id,
        st.id AS subtask_id,
        st.user_id AS subtask_user_id
      FROM 
        sub_tasks st
      LEFT JOIN 
        tasks t ON t.id = st.task_id
      LEFT JOIN 
        users u ON u.id = st.user_id
      LEFT JOIN 
        products p ON p.id = t.product_id
      LEFT JOIN 
        projects pr ON pr.id = t.project_id
      LEFT JOIN 
        teams tm ON tm.id = u.team_id
      LEFT JOIN 
        users u_assigned ON u_assigned.id = t.assigned_user_id

      WHERE 
        st.status = 3
        AND st.deleted_at IS NULL
        ${subtaskWhereClause}
    `;

    // Query to fetch tasks without subtasks
    const tasksQuery = `
      SELECT 
        p.name AS product_name,
        pr.name AS project_name,
        t.name AS task_name,
        t.estimated_hours AS estimated_time,
        t.total_hours_worked AS time_taken,
        t.rating AS task_rating,
        tm.name AS team_name,
        'Task' AS type,
        t.id AS task_id,
        NULL AS subtask_id,
        t.user_id AS task_user_id
      FROM 
        tasks t
      LEFT JOIN 
        users u ON u.id = t.user_id
              LEFT JOIN 
        products p ON p.id = t.product_id
      LEFT JOIN 
        projects pr ON pr.id = t.project_id
      LEFT JOIN 
        teams tm ON tm.id = u.team_id
      LEFT JOIN 
        users u_assigned ON u_assigned.id = t.assigned_user_id

      WHERE 
        t.deleted_at IS NULL
        AND t.status = 3
        AND t.id NOT IN (SELECT task_id FROM sub_tasks)
        ${taskWhereClause}
    `;

    // Execute both queries
    const [subtasks] = await db.query(subtasksQuery, subtaskValues);
    const [tasks] = await db.query(tasksQuery, taskValues);

    // Combine the results
    const mergedResults = [...subtasks, ...tasks];

    // Fetch assignee names and remove user_id
    const processedData = await Promise.all(
      mergedResults.map(async (item) => {
        const assigneeUserId = item.subtask_id
          ? item.subtask_user_id
          : item.task_user_id;
        const assigneeNameQuery = `SELECT COALESCE(CONCAT(first_name, ' ', last_name), first_name, last_name) AS assignee_name FROM users WHERE id = ?`;
        const [results] = await db.query(assigneeNameQuery, [assigneeUserId]);
        item.assignee_name = results[0] ? results[0].assignee_name : "Unknown";
        delete item.user_id;
        return item;
      })
    );

    // Pagination logic
    const totalRecords = processedData.length;
    const paginatedData = processedData.slice(
      offset,
      offset + parseInt(perPage)
    );
    const pagination = getPagination(page, perPage, totalRecords);

    // Add serial numbers to the paginated data
    const data = paginatedData.map((row, index) => ({
      s_no: offset + index + 1,
      ...row,
    }));
    successResponse(
      res,
      data,
      data.length === 0
        ? "No tasks or subtasks found"
        : "Done Tasks and subtasks retrieved successfully",
      200,
      pagination
    );
  } catch (error) {
    console.error("Error fetching tasks and subtasks:", error);
    return errorResponse(res, error.message, "Server error", 500);
  }
};

// Helper functions for task actions
exports.startTask = async (taskOrSubtask, type, id, res) => {
  if (type === "task") {
    const [subtasksexist] = await db.query("SELECT * FROM sub_tasks WHERE task_id = ? AND deleted_at IS NULL", [id]);
    if (subtasksexist.length > 0) {
      throw {
        status: 500,
        success: false,
        message: "This task cannot be started as it contains subtasks.",
        error: "This task cannot be started as it contains subtasks.",
      };
    }
  }
  const [existingSubtaskSublime] = await db.query(
    "SELECT * FROM sub_tasks_user_timeline WHERE end_time IS NULL AND user_id = ?",
    [taskOrSubtask.user_id]
  );
  if (existingSubtaskSublime.length > 0) {
    throw {
      status: 500,
      success: false,
      message: "You Already have Active Task",
      error: "You Already have Active Task",
    };
  }

  await db.query(
    "UPDATE ?? SET status = 1, active_status = 1, reopen_status = 0, updated_at = NOW() WHERE id = ?",
    [type === "subtask" ? "sub_tasks" : "tasks", id]
  );
  await db.query(
    "INSERT INTO sub_tasks_user_timeline (user_id, product_id, project_id, task_id, subtask_id, start_time) VALUES (?, ?, ?, ?, ?, ?)",
    [
      taskOrSubtask.user_id,
      taskOrSubtask.product_id,
      taskOrSubtask.project_id,
      type == "subtask" ? taskOrSubtask.task_id : taskOrSubtask.id,
      type == "subtask" ? taskOrSubtask.id : null,
      moment().format("YYYY-MM-DD HH:mm:ss"),
    ]
  );
};

exports.pauseTask = async (
  taskOrSubtask,
  type,
  id,
  lastStartTime,
  timeline_id,
  res
) => {
  const currentTime = moment();
  let timeDifference = currentTime.diff(lastStartTime, "seconds");

  // Prevent negative time difference
  let safeTimeDifference = timeDifference;
  if (timeDifference < 0) {
    console.warn("Time difference is negative. Adjusting to 0.");
    safeTimeDifference = 0;
  }

  // Calculate new total hours worked
  const newTotalHoursWorked = calculateNewWorkedTime(
    taskOrSubtask.total_hours_worked,
    safeTimeDifference
  );

  await db.query(
    "UPDATE ?? SET total_hours_worked = ?, status = 1, active_status = 0, reopen_status = 0, updated_at = NOW() WHERE id = ?",
    [type === "subtask" ? "sub_tasks" : "tasks", newTotalHoursWorked, id]
  );

  await db.query(
    "UPDATE sub_tasks_user_timeline SET end_time = ? WHERE id = ?",
    [moment().format("YYYY-MM-DD HH:mm:ss"), timeline_id]
  );
};

exports.endTask = async (
  taskOrSubtask,
  type,
  id,
  lastStartTime,
  timeline_id,
  comment,
  res
) => {
  if (!comment) {
    throw {
      status: 400,
      success: false,
      message: "Comment is required",
      error: "Comment is required",
    };
  }
  const currentTime = moment();
  const timeDifference = currentTime.diff(lastStartTime, "seconds");

  const newTotalHoursWorked = calculateNewWorkedTime(
    taskOrSubtask.total_hours_worked,
    timeDifference
  );

  const estimatedHours = taskOrSubtask.estimated_hours;

  const newTotalHoursWorkedSeconds = convertToSeconds(newTotalHoursWorked);
  const estimatedHoursSeconds = convertToSeconds(estimatedHours);

  const remainingSeconds = estimatedHoursSeconds - newTotalHoursWorkedSeconds;
  let extendedHours = "00:00:00";

  if (remainingSeconds < 0) {
    // Convert absolute seconds to HH:MM:SS
    const absSeconds = Math.abs(remainingSeconds);
    const hours = Math.floor(absSeconds / 3600)
      .toString()
      .padStart(2, "0");
    const minutes = Math.floor((absSeconds % 3600) / 60)
      .toString()
      .padStart(2, "0");
    const seconds = (absSeconds % 60).toString().padStart(2, "0");

    extendedHours = `${hours}:${minutes}:${seconds}`;
  }

  await db.query(
    "UPDATE ?? SET total_hours_worked = ?, extended_hours = ?, status = 2, active_status = 0, reopen_status = 0, updated_at = NOW(), command = ? WHERE id = ?",
    [
      type === "subtask" ? "sub_tasks" : "tasks",
      newTotalHoursWorked,
      extendedHours,
      comment,
      id,
    ]
  );

  await db.query(
    "UPDATE sub_tasks_user_timeline SET end_time = ? WHERE id = ?",
    [moment().format("YYYY-MM-DD HH:mm:ss"), timeline_id]
  );
};

// Main controller function
exports.updateTaskTimeLine = async (req, res) => {
  try {
    const { id, action, type, last_start_time, timeline_id, comment } =
      req.body;

    // Validate the request body
    const { error } = updateTimelineShema.validate(req.body, {
      abortEarly: false,
    });

    if (error) {
      const errorMessages = error.details.reduce((acc, err) => {
        acc[err.path[0]] = err.message;
        return acc;
      }, {});
      return errorResponse(res, errorMessages, "Validation Error", 400);
    }

    const lastStartTime = moment(last_start_time);
    let taskOrSubtask;
    let taskId, subtaskId;

    if (type === "subtask") {
      const [subtask] = await db.query("SELECT * FROM sub_tasks WHERE id = ?", [
        id,
      ]);
      taskOrSubtask = subtask[0];
      taskId = taskOrSubtask.task_id;
      subtaskId = taskOrSubtask.id;
      userTeamId = taskOrSubtask.team_id;
    } else {
      const [task] = await db.query("SELECT * FROM tasks WHERE id = ?", [id]);
      taskOrSubtask = task[0];
      taskId = taskOrSubtask.id;
      subtaskId = null;
      userTeamId = taskOrSubtask.team_id;
    }

    const getStatusGroups = (t_status, reopenStatus, activeStatus) => {
      t_status = Number(t_status);
      reopenStatus = Number(reopenStatus);
      activeStatus = Number(activeStatus);
      if (t_status === 0 && reopenStatus === 0 && activeStatus === 0) {
        return "To Do";
      } else if (t_status === 1 && reopenStatus === 0 && activeStatus === 0) {
        return "On Hold";
      } else if (t_status === 2 && reopenStatus === 0) {
        return "Pending Approval";
      } else if (reopenStatus === 1 && activeStatus === 0) {
        return "Reopen";
      } else if (t_status === 1 && activeStatus === 1) {
        return "InProgress";
      } else if (t_status === 3) {
        return "Done";
      }
      return "";
    };

    const localISTTime = getISTTime();
    const old_data = getStatusGroups(
      taskOrSubtask.status,
      taskOrSubtask.reopen_status,
      taskOrSubtask.active_status
    );
    console.log("old_data", taskId, subtaskId, taskOrSubtask.user_id);
    if (action === "start") {
      await this.startTask(taskOrSubtask, type, id, res);
      const query =
        "INSERT INTO task_histories (old_data, new_data, task_id, subtask_id,text,updated_by,status_flag,created_at,updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())";
      const values = [
        old_data,
        "InProgress",
        taskId,
        subtaskId,
        "Changed Status",
        taskOrSubtask.user_id,
        1,
        localISTTime,
        localISTTime,
      ];
      await db.query(query, values);
    } else if (action === "pause") {
      await this.pauseTask(
        taskOrSubtask,
        type,
        id,
        lastStartTime,
        timeline_id,
        res
      );
      const query =
        "INSERT INTO task_histories (old_data, new_data, task_id, subtask_id,text,updated_by,status_flag,created_at,updated_at) VALUES (?, ?, ?, ?, ?, ?, ?,NOW(), NOW())";
      const values = [
        old_data,
        "On Hold",
        taskId,
        subtaskId,
        "Changed Status",
        taskOrSubtask.user_id,
        1,
        localISTTime,
        localISTTime,
      ];
      await db.query(query, values);
    } else if (action === "end") {
      await this.endTask(
        taskOrSubtask,
        type,
        id,
        lastStartTime,
        timeline_id,
        comment,
        res
      );
      const query =
        "INSERT INTO task_histories (old_data, new_data, task_id, subtask_id,text,updated_by,status_flag,created_at,updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())";
      const values = [
        old_data,
        "Pending Approval",
        taskId,
        subtaskId,
        "Changed Status",
        taskOrSubtask.user_id,
        1,
        localISTTime,
        localISTTime,
      ];
      await db.query(query, values);

      // Send notifications to users with role_id 1 and 2
      const [adminsAndManagers] = await db.query(
        "SELECT id FROM users WHERE role_id IN (1, 2)"
      );
      const adminAndManagerIds = adminsAndManagers.map((user) => user.id);
      console.log("adminAndManagerIds", adminAndManagerIds);
      const notificationPayload = {
        title: "Review Employee Tasks",
        body: "Please review employee pending tasks.",
      };

      adminAndManagerIds.forEach(async (userId) => {
        const socketIds = userSockets[userId];
        if (Array.isArray(socketIds)) {
          socketIds.forEach((socketId) => {
            req.io
              .of("/notifications")
              .to(socketId)
              .emit("push_notification", notificationPayload);
          });
        }
        console.log("userId", userId);
        await db.execute(
          "INSERT INTO notifications (user_id, title, body, read_status, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())",
          [userId, notificationPayload.title, notificationPayload.body, 0]
        );
      });

      // Send notification to the reporting user of the team
      const userTeamId = taskOrSubtask.team_id;
      const [team] = await db.query(
        "SELECT reporting_user_id FROM teams WHERE id = ?",
        [userTeamId]
      );
      if (team.length > 0) {
        const reportingUserId = team[0].reporting_user_id;
        const reportingUserSocketIds = userSockets[reportingUserId];
        if (reportingUserId) {
          if (Array.isArray(reportingUserSocketIds)) {
            reportingUserSocketIds.forEach((socketId) => {
              req.io
                .of("/notifications")
                .to(socketId)
                .emit("push_notification", notificationPayload);
            });
          }
          await db.execute(
            "INSERT INTO notifications (user_id, title, body, read_status, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())",
            [
              reportingUserId,
              notificationPayload.title,
              notificationPayload.body,
              0,
            ]
          );
        }

      }
    } else {
      return errorResponse(res, "Invalid Type", 400);
    }

    return successResponse(res, "Time updated successfully", 201);
  } catch (error) {
    return errorResponse(res, error.message, 400);
  }
};

// function calculateNewWorkedTime(worked, timeDifference) {
//   const workedInSeconds = convertToSeconds(worked);
//   const newTotalWorkedInSeconds = workedInSeconds + timeDifference;
//   return convertSecondsToHHMMSS(newTotalWorkedInSeconds);
// }

// function convertSecondsToHHMMSS(totalSeconds) {
//   const hours = Math.floor(totalSeconds / 3600);
//   const minutes = Math.floor((totalSeconds % 3600) / 60);
//   const seconds = totalSeconds % 60;
//   return [hours, minutes, seconds]
//     .map((num) => String(num).padStart(2, "0"))
//     .join(":");
// }

// const convertToSeconds = (timeString) => {
//   const [hours, minutes, seconds] = timeString.split(":").map(Number);
//   return hours * 3600 + minutes * 60 + seconds;
// };

// function calculateRemainingHours(estimated, worked) {
//   const estimatedSeconds = convertToSeconds(estimated);
//   const workedSeconds = convertToSeconds(worked);
//   const remainingSeconds = Math.max(0, estimatedSeconds - workedSeconds);
//   return convertSecondsToHHMMSS(remainingSeconds);
// }

// const calculatePercentage = (value, total) => {
//   if (!total || total === 0) return "0%";
//   return ((value / total) * 100).toFixed(2) + "%";
// };

exports.deleteTaskList = async (req, res) => {
  try {
    const {
      product_id,
      project_id,
      team_id,
      priority,
      search,
      page = 1,
      perPage = 10,
    } = req.query;
    const offset = (page - 1) * perPage;

    const taskConditions = [];
    const taskValues = [];

    const subtaskConditions = [];
    const subtaskValues = [];

    // Handle product_id and project_id using WHERE IN
    if (product_id) {
      const productIds = product_id.split(","); // Ensure it's an array
      const placeholders = productIds.map(() => "?").join(", ");
      taskConditions.push(`t.product_id IN (${placeholders})`);
      subtaskConditions.push(`st.product_id IN (${placeholders})`);
      taskValues.push(...productIds);
      subtaskValues.push(...productIds);
    }

    if (project_id) {
      const projectIds = project_id.split(",");
      const placeholders = projectIds.map(() => "?").join(", ");
      taskConditions.push(`t.project_id IN (${placeholders})`);
      subtaskConditions.push(`st.project_id IN (${placeholders})`);
      taskValues.push(...projectIds);
      subtaskValues.push(...projectIds);
    }

    // Additional filters
    if (team_id) {
      taskConditions.push("tm.id = ?");
      subtaskConditions.push("tm.id = ?");
      taskValues.push(team_id);
      subtaskValues.push(team_id);
    }

    if (priority) {
      taskConditions.push("t.priority = ?");
      subtaskConditions.push("st.priority = ?");
      taskValues.push(priority);
      subtaskValues.push(priority);
    }

    // Search filter
    if (search) {
      const searchTerm = `%${search}%`;
      const searchQuery = `(t.name LIKE ? OR  CONCAT(u.first_name, ' ', u.last_name) LIKE ? OR pr.name LIKE ? OR tm.name LIKE ? OR p.name LIKE ? OR t.priority LIKE ?)`;

      taskConditions.push(searchQuery);
      subtaskConditions.push(searchQuery);

      taskValues.push(
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm
      );
      subtaskValues.push(
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm
      );
    }

    // Generate WHERE clauses
    const taskWhereClause = taskConditions.length
      ? `AND ${taskConditions.join(" AND ")}`
      : "";
    const subtaskWhereClause = subtaskConditions.length
      ? `AND ${subtaskConditions.join(" AND ")}`
      : "";

    // Query to fetch deleted subtasks
    const subtasksQuery = `
      SELECT 
        p.name AS product_name,
        pr.name AS project_name,
        t.name AS task_name,
        st.name AS subtask_name,
        st.estimated_hours AS estimated_time,
        st.total_hours_worked AS time_taken,
        st.rating AS subtask_rating,
        tm.name AS team_name,
        'Subtask' AS type,
        t.id AS task_id,
        st.id AS subtask_id,
        st.priority AS priority,
        st.user_id AS subtask_user_id,
        st.deleted_at AS deleted_at
      FROM sub_tasks st
      LEFT JOIN tasks t ON t.id = st.task_id
      LEFT JOIN users u ON u.id = st.user_id
      LEFT JOIN products p ON p.id = t.product_id
      LEFT JOIN projects pr ON pr.id = t.project_id
      LEFT JOIN teams tm ON tm.id = u.team_id
      WHERE st.deleted_at IS NOT NULL AND pr.deleted_at IS  NULL AND p.deleted_at IS  NULL ${subtaskWhereClause}
      ORDER BY st.deleted_at DESC
    `;

    // Query to fetch deleted tasks (not linked to subtasks)
    const tasksQuery = `
      SELECT 
        p.name AS product_name,
        pr.name AS project_name,
        t.name AS task_name,
        t.estimated_hours AS estimated_time,
        t.total_hours_worked AS time_taken,
        t.rating AS task_rating,
        tm.name AS team_name,
        'Task' AS type,
        t.id AS task_id,
        t.priority AS priority,
        NULL AS subtask_id,
        t.user_id AS task_user_id,
        t.deleted_at AS deleted_at
      FROM tasks t
      LEFT JOIN users u ON u.id = t.user_id
      LEFT JOIN products p ON p.id = t.product_id
      LEFT JOIN projects pr ON pr.id = t.project_id
      LEFT JOIN teams tm ON tm.id = u.team_id
      WHERE t.deleted_at IS NOT NULL 
        AND t.id NOT IN (SELECT task_id FROM sub_tasks) AND pr.deleted_at IS  NULL AND p.deleted_at IS  NULL
        ${taskWhereClause}
      ORDER BY t.deleted_at DESC
    `;

    // Execute both queries
    const [subtasks] = await db.query(subtasksQuery, subtaskValues);
    const [tasks] = await db.query(tasksQuery, taskValues);

    // Combine the results
    const mergedResults = [...subtasks, ...tasks];
    mergedResults.sort((a, b) => new Date(b.deleted_at) - new Date(a.deleted_at));

    console.log("mergedResults", mergedResults);
    // Fetch assignee names and remove user_id
    const processedData = await Promise.all(
      mergedResults.map(async (item) => {
        const assigneeUserId = item.subtask_id
          ? item.subtask_user_id
          : item.task_user_id;
        const assigneeNameQuery = `SELECT COALESCE(CONCAT(first_name, ' ', last_name), first_name, last_name) AS assignee_name FROM users WHERE id = ?`;
        const [results] = await db.query(assigneeNameQuery, [assigneeUserId]);
        item.assignee_name = results[0] ? results[0].assignee_name : "Unknown";
        delete item.user_id;
        return item;
      })
    );

    // Pagination logic
    const totalRecords = processedData.length;
    const paginatedData = processedData.slice(
      offset,
      offset + parseInt(perPage)
    );
    const pagination = getPagination(page, perPage, totalRecords);

    // Add serial numbers to the paginated data
    const data = paginatedData.map((row, index) => ({
      s_no: offset + index + 1,
      ...row,
    }));

    successResponse(
      res,
      data,
      data.length === 0
        ? "No tasks or subtasks found"
        : "Deleted tasks and subtasks retrieved successfully",
      200,
      pagination
    );
  } catch (error) {
    console.error("Error fetching tasks and subtasks:", error);
    return errorResponse(res, error.message, "Server error", 500);
  }
};

exports.restoreTasks = async (req, res) => {
  try {
    const { task_id, subtask_id, user_id } = req.body;
    // const { error } = productSchema.validate(
    //   { name, user_id },
    //   { abortEarly: false }
    // );
    const user = await getAuthUserDetails(user_id, res);
    if (!user) return;
    // if (error) {
    //   const errorMessages = error.details.reduce((acc, err) => {
    //     acc[err.path[0]] = err.message;
    //     return acc;
    //   }, {});
    //   return errorResponse(res, errorMessages, "Validation Error", 400);
    // }
    const isSubtask = subtask_id !== null;
    const table = isSubtask ? "sub_tasks" : "tasks";
    const id = isSubtask ? subtask_id : task_id;

    // Check if the record exists and is soft-deleted
    const checkQuery = `SELECT COUNT(*) as count, product_id, project_id FROM ${table} WHERE id = ?`;
    const [checkResult] = await db.query(checkQuery, [id]);

    if (checkResult.length === 0 || checkResult[0].count === 0) {
      return errorResponse(
        res,
        "Record not found or deleted",
        "Not Found",
        404
      );
    }

    const { product_id, project_id } = checkResult[0];

    const productCheckQuery = `SELECT COUNT(*) as count FROM products WHERE id = ? AND deleted_at IS NULL`;
    const [productCheckResult] = await db.query(productCheckQuery, [
      product_id,
    ]);

    if (productCheckResult[0].count === 0) {
      return errorResponse(
        res,
        "Oops! It appears that the project / product has been deleted for this task. You will be unable to restore this task.",
        "Product Not Found",
        404
      );
    }

    const projectCheckQuery = `SELECT COUNT(*) as count FROM projects WHERE id = ? AND deleted_at IS NULL`;
    const [projectCheckResult] = await db.query(projectCheckQuery, [
      project_id,
    ]);

    if (projectCheckResult[0].count === 0) {
      return errorResponse(
        res,
        "Oops! It appears that the project / product has been deleted for this task. You will be unable to restore this task.",
        "Project Not Found",
        404
      );
    }

    // Restore the record
    const restoreQuery = `UPDATE ${table} SET deleted_at = null, updated_by = ? WHERE id = ?`;
    const values = [user_id, id];
    await db.query(restoreQuery, values);

    return successResponse(res, "Record restored successfully", "Success", 200);
  } catch (error) {
    console.error("Error updating product:", error.message);
    return errorResponse(res, error.message, "Error updating product", 500);
  }
};

const formatDate = (date) => {
  const [year, month, day] = date.split("-");
  return `${year}-${month}-${day}`; // Convert to YYYY-MM-DD
};


exports.getWorkReportData = async (queryParams, res) => {
  try {
    const {
      user_id,
      team_id,
      from_date,
      to_date,
      search,
      export_status,
      page = 1,
      perPage = 10,
    } = queryParams;

    let baseQuery = `
   SELECT 
  DATE_FORMAT(su.start_time, '%d-%m-%Y') AS date,
  su.id AS timeline_id,
  u.employee_id,  -- Fetching employee_id from users table
  CONCAT(u.first_name, ' ', u.last_name) AS name,
  COALESCE(p.name, '') AS project_name,  -- Fetching project_name from projects table
  -- COALESCE(CASE WHEN su.subtask_id IS NULL THEN t.name ELSE st.name END, '') AS task_name,
 
  -- Check if status and active_status are both 1, mark as in progress
  CASE 
    WHEN (
      (su.subtask_id IS NULL AND t.status = 1 AND t.active_status = 1) 
      OR (su.subtask_id IS NOT NULL AND st.status = 1 AND st.active_status = 1)
    ) THEN 
      CASE 
        WHEN su.subtask_id IS NULL THEN t.name
        ELSE st.name
      END
    ELSE NULL
  END AS in_progress,

  -- Mark as completed if status or active_status is not 1 (not in progress)
  CASE 
    WHEN (
      (su.subtask_id IS NULL AND t.status = 3) 
      OR (su.subtask_id IS NOT NULL AND st.status = 3)
    ) THEN 
      CASE 
        WHEN su.subtask_id IS NULL THEN t.name
        ELSE st.name
      END
    ELSE NULL
  END AS completed,
   SEC_TO_TIME(
    SUM(
      TIMESTAMPDIFF(SECOND, su.start_time, COALESCE(su.end_time, NOW()))
    )
  ) AS total_hours_worked

FROM 
  sub_tasks_user_timeline su
LEFT JOIN 
  tasks t ON su.task_id = t.id
LEFT JOIN 
  sub_tasks st ON su.subtask_id = st.id
LEFT JOIN 
  projects p ON t.project_id = p.id  -- Join projects table to get project_name
LEFT JOIN 
  users u ON su.user_id = u.id  -- Join users table to get employee_id and first_name
WHERE 
  su.deleted_at IS NULL
  AND (
    (
      su.subtask_id IS NULL 
      AND t.deleted_at IS NULL 
      AND (
        (t.status = 1 AND t.active_status = 1) 
        OR t.status = 3
      )
    )
    OR (
      su.subtask_id IS NOT NULL 
      AND st.deleted_at IS NULL 
      AND (
        (st.status = 1 AND st.active_status = 1) 
        OR st.status = 3
      )
    )
  )
  AND p.deleted_at IS NULL
  AND u.deleted_at IS NULL
`;

    const params = [];

    if (user_id) {
      baseQuery += ` AND su.user_id = ?`;
      params.push(user_id);
    }

    if (team_id) {
      const teamId = team_id.trim(); // Trim any whitespace
      if (teamId !== "") {
        baseQuery += ` AND u.team_id = ?`;
        params.push(teamId); // Push the non-empty team_id value
      }
    }

    if (from_date && to_date) {
      const formattedFromDate = formatDate(from_date);
      const formattedToDate = formatDate(to_date);

      baseQuery += ` AND DATE(su.start_time) BETWEEN ? AND ?`;
      params.push(formattedFromDate, formattedToDate);
    }

    // Add search condition if provided
    if (search) {
      baseQuery += ` AND (t.name LIKE ? OR st.name LIKE ? OR p.name LIKE ? OR u.employee_id LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR CONCAT(u.first_name, ' ', u.last_name) LIKE ? )`;
      params.push(
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`
      );
    }

    // Add GROUP BY clause
    baseQuery += ` GROUP BY su.task_id, su.subtask_id, su.user_id, DATE(su.start_time), p.name, t.name, st.name, u.employee_id, u.first_name`;

    // Fetch tasks and subtasks data
    const [results] = await db.query(baseQuery, params);

    // Handle export case (no pagination)
    if (export_status == 1) {
      if (results.length === 0) {
        return errorResponse(
          res,
          "No data available for export",
          "No data found",
          404
        );
      }
      if (export_status == 1) {
        const { Parser } = require("json2csv");

      const groupedData = {};

      results.forEach(row => {
        const userId = row.employee_id;

        if (!groupedData[userId]) {
          groupedData[userId] = {
            s_no: 0,
            employee_id: row.employee_id,
            name: row.name,
            date: [],
            project_name: [],
            in_progress: [],
            completed: [],
            total_seconds: 0, // store seconds for summing
          };
        }

        groupedData[userId].date.push(row.date);
        groupedData[userId].project_name.push(row.project_name);
        groupedData[userId].completed.push(row.completed);
        groupedData[userId].in_progress.push(row.in_progress);

        // Convert time string to seconds
        const [hours, minutes, seconds] = row.total_hours_worked.split(':').map(Number);
        const totalSeconds = (hours * 3600) + (minutes * 60) + seconds;
        groupedData[userId].total_seconds += totalSeconds;
      });

      // Helper to convert seconds back to HH:MM:SS
      function formatSecondsToHHMMSS(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
      }

      // Prepare export array
      const exportData = Object.values(groupedData).map((user, index) => ({
        "S.No": index + 1,
        "Employee ID": user.employee_id,
        "Employee Name": user.name,
        "Date": user.date.join(', '),
        "Project Name": user.project_name.join(', '),
        "In Progress": user.in_progress.join(', '),
        "Completed": user.completed.join(', '),
        "Total Hours Worked": formatSecondsToHHMMSS(user.total_seconds),
      }));


        const json2csvParser = new Parser({ });
        const csv = json2csvParser.parse(exportData);

        res.header('Content-Type', 'text/csv');
        res.attachment('attendance_data.csv');
        return res.send(csv);
      }

     

      // Convert data to CSV
      const { Parser } = require("json2csv");
      const csv = json2csvParser.parse(results);

      res.header("Content-Type", "text/csv");
      res.attachment("work_report_data.csv");
      return res.send(csv);
    }

    const totalRecords = results.length;
    const offset = (page - 1) * perPage;
    const paginatedData = results.slice(offset, offset + parseInt(perPage));
    const pagination = getPagination(page, perPage, totalRecords);

    const data = paginatedData.map((row, index) => ({
      s_no: offset + index + 1,
      ...row,
    }));

    successResponse(
      res,
      data,
      paginatedData.length === 0
        ? "No tasks or subtasks found"
        : "Work report data retrieved successfully",
      200,
      pagination
    );
  } catch (error) {
    console.error("Error fetching tasks and subtasks:", error);
    return errorResponse(res, error.message, "Server error", 500);
  }
};

