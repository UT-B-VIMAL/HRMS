const db = require("../../config/db");
const {
  successResponse,
  errorResponse,
  calculateNewWorkedTime,
  convertSecondsToHHMMSS,
  convertToSeconds,
  calculateRemainingHours,
  calculatePercentage,
} = require("../../helpers/responseHelper");
const moment = require("moment");
const { startTask, pauseTask, endTask } = require("../functions/taskFunction");
const {
  getAuthUserDetails,
  formatTimeDHMS,
  commonStatusGroup,
  checkUpdatePermission,
  addHistorydata,
  getUserIdFromAccessToken,
} = require("./commonFunction");
const { userSockets } = require("../../helpers/notificationHelper");

// Insert Task
exports.createSubTask = async (payload, res,req) => {
  const { task_id, name, created_by } = payload;

  try {
    const accessToken = req.headers.authorization?.split(" ")[1];
    if (!accessToken) {
      return errorResponse(res, "Access token is required", 401);
    }
    const userId = await getUserIdFromAccessToken(accessToken);

    // Retrieve `product_id` and `project_id` from the `tasks` table
    const selectQuery = `
          SELECT product_id, project_id ,status, active_status, reopen_status
          FROM tasks 
          WHERE deleted_at IS NULL AND id = ?
      `;
    const [taskResult] = await db.query(selectQuery, [task_id]);

    if (taskResult.length === 0) {
      return errorResponse(
        res,
        "Task not found or deleted",
        "Error creating subtask",
        404
      );
    }

    const { product_id, project_id, status, active_status } = taskResult[0];

    if (status == 1 && active_status == 1) {
      return errorResponse(
        res,
        "Task is already active",
        "Cannot add subtask",
        400
      );
    }
    const isConverted = await convertTasktoSubtask(task_id);
    // Insert into `sub_tasks` table
    const insertQuery = `
        INSERT INTO sub_tasks (
            product_id, project_id, task_id, name, created_by,updated_by ,deleted_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?,?,?, NULL, NOW(), NOW())
    `;
    const values = [
      product_id,
      project_id,
      task_id,
      name,
      userId,
      userId,
    ];

    const [result] = await db.query(insertQuery, values);

    // Return success response
    return successResponse(
      res,
      { id: result.insertId, task_id, name, created_by },
      "SubTask added successfully",
      201
    );
  } catch (error) {
    console.error("Error inserting subtask:", error.message);
    return errorResponse(res, error.message, "Error inserting subtask", 500);
  }
};

//import SubTask

