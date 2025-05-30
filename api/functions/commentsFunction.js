const db = require("../../config/db");
const {
  successResponse,
  errorResponse,
} = require("../../helpers/responseHelper");
const { getUserIdFromAccessToken } = require("./commonFunction");
// add task and subtask Comments
exports.addComments = async (payload, res) => {
  const { task_id, subtask_id, user_id, comments, updated_by } = payload;

  try {
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

    const [task] = await db.query(
      "SELECT id FROM tasks WHERE id = ? AND deleted_at IS NULL",
      [task_id]
    );
    if (task.length === 0) {
      return errorResponse(
        res,
        null,
        "Task not found or has been deleted",
        404
      );
    }

    if (subtask_id) {
      const [subtask] = await db.query(
        "SELECT id FROM sub_tasks WHERE id = ? AND deleted_at IS NULL",
        [subtask_id]
      );
      if (subtask.length === 0) {
        return errorResponse(
          res,
          null,
          "SubTask not found or has been deleted",
          404
        );
      }
    }

    const validSubtaskId = subtask_id || null;


    // Insert the new comment
    const insertCommentQuery = `
        INSERT INTO task_comments (task_id, subtask_id, user_id, comments, updated_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, NOW(), NOW())
      `;
    const commentValues = [
      task_id,
      validSubtaskId,
      user_id,
      comments,
      updated_by,

    ];

    const [commentResult] = await db.query(insertCommentQuery, commentValues);

    if (commentResult.affectedRows === 0) {
      return errorResponse(res, null, "Failed to add task comment", 500);
    }

    const historyQuery = `
        INSERT INTO task_histories (
          old_data, new_data, task_id, subtask_id, text,
          updated_by, status_flag, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW(),  NULL)
      `;
    const historyValues = [
      null,
      comments,
      task_id,
      validSubtaskId,
      "Comment Added",
      updated_by,
      7,

    ];

    const [historyResult] = await db.query(historyQuery, historyValues);

    if (historyResult.affectedRows === 0) {
      return errorResponse(
        res,
        null,
        "Failed to log history for task comment",
        500
      );
    }

    return successResponse(
      res,
      { id: commentResult.insertId, ...payload },
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

exports.updateComments = async (id, payload, res,req) => {
  const { comments,  updated_by } = payload;

    const accessToken = req.headers.authorization?.split(" ")[1];
    if (!accessToken) {
      return errorResponse(res, "Access token is required", 401);
    }

    const user_id = await getUserIdFromAccessToken(accessToken);

    if (user_id) {
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
    }

  try {
    const [existingComment] = await db.query(
      "SELECT id, comments AS old_comments, task_id, subtask_id,user_id AS owner_id FROM task_comments WHERE id = ? AND deleted_at IS NULL",
      [id]
    );

    if (existingComment.length === 0) {
      return errorResponse(
        res,
        null,
        "Comment not found or has been deleted",
        404
      );
    }
    const { old_comments, task_id, subtask_id, owner_id } = existingComment[0];

    if (Number(owner_id) !== Number(user_id)) {
      return errorResponse(
        res,
        null,
        "You are not authorized to update this comment",
        403
      );
    }



const query = `
  UPDATE task_comments
  SET comments = ?, updated_by = ?, updated_at = NOW(), is_edited = 1
  WHERE id = ? AND deleted_at IS NULL
`;
const values = [comments, updated_by, id]; 

    const [result] = await db.query(query, values);

    if (result.affectedRows === 0) {
      return errorResponse(res, null, "Comment update failed", 400);
    }

    const historyQuery = `
        INSERT INTO task_histories (
          old_data, new_data, task_id, subtask_id, text,
          updated_by, status_flag, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NULL)
      `;
    const historyValues = [
      old_comments,
      comments,
      task_id,
      subtask_id,
      "Comment Updated",
      updated_by,
      12,
    ];

    const [historyResult] = await db.query(historyQuery, historyValues);

    if (historyResult.affectedRows === 0) {
      return errorResponse(
        res,
        null,
        "Failed to log history for task comment",
        500
      );
    }

    return successResponse(
      res,
      { id, ...payload },
      "Task comment updated successfully"
    );
  } catch (error) {
    return errorResponse(
      res,
      error.message,
      "Error updating task comment",
      500
    );
  }
};

exports.deleteComments = async (id, payload, res,req) => {
  const  { updated_by} = payload;
    const accessToken = req.headers.authorization?.split(" ")[1];
    if (!accessToken) {
      return errorResponse(res, "Access token is required", 401);
    }

    const user_id = await getUserIdFromAccessToken(accessToken);

    if (user_id) {
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
    }
  
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
      "SELECT id, comments AS old_comments, task_id, subtask_id,user_id AS owner_id  FROM task_comments WHERE id = ? AND deleted_at IS NULL",
      [id]
    );

    if (existingComment.length === 0) {
      return errorResponse(
        res,
        null,
        "Comment not found or has been deleted",
        404
      );
    }
    const { task_id, subtask_id, owner_id } = existingComment[0];

    if (Number(owner_id) !== Number(user_id)) {
      return errorResponse(
        res,
        null,
        "You are not authorized to update this comment",
        403
      );
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

    const historyQuery = `
        INSERT INTO task_histories (
          old_data, new_data, task_id, subtask_id, text,
          updated_by, status_flag, created_at, updated_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NULL)
      `;
    const historyValues = [
      null,
      null,
      task_id,
      subtask_id,
      "Comment Deleted",
      updated_by,
      13,
    ];

    const [historyResult] = await db.query(historyQuery, historyValues);

    if (historyResult.affectedRows === 0) {
      return errorResponse(
        res,
        null,
        "Failed to log history for task comment",
        500
      );
    }

    return successResponse(res, null, "Task comment deleted successfully");
  } catch (error) {
    return errorResponse(
      res,
      error.message,
      "Error deleting task comment",
      500
    );
  }
};
