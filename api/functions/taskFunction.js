const db = require("../../config/db");
const {
  successResponse,
  errorResponse,
  getPagination
} = require("../../helpers/responseHelper");
const {getAuthUserDetails} = require("../../api/functions/commonFunction")
const moment = require('moment');
const{
  updateTimelineShema
}  = require("../../validators/taskValidator")

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

    const [product] = await db.query('SELECT id FROM products WHERE id = ? AND deleted_at IS NULL', [product_id]);
    if (product.length === 0) {
      return errorResponse(res, null, 'Product not found or has been deleted', 404);
    }

    const [project] = await db.query('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL', [project_id]);
    if (project.length === 0) {
      return errorResponse(res, null, 'Project not found or has been deleted', 404);
    }

    const [assigned_user] = await db.query('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL', [assigned_user_id]);
    if (assigned_user.length === 0) {
      return errorResponse(res, null, 'Assigned User not found or has been deleted', 404);
    }

    const [user] = await db.query('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL', [user_id]);
    if (user.length === 0) {
      return errorResponse(res, null, 'User not found or has been deleted', 404);
    }

    const [team] = await db.query('SELECT id FROM teams WHERE id = ? AND deleted_at IS NULL', [team_id]);
    if (team.length === 0) {
      return errorResponse(res, null, 'Team not found or has been deleted', 404);
    }


    const query = `
        INSERT INTO tasks (
          product_id, project_id, user_id, name, estimated_hours,
          start_date, end_date, extended_status, extended_hours,
          active_status, status, total_hours_worked, rating, command,
          assigned_user_id, remark, reopen_status, description,
          team_id, priority, created_by, updated_by, deleted_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?)
      `;

    const values = [
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
      pj.name AS project_name 
    FROM tasks t 
    LEFT JOIN teams te ON t.team_id = te.id 
    LEFT JOIN users owner ON t.user_id = owner.id 
    LEFT JOIN users assignee ON t.assigned_user_id = assignee.id 
    LEFT JOIN products p ON t.product_id = p.id 
    LEFT JOIN projects pj ON t.project_id = pj.id 
    WHERE t.id = ?
    AND t.deleted_at IS NULL;


    `;
    const [task] = await db.query(taskQuery, [id]);


    console.log(task);
    
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
      SELECT h.*, COALESCE(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(NULLIF(u.last_name, ''), '')), 'Unknown User') AS updated_by,  
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

    // Time calculations
    const timeTaken = isNaN(parseFloat(task.total_hours_worked))
      ? 0
      : parseFloat(task.total_hours_worked);
    const estimatedHours = isNaN(parseFloat(task.estimated_hours))
      ? 0
      : parseFloat(task.estimated_hours);
    const remainingHours =
      estimatedHours > 0 ? Math.max(0, estimatedHours - timeTaken) : 0;

    // Prepare task data
    const taskData = task.map((task) => ({
      task_id: task.id || "N/A",
      name: task.name || "N/A",
      status: task.status || "N/A",
      project: task.project_name || "N/A",
      product: task.product_name || "N/A",
      owner: task.owner_name || "N/A",
      team: task.team_name || "N/A",
      estimated_hours: estimatedHours,
      time_taken: timeTaken,
      assigned_to: task.assignee_name || "N/A",
      remaining_hours: remainingHours
        ? new Date(remainingHours * 3600 * 1000).toISOString().substr(11, 8)
        : "N/A",
      start_date: task.start_date,
      end_date: task.end_date,
      priority: task.priority,
      description: task.description,
      status_text: statusMap[task.status] || "Unknown",
    }));

    // Prepare subtasks data
    const subtasksData =
      Array.isArray(subtasks) && subtasks[0].length > 0
        ? subtasks[0].map((subtask) => ({
            subtask_id: subtask.id,
            name: subtask.name || "",
            status: subtask.status,
            assignee: subtask.user_id,
            assigneename: subtask.assignee_name || "N/A",
            reopen_status: subtask.reopen_status,
            short_name: (subtask.assignee_name || "N/A").substr(0, 2),
            status_text: statusMap[subtask.status] || "Unknown",
          }))
        : [];

    const historiesData =
      Array.isArray(histories) && histories[0].length > 0
        ? histories[0].map((history) => ({
            old_data: history.old_data,
            new_data: history.new_data,
            description: history.status_description || "N/A",
            updated_by: updatedBy,
            shortName: updatedBy.substr(0, 2),
            time: history.created_at,
          }))
        : [];

    const commentsData =
      Array.isArray(comments) && comments[0].length > 0
        ? comments[0].map((comment) => ({
            comments: comment.comments,
            updated_by: comment.updated_by || "N/A",
            time: comment.created_at,
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
    const query = "SELECT * FROM tasks";
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

    const [product] = await db.query('SELECT id FROM products WHERE id = ? AND deleted_at IS NULL', [product_id]);
    if (product.length === 0) {
      return errorResponse(res, null, 'Product not found or has been deleted', 404);
    }

    const [project] = await db.query('SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL', [project_id]);
    if (project.length === 0) {
      return errorResponse(res, null, 'Project not found or has been deleted', 404);
    }

    const [assigned_user] = await db.query('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL', [assigned_user_id]);
    if (assigned_user.length === 0) {
      return errorResponse(res, null, 'Assigned User not found or has been deleted', 404);
    }

    const [user] = await db.query('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL', [user_id]);
    if (user.length === 0) {
      return errorResponse(res, null, 'User not found or has been deleted', 404);
    }

    const [team] = await db.query('SELECT id FROM teams WHERE id = ? AND deleted_at IS NULL', [team_id]);
    if (team.length === 0) {
      return errorResponse(res, null, 'Team not found or has been deleted', 404);
    }

    const [currentTask] = await db.query(
      "SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL",
      [id]
    );

    if (currentTask.length === 0) {
      return errorResponse(res, null, "Task not found", 200);
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
      product_id, product_id,
      project_id, project_id,
      user_id, user_id,
      name, name,
      estimated_hours, estimated_hours,
      start_date, start_date,
      end_date, end_date,
      extended_status, extended_status,
      extended_hours, extended_hours,
      active_status, active_status,
      status, status,
      total_hours_worked, total_hours_worked,
      rating, rating,
      command, command,
      assigned_user_id, assigned_user_id,
      remark, remark,
      reopen_status, reopen_status,
      description, description,
      team_id, team_id,
      priority, priority,
      created_by, created_by,
      updated_by, updated_by,
      deleted_at, deleted_at,
      created_at, created_at,
      id
    ];

    const [result] = await db.query(query, values);

    if (result.affectedRows === 0) {
      return errorResponse(res, null, "No changes made to the task", 200);
    }

    return successResponse(res, { id, ...payload }, "Task updated successfully");
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

  // Define the mapping of fields to status_flag values
  const statusFlagMapping = {
    status: 1,
    owner_id: 2,
    estimated_hours: 3,
    due_date: 4,
    start_date: 5,
    description: 6,
    assigned_user_id: 9,
    team_id: 10,
    priority: 11,
    updated_by: 12,
  };

  console.log([id]);

  // Define the field mapping for database column names
  const fieldMapping = {
    owner_id: 'user_id',
    due_date:'end_date',

  };

  try {

    if (assigned_user_id) {
      const [assigned_user] = await db.query('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL', [assigned_user_id]);
      if (assigned_user.length === 0) {
        return errorResponse(res, null, 'Assigned User not found or has been deleted', 404);
      }
    }

    if (owner_id) {
      const [user] = await db.query('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL', [owner_id]);
      if (user.length === 0) {
        return errorResponse(res, null, 'Owner not found or has been deleted', 404);
      }
    }

    if (team_id) {
      const [team] = await db.query('SELECT id FROM teams WHERE id = ? AND deleted_at IS NULL', [team_id]);
      if (team.length === 0) {
        return errorResponse(res, null, 'Team not found or has been deleted', 404);
      }
    }
    const [tasks] = await db.query(
      'SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    const currentTask = tasks[0]; 

    if (!currentTask) {
      return errorResponse(res, null, 'Task not found or has been deleted', 404);
    }

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
      return errorResponse(res, null, 'No fields to update', 400);
    }
    updateValues.push(id);

    const updateQuery = `UPDATE tasks SET ${updateFields.join(', ')} WHERE id = ?`;
    const [updateResult] = await db.query(updateQuery, updateValues);

    if (updateResult.affectedRows === 0) {
      return errorResponse(res, null, 'Task not updated', 400);
    }

    const taskHistoryEntries = [];
    for (const key in payload) {
      if (payload[key] !== undefined && payload[key] !== currentTask[key]) {
        const flag = statusFlagMapping[key] || null;
        taskHistoryEntries.push([
          currentTask[key],
          payload[key], 
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

    return successResponse(res, { id, ...payload }, 'Task updated successfully');
  } catch (error) {
    return errorResponse(res, error.message, 'Error updating task', 500);
  }
};

exports.deleteTask = async (id, res) => {
  try {
    const subtaskQuery = 'SELECT COUNT(*) as subtaskCount FROM sub_tasks WHERE task_id = ? AND deleted_at IS NULL';
    const [subtaskResult] = await db.query(subtaskQuery, [id]);

    if (subtaskResult[0].subtaskCount > 0) {
      return errorResponse(res, null, "Task has associated subtasks and cannot be deleted", 400);
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



const convertToSeconds = (timeString) => {

const [hours, minutes, seconds] = timeString.split(':').map(Number);
return hours * 3600 + minutes * 60 + seconds;
}
const calculateTimeLeft = (estimatedHours, totalHoursWorked, timeDifference) => {
  const estimatedInSeconds = convertToSeconds(estimatedHours || '00:00:00');
  const workedInSeconds = convertToSeconds(totalHoursWorked || '00:00:00');
  const remainingSeconds = Math.max(0, estimatedInSeconds - workedInSeconds - timeDifference);
  return new Date(remainingSeconds * 1000).toISOString().substr(11, 8);
};

const lastActiveTask = async (userId) => {
  try {
    const query = `
        SELECT stut.*, s.name as subtask_name, s.estimated_hours as subtask_estimated_hours,
               s.total_hours_worked as subtask_total_hours_worked, t.name as task_name,
               t.estimated_hours as task_estimated_hours, t.total_hours_worked as task_total_hours_worked
        FROM sub_tasks_user_timeline stut
        LEFT JOIN sub_tasks s ON stut.subtask_id = s.id
        LEFT JOIN tasks t ON stut.task_id = t.id
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
    const timeDifference = now.diff(lastStartTime, 'seconds'); // Calculate the difference in seconds

    // Calculate the time left based on whether it's a subtask or task
    const timeLeft = calculateTimeLeft(
        task.subtask_id ? task.subtask_estimated_hours : task.task_estimated_hours,
        task.subtask_id ? task.subtask_total_hours_worked : task.task_total_hours_worked,
        timeDifference
    );

    // Add time left to the task or subtask object
    if (task.subtask_id) {
        task.subtask_time_left = timeLeft;
    } else {
        task.task_time_left = timeLeft;
    }

    return task;
  } catch (err) {
    console.error('Error fetching last active task:', err.message);
    return null;
  }
};

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  };

  exports.getTaskList = async (queryParams, res) => {
    const {user_id,search,product_id,project_id,project_dropdown,product_dropdown,team_id,priority}=queryParams;
    const authUserDetails = await getAuthUserDetails(res,user_id);
    console.log(authUserDetails.id);
    console.log(authUserDetails.role_id);

    const searchTerm = search ? `%${search}%` : null;
    try {
      const [teamIds] = await db.query(
        `SELECT id FROM teams WHERE reporting_user_id = ?`,
        [authUserDetails.id]
      );
  
      const teamIdsList = teamIds.map((team) => team.id);
  
      let whereConditions = [];
      let queryParams = [];
  
      if (authUserDetails.role_id === 3) {
        whereConditions.push('t.team_id IN (?)');
        queryParams.push(teamIdsList.length ? teamIdsList : undefined);
      }
  
      if (authUserDetails.role_id === 4) {
        whereConditions.push('(t.user_id = ? OR s.user_id = ?)');
        queryParams.push(authUserDetails.id, authUserDetails.id);
      }
      if (product_id) {
        whereConditions.push('t.product_id = ?');
        queryParams.push(product_id);
      }
      if (product_dropdown) {
        whereConditions.push('t.product_id IN (?)');
        queryParams.push(product_dropdown.split(',')); 
      }
      if (project_dropdown) {
        whereConditions.push('t.project_id IN (?)');
        queryParams.push(project_dropdown.split(',')); 
      }
      if (team_id) {
        whereConditions.push('t.team_id = ?');
        queryParams.push(team_id);
      }
  
      if (priority) {
        whereConditions.push('t.priority = ?');
        queryParams.push(priority);
      }
      if (project_id) {
        whereConditions.push('t.project_id = ?');
        queryParams.push(project_id);
      }
  
      if (searchTerm) {
        whereConditions.push(`
          (t.name LIKE ? OR s.name LIKE ? OR p.name LIKE ? OR pr.name LIKE ? OR u.first_name LIKE ?)
        `);
        queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm,searchTerm);
      }
  
      const tasksQuery = `
        SELECT t.*, 
               s.id AS subtask_id, s.name AS subtask_name, s.status AS subtask_status,
               p.name AS product_name, pr.name AS project_name, u.first_name AS user_name, tm.name AS team_name
        FROM tasks t
        LEFT JOIN sub_tasks s ON s.task_id = t.id
        LEFT JOIN products p ON t.product_id = p.id
        LEFT JOIN projects pr ON t.project_id = pr.id
        LEFT JOIN users u ON t.user_id = u.id
        LEFT JOIN teams tm ON u.team_id = tm.id
        ${whereConditions.length ? 'WHERE ' + whereConditions.join(' AND ') : ''}
        ORDER BY t.updated_at DESC
      `;
  
      const [tasks] = await db.query(tasksQuery, queryParams);
  
      const groups = {
        'To-Do': [],
        'In-Progress': [],
        'On-Hold': [],
        'Pending-Approval': [],
        'Reopen': [],
        'Done': []
      };
  
      const groupByStatus = (status) => {
        return status === 0
          ? 'To-Do'
          : status === 1
          ? 'On-Hold'
          : status === 2
          ? 'Pending-Approval'
          : status === 3
          ? 'Reopen'
          : status === 4
          ? 'In-Progress'
          : 'Done';
      };
  
      const taskMap = new Map();
  
      // Process tasks and subtasks
      tasks.forEach((task) => {
        const taskKey = task.id;
        const estimatedSeconds = convertToSeconds(task.estimated_hours || '00:00:00');
        const workedSeconds = convertToSeconds(task.total_hours_worked || '00:00:00');
        const remainingSeconds = estimatedSeconds - workedSeconds;
        const timeLeftFormatted = remainingSeconds > 0 ? formatTime(remainingSeconds) : '00:00:00';
        if (!taskMap.has(taskKey)) {
          taskMap.set(taskKey, {
            task_details: {
              id: task.id,
              name: task.name,
              product_id:task.product_id,
              project_id:task.project_id,
              product_name: task.product_name || 'N/A',
              project_name: task.project_name || 'N/A',
              priority: task.priority,
              assignee: task.user_name || '',
              team: task.team_name || '',
              task_status: groupByStatus(task.status),
              time_left: timeLeftFormatted,
              type: task.subtask_id ? "subtask" : "task"
            },
            subtasks: []
          });
        }
  
        if (task.subtask_id) {
          taskMap.get(taskKey).subtasks.push({
            subtask_id: task.subtask_id,
            subtask_name: task.subtask_name,
            subtask_status: groupByStatus(task.subtask_status),
            subtask_estimated_hours: task.estimated_hours,
            subtask_total_hours_worked: task.total_hours_worked,
            subtask_reopen_status: task.reopen_status,
            subtask_active_status: task.active_status
          });
        }
      });
  
      // Group tasks
      taskMap.forEach(({ task_details, subtasks }) => {
        // If there are no subtasks, group the task by its own status
        if (subtasks.length === 0) {
          const statusGroup = groupByStatus(task_details.task_status);
          groups[statusGroup].push({ task_details });
        } else {
          // Split subtasks by their status and add them to the respective groups
          subtasks.forEach((subtask) => {
            const subtaskGroup = subtask.subtask_status;
            const group = groups[subtaskGroup];
            const existingTask = group.find(
              (g) => g.task_details.id === task_details.id
            );
      
            if (existingTask) {
              // If the task already exists in the group, append the subtask
              existingTask.subtask_details.push(subtask);
            } else {
              // If the task doesn't exist in the group, create a new entry
              group.push({
                task_details,
                subtask_details: [subtask]
              });
            }
          });
        }
      });
      const activeTask = await lastActiveTask(authUserDetails.id);
      const data = { groups,activeTask};
      return successResponse(res, data, "Tasks retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message, 'Error fetching task', 500);
    }
  };

  exports.doneTaskList = async (req, res) => {
    try {
      const { user_id, product_id, project_id, search, page = 1, perPage = 10  } = req.query;
      const offset = (page - 1) * perPage;
      let query = `
        SELECT 
          t.id AS task_id,
          t.name AS task_name,
          t.rating AS task_rating,
          t.estimated_hours AS task_estimated_hours,
          t.total_hours_worked AS task_total_hours_worked,
          t.updated_at AS task_updated_at,
          tsut.start_time AS task_start_time,
          tsut.end_time AS task_end_time,
          u.id AS user_id,
          u.first_name AS user_name,
          u.employee_id AS employee_id,
          p.id AS product_id,
          p.name AS product_name,
          pr.id AS project_id,
          pr.name AS project_name,
          st.id AS subtask_id,
          st.name AS subtask_name,
          st.rating AS subtask_rating,
          st.estimated_hours AS subtask_estimated_hours,
          st.total_hours_worked AS subtask_total_hours_worked,
          st.updated_at AS subtask_updated_at,
          tsut_sub.start_time AS subtask_start_time,
          tsut_sub.end_time AS subtask_end_time,
          DATE(t.created_at) AS task_date,
          t.status AS task_status
        FROM 
          tasks t
        LEFT JOIN 
          users u ON u.id = t.user_id
        LEFT JOIN 
          products p ON p.id = t.product_id
        LEFT JOIN 
          projects pr ON pr.id = t.project_id
        LEFT JOIN 
          sub_tasks st ON st.task_id = t.id AND st.deleted_at IS NULL
        LEFT JOIN 
          sub_tasks_user_timeline tsut ON tsut.task_id = t.id AND tsut.deleted_at IS NULL
        LEFT JOIN 
          sub_tasks_user_timeline tsut_sub ON tsut_sub.subtask_id = st.id AND tsut_sub.deleted_at IS NULL
        WHERE 
          t.deleted_at IS NULL
          AND t.status = 3
          ${product_id ? `AND (t.product_id = ? OR st.product_id = ?)` : ""}
          ${project_id ? `AND (t.project_id = ? OR st.project_id = ?)` : ""}
          ${user_id ? `AND t.user_id = ?` : ""}
          ${search ? `AND (t.name LIKE ? OR st.name LIKE ?)` : ""}
        ORDER BY t.id, st.id
        
        
      `;
  
      const values = [];
      if (product_id) {
        values.push(product_id, product_id);
      }
      if (project_id) {
        values.push(project_id, project_id);
      }
      if (user_id) values.push(user_id);
      if (search) {
        const searchTerm = `%${search}%`;
        values.push(searchTerm, searchTerm);
      }
  
      const [result] = await db.execute(query, values);
  
      const groupedTasks = result.reduce((acc, row) => {
        if (!acc[row.task_id]) {
          acc[row.task_id] = {
            task_id: row.task_id,
            task_name: row.task_name,
            estimated_time: row.task_estimated_hours,
            task_duration: row.task_updated_at
              ? moment(row.task_updated_at).fromNow()
              : "Not started",
            user_id: row.user_id,
            employee_id: row.employee_id,
            product_id: row.product_id,
            product_name: row.product_name,
            project_id: row.project_id,
            project_name: row.project_name,
            rating: row.task_rating,
            subtasks: [],
          };
        }
  
        if (row.subtask_id) {
          acc[row.task_id].subtasks.push({
            subtask_id: row.subtask_id,
            subtask_name: row.subtask_name,
            estimated_time: row.subtask_estimated_hours,
            task_duration: row.subtask_updated_at
              ? moment(row.subtask_updated_at).fromNow()
              : "Not started",
            rating: row.subtask_rating,
          });
        }
  
        return acc;
      }, {});
  
      const data = Object.values(groupedTasks).flatMap((task) => {
        if (task.subtasks.length > 0) {
          return task.subtasks.map((subtask) => ({
            task_name: subtask.subtask_name,
            estimated_time: subtask.estimated_time,
            task_duration: subtask.task_duration,
            rating: subtask.rating,
            product_id: task.product_id,
            product_name: task.product_name,
            project_id: task.project_id,
            project_name: task.project_name,
          }));
        }
  
        return {
          task_name: task.task_name,
          estimated_time: task.estimated_time,
          task_duration: task.task_duration,
          rating: task.rating,
          product_id: task.product_id,
          product_name: task.product_name,
          project_id: task.project_id,
          project_name: task.project_name,
        };
      });
  
      successResponse(
        res,
        data,
        data.length === 0
          ? "No tasks or subtasks found"
          : "Tasks and subtasks retrieved successfully",
        200
      );
    } catch (error) {
      console.error("Error fetching tasks and subtasks:", error);
      return errorResponse(res, error.message, "Server error", 500);
    }
  };
  exports.updateTaskTimeLine = async (req, res) => {
    try {
        const {
            id,
            action,
            type,
            last_start_time,
            timeline_id,
            comment
        } = req.body;
      console.log(action);
        const { error } = updateTimelineShema.validate(
          req.body,
          { abortEarly: false }
        );
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
  
          if (type === 'subtask') {
              const [subtask] = await db.query('SELECT * FROM sub_tasks WHERE id = ?', [id]);
              taskOrSubtask = subtask[0];
              taskId = taskOrSubtask.task_id;
              subtaskId = taskOrSubtask.id;
          } else {
              const [task] = await db.query('SELECT * FROM tasks WHERE id = ?', [id]);
              taskOrSubtask = task[0];
              taskId = taskOrSubtask.id;
              subtaskId = null;
          }
          console.log(taskId)
  
          if (action === 'start') {
              // Check if a record already exists in the sub_tasks_user_timeline table for the current task/subtask
              const [existingSubtaskSublime] = await db.query('SELECT * FROM ?? WHERE active_status = 1 AND deleted_at IS NULL AND user_id = ?', [type === 'subtask' ? 'sub_tasks' : 'tasks',taskOrSubtask.user_id]);
            console.log(existingSubtaskSublime)
              if (existingSubtaskSublime.length>0) {
                  return res.status(400).json({ message: 'Time Line is Already Started' });
              }
  
              await db.query('UPDATE ?? SET status = 1, active_status = 1 WHERE id = ?', [type === 'subtask' ? 'sub_tasks' : 'tasks', id]);
              const [timeline] = await db.query('INSERT INTO sub_tasks_user_timeline (user_id, product_id, project_id, task_id, subtask_id, start_time) VALUES (?, ?, ?, ?, ?, ?)', [
                  taskOrSubtask.user_id,
                  taskOrSubtask.product_id,
                  taskOrSubtask.project_id,
                  taskId,
                  subtaskId,
                  moment().format('YYYY-MM-DD HH:mm:ss')
              ]);
  
          }
  
         else if (action === 'pause') {

              const currentTime = moment();
              const timeDifference = lastStartTime.diff(currentTime, 'seconds');
              const newTotalHoursWorked = calculateNewWorkedTime(taskOrSubtask.total_hours_worked, timeDifference);
  
              await db.query('UPDATE ?? SET total_hours_worked = ?, status = 1, active_status = 0, reopen_status = 0 WHERE id = ?', [
                  type === 'subtask' ? 'sub_tasks' : 'tasks',
                  newTotalHoursWorked,
                  id
              ]);
  
              await db.query('UPDATE sub_tasks_user_timeline SET end_time = ? WHERE id = ?', [
                  moment().format('YYYY-MM-DD HH:mm:ss'),
                  timeline_id
              ]);
          }
  
          else if (action === 'end') {
              const currentTime = moment();
              const timeDifference = currentTime.diff(lastStartTime, 'seconds');
              const newTotalHoursWorked = calculateNewWorkedTime(taskOrSubtask.total_hours_worked, timeDifference);
              const estimatedHours = taskOrSubtask.estimated_hours;
  
              const newTotalHoursWorkedSeconds = convertToSeconds(newTotalHoursWorked);
              const estimatedHoursSeconds = convertToSeconds(estimatedHours);
  
              const remainingSeconds = estimatedHoursSeconds - newTotalHoursWorkedSeconds;
              let extendedHours = "00:00:00";
  
              if (remainingSeconds < 0) {
                  extendedHours = new Date(Math.abs(remainingSeconds) * 1000).toISOString().substr(11, 8);
              }
            
              await db.query('UPDATE ?? SET total_hours_worked = ?, extended_hours = ?, status = 2, active_status = 0, reopen_status = 0, command = ? WHERE id = ?', [
                  type === 'subtask' ? 'sub_tasks' : 'tasks',
                  newTotalHoursWorked,
                  extendedHours,
                  comment,
                  id
              ]);
  
              await db.query('UPDATE sub_tasks_user_timeline SET end_time = ? WHERE id = ?', [
                  moment().format('YYYY-MM-DD HH:mm:ss'),
                  timeline_id
              ]);
  
          }else{
          return errorResponse(res, 'Invalid Type ', 400);
        }
        return successResponse(
          res,
          "Time updated successfully",
          201
        );
       
    } catch (error) {
      return errorResponse(res, 'Error Updating Time', 400);
    }
};


function calculateNewWorkedTime(worked, timeDifference) {
    const workedInSeconds = convertToSeconds(worked);
    const newTotalWorkedInSeconds = workedInSeconds + timeDifference;
    return convertSecondsToHHMMSS(newTotalWorkedInSeconds);
}


function convertSecondsToHHMMSS(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map(num => String(num).padStart(2, '0')).join(':');
}
  
  