exports.bulkimportSubTask = async (payload, res, req) => {
  const {
    product_name,
    project_name,
    emp_id,
    task_name,
    subtask_name,
    estimated_hours,
    start_date,
    end_date,
    extended_status = "00:00:00",
    extended_hours = "00:00:00",
    active_status,
    status,
    total_hours_worked = "00:00:00",
    rating,
    command,
    manager_id,
    remark,
    reopen_status,
    description,
    priority,
  } = payload;

  try {
    const accessToken = req.headers.authorization?.split(" ")[1];
    
    if (!accessToken) return errorResponse(res, "Access token is required", 401);
    const created_by = await getUserIdFromAccessToken(accessToken);

    // 1. Get or create product
    let [productRow] = await db.query("SELECT id FROM products WHERE name = ? AND deleted_at IS NULL", [product_name]);
    let product_id = productRow[0]?.id;
    if (!product_id) {
      const [insertProduct] = await db.query(
        "INSERT INTO products (name, created_at, updated_at) VALUES (?, NOW(), NOW())",
        [product_name]
      );
      product_id = insertProduct.insertId;
    }

    // 2. Get or create project under that product
    let [projectRow] = await db.query(
      "SELECT id FROM projects WHERE name = ? AND product_id = ? AND deleted_at IS NULL",
      [project_name, product_id]
    );
    let project_id = projectRow[0]?.id;
    if (!project_id) {
      const [insertProject] = await db.query(
        "INSERT INTO projects (name, product_id, created_at, updated_at) VALUES (?, ?, NOW(), NOW())",
        [project_name, product_id]
      );
      project_id = insertProject.insertId;
    }



    // 3. Get employee and manager IDs
    const [[employee]] = await db.query("SELECT id,team_id FROM users WHERE employee_id = ? AND deleted_at IS NULL", [emp_id]);
    if (!employee) return errorResponse(res, null, "Employee not found", 404);
    const user_id = employee.id;
    const team_id = employee.team_id;

   const [[task]] = await db.query(`SELECT id FROM tasks WHERE user_id = ? AND product_id = ? AND project_id = ? AND name= ? AND deleted_at IS NULL`, [user_id, product_id, project_id,task_name]);
   if (!task) return errorResponse(res, null, "Task not found", 404);
    const task_id = task.id;

    const [[manager]] = await db.query("SELECT id FROM users WHERE employee_id = ? AND deleted_at IS NULL", [manager_id]);
    if (!manager) return errorResponse(res, null, "Manager not found", 404);
    const assigned_user_id = manager.id;

    // 4. Validate team
    const [teamRow] = await db.query("SELECT id FROM teams WHERE id = ? AND deleted_at IS NULL", [team_id]);
    if (teamRow.length === 0) return errorResponse(res, null, "Team not found", 404);

    // 5. Parse and validate estimated_hours
    let formattedEstimatedHours = "00:00:00";
    if (estimated_hours) {
      const timeMatch = estimated_hours.match(/^((\d+)d\s*)?((\d+)h\s*)?((\d+)m\s*)?((\d+)s)?$/);
      if (!timeMatch) {
        return errorResponse(res, null, 'Invalid estimated_hours format. Use "1d 2h 30m", etc.', 400);
      }

      const days = parseInt(timeMatch[2] || "0", 10);
      const hours = parseInt(timeMatch[4] || "0", 10);
      const minutes = parseInt(timeMatch[6] || "0", 10);
      const seconds = parseInt(timeMatch[8] || "0", 10);

      if (minutes >= 60 || seconds >= 60 || days < 0 || hours < 0 || minutes < 0 || seconds < 0) {
        return errorResponse(res, null, "Invalid time values in estimated_hours", 400);
      }

      // Validate start/end date duration
      const start = moment(start_date, "YYYY-MM-DD");
      const end = moment(end_date, "YYYY-MM-DD");

      if (!start.isValid() || !end.isValid()) {
        return errorResponse(res, null, "Invalid start_date or end_date", 400);
      }

      const diffDays = end.diff(start, "days") + 1;
      const totalEstimatedHours = days * 8 + hours + minutes / 60 + seconds / 3600;
      const effectiveDays = Math.ceil(totalEstimatedHours / 8);

      if (diffDays < effectiveDays) {
        return errorResponse(
          res,
          null,
          `Estimated duration requires ${effectiveDays} day(s) but only ${diffDays} day(s) selected.`,
          400
        );
      }

      // Format to HH:MM:SS
      const totalHours = days * 8 + hours;
      formattedEstimatedHours = `${String(totalHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

    console.log("task_id", task_id);
    
    const isConverted = await convertTasktoSubtask(task_id);


    // 6. Insert task
    const insertQuery = `
      INSERT INTO sub_tasks (
        product_id, project_id, task_id, user_id, name, estimated_hours,
        start_date, end_date, extended_status, extended_hours,
        active_status, status, total_hours_worked, rating, command,
        assigned_user_id, remark, reopen_status, description,
        team_id, priority, created_by, updated_by,
        deleted_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?,?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, NOW(), NOW())
    `;

    const values = [
      product_id, project_id, task_id, user_id, subtask_name, formattedEstimatedHours,
      start_date, end_date, extended_status, extended_hours,
      active_status, status, total_hours_worked, rating, command,
      assigned_user_id, remark, reopen_status, description,
      team_id, priority, created_by, created_by,
    ];

    const [result] = await db.query(insertQuery, values);

    return successResponse(
      res,
      { id: result.insertId, subtask_name: subtask_name },
      "Task created successfully",
      201
    );
  } catch (error) {
    console.error("Create Task Error:", error);
    return errorResponse(res, error.message, "Error creating task", 500);
  }
};


// Show Task
exports.getSubTask = async (id, res) => {
  try {
    // Subtask query (expects a single result due to primary key)
    const subtaskQuery = `
      SELECT 
        st.*, 
        te.name AS team_name, 
        COALESCE(CONCAT(COALESCE(owner.first_name, ''), ' ', COALESCE(NULLIF(owner.last_name, ''), '')), 'Unknown Owner') AS owner_name, 
        COALESCE(CONCAT(COALESCE(assignee.first_name, ''), ' ', COALESCE(NULLIF(assignee.last_name, ''), '')), 'Unknown Assignee') AS assignee_name, 
        p.name AS product_name, 
        pj.name AS project_name 
      FROM sub_tasks st 
      LEFT JOIN teams te ON st.team_id = te.id 
      LEFT JOIN users assignee ON st.user_id = assignee.id 
      LEFT JOIN users owner ON st.assigned_user_id = owner.id 
      LEFT JOIN products p ON st.product_id = p.id 
      LEFT JOIN projects pj ON st.project_id = pj.id 
      WHERE st.id = ?
      AND st.deleted_at IS NULL;
    `;
    const [subtask] = await db.query(subtaskQuery, [id]);

    if (!subtask || subtask.length === 0) {
      return errorResponse(
        res,
        "Subtask not found",
        "Error retrieving task",
        404
      );
    }

    // // Histories query
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
WHERE h.subtask_id = ? 
  AND h.deleted_at IS NULL
ORDER BY h.id DESC;

  `;
    const histories = await db.query(historiesQuery, [id]);

    // // Comments query
    const commentsQuery = `
      SELECT c.*, COALESCE(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(NULLIF(u.last_name, ''), '')), 'Unknown User') AS updated_by
      FROM task_comments c
      LEFT JOIN users u ON c.updated_by = u.id
      WHERE c.subtask_id = ? 
      AND c.deleted_at IS NULL
      ORDER BY c.id DESC;
    `;
    const comments = await db.query(commentsQuery, [id]);

    const subtaskData = subtask.map((subtask) => {
      const totalEstimatedHours = subtask.estimated_hours || "00:00:00"; // Default format as "HH:MM:SS"
      const timeTaken = subtask.total_hours_worked || "00:00:00"; // Default format as "HH:MM:SS"

      // Calculate remaining hours and ensure consistent formatting
      const remainingHours = calculateRemainingHours(
        totalEstimatedHours,
        timeTaken
      );

      // Calculate percentages for hours
      const estimatedInSeconds = convertToSeconds(totalEstimatedHours);
      const timeTakenInSeconds = convertToSeconds(timeTaken);
      const remainingInSeconds = convertToSeconds(remainingHours);

      return {
        subtask_id: subtask.id || "",
        task_id: subtask.task_id || "",
        name: subtask.name || "",
        project_id: subtask.project_id || "",
        project: subtask.project_name || "",
        product_id: subtask.product_id || "",
        product: subtask.product_name || "",
        owner_id: subtask.user_id || "",
        owner: subtask.owner_name?.trim() ? subtask.owner_name : "",
        team_id: subtask.team_id || "",
        team: subtask.team_name || "",
        assignee_id: subtask.assigned_user_id || "",
        assignee: subtask.assignee_name?.trim() ? subtask.assignee_name : "",
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
        start_date: subtask.start_date || "",
        end_date: subtask.end_date || "",
        priority: subtask.priority || "",
        description: subtask.description || "",
        status: subtask.status,
        active_status: subtask.active_status,
        reopen_status: subtask.reopen_status,
        hold_status: subtask.hold_status,
        status_text: commonStatusGroup(
          subtask.status,
          subtask.reopen_status,
          subtask.active_status
        ),
        is_exceed: timeTakenInSeconds > estimatedInSeconds ? true : false,
      };
    });

    const validHistories =
      Array.isArray(histories) && Array.isArray(histories[0])
        ? histories[0]
        : [];

    const historiesData =
      validHistories.length > 0
        ? await Promise.all(
            validHistories.map(async (history) => ({
              old_data: history.old_data,
              new_data: history.new_data,
              description: history.status_description || "",
              updated_by: history.updated_by || "Unknown User",
              shortName: history.short_name,
              time_date: moment
                .utc(history.updated_at)
                .tz("Asia/Kolkata")
                .format("YYYY-MM-DD HH:mm:ss"),
              time_utc: history.updated_at,
               time: moment(history.updated_at).fromNow(),
                time1: moment.utc(history.updated_at).tz("Asia/Kolkata").fromNow()
            }))
          )
        : [];
    // Prepare comments data
    const validComments =
      Array.isArray(comments) && Array.isArray(comments[0]) ? comments[0] : [];
    const commentsData = validComments.map((comment) => ({
      comments_id: comment.id || "",
      comments: comment.comments || "",
      user_id: comment.user_id || "",
      is_edited: comment.is_edited,
      updated_by: comment.updated_by || "",
      shortName: comment.updated_by.substr(0, 2),
      time_date: moment
        .utc(comment.updated_at)
        .tz("Asia/Kolkata")
        .format("YYYY-MM-DD HH:mm:ss"),
      time_utc: comment.updated_at,
      time: moment(comment.updated_at).fromNow()
    }));

    // Final response
    const data = {
      subtask: subtaskData,
      histories: historiesData,
      comments: commentsData,
    };

    return successResponse(
      res,
      data,
      "SubTask details retrieved successfully",
      200
    );
  } catch (error) {
    return errorResponse(res, error.message, "Error retrieving subtask", 500);
  }
};

// Show All Task
exports.getAllSubTasks = async (req, res) => {
  try {
    const { task_id } = req.query;

    let query = "SELECT * FROM sub_tasks WHERE deleted_at IS NULL";
    const queryParams = [];

    if (task_id) {
      query += " AND task_id = ?";
      queryParams.push(task_id);
    }

    const [rows] = await db.query(query, queryParams);

    if (rows.length === 0) {
      return errorResponse(
        res,
        null,
        task_id ? "No subtasks found for this task" : "No subtasks found",
        404
      );
    }

    return successResponse(res, rows, "SubTasks retrieved successfully");
  } catch (error) {
    return errorResponse(res, error.message, "Error retrieving subtasks", 500);
  }
};

// Update Task
exports.updateSubTask = async (id, payload, res) => {
  const {
    product_id,
    project_id,
    task_id,
    user_id,
    name,
    estimated_hours,
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
  } = payload;

  try {
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
    }
    const query = `
            UPDATE sub_tasks SET
                product_id = ?, project_id = ?,task_id = ?, user_id = ?, name = ?, estimated_hours = ?,
                start_date = ?, end_date = ?, extended_status = ?, extended_hours = ?,
                active_status = ?, status = ?, total_hours_worked = ?, rating = ?, command = ?,
                assigned_user_id = ?, remark = ?, reopen_status = ?, description = ?,
                team_id = ?, priority = ?, created_by = ?, updated_by = ?, deleted_at = ?, created_at = ?, updated_at = NOW()
            WHERE id = ?
        `;

    const values = [
      product_id,
      project_id,
      task_id,
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
      id,
    ];

    const [result] = await db.query(query, values);

    if (result.affectedRows === 0) {
      return errorResponse(res, null, "SubTask not found", 204);
    }
    return successResponse(
      res,
      { id, ...payload },
      "SubTask updated successfully"
    );
  } catch (error) {
    return errorResponse(res, error.message, "Error updating subtask", 500);
  }
};

