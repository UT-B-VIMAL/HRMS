const db = require('../../config/db');
const { successResponse, errorResponse } = require('../../helpers/responseHelper');

// Insert Task
exports.createTask= async (payload, res) => {
    const {
      product_id, project_id, user_id, name, estimated_hours,
      start_date, end_date, extended_status, extended_hours,
      active_status, status, total_hours_worked, rating, command,
      assigned_user_id, remark, reopen_status, description,
      team_id, priority, created_by, updated_by, deleted_at, created_at, updated_at
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
        product_id, project_id, user_id, name, estimated_hours,
        start_date, end_date, extended_status, extended_hours,
        active_status, status, total_hours_worked, rating, command,
        assigned_user_id, remark, reopen_status, description,
        team_id, priority, created_by, updated_by, deleted_at, created_at, updated_at
      ];
      console.log('Query:', query);
      console.log('Values:', values);

      const [result] = await db.query(query, values);
  
      return successResponse(res, { id: result.insertId, ...payload }, 'Task added successfully', 201);
    } catch (error) {
      console.error('Error inserting task:', error.message);
      return errorResponse(res, error.message, 'Error inserting task', 500);
    }
  };

// Show Task
exports.getTask = async (id, res) => {
    try {
      const query = 'SELECT * FROM tasks WHERE id = ?';
      const [rows] = await db.query(query, [id]);
  
      if (rows.length === 0) {
        return errorResponse(res, null, 'Task not found', 204);
      }
  
      return successResponse(res, rows[0], 'Task retrieved successfully');
    } catch (error) {
      return errorResponse(res, error.message, 'Error retrieving task', 500);
    }
  };

// Show All Task
exports.getAllTasks= async (res) => {
    try {
        const query = 'SELECT * FROM tasks';
        const [rows] = await db.query(query);

        if (rows.length === 0) {
            return errorResponse(res, null, 'No tasks found', 204);
        }

        return successResponse(res, rows, 'Tasks retrieved successfully');
    } catch (error) {
        return errorResponse(res, error.message, 'Error retrieving tasks', 500);
    }
};



// Update Task
exports.updateTask = async (id, payload, res) => {
    const {
        product_id, project_id, user_id, name, estimated_hours,
        start_date, end_date, extended_status, extended_hours,
        active_status, status, total_hours_worked, rating, command,
        assigned_user_id, remark, reopen_status, description,
        team_id, priority, created_by, updated_by, deleted_at, created_at, updated_at,
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
            product_id, project_id, user_id, name, estimated_hours,
            start_date, end_date, extended_status, extended_hours,
            active_status, status, total_hours_worked, rating, command,
            assigned_user_id, remark, reopen_status, description,
            team_id, priority, created_by, updated_by, deleted_at, created_at, updated_at, id,
        ];

        const [result] = await db.query(query, values);

        if (result.affectedRows === 0) {
            return errorResponse(res, null, 'Task not found', 204);
        }

        return successResponse(res, { id, ...payload }, 'Task updated successfully');
    } catch (error) {
        return errorResponse(res, error.message, 'Error updating task', 500);
    }
};


// Delete Task
exports.deleteTask = async (id, res) => {
  try {
    const query = 'DELETE FROM tasks WHERE id = ?';
    const [result] = await db.query(query, [id]);

    if (result.affectedRows === 0) {
      return errorResponse(res, null, 'Task not found', 204);
    }

    return successResponse(res, null, 'Task deleted successfully');
  } catch (error) {
    return errorResponse(res, error.message, 'Error deleting task', 500);
  }
};


