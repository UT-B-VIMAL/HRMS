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
  
      // Insert the new comment
      const insertCommentQuery = `
        INSERT INTO task_comments (task_id, subtask_id, user_id, comments, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, NOW(), NOW())
      `;
      const commentValues = [task_id, validSubtaskId, user_id, comments, updated_by];
  
      const [commentResult] = await db.query(insertCommentQuery, commentValues);
  
      if (commentResult.affectedRows === 0) {
        return errorResponse(res, null, 'Failed to add task comment', 500);
      }
  
      const historyQuery = `
        INSERT INTO task_histories (
          old_data, new_data, task_id, subtask_id, text,
          updated_by, status_flag, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NULL)
      `;
      const historyValues = [
        null,
       comments, 
        task_id,
        validSubtaskId,
        'Comment Added',
        updated_by,
        7 // Default flag for added comments
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
      const [comment] = await db.query('SELECT id FROM task_comments WHERE id = ? AND deleted_at IS NULL', [id]);
      if (comment.length === 0) {
        return errorResponse(res, null, 'Comment not found or has been deleted', 404);
      }
        
       const query = `
        UPDATE task_comments
        SET  comments = ?, updated_by = ?, updated_at = NOW()
        WHERE id = ? AND deleted_at IS NULL
      `;
      const values = [comments, updated_by, id];
  
      const [result] = await db.query(query, values);
  
      if (result.affectedRows === 0) {
        return errorResponse(res, null, "Comment update failed", 400);
      }
      return successResponse(res, { id, ...payload }, "Task comment updated successfully");
  
    } catch (error) {
      return errorResponse(res, error.message, "Error updating task comment", 500);
    }
  };
  

  exports.deleteComments = async (id, res) => {
    try {
      const [comment] = await db.query(
        'SELECT id FROM task_comments WHERE id = ? AND deleted_at IS NULL',
        [id]
      );
  
      if (comment.length === 0) {
        return errorResponse(res, null, 'Comment not found or has been deleted', 404);
      }
  
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
  
      return successResponse(res, null, "Task comment deleted successfully");
    } catch (error) {
      return errorResponse(res, error.message, "Error deleting task comment", 500);
    }
  };
  
  