// Delete Task
exports.deleteSubTask = async (req, res) => {
  const id = req.params.id;

  const updated_by = req.body.updated_by;
  try {
    // Fetch subtask status
    const statusQuery =
      "SELECT status, reopen_status, active_status, task_id FROM sub_tasks WHERE id = ? AND deleted_at IS NULL";
    const [statusResult] = await db.query(statusQuery, [id]);

    if (statusResult.length === 0) {
      return errorResponse(res, null, "SubTask not found", 404);
    }

    const { status, reopen_status, active_status, task_id } = statusResult[0];

    // Check if subtask is InProgress
    const currentGroup = commonStatusGroup(
      status,
      reopen_status,
      active_status
    );
    if (currentGroup === "InProgress") {
      return errorResponse(
        res,
        null,
        "SubTask is InProgress and cannot be deleted",
        400
      );
    }

    // Soft delete the subtask
    const deleteQuery = "UPDATE sub_tasks SET deleted_at = NOW() WHERE id = ?";
    const [deleteResult] = await db.query(deleteQuery, [id]);

    if (deleteResult.affectedRows === 0) {
      return errorResponse(res, null, "SubTask not found", 204);
    }

    // Get status_flag for "Task Deleted"
    const flagQuery = `
  SELECT new_data 
  FROM task_histories 
  WHERE  task_id = ? 
    AND subtask_id = ? 
  ORDER BY created_at DESC 
  LIMIT 1
`;
    const [flagResult] = await db.query(flagQuery, [task_id, id]);
    const old_data = flagResult.length > 0 ? flagResult[0].new_data : null;

    await addHistorydata(
      old_data,
      "Deleted",
      task_id,
      id,
      updated_by || null,
      15
    );

    return successResponse(res, null, "SubTask deleted successfully");
  } catch (error) {
    return errorResponse(res, error.message, "Error deleting subtask", 500);
  }
};

