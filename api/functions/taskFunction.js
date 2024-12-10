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
    SELECT t.*, 
          te.name AS team_name, 
          owner.name AS owner_name,
          assignee.name AS assignee_name,
          p.name AS product_name,
          pj.name AS project_name
    FROM tasks t
    LEFT JOIN teams te ON t.team_id = te.id
    LEFT JOIN users owner ON t.user_id = owner.id 
    LEFT JOIN users assignee ON t.assigned_user_id = assignee.id 
    LEFT JOIN products p ON t.product_id = p.id 
    LEFT JOIN projects pj ON t.project_id = pj.id 
    WHERE t.id = ?;
    `;
    const [task] = await db.query(taskQuery, [id]);

    if (!task) {
      return errorResponse(res, "Task not found", "Error retrieving task", 404);
    }

    // Subtasks query
    const subtasksQuery = `
    SELECT 
        st.*, 
        u.name AS assignee_name, 
        t.name AS task_name, 
        p.name AS project_name
    FROM sub_tasks st
    LEFT JOIN users u ON st.user_id = u.id 
    LEFT JOIN tasks t ON st.task_id = t.id 
    LEFT JOIN projects p ON t.project_id = p.id 
    WHERE st.task_id = ? 
    ORDER BY st.id DESC;

    `;
    const subtasks = await db.query(subtasksQuery, [id]);

    // // Histories query
    const historiesQuery = `
      SELECT h.*, u.name as updated_by, s.description as status_description
      FROM task_histories h
      LEFT JOIN users u ON h.updated_by = u.id
      LEFT JOIN task_status_flags s ON h.status_flag = s.id
      WHERE h.task_id = ?
      ORDER BY h.id DESC;
    `;
    const histories = await db.query(historiesQuery, [id]);

    // // Comments query
    const commentsQuery = `
    SELECT c.*, u.name as updated_by
    FROM task_comments c
    LEFT JOIN users u ON c.updated_by = u.id
    WHERE c.task_id = ? AND c.subtask_id IS NULL
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
    const query = `
            UPDATE tasks SET
                product_id = ?, project_id = ?, user_id = ?, name = ?, estimated_hours = ?,
                start_date = ?, end_date = ?, extended_status = ?, extended_hours = ?,
                active_status = ?, status = ?, total_hours_worked = ?, rating = ?, command = ?,
                assigned_user_id = ?, remark = ?, reopen_status = ?, description = ?,
                team_id = ?, priority = ?, created_by = ?, updated_by = ?, deleted_at = ?, created_at = ?, updated_at = ?
            WHERE id = ?
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
      id,
    ];

    const [result] = await db.query(query, values);

    if (result.affectedRows === 0) {
      return errorResponse(res, null, "Task not found", 204);
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

// Delete Task
exports.deleteTask = async (id, res) => {
  try {
    const query = "DELETE FROM tasks WHERE id = ?";
    const [result] = await db.query(query, [id]);

    if (result.affectedRows === 0) {
      return errorResponse(res, null, "Task not found", 204);
    }

    return successResponse(res, null, "Task deleted successfully");
  } catch (error) {
    return errorResponse(res, error.message, "Error deleting task", 500);
  }
};

// add task and subtask Comments
exports.addTaskComment = async (payload, res) => {
  const { task_id, subtask_id, user_id, comments, updated_by } = payload;

  try {
    const validSubtaskId = subtask_id || null;

    const query = `
          INSERT INTO task_comments (task_id, subtask_id, user_id, comments, updated_by)
          VALUES (?, ?, ?, ?, ?)
      `;

    const values = [task_id, validSubtaskId, user_id, comments, updated_by];

    const [result] = await db.query(query, values);

    if (!result || result.length === 0) {
      return errorResponse(res, null, "No task comment found", 204);
    }

    return successResponse(
      res,
      { id: result.insertId, ...payload },
      "Task comment added successfully"
    );
  } catch (error) {
    return errorResponse(
      res,
      error.message,
      "Error inserting task comment",
      500
    );
  }
};
