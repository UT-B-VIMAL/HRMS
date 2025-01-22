const db = require("../../config/db");
const mysql = require("mysql2");
const {
  successResponse, errorResponse,getPagination,calculateNewWorkedTime,convertSecondsToHHMMSS,convertToSeconds,calculateRemainingHours,calculatePercentage
} = require("../../helpers/responseHelper");
const { getAuthUserDetails,processStatusData,formatTimeDHMS} = require("../../api/functions/commonFunction");
const moment = require("moment");
const { updateTimelineShema } = require("../../validators/taskValidator");
const { Parser } = require('json2csv');


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
          'Invalid format for estimated_hours. Use formats like "1d 2h 30m 30s", "2h 30m", or "45m 15s".',
          400
        );
      }
    
      const days = parseInt(timeMatch[2] || '0', 10);
      const hours = parseInt(timeMatch[4] || '0', 10);
      const minutes = parseInt(timeMatch[6] || '0', 10);
      const seconds = parseInt(timeMatch[8] || '0', 10);
    
      if (
        days < 0 ||
        hours < 0 ||
        minutes < 0 ||
        seconds < 0 ||
        minutes >= 60 ||
        seconds >= 60
      ) {
        return errorResponse(res, null, 'Invalid time values in estimated_hours', 400);
      }
    
      // Convert days to hours and calculate total hours
      const totalHours = days * 8 + hours;
    
      // Format as "HH:MM:SS"
      payload.estimated_hours = `${String(totalHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      
    }

    const query = `
        INSERT INTO tasks (
          product_id, project_id, user_id, name, estimated_hours,
          start_date, end_date, extended_status, extended_hours,
          active_status, status, total_hours_worked, rating, command,
          assigned_user_id, remark, reopen_status, description,
          team_id, priority, created_by, updated_by, deleted_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, now(),now())
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

// Show Task
// exports.getTask = async (id, res) => {
//     try {
//       const query = 'SELECT * FROM tasks WHERE id = ?';
//       const [rows] = await db.query(query, [id]);

//       if (rows.length === 0) {
//         return errorResponse(res, null, 'Task not found', 204);
//       }

//       return successResponse(res, rows[0], 'Task retrieved successfully');
//     } catch (error) {
//       return errorResponse(res, error.message, 'Error retrieving task', 500);
//     }
//   };

