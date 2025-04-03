const db = require("../../config/db");
const {successResponse,errorResponse,} = require("../../helpers/responseHelper");

// add task and subtask Comments
exports.addComments = async (payload, res) => {
    const { task_id, subtask_id, user_id, comments, updated_by } = payload;
  
    try {
      const [user] = await db.query(
        'SELECT id FROM users WHERE id = ? AND deleted_at IS NULL',
        [user_id]
      );
      if (user.length === 0) {
        return errorResponse(res, null, 'User not found or has been deleted', 404);
      }
  
      const [task] = await db.query(
        'SELECT id FROM tasks WHERE id = ? AND deleted_at IS NULL',
        [task_id]
      );
      if (task.length === 0) {
        return errorResponse(res, null, 'Task not found or has been deleted', 404);
      }
  
      if (subtask_id) {
        const [subtask] = await db.query(
          'SELECT id FROM sub_tasks WHERE id = ? AND deleted_at IS NULL',
          [subtask_id]
        );
        if (subtask.length === 0) {
          return errorResponse(res, null, 'SubTask not found or has been deleted', 404);
        }
      }
  
      const validSubtaskId = subtask_id || null;
      const getISTTime = () => {
        const now = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
        const istTime = new Date(now.getTime() + istOffset);
        return istTime.toISOString().slice(0, 19).replace("T", " "); // Convert to MySQL DATETIME format
    };
    
    const localISTTime = getISTTime();
      
      // Insert the new comment
      const insertCommentQuery = `
        INSERT INTO task_comments (task_id, subtask_id, user_id, comments, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      const commentValues = [task_id, validSubtaskId, user_id, comments, updated_by,localISTTime,localISTTime];
  
      const [commentResult] = await db.query(insertCommentQuery, commentValues);
  
      if (commentResult.affectedRows === 0) {
        return errorResponse(res, null, 'Failed to add task comment', 500);
      }
  
      const historyQuery = `
        INSERT INTO task_histories (
          old_data, new_data, task_id, subtask_id, text,
          updated_by, status_flag, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `;
      const historyValues = [
        null,
       comments, 
        task_id,
        validSubtaskId,
        'Comment Added',
        updated_by,
        7,
        localISTTime,
        localISTTime // Default flag for added comments
      ];
  
      const [historyResult] = await db.query(historyQuery, historyValues);
  
      if (historyResult.affectedRows === 0) {
        return errorResponse(res, null, 'Failed to log history for task comment', 500);
      }
  
      return successResponse( res,{ id: commentResult.insertId, ...payload },'Task comment added successfully' );
    } catch (error) {
      return errorResponse(res, error.message, 'Error inserting task comment', 500);
    }
  };
  

  exports.updateComments = async (id, payload, res) => {
    const { comments, updated_by } = payload;
  
    try {

      const [existingComment] = await db.query(
        'SELECT id, comments AS old_comments, task_id, subtask_id FROM task_comments WHERE id = ? AND deleted_at IS NULL',
        [id]
      );
  
      if (existingComment.length === 0) {
        return errorResponse(res, null, 'Comment not found or has been deleted', 404);
      }
      const { old_comments, task_id, subtask_id } = existingComment[0];

    //   const getISTTime = () => {
    //     const now = new Date();
    //     const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
    //     const istTime = new Date(now.getTime() + istOffset);
    //     return istTime.toISOString().slice(0, 19).replace("T", " "); // Convert to MySQL DATETIME format
    // };
    
    // const localISTTime = getISTTime();
        
       const query = `
        UPDATE task_comments
        SET  comments = ?, updated_by = ?, updated_at = ?
        WHERE id = ? AND deleted_at IS NULL
      `;
      const values = [comments, updated_by, localISTTime, id];
  
      const [result] = await db.query(query, values);
  
      if (result.affectedRows === 0) {
        return errorResponse(res, null, "Comment update failed", 400);
      }

      const historyQuery = `
        INSERT INTO task_histories (
          old_data, new_data, task_id, subtask_id, text,
          updated_by, status_flag, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `;
      const historyValues = [
        old_comments,
        comments, 
        task_id,
        subtask_id,
        'Comment Updated',
        updated_by,
        12,
        now(),
        now()
      ];
  
      const [historyResult] = await db.query(historyQuery, historyValues);
  
      if (historyResult.affectedRows === 0) {
        return errorResponse(res, null, 'Failed to log history for task comment', 500);
      }

      return successResponse(res, { id, ...payload }, "Task comment updated successfully");
  
    } catch (error) {
      return errorResponse(res, error.message, "Error updating task comment", 500);
    }
  };
  

  exports.deleteComments = async (req, res) => {
    const { id, updated_by } = req.query;
    
    try {
      if (!updated_by) {
        return errorResponse(
          res,
          "Updated_by is required",
          "Missing Updated_by in query parameters",
          400
        );
      }

      const [rows] = await db.query(
        "SELECT id FROM users WHERE id = ? AND deleted_at IS NULL",
        [updated_by]
      );
  
      // Check if no rows are returned
      if (rows.length === 0) {
        return errorResponse(res, null, "User Not Found", 400);
      }
      const [existingComment] = await db.query(
        'SELECT id, comments AS old_comments, task_id, subtask_id FROM task_comments WHERE id = ? AND deleted_at IS NULL',
        [id]
      );
  
      if (existingComment.length === 0) {
        return errorResponse(res, null, 'Comment not found or has been deleted', 404);
      }
      const { task_id, subtask_id } = existingComment[0];
  
      const query = `
        UPDATE task_comments
        SET deleted_at = NOW(), updated_at = NOW()
        WHERE id = ? AND deleted_at IS NULL
      `;
      const values = [id];
  
      const [result] = await db.query(query, values);
  
      if (result.affectedRows === 0) {
        return errorResponse(res, null, "Comment deletion failed", 400);
      }

      const getISTTime = () => {
        const now = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
        const istTime = new Date(now.getTime() + istOffset);
        return istTime.toISOString().slice(0, 19).replace("T", " "); // Convert to MySQL DATETIME format
    };
    
    const localISTTime = getISTTime();
      const historyQuery = `
        INSERT INTO task_histories (
          old_data, new_data, task_id, subtask_id, text,
          updated_by, status_flag, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `;
      const historyValues = [
        null,
        null, 
        task_id,
        subtask_id,
        'Comment Deleted',
        updated_by,
        13,
        localISTTime,
        localISTTime // Default flag for deleted comments
      ];
  
      const [historyResult] = await db.query(historyQuery, historyValues);
  
      if (historyResult.affectedRows === 0) {
        return errorResponse(res, null, 'Failed to log history for task comment', 500);
      }
  
      return successResponse(res, null, "Task comment deleted successfully");
    } catch (error) {
      return errorResponse(res, error.message, "Error deleting task comment", 500);
    }
  };
  
  