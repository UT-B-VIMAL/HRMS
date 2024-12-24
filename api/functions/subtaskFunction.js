const db = require('../../config/db');
const { successResponse, errorResponse,calculateNewWorkedTime,convertSecondsToHHMMSS,convertToSeconds,calculateRemainingHours,calculatePercentage } = require('../../helpers/responseHelper');
const moment = require("moment");

// Insert Task
exports.createSubTask = async (payload, res) => {
  const { task_id, name, created_by } = payload;

  try {
      // Retrieve `product_id` and `project_id` from the `tasks` table
      const selectQuery = `
          SELECT product_id, project_id 
          FROM tasks 
          WHERE deleted_at IS NULL AND id = ?
      `;
      const [taskResult] = await db.query(selectQuery, [task_id]);

      if (taskResult.length === 0) {
          return errorResponse(res, "Task not found or deleted", "Error creating subtask", 404);
      }

      const { product_id, project_id } = taskResult[0];

      // Insert into `sub_tasks` table
      const insertQuery = `
          INSERT INTO sub_tasks (
              product_id, project_id, task_id, name, created_by,updated_by ,deleted_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?,?, NULL, NOW(), NOW())
      `;
      const values = [product_id, project_id, task_id, name, created_by, created_by];
console.log(values);

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
      LEFT JOIN users owner ON st.user_id = owner.id 
      LEFT JOIN users assignee ON st.assigned_user_id = assignee.id 
      LEFT JOIN products p ON st.product_id = p.id 
      LEFT JOIN projects pj ON st.project_id = pj.id 
      WHERE st.id = ?
      AND st.deleted_at IS NULL;
    `;
    const [subtask] = await db.query(subtaskQuery, [id]);

    if (!subtask || subtask.length === 0) {
      return errorResponse(res, "Subtask not found", "Error retrieving task", 404);
    }

    // // Histories query
    const historiesQuery = `
      SELECT h.*, COALESCE(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(NULLIF(u.last_name, ''), '')), 'Unknown User') AS updated_by,  
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

    // // Status mapping
    const statusMap = {
      0: "To Do",
      1: "In Progress",
      2: "In Review",
      3: "Done",
    };

    const subtaskData = subtask.map((subtask) => {
      const totalEstimatedHours = subtask.estimated_hours || "00:00:00"; // Default format as "HH:MM:SS"
      const timeTaken = subtask.total_hours_worked || "00:00:00"; // Default format as "HH:MM:SS"
    
      // Calculate remaining hours and ensure consistent formatting
      const remainingHours = calculateRemainingHours(totalEstimatedHours, timeTaken);
    
      // Calculate percentages for hours
      const estimatedInSeconds = convertToSeconds(totalEstimatedHours);
      const timeTakenInSeconds = convertToSeconds(timeTaken);
      const remainingInSeconds = convertToSeconds(remainingHours);
    
      return {
        subtask_id: subtask.id || "N/A",
        name: subtask.name || "N/A",
        status: subtask.status || "N/A",
        project_id: subtask.project_id || "N/A",
        project: subtask.project_name || "N/A",
        product_id: subtask.product_id || "N/A",
        product: subtask.product_name || "N/A",
        owner_id: subtask.user_id || "N/A",
        owner: subtask.owner_name || "N/A",
        team_id: subtask.team_id || "N/A",
        team: subtask.team_name || "N/A",
        assignee_id: subtask.assigned_user_id || "N/A",
        assignee: subtask.assignee_name || "N/A",
        estimated_hours: totalEstimatedHours,
        estimated_hours_percentage: calculatePercentage(estimatedInSeconds, estimatedInSeconds),
        time_taken: timeTaken,
        time_taken_percentage: calculatePercentage(timeTakenInSeconds, estimatedInSeconds),
        remaining_hours: remainingHours,
        remaining_hours_percentage: calculatePercentage(remainingInSeconds, estimatedInSeconds),
        start_date: subtask.start_date || "N/A",
        end_date: subtask.end_date || "N/A",
        priority: subtask.priority || "N/A",
        description: subtask.description || "N/A",
        status_text: statusMap[subtask.status] || "Unknown",
      };
    });
    

    // Prepare histories data
    const validHistories = Array.isArray(histories) && Array.isArray(histories[0]) ? histories[0] : [];
    const historiesData = validHistories.map((history) => ({
      old_data: history.old_data ,
      new_data: history.new_data ,
      description: history.status_description || "N/A",
      updated_by: history.updated_by || "Unknown User",
      time: moment(history.updated_at).fromNow(),
      
    }));

    // Prepare comments data
    const validComments = Array.isArray(comments) && Array.isArray(comments[0]) ? comments[0] : [];
    const commentsData = validComments.map((comment) => ({
      comments: comment.comments || "No Comment",
      updated_by: comment.updated_by || "Unknown User",
      time: moment(history.updated_at).fromNow(),
     
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
exports.getAllSubTasks = async (req,res) => {
  try {
    const { task_id } = req.query;
    
    let query = 'SELECT * FROM sub_tasks WHERE deleted_at IS NULL';
    const queryParams = [];

    if (task_id) {
      query += ' AND task_id = ?';
      queryParams.push(task_id);
    }

    const [rows] = await db.query(query, queryParams);

    if (rows.length === 0) {
      return errorResponse(res, null, task_id ? 'No subtasks found for this task' : 'No subtasks found', 404);
    }

    return successResponse(res, rows, 'SubTasks retrieved successfully');
  } catch (error) {
    return errorResponse(res, error.message, 'Error retrieving subtasks', 500);
  }
};


// Update Task
exports.updateSubTask = async (id, payload, res) => {
    const {
        product_id, project_id,task_id, user_id, name, estimated_hours,
        start_date, end_date, extended_status, extended_hours,
        active_status, status, total_hours_worked, rating, command,
        assigned_user_id, remark, reopen_status, description,
        team_id, priority, created_by, updated_by, deleted_at, created_at, updated_at,
    } = payload;

    try {
        const query = `
            UPDATE sub_tasks SET
                product_id = ?, project_id = ?,task_id = ?, user_id = ?, name = ?, estimated_hours = ?,
                start_date = ?, end_date = ?, extended_status = ?, extended_hours = ?,
                active_status = ?, status = ?, total_hours_worked = ?, rating = ?, command = ?,
                assigned_user_id = ?, remark = ?, reopen_status = ?, description = ?,
                team_id = ?, priority = ?, created_by = ?, updated_by = ?, deleted_at = ?, created_at = ?, updated_at = ?
            WHERE id = ?
        `;

        const values = [
            product_id, project_id,task_id, user_id, name, estimated_hours,
            start_date, end_date, extended_status, extended_hours,
            active_status, status, total_hours_worked, rating, command,
            assigned_user_id, remark, reopen_status, description,
            team_id, priority, created_by, updated_by, deleted_at, created_at, updated_at, id,
        ];

        const [result] = await db.query(query, values);

        if (result.affectedRows === 0) {
            return errorResponse(res, null, 'SubTask not found', 204);
        }

        return successResponse(res, { id, ...payload }, 'SubTask updated successfully');
    } catch (error) {
        return errorResponse(res, error.message, 'Error updating subtask', 500);
    }
};


// Delete Task
exports.deleteSubTask = async (id, res) => {
  try {
    const query = 'UPDATE sub_tasks SET deleted_at = NOW() WHERE id = ?';
    const [result] = await db.query(query, [id]);

    if (result.affectedRows === 0) {
      return errorResponse(res, null, 'SubTask not found', 204);
    }

    return successResponse(res, null, 'SubTask deleted successfully');
  } catch (error) {
    return errorResponse(res, error.message, 'Error deleting subtask', 500);
  }
};

exports.updatesubTaskData = async (id, payload, res) => {
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
      'SELECT * FROM sub_tasks WHERE id = ? AND deleted_at IS NULL',
      [id]
    );
    const currentTask = tasks[0]; 

    if (!currentTask) {
      return errorResponse(res, null, 'SubTask not found or has been deleted', 404);
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

    const updateQuery = `UPDATE sub_tasks SET ${updateFields.join(', ')} WHERE id = ?`;
    const [updateResult] = await db.query(updateQuery, updateValues);

    if (updateResult.affectedRows === 0) {
      return errorResponse(res, null, 'SubTask not updated', 400);
    }

    const taskHistoryEntries = [];
    for (const key in payload) {
      if (payload[key] !== undefined && payload[key] !== currentTask[key]) {
        const flag = statusFlagMapping[key] || null;
        taskHistoryEntries.push([
          currentTask[key],
          payload[key], 
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