exports.updatesubTaskData = async (id, payload, res, req) => {
  const {
    status,
    name,
    reopen_status,
    active_status,
    assigned_user_id,
    team_id,
    owner_id,
    user_id,
    estimated_hours,
    start_date,
    due_date,
    priority,
    updated_by,
  } = payload;

  // Define the mapping of fields to status_flag values
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
    name:18,
  };

  const fieldMapping = {
    due_date: "end_date",
  };

  try {
    const userDetails = await getAuthUserDetails(updated_by, res);
    const role_id = userDetails.role_id;
    const [tasks] = await db.query(
      "SELECT * FROM sub_tasks WHERE id = ? AND deleted_at IS NULL",
      [id]
    );
    const currentTask = tasks[0];
    const assigneeId = currentTask.user_id;

    if (status && active_status && reopen_status) {
      if (!assigneeId) {
        return errorResponse(
          res,
          null,
          "SubTask is not assigned to any user",
          400
        );
      }
      const result = await checkUpdatePermission({
        id,
        type: "subtask",
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

    // else{
    //   return errorResponse(res, null, "Status cannot be changed without an assigned user.", 400);
    // }

    if (user_id) {
      const [assignee] = await db.query(
        "SELECT id, team_id FROM users WHERE id = ? AND deleted_at IS NULL",
        [user_id]
      );
      if (assignee.length === 0) {
        return errorResponse(
          res,
          null,
          "Assigned User not found or has been deleted",
          404
        );
      }
      payload.team_id = assignee[0].team_id;

      const notificationPayload = {
        title: "New SubTask Assigned",
        body: "A new subtask has been assigned to you. Check your dashboard for details.",
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
        "SubTask not found or has been deleted",
        404
      );
    }

    if (active_status == 1 && status == 1) {
      const userDetails = await getAuthUserDetails(updated_by, res);

      if (!userDetails || userDetails.id == undefined) {
        return;
      }
      if (userDetails.role_id == 4) {
        await startTask(currentTask, "subtask", currentTask.id, res);
      } else {
        return errorResponse(res, "You are not allowed to start task", 400);
      }
    } else if (active_status == 0 && status == 1) {
      const userDetails = await getAuthUserDetails(updated_by, res);

      const [existingSubtaskSublime] = await db.query(
        "SELECT * FROM sub_tasks_user_timeline WHERE end_time IS NULL AND user_id = ?",
        [updated_by]
      );
      if (existingSubtaskSublime.length > 0) {
        const timeline = existingSubtaskSublime[0];
        if (userDetails.role_id == 4) {
          await pauseTask(
            currentTask,
            "subtask",
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
      const userDetails = await getAuthUserDetails(updated_by, res);

      const [existingSubtaskSublime] = await db.query(
        "SELECT * FROM sub_tasks_user_timeline WHERE end_time IS NULL AND user_id = ?",
        [updated_by]
      );
      if (existingSubtaskSublime.length > 0) {
        const timeline = existingSubtaskSublime[0];
        if (userDetails.role_id == 4) {
          await endTask(
            currentTask,
            "subtask",
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

    //   const currentStatusGroup = commonStatusGroup(
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

    if (payload.start_date) {
      const dueDateToCheck = payload.due_date || currentTask.end_date;
    if(dueDateToCheck !=null){
      const newStart = new Date(payload.start_date);
      const existingDue = new Date(dueDateToCheck);

      // Normalize both dates (remove time & timezone)
      const localNewStart = new Date(
        newStart.getFullYear(),
        newStart.getMonth(),
        newStart.getDate()
      );
      const localDue = new Date(
        existingDue.getFullYear(),
        existingDue.getMonth(),
        existingDue.getDate()
      );

      if (localNewStart > localDue) {
        return errorResponse(
          res,
          null,
          "Start date cannot be after the due date.",
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
      let hold_status = 0;
      if (payload.status == 1 && payload.active_status == 0 && payload.reopen_status == 0) {

        if(role_id == 4) {
        payload.hold_status = 0;
        }
        else{
          payload.hold_status = 1;
        }
      }
    
    const getStatusGroup = (status, reopenStatus, activeStatus,holdStatus) => {
      status = Number(status);
      reopenStatus = Number(reopenStatus);
      activeStatus = Number(activeStatus);
      holdStatus = Number(activeStatus);
      if (status === 0 && reopenStatus === 0 && activeStatus === 0) {
        return "To Do";
      } else if (status === 1 && reopenStatus === 0 && activeStatus === 0 && holdStatus === 0) {
        return "Paused";
      } 
      else if (status === 1 && reopenStatus === 0 && activeStatus === 0 && holdStatus === 1) {
        return "On Hold";
     }  else if (status === 2 && reopenStatus === 0) {
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
          return getStatusGroup(data, task.reopen_status, task.active_status,task.hold_status);
        case 1:
          return getStatusGroup(data, task.reopen_status, task.active_status,task.hold_status);
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
          return getStatusGroup(status, reopen_status, active_status,hold_status);
        case 1:
          return getStatusGroup(status, reopen_status, active_status,hold_status);
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
          await processStatusData(flag, currentTask[key], null, id),
          await processStatusData1(flag, payload[key]),
          currentTask.task_id,
          id,
          `Changed ${key}`,
          updated_by,
          flag,
          new Date(),
          new Date(),
          null,
        ]);
      }
    }

    if (taskHistoryEntries.length > 0) {
      const historyQuery = `
        INSERT INTO task_histories (
          old_data, new_data, task_id, subtask_id, text,
          updated_by, status_flag, created_at, updated_at, deleted_at
        ) VALUES ?;
      `;
      await db.query(historyQuery, [taskHistoryEntries]);
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
    updateFields.push("updated_at = NOW()");

    if (updateFields.length === 0) {
      return errorResponse(res, null, "No fields to update", 400);
    }

    updateValues.push(id);

    const updateQuery = `UPDATE sub_tasks SET ${updateFields.join(
      ", "
    )} WHERE id = ?`;
    const [updateResult] = await db.query(updateQuery, updateValues);

    if (updateResult.affectedRows === 0) {
      return errorResponse(res, null, "SubTask not updated", 400);
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

const convertTasktoSubtask = async (task_id) => {
  try {
    if (!task_id) return false;

    // Check for eligible task and timeline records
    const usertimelineQuery = `
      SELECT * 
      FROM sub_tasks_user_timeline 
      WHERE subtask_id IS NULL AND deleted_at IS NULL AND task_id = ?
    `;
    const [usertimelineResult] = await db.query(usertimelineQuery, [task_id]);

    const taskQuery = `
  SELECT * 
  FROM tasks 
  WHERE (
    reopen_status = 1
    OR (
      active_status = 0 AND reopen_status = 0 AND (
        status = 1 OR status = 2 OR status = 3
      )
    )
  )
  AND deleted_at IS NULL 
  AND id = ?
`;

    const [taskResults] = await db.query(taskQuery, [task_id]);

    if (taskResults.length === 0 || usertimelineResult.length === 0) {
      console.log("convertTasktoSubtask: No eligible task or timeline data.");
      return false;
    }

    const task = taskResults[0];

    const subtaskQuery = `
  SELECT 1 
  FROM sub_tasks 
  WHERE task_id IS NOT NULL AND deleted_at IS NULL AND task_id = ?
  LIMIT 1
`;
    const [subtaskResult] = await db.query(subtaskQuery, [task_id]);

    if (subtaskResult.length === 0) {
      // Insert as new subtask
      const insertQuery = `
      INSERT INTO sub_tasks (
        product_id, project_id, task_id, user_id, name, estimated_hours, start_date, end_date,
        extended_status, extended_hours, active_status, status, total_hours_worked,
        command, assigned_user_id, remark, reopen_status, description, team_id,
        priority, created_by, updated_by, deleted_at, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NOW()
      )
    `;
      const values = [
        task.product_id,
        task.project_id,
        task.id,
        task.user_id,
        task.name,
        task.estimated_hours,
        task.start_date,
        task.end_date,
        task.extended_status,
        task.extended_hours,
        task.active_status,
        task.status,
        task.total_hours_worked,
        task.command,
        task.assigned_user_id,
        task.remark,
        task.reopen_status,
        task.description,
        task.team_id,
        task.priority,
        task.created_by,
        task.updated_by,
        task.created_at,
      ];

      const [insertResult] = await db.query(insertQuery, values);
      const newSubtaskId = insertResult.insertId;

      // Update sub_tasks_user_timeline
      await db.query(
        `
      UPDATE sub_tasks_user_timeline
      SET subtask_id = ?
      WHERE task_id = ? AND subtask_id IS NULL AND deleted_at IS NULL
    `,
        [newSubtaskId, task_id]
      );

      // Update task_comments
      await db.query(
        `
      UPDATE task_comments
      SET subtask_id = ?
      WHERE task_id = ? AND subtask_id IS NULL AND deleted_at IS NULL
    `,
        [newSubtaskId, task_id]
      );

      // Update task_histories
      await db.query(
        `
      UPDATE task_histories
      SET subtask_id = ?
      WHERE task_id = ? AND subtask_id IS NULL AND deleted_at IS NULL
    `,
        [newSubtaskId, task_id]
      );
      return true;
    }
  } catch (err) {
    console.error("convertTasktoSubtask error:", err.message);
    return false;
  }
};
