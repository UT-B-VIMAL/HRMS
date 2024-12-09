const db = require('../../config/db');
const { successResponse, errorResponse } = require('../../helpers/responseHelper');

// Insert Task
exports.createSubTask= async (payload, res) => {
    const {
      product_id, project_id, user_id, name, estimated_hours,
      start_date, end_date, extended_status, extended_hours,
      active_status, status, total_hours_worked, rating, command,
      assigned_user_id, remark, reopen_status, description,
      team_id, priority, created_by, updated_by, deleted_at, created_at, updated_at
    } = payload;
  
    try {
        const query = `
        INSERT INTO sub_tasks (
          product_id, project_id,task_id, user_id, name, estimated_hours,
          start_date, end_date, extended_status, extended_hours,
          active_status, status, total_hours_worked, rating, command,
          assigned_user_id, remark, reopen_status, description,
          team_id, priority, created_by, updated_by, deleted_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?,?)
      `;
      
      const values = [
        product_id, project_id,task_id, user_id, name, estimated_hours,
        start_date, end_date, extended_status, extended_hours,
        active_status, status, total_hours_worked, rating, command,
        assigned_user_id, remark, reopen_status, description,
        team_id, priority, created_by, updated_by, deleted_at, created_at, updated_at
      ];
      console.log('Query:', query);
      console.log('Values:', values);

      const [result] = await db.query(query, values);
  
      return successResponse(res, { id: result.insertId, ...payload }, 'SubTask added successfully', 201);
    } catch (error) {
      console.error('Error inserting subtask:', error.message);
      return errorResponse(res, error.message, 'Error inserting subtask', 500);
    }
  };

// Show Task
exports.getSubTask = async (id, res) => {
    try {
      const query = 'SELECT * FROM sub_tasks WHERE id = ?';
      const [rows] = await db.query(query, [id]);
  
      if (rows.length === 0) {
        return errorResponse(res, null, 'SubTask not found', 204);
      }
  
      return successResponse(res, rows[0], 'SubTask retrieved successfully');
    } catch (error) {
      return errorResponse(res, error.message, 'Error retrieving subtask', 500);
    }
  };

// Show All Task
exports.getAllSubTasks= async (res) => {
    try {
        const query = 'SELECT * FROM sub_tasks';
        const [rows] = await db.query(query);

        if (rows.length === 0) {
            return errorResponse(res, null, 'No subtasks found', 204);
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
    const query = 'DELETE FROM sub_tasks WHERE id = ?';
    const [result] = await db.query(query, [id]);

    if (result.affectedRows === 0) {
      return errorResponse(res, null, 'SubTask not found', 204);
    }

    return successResponse(res, null, 'SubTask deleted successfully');
  } catch (error) {
    return errorResponse(res, error.message, 'Error deleting subtask', 500);
  }
};