exports.getTask = async (id, res) => {
  try {
    // Task query
    const taskQuery = `
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
    AND t.deleted_at IS NULL;


    `;
    const [task] = await db.query(taskQuery, [id]);

    // console.log(task);

    if (!task || task.length === 0) {
      return errorResponse(res, "Task not found", "Error retrieving task", 404);
    }

    // Subtasks query
    const subtasksQuery = `
    SELECT 
        st.*, 
        COALESCE(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(NULLIF(u.last_name, ''), '')), 'Unknown Assignee') AS assignee_name, 
        t.name AS task_name, 
        p.name AS project_name
    FROM sub_tasks st
    LEFT JOIN users u ON st.user_id = u.id 
    LEFT JOIN tasks t ON st.task_id = t.id 
    LEFT JOIN projects p ON t.project_id = p.id 
    WHERE st.task_id = ? 
    AND st.deleted_at IS NULL
    ORDER BY st.id DESC;

    `;
    const subtasks = await db.query(subtasksQuery, [id]);

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

    // Status mapping
    const statusMap = {
      0: "To Do",
      1: "In Progress",
      2: "In Review",
      3: "Done",
    };

    // Prepare task data
    const taskData = task.map((task) => {
      const totalEstimatedHours = task.estimated_hours || "00:00:00";  // Ensure default format as "HH:MM:SS"
      const timeTaken = task.total_hours_worked || "00:00:00";  // Ensure default format as "HH:MM:SS"
      
      // Calculate remaining hours and ensure consistent formatting
      const remainingHours = calculateRemainingHours(totalEstimatedHours, timeTaken);
    
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
        owner_id: task.user_id || "",
        owner: task.owner_name || "",
        team_id: task.team_id || "",
        team: task.team_name || "",
        assignee_id: task.assigned_user_id || "",
        assignee: task.assignee_name || "",
        estimated_hours: formatTimeDHMS(totalEstimatedHours),
        estimated_hours_percentage: calculatePercentage(estimatedInSeconds, estimatedInSeconds),
        time_taken: formatTimeDHMS(timeTaken),
        time_taken_percentage: calculatePercentage(timeTakenInSeconds, estimatedInSeconds),
        remaining_hours:formatTimeDHMS(remainingHours),
        remaining_hours_percentage: calculatePercentage(remainingInSeconds, estimatedInSeconds),
        start_date: task.start_date,
        end_date: task.end_date,
        priority: task.priority,
        description: task.description,
        status_text: statusMap[task.status] || "Unknown",
      };
    });

    // Prepare subtasks data
    const subtasksData =
  Array.isArray(subtasks) && subtasks[0].length > 0
    ? subtasks[0].map((subtask) => ({
        subtask_id: subtask.id,
        name: subtask.name || "",
        status: subtask.status,
        active_status: subtask.active_status,
        assignee: subtask.user_id,
        assigneename: subtask.assignee_name || "",
        reopen_status: subtask.reopen_status,
        short_name: (subtask.assignee_name || "").substr(0, 2),
        status_text: statusMap[subtask.status] || "Unknown",
      }))
    : [];
 
    const historiesData = Array.isArray(histories) && histories[0].length > 0
      ? await Promise.all(
          histories[0].map(async (history) => ({
            old_data: history.old_data,
            new_data: history.new_data,
            description: history.status_description || "Changed the status",
            updated_by: history.updated_by,
            shortName: history.short_name,
            time: moment(history.updated_at).fromNow(),
          }))
        )
      : [];
    

    const commentsData =
      Array.isArray(comments) && comments[0].length > 0
        ? comments[0].map((comment) => ({
            comment_id: comment.id ,
            comments: comment.comments,
            updated_by: comment.updated_by || "",
            shortName:comment. updated_by.substr(0, 2),
            time: moment(comment.updated_at).fromNow(),
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

// Show All Task
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

// Update Task
exports.updateTask = async (id, payload, res) => {
  const {
    product_id,
    project_id,
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

    const [currentTask] = await db.query(
      "SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL",
      [id]
    );

    if (currentTask.length === 0) {
      return errorResponse(res, null, "Task not found", 200);
    }

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
    
      const days = parseInt(timeMatch[2] || '0', 10);
      const hours = parseInt(timeMatch[4] || '0', 10);
      const minutes = parseInt(timeMatch[6] || '0', 10);
      const seconds = parseInt(timeMatch[8] || '0', 10);
    
      if (
        days < 0 ||
        hours < 0 ||
        minutes < 0 ||
        seconds < 0 ||
        minutes >= 60 ||
        seconds >= 60
      ) {
        return errorResponse(res, null, 'Invalid time values in estimated_hours', 400);
      }
    
      // Convert days to hours and calculate total hours
      const totalHours = days * 8 + hours;
    
      // Format as "HH:MM:SS"
      payload.estimated_hours = `${String(totalHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    // Update query
    const query = `
      UPDATE tasks SET
        product_id = IF(? = product_id, product_id, ?),
        project_id = IF(? = project_id, project_id, ?),
        user_id = IF(? = user_id, user_id, ?),
        name = IF(? = name, name, ?),
        estimated_hours = IF(? = estimated_hours, estimated_hours, ?),
        start_date = IF(? = start_date, start_date, ?),
        end_date = IF(? = end_date, end_date, ?),
        extended_status = IF(? = extended_status, extended_status, ?),
        extended_hours = IF(? = extended_hours, extended_hours, ?),
        active_status = IF(? = active_status, active_status, ?),
        status = IF(? = status, status, ?),
        total_hours_worked = IF(? = total_hours_worked, total_hours_worked, ?),
        rating = IF(? = rating, rating, ?),
        command = IF(? = command, command, ?),
        assigned_user_id = IF(? = assigned_user_id, assigned_user_id, ?),
        remark = IF(? = remark, remark, ?),
        reopen_status = IF(? = reopen_status, reopen_status, ?),
        description = IF(? = description, description, ?),
        team_id = IF(? = team_id, team_id, ?),
        priority = IF(? = priority, priority, ?),
        created_by = IF(? = created_by, created_by, ?),
        updated_by = IF(? = updated_by, updated_by, ?),
        deleted_at = IF(? = deleted_at, deleted_at, ?),
        created_at = IF(? = created_at, created_at, ?),
        updated_at = NOW()
      WHERE id = ?
    `;

    const values = [
      product_id,
      product_id,
      project_id,
      project_id,
      user_id,
      user_id,
      name,
      name,
      payload.estimated_hours ,
      payload.estimated_hours ,
      start_date,
      start_date,
      end_date,
      end_date,
      extended_status,
      extended_status,
      extended_hours,
      extended_hours,
      active_status,
      active_status,
      status,
      status,
      total_hours_worked,
      total_hours_worked,
      rating,
      rating,
      command,
      command,
      assigned_user_id,
      assigned_user_id,
      remark,
      remark,
      reopen_status,
      reopen_status,
      description,
      description,
      team_id,
      team_id,
      priority,
      priority,
      created_by,
      created_by,
      updated_by,
      updated_by,
      deleted_at,
      deleted_at,
      created_at,
      created_at,
      id,
    ];

    const [result] = await db.query(query, values);

    if (result.affectedRows === 0) {
      return errorResponse(res, null, "No changes made to the task", 200);
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

// exports.updateTaskData = async (id, payload, res) => {
//   const {
//     status,
//     assigned_user_id,
//     team_id,
//     owner_id,
//     estimated_hours,
//     start_date,
//     due_date,
//     priority,
//     updated_by,
//     updated_at,
//   } = payload;

//   // Define the mapping of fields to status_flag values
//   const statusFlagMapping = {
//     status: 1,
//     owner_id: 2,
//     estimated_hours: 3,
//     due_date: 4,
//     start_date: 5,
//     description: 6,
//     assigned_user_id: 9,
//     team_id: 10,
//     priority: 11,
//     updated_by:12,
//   };

//   console.log([id]);

//   try {
//     // Fetch the current task details with a soft delete check
//     const [tasks] = await db.query(
//       'SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL',
//       [id]
//     );
//     const currentTask = tasks[0]; // Get the first result

//     if (!currentTask) {
//       return errorResponse(res, null, 'Task not found or has been deleted', 404);
//     }

//     // Prepare dynamic update query for the specified fields
//     const updateFields = [];
//     const updateValues = [];

//     for (const key in payload) {
//       if (payload[key] !== undefined && payload[key] !== currentTask[key]) {
//         updateFields.push(`${key} = ?`);
//         updateValues.push(payload[key]);
//       }
//     }

//     if (updateFields.length === 0) {
//       return errorResponse(res, null, 'No fields to update', 400);
//     }

//     // Add task ID for the WHERE clause
//     updateValues.push(id);

//     // Execute the update query
//     const updateQuery = `UPDATE tasks SET ${updateFields.join(', ')} WHERE id = ?`;
//     const [updateResult] = await db.query(updateQuery, updateValues);

//     if (updateResult.affectedRows === 0) {
//       return errorResponse(res, null, 'Task not updated', 400);
//     }

//     // Prepare task history entries for changes
//     const taskHistoryEntries = [];
//     for (const key in payload) {
//       if (payload[key] !== undefined && payload[key] !== currentTask[key]) {
//         const flag = statusFlagMapping[key] || null; // Get the flag ID, default to null if not defined
//         taskHistoryEntries.push([
//           currentTask[key], // old_data
//           payload[key], // new_data
//           id, // task_id
//           null, // subtask_id (optional)
//           `Changed ${key}`, // description
//           updated_by, // updated_by
//           flag, // status_flag
//           new Date(), // created_at
//           new Date(), // updated_at
//           null, // deleted_at
//         ]);
//       }
//     }

//     // Insert task history entries into the task_histories table
//     if (taskHistoryEntries.length > 0) {
//       const historyQuery = `
//         INSERT INTO task_histories (
//           old_data, new_data, task_id, subtask_id, text,
//           updated_by, status_flag, created_at, updated_at, deleted_at
//         ) VALUES ?
//       `;
//       await db.query(historyQuery, [taskHistoryEntries]);
//     }

//     return successResponse(res, { id, ...payload }, 'Task updated successfully');
//   } catch (error) {
//     return errorResponse(res, error.message, 'Error updating task', 500);
//   }
// };

// Delete Task

exports.updateTaskData = async (id, payload, res) => {
  const {
    status,
    active_status,
    reopen_status,
    assigned_user_id,
    team_id,
    owner_id,
    estimated_hours,
    start_date,
    due_date,
    priority,
    updated_by,
    updated_at,
  } = payload;

  const statusFlagMapping = {
    status: 1,
    active_status:1,
    reopen_status:1,
    assigned_user_id: 2,
    user_id: 9 ,
    estimated_hours: 3,
    due_date: 4,
    start_date: 5,
    description: 6,
    team_id: 10,
    priority: 11
  };

  const fieldMapping = {
    due_date: 'end_date',
  };
  try {
    if (assigned_user_id) {
      const [assigned_user] = await db.query(
        "SELECT id, team_id FROM users WHERE id = ? AND deleted_at IS NULL",
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
      // payload.team_id = assigned_user[0].team_id;
    }

    if (owner_id) {
      const [user] = await db.query(
        "SELECT id FROM users WHERE id = ? AND deleted_at IS NULL",
        [owner_id]
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
    const [tasks] = await db.query(
      "SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL",
      [id]
    );
    const [sub_task_counts] = await db.query(
      "SELECT * FROM sub_tasks WHERE task_id = ? AND deleted_at IS NULL",
      [id]
    );
    const currentTask = tasks[0];

    if (!currentTask) {
      return errorResponse(
        res,
        null,
        "Task not found or has been deleted",
        404
      );
    }
    if(sub_task_counts.length===0){

      if(active_status==1 && status==1){
        const userDetails = await getAuthUserDetails(updated_by, res);

        if (!userDetails || userDetails.id == undefined) {
          return;
        }
        if(userDetails.role_id==4){
          await this.startTask( currentTask, "task", currentTask.id,res);
        }else{
          return errorResponse(res, "You are not allowed to start task", 400);
        }
      }else if(active_status==0 && status==1){
        const userDetails = await getAuthUserDetails(updated_by, res);

        const [existingSubtaskSublime] = await db.query(
          "SELECT * FROM sub_tasks_user_timeline WHERE end_time IS NULL AND user_id = ?",
          [updated_by]
        );
        if (existingSubtaskSublime.length > 0) {

          const timeline = existingSubtaskSublime[0];
          if(userDetails.role_id==4){
          await this.pauseTask(currentTask, "task", currentTask.id, timeline.start_time, timeline.id,res);
          }else{
            return errorResponse(res, "You are not allowed to pause task", 400);
          }
        }

      }else if(active_status==0 && status==2){
        const userDetails = await getAuthUserDetails(updated_by, res);

        const [existingSubtaskSublime] = await db.query(
          "SELECT * FROM sub_tasks_user_timeline WHERE end_time IS NULL AND user_id = ?",
          [updated_by]
        );
        if (existingSubtaskSublime.length > 0) {
          const timeline = existingSubtaskSublime[0];
          if(userDetails.role_id==4){
          await this.endTask(currentTask, "task", currentTask.id, timeline.start_time, timeline.id,"completed",res);
          }else{
            return errorResponse(res, "You are not allowed to end task", 400);
          }
        }
      }
    }

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
    
      const days = parseInt(timeMatch[2] || '0', 10);
      const hours = parseInt(timeMatch[4] || '0', 10);
      const minutes = parseInt(timeMatch[6] || '0', 10);
      const seconds = parseInt(timeMatch[8] || '0', 10);
    
      if (
        days < 0 ||
        hours < 0 ||
        minutes < 0 ||
        seconds < 0 ||
        minutes >= 60 ||
        seconds >= 60
      ) {
        return errorResponse(res, null, 'Invalid time values in estimated_hours', 400);
      }
    
      // Convert days to hours and calculate total hours
      const totalHours = days * 8 + hours;
    
      // Format as "HH:MM:SS"
      payload.estimated_hours = `${String(totalHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
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
        const [user] = await db.query("SELECT first_name, last_name FROM users WHERE id = ?", [userId]);
        return user.length > 0 ? `${user[0].first_name} ${user[0].last_name}` : "";
      } catch (error) {
        console.error('Error fetching user:', error);
        return "Error fetching user";
      }
    };

    const getTeamName = async (teamId) => {
      try {
        const [team] = await db.query("SELECT name FROM teams WHERE id = ?", [teamId]);
        return team.length > 0 ? team[0].name : ""; 
      } catch (error) {
        console.error('Error fetching team:', error);
        return "Error fetching team";
      }
    };
    
    async function processStatusData(statusFlag, data, taskId, subtaskId) {
     
      let task_data;
      
      if (!subtaskId) {
        task_data = await db.query("SELECT * FROM tasks WHERE id = ?", [taskId]);
      } else {
        task_data = await db.query("SELECT * FROM sub_tasks WHERE id = ?", [subtaskId]);
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
    
    const fieldsToRemove = [
      'updated_by',
      'reopen_status',
      'active_status'
    ];
    const cleanedPayload = Object.fromEntries(
      Object.entries(payload).filter(([key]) => !fieldsToRemove.includes(key))
    );
    const taskHistoryEntries = [];
    for (const key in cleanedPayload) {
      if (payload[key] !== undefined && payload[key] !== currentTask[key]) {
        const flag = statusFlagMapping[key] || null;
        taskHistoryEntries.push([
          await processStatusData( flag, currentTask[key], id, null),
          await processStatusData1( flag,  payload[key]),

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

    if (updateFields.length === 0) {
      return errorResponse(res, null, "No fields to update", 400);
    }
    updateValues.push(id);

    const updateQuery = `UPDATE tasks SET ${updateFields.join(
      ", "
    )} WHERE id = ?`;
    const [updateResult] = await db.query(updateQuery, updateValues);

    if (updateResult.affectedRows === 0) {
      return errorResponse(res, null, "Task not updated", 400);
    }

    

    // Insert task history entries into the task_histories table
    if (taskHistoryEntries.length > 0) {
      const historyQuery = `
        INSERT INTO task_histories (
          old_data, new_data, task_id, subtask_id, text,
          updated_by, status_flag, created_at, updated_at, deleted_at
        ) VALUES ?;
      `;
      await db.query(historyQuery, [taskHistoryEntries]);
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

exports.deleteTask = async (id, res) => {
  try {
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

    const query = "UPDATE tasks SET deleted_at = NOW() WHERE id = ?";
    const [result] = await db.query(query, [id]);

    if (result.affectedRows === 0) {
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
    const totaltimeTaken=totalWorkedTime+timeDifference;
    const timeTaken=convertSecondsToHHMMSS(totaltimeTaken);
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
    task.timeline_id=task.id;
    // Add time left to the task or subtask object
    task.time_left = timeLeft;
    task.type = task.subtask_id ? 'subtask' : 'task';
    task.priority = task.subtask_id ? task.subtask_priority : task.task_priority;
    task.estimated_hours = task.subtask_id ? task.subtask_estimated_hours : task.task_estimated_hours;
    task.total_hours_worked = task.subtask_id ? task.subtask_total_hours_worked : task.task_total_hours_worked;
    task.id = task.subtask_id || task.task_id;
    task.time_exceed_status= task.subtask_id ? task.subtask_total_hours_worked > task.subtask_estimated_hours?true:false:task.task_total_hours_worked > task.estimated_hours?true:false;
    task.assignedTo=task.subtask_id?task.subtask_assigned_to:task.task_assigned_to;
    task.assignedBy=task.subtask_id?task.subtask_assigned_by:task.task_assigned_by;
    task.timeTaken=timeTaken;
    const keysToRemove = [
      'subtask_priority',
      'task_priority',
      'subtask_estimated_hours',
      'subtask_total_hours_worked',
      'task_total_hours_worked',
      'task_estimated_hours',
      'subtask_assigned_to','task_assigned_to','subtask_assigned_by','task_assigned_by',
      'task_id',
      'subtask_id',
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
    const {
      user_id,
      product_id,
      project_id,
      team_id,
      priority,
      search,
      dropdown_products,
      dropdown_projects,
    } = queryParams;

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
        tasks.priority,
        tasks.estimated_hours,
        tasks.total_hours_worked,
        tasks.status AS task_status,
        tasks.reopen_status,
        tasks.active_status,
        tasks.product_id,
        tasks.project_id,
        tasks.team_id,
        projects.name AS project_name,
        products.name AS product_name,
        users.first_name AS assignee_name,
        teams.name AS team_name,
        teams.id AS team_id
      FROM tasks
      LEFT JOIN projects ON tasks.project_id = projects.id
      LEFT JOIN products ON tasks.product_id = products.id
      LEFT JOIN users ON tasks.user_id = users.id
      LEFT JOIN teams ON tasks.team_id = teams.id
      WHERE tasks.deleted_at IS NULL
    `;

    const params = [];
    if (team_id) {
      baseQuery += ` AND tasks.team_id = ?`;
      params.push(team_id);
    } else if (role_id === 3) {
      const queryteam = "SELECT id FROM teams WHERE deleted_at IS NULL AND reporting_user_id = ?";
      const [rowteams] = await db.query(queryteam, [user_id]);
      let teamIds = []; 
      if(rowteams.length > 0){
          teamIds = rowteams.map(row => row.id);
      }
      baseQuery += ` AND tasks.team_id IN (?)`;
      params.push(teamIds);
    }

    if (role_id === 4) {
      // Check if subtasks exist
      baseQuery += ` AND (
        (
          EXISTS (
            SELECT 1 FROM sub_tasks 
            WHERE sub_tasks.task_id = tasks.id AND sub_tasks.deleted_at IS NULL
          ) AND EXISTS (
            SELECT 1 FROM sub_tasks 
            WHERE sub_tasks.task_id = tasks.id AND sub_tasks.user_id = ? AND sub_tasks.deleted_at IS NULL
          )
        ) OR (
          NOT EXISTS (
            SELECT 1 FROM sub_tasks 
            WHERE sub_tasks.task_id = tasks.id AND sub_tasks.deleted_at IS NULL
          ) AND tasks.user_id = ?
        )
      )`;
      params.push(user_id, user_id);
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
      baseQuery += ` AND tasks.priority = ?`;
      params.push(priority);
    }

    if (dropdown_products && dropdown_products.length > 0) {
      baseQuery += ` AND tasks.product_id IN (${dropdown_products
        .map(() => "?")
        .join(",")})`;
      params.push(...dropdown_products);
    }

    if (dropdown_projects && dropdown_projects.length > 0) {
      baseQuery += ` AND tasks.project_id IN (${dropdown_projects
        .map(() => "?")
        .join(",")})`;
      params.push(...dropdown_projects);
    }
    if (search) {
      const searchTerm = `%${search}%`;
      baseQuery += `AND (tasks.name LIKE ? OR EXISTS (SELECT 1 FROM sub_tasks WHERE sub_tasks.task_id = tasks.id AND sub_tasks.name LIKE ? AND sub_tasks.deleted_at IS NULL) OR projects.name LIKE ? OR products.name LIKE ? OR users.first_name LIKE ? OR users.last_name LIKE ? OR teams.name LIKE ? OR tasks.priority LIKE ?)`;
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

    baseQuery += ` ORDER BY tasks.updated_at DESC`;

    // Execute the base query for tasks
    const [tasks] = await db.query(baseQuery, params);

    // Fetch subtasks only if tasks exist
    const taskIds = tasks.map((task) => task.task_id);
    let allSubtasks = [];
    if (taskIds.length > 0) {
      [allSubtasks] = await db.query(
        `
        SELECT 
          id AS subtask_id, 
          name AS subtask_name, 
          task_id,
          estimated_hours, 
          total_hours_worked, 
          status, 
          reopen_status, 
          active_status 
        FROM sub_tasks
        WHERE task_id IN (?) AND sub_tasks.deleted_at IS NULL`,
        [taskIds]
      );
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
        task_name: task.task_name,
        project_name: task.project_name,
        product_name: task.product_name,
        priority: task.priority,
        estimated_hours: formatTimeDHMS(task.estimated_hours),
        assignee_name: task.assignee_name,
        team_name: task.team_name,
        team_id: task.team_id,
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
              subtask_name: subtask.subtask_name,
              estimated_hours: formatTimeDHMS(subtask.estimated_hours),
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
function calculateTimeLeft(estimatedHours, totalHoursWorked,timeDifference) {
  const timeLeft = convertToSeconds(estimatedHours) - convertToSeconds(totalHoursWorked);
  const times =timeLeft-timeDifference;
  const time= convertSecondsToHHMMSS(times);
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
exports.startTask = async (taskOrSubtask, type, id,res) => {
  const [existingSubtaskSublime] = await db.query(
    "SELECT * FROM sub_tasks_user_timeline WHERE end_time IS NULL AND user_id = ?",
    [taskOrSubtask.user_id]
  );
  if (existingSubtaskSublime.length > 0) {
    return errorResponse(res, "You Already have Active Task", 400);
  }

  await db.query(
    "UPDATE ?? SET status = 1, active_status = 1 WHERE id = ?",
    [type === "subtask" ? "sub_tasks" : "tasks", id]
  );
  await db.query(
    "INSERT INTO sub_tasks_user_timeline (user_id, product_id, project_id, task_id, subtask_id, start_time) VALUES (?, ?, ?, ?, ?, ?)",
    [
      taskOrSubtask.user_id,
      taskOrSubtask.product_id,
      taskOrSubtask.project_id,
      type =="subtask" ?taskOrSubtask.task_id :taskOrSubtask.id,
      type=="subtask" ?taskOrSubtask.id :null,
      moment().format("YYYY-MM-DD HH:mm:ss"),
    ]
  );
} ;

exports.pauseTask = async (taskOrSubtask, type, id, lastStartTime, timeline_id,res) => {
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
    "UPDATE ?? SET total_hours_worked = ?, status = 1, active_status = 0, reopen_status = 0 WHERE id = ?",
    [type === "subtask" ? "sub_tasks" : "tasks", newTotalHoursWorked, id]
  );

  await db.query(
    "UPDATE sub_tasks_user_timeline SET end_time = ? WHERE id = ?",
    [moment().format("YYYY-MM-DD HH:mm:ss"), timeline_id]
  );
};

exports.endTask  = async (taskOrSubtask, type, id, lastStartTime, timeline_id, comment,res) => {
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
    const hours = Math.floor(absSeconds / 3600).toString().padStart(2, "0");
    const minutes = Math.floor((absSeconds % 3600) / 60).toString().padStart(2, "0");
    const seconds = (absSeconds % 60).toString().padStart(2, "0");

    extendedHours = `${hours}:${minutes}:${seconds}`;
  }

  await db.query(
    "UPDATE ?? SET total_hours_worked = ?, extended_hours = ?, status = 2, active_status = 0, reopen_status = 0, command = ? WHERE id = ?",
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
    const { id, action, type, last_start_time, timeline_id, comment } = req.body;

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
      const [subtask] = await db.query("SELECT * FROM sub_tasks WHERE id = ?", [id]);
      taskOrSubtask = subtask[0];
      taskId = taskOrSubtask.task_id;
      subtaskId = taskOrSubtask.id;
    } else {
      const [task] = await db.query("SELECT * FROM tasks WHERE id = ?", [id]);
      taskOrSubtask = task[0];
      taskId = taskOrSubtask.id;
      subtaskId = null;
    }

    // Action-based logic (start, pause, end)
    if (action === "start") {
      await this.startTask(taskOrSubtask, type, id,res);
    } else if (action === "pause") {
      await this.pauseTask(taskOrSubtask, type, id, lastStartTime, timeline_id,res);
    } else if (action === "end") {
      await this.endTask(taskOrSubtask, type, id, lastStartTime, timeline_id, comment,res);
    } else {
      return errorResponse(res, "Invalid Type", 400);
    }

    return successResponse(res, "Time updated successfully", 201);
  } catch (error) {
    return errorResponse(res, "Error Updating Time", 400);
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
    if (search) {
      const searchTerm = `%${search}%`;
      subtaskConditions.push(
        `(st.name LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR pr.name LIKE ? OR tm.name LIKE ?)`
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
      st.deleted_at IS NOT NULL
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
        t.deleted_at IS NOT NULL
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
        : "Deleted Tasks and subtasks retrieved successfully",
      200,
      pagination
    );
  } catch (error) {
    console.error("Error fetching tasks and subtasks:", error);
    return errorResponse(res, error.message, "Server error", 500);
  }
};

exports.restoreTasks = async ( req, res) => {
try{
  const { task_id ,subtask_id,user_id } = req.body;
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
  const checkQuery = `SELECT COUNT(*) as count FROM ${table} WHERE id = ?`;
  const [checkResult] = await db.query(checkQuery, [id]);

  if (checkResult[0].count === 0) {
    return errorResponse(res, "Record not found or deleted", "Not Found", 404);
  }

  // Restore the record
  const restoreQuery = `UPDATE ${table} SET deleted_at = null, updated_by = ? WHERE id = ?`;
  const values = [user_id, id];
  await db.query(restoreQuery, values);

  return successResponse(res, 'Record restored successfully', 'Success', 200);

 
} catch (error) {
  console.error('Error updating product:', error.message);
  return errorResponse(res, error.message, 'Error updating product', 500);
}
};

exports.getWorkReportData = async (queryParams, res) => {
  try {
    const {
      team_id,
      fromDate,
      toDate,
      search,
      export_status,
      page = 1,
      perPage = 10,
    } = queryParams;

    let baseQuery = `
      SELECT 
        tasks.id AS task_id, 
        tasks.name AS task_name,
        tasks.priority,
        tasks.estimated_hours,
        tasks.total_hours_worked,
        tasks.status AS task_status,
        tasks.reopen_status,
        tasks.active_status,
        tasks.product_id,
        tasks.project_id,
        tasks.team_id,
        projects.name AS project_name,
        users.first_name AS assignee_name
      FROM tasks
      LEFT JOIN projects ON tasks.project_id = projects.id
      LEFT JOIN users ON tasks.user_id = users.id
      WHERE tasks.deleted_at IS NULL
    `;

    const params = [];

    if (team_id) {
      const teamIds = team_id.split(',').map(id => id.trim());
      if (teamIds.length > 0) {
        baseQuery += `AND tasks.team_id IN (${teamIds.map(() => '?').join(',')})`;
        params.push(...teamIds);
      }
    }
    if (fromDate && toDate) {
      baseQuery += ` AND tasks.created_at BETWEEN ? AND ?`;
      params.push(fromDate, toDate);
    }

    if (search) {
      baseQuery += ` AND tasks.name LIKE ?`;
      params.push(`%${search}%`);
    }

    // Fetch tasks data
    const [tasks] = await db.query(baseQuery, params);

    // Fetch subtasks data
    const subtaskQuery = `
      SELECT 
       task_id,
       total_hours_worked
      FROM sub_tasks
    `;
    
    const [subtasks] = await db.query(subtaskQuery);

    // Create a map of task_id to total work hours
    const subtaskMap = subtasks.reduce((acc, subtask) => {
      const seconds = convertToSeconds(subtask.total_hours_worked);
      acc[subtask.task_id] = (acc[subtask.task_id] || 0) + seconds;
      return acc;
    }, {});

    // Function to convert time (HH:MM:SS) to seconds
    

    // Handle export case (no pagination)
    if (export_status == 1) {
      const result = tasks.map((task ,index) => {
        const subtaskSeconds = subtaskMap[task.task_id] || 0;
        const taskSeconds = task.total_hours_worked ? convertToSeconds(task.total_hours_worked) : 0;
        const totalSeconds = subtaskSeconds + taskSeconds;

        return {
          s_no: index + 1,
          ...task,
          total_work_hours: convertSecondsToHHMMSS(totalSeconds),
        };
      });

      // Convert data to CSV
      const json2csvParser = new Parser();
      const csv = json2csvParser.parse(result);

      res.header('Content-Type', 'text/csv');
      res.attachment('work_report_data.csv');
      return res.send(csv);
    }

    // Pagination logic (only applied when no exportType)
    const totalRecords = tasks.length;
    const offset = (page - 1) * perPage;
    const paginatedData = tasks.slice(offset, offset + parseInt(perPage));
    const pagination = getPagination(page, perPage, totalRecords);

    // Process data with total work hours calculated
    const data = paginatedData.map((task, index) => {
      const subtaskSeconds = subtaskMap[task.task_id] || 0;
      const taskSeconds = task.total_hours_worked ? convertToSeconds(task.total_hours_worked) : 0;
      const totalSeconds = subtaskSeconds + taskSeconds;

      return {
        s_no: offset + index + 1,
        ...task,
        total_work_hours: convertSecondsToHHMMSS(totalSeconds),
      };
    });

    successResponse(
      res,
      data,
      data.length === 0
        ? "No tasks or subtasks found"
        : "Tasks and subtasks retrieved successfully",
      200,
      pagination
    );
  } catch (error) {
    console.error("Error fetching tasks and subtasks:", error);
    return errorResponse(res, error.message, "Server error", 500);
  }
};






