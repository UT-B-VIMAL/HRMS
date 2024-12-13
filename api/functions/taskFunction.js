const db = require("../../config/db");
const {
  successResponse,
  errorResponse,
} = require("../../helpers/responseHelper");

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
    const query = "UPDATE FROM tasks SET deleted_at = NOW() WHERE id = ?";
    const [result] = await db.query(query, [id]);

    if (result.affectedRows === 0) {
      return errorResponse(res, null, "Task not found", 204);
    }

    return successResponse(res, null, "Task deleted successfully");
  } catch (error) {
    return errorResponse(res, error.message, "Error deleting task", 500);
  }
};


const convertToSeconds = (timeString) => {
  const [hours, minutes, seconds] = timeString.split(':').map(Number);
  return (hours * 3600) + (minutes * 60) + (seconds || 0);
};

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
    const authUser = { id: 61, role_id: 2}; 
    const {user_id,search,product_id,project_id,team_id,priority}=queryParams
    const searchTerm = search ? `%${search}%` : null;
    //  const authuser = 
    try {
      const [teamIds] = await db.query(
        `SELECT id FROM teams WHERE reporting_user_id = ?`,
        [authUser.id]
      );
  
      const teamIdsList = teamIds.map((team) => team.id);
  
      let whereConditions = [];
      let queryParams = [];
  
      if (authUser.role_id === 3) {
        whereConditions.push('t.team_id IN (?)');
        queryParams.push(teamIdsList.length ? teamIdsList : undefined);
      }
  
      if (authUser.role_id === 4) {
        whereConditions.push('(t.user_id = ? OR s.user_id = ?)');
        queryParams.push(authUser.id, authUser.id);
      }
      if (product_id) {
        whereConditions.push('t.product_id = ?');
        queryParams.push(product_id);
      }
  
      if (project_id) {
        whereConditions.push('t.project_id = ?');
        queryParams.push(project_id);
      }
  
      if (team_id) {
        whereConditions.push('t.team_id = ?');
        queryParams.push(team_id);
      }
  
      if (priority) {
        whereConditions.push('t.priority = ?');
        queryParams.push(priority);
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
              product_name: task.product_name || 'N/A',
              project_name: task.project_name || 'N/A',
              priority: task.priority,
              assignee: task.user_name || '',
              team: task.team_name || '',
              task_status: groupByStatus(task.status),
              time_left: timeLeftFormatted,
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
      const activeTask = await lastActiveTask(authUser.id);
      const data = { groups,activeTask};
      return successResponse(res, data, "Tasks retrieved successfully");
    } catch (error) {
      return errorResponse(res, error.message, 'Error fetching task', 500);
    }
  };
  
  
  

