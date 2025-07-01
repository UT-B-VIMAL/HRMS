const db = require("../../config/db");
const {
  successResponse,
  errorResponse,
} = require("../../helpers/responseHelper");
const { getUserIdFromAccessToken } = require("./commonFunction");
const { uploadcommentsFileToS3 , deleteFileFromS3} = require("../../config/s3");
const path = require("path");

// add task and subtask Comments
exports.addComments = async (payload, res, req) => {
  const { task_id, subtask_id, user_id, comments } = payload;

  const validSubtaskId =
    subtask_id && subtask_id.trim() !== "" ? subtask_id : null;

  let files = [];

  if (req.files?.files) {
    files = Array.isArray(req.files.files)
      ? req.files.files
      : [req.files.files]; 
  }

  try {
    const accessToken = req.headers.authorization?.split(" ")[1];
    if (!accessToken) {
      return errorResponse(res, "Access token is required", 401);
    }

    const userId = await getUserIdFromAccessToken(accessToken);
    console.log("User ID from access token:", userId);

    // ✅ Validate user
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

    // ✅ Validate task
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

    // ✅ Validate subtask
    if (validSubtaskId) {
      const [subtask] = await db.query(
        "SELECT id FROM sub_tasks WHERE id = ? AND deleted_at IS NULL",
        [validSubtaskId]
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

    // ✅ Insert comment (even if comment is null but files are present)
    const insertCommentQuery = `
      INSERT INTO task_comments (task_id, subtask_id, user_id, comments, updated_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, NOW(), NOW())
    `;
    const commentValues = [
      task_id,
      validSubtaskId,
      user_id,
      comments?.trim() || null,
      userId,
    ];
    const [commentResult] = await db.query(insertCommentQuery, commentValues);

    const commentId = commentResult.insertId;

    let uploadedFiles = [];
    for (const file of files) {
      const fileBuffer = file.buffer;
      const fileName = `${Date.now()}_${file.name}`;
      console.log("Uploading file:", fileName);

      const fileUrl = await uploadcommentsFileToS3(fileBuffer, fileName);

      const ext = path.extname(file.name).toLowerCase();

      let fileType = "other";

      if ([".jpg", ".jpeg", ".png"].includes(ext)) {
        fileType = "image";
      } else if ([".mp4", ".mov", ".avi"].includes(ext)) {
        fileType = "video";
      } else if ([".pdf", ".docx"].includes(ext)) {
        fileType = "document";
      }

      if (fileType === "other") continue;

      // const fileType = file.mimetype.startsWith("image/")
      //   ? "image"
      //   : file.mimetype.startsWith("video/")
      //   ? "video"
      //   : "other";

      // if (fileType === "other") continue;

      await db.query(
        `INSERT INTO task_comment_files (comment_id, file_url, file_type) VALUES (?, ?, ?)`,
        [commentId, fileUrl, fileType]
      );
      uploadedFiles.push({ url: fileUrl, type: fileType });
    }

    // ✅ Add to history
    const historyQuery = `
      INSERT INTO task_histories (
        old_data, new_data, task_id, subtask_id, text,
        updated_by, status_flag, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NULL)
    `;
    const historyValues = [
      null,
      comments?.trim() || "[Files Only]",
      task_id,
      validSubtaskId,
      "Comment Added",
      userId,
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
      {
        id: commentId,
        task_id,
        subtask_id,
        user_id,
        comments,
        files: uploadedFiles,
      },

      "Task comment added successfully"
    );
  } catch (error) {
    console.error("Error in addComments:", error);
    return errorResponse(
      res,
      error.message,
      "Error inserting task comment",
      500
    );
  }
};


exports.getCommentById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return errorResponse(res, null, "Invalid comment ID", 400);
    }

    const [comments] = await db.query(
      `SELECT c.*, 
              COALESCE(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(NULLIF(u.last_name, ''))), 'Unknown User') AS updated_by
       FROM task_comments c
       LEFT JOIN users u ON c.updated_by = u.id
       WHERE c.id = ? AND c.deleted_at IS NULL`,
      [id]
    );

    if (!comments.length) {
      return errorResponse(res, null, "Comment not found", 404);
    }

    const comment = comments[0];

    // Fetch attached files
    const [files] = await db.query(
      `SELECT file_url AS url, file_type AS type
       FROM task_comment_files
       WHERE comment_id = ?`,
      [id]
    );

    const response = {
      comment_id: comment.id,
      task_id: comment.task_id,
      subtask_id: comment.subtask_id,
      user_id: comment.user_id,
      comments: comment.comments || "",
      is_edited: comment.is_edited,
      updated_by: comment.updated_by || "",
      time_date: moment
        .utc(comment.updated_at)
        .tz("Asia/Kolkata")
        .format("YYYY-MM-DD HH:mm:ss"),
      files: files || [],
    };

    return successResponse(res, response, "Comment fetched successfully");
  } catch (error) {
    console.error("Error fetching comment by ID:", error);
    return errorResponse(res, error.message, "Error fetching comment", 500);
  }
};

exports.updateComments = async (id, payload, res, req) => {
  const { comments } = payload;

  // Parse new files
  let files = [];
  if (req.files?.files) {
    files = Array.isArray(req.files.files) ? req.files.files : [req.files.files];
  }

  try {
    const accessToken = req.headers.authorization?.split(" ")[1];
    if (!accessToken) {
      return errorResponse(res, "Access token is required", 401);
    }
    const updated_by = await getUserIdFromAccessToken(accessToken);

    // 1. Get old comment
    const [existing] = await db.query(`SELECT * FROM task_comments WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!existing.length) {
      return errorResponse(res, null, "Comment not found", 404);
    }
    const comment = existing[0];

    // 2. Delete old files from DB & S3
    const [oldFiles] = await db.query(`SELECT file_url FROM task_comment_files WHERE comment_id = ?`, [id]);

    for (const file of oldFiles) {
      try {
        await deleteFileFromS3(file.file_url);
      } catch (err) {
        console.warn("S3 delete failed:", err.message);
      }
    }

    await db.query(`DELETE FROM task_comment_files WHERE comment_id = ?`, [id]);

    // 3. Update the comment text and time
    await db.query(
      `UPDATE task_comments SET comments = ?, is_edited = 1, updated_by = ?, updated_at = NOW() WHERE id = ?`,
      [comments?.trim() || null, updated_by, id]
    );

    // 4. Upload new files and insert
    let uploadedFiles = [];

    for (const file of files) {
      const buffer = file.buffer;
      const fileName = `${Date.now()}_${file.name}`;
      const fileUrl = await uploadcommentsFileToS3(buffer, fileName);

      const ext = path.extname(file.name).toLowerCase();

      let fileType = "other";
      if ([".jpg", ".jpeg", ".png"].includes(ext)) fileType = "image";
      else if ([".mp4", ".mov", ".avi"].includes(ext)) fileType = "video";
      else if ([".pdf", ".docx"].includes(ext)) fileType = "document";

      if (fileType === "other") continue;

      await db.query(
        `INSERT INTO task_comment_files (comment_id, file_url, file_type) VALUES (?, ?, ?)`,
        [id, fileUrl, fileType]
      );

      uploadedFiles.push({ url: fileUrl, type: fileType });
    }

    // 5. History entry
    await db.query(
      `INSERT INTO task_histories (old_data, new_data, task_id, subtask_id, text, updated_by, status_flag, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NULL)`,
      [
        comment.comments,
        comments?.trim() || "[Files Only]",
        comment.task_id,
        comment.subtask_id,
        "Comment Updated",
        updated_by,
        8, // status_flag for updated
      ]
    );

    return successResponse(
      res,
      {
        id: comment.id,
        comments: comments,
        task_id: comment.task_id,
        subtask_id: comment.subtask_id,
        user_id: comment.user_id,
        files: uploadedFiles,
      },
      "Comment updated successfully"
    );
  } catch (error) {
    console.error("Error in updateComments:", error);
    return errorResponse(res, error.message, "Failed to update comment", 500);
  }
};



exports.deleteComments = async (id, payload, res, req) => {
  try {
    const accessToken = req.headers.authorization?.split(" ")[1];
    if (!accessToken) {
      return errorResponse(res, "Access token is required", 401);
    }
    const updated_by = await getUserIdFromAccessToken(accessToken);

    // 1. Check if comment exists
    const [commentRows] = await db.query(`SELECT * FROM task_comments WHERE id = ? AND deleted_at IS NULL`, [id]);
    if (!commentRows.length) {
      return errorResponse(res, null, "Comment not found or already deleted", 404);
    }

    const comment = commentRows[0];
    const task_id = comment.task_id;
    const subtask_id = comment.subtask_id;

        // 2. Get all file URLs
    const [files] = await db.query(`SELECT file_url FROM task_comment_files WHERE comment_id = ?`, [id]);

    // 3. Delete files from S3 using your common function
    for (const file of files) {
      try {
        await deleteFileFromS3(file.file_url);
      } catch (err) {
        console.warn("S3 deletion warning:", err.message); // Don't fail the whole operation
      }
    }
    // 4. Delete files from DB
    await db.query(`DELETE FROM task_comment_files WHERE comment_id = ?`, [id]);

    // 5. Soft delete comment
    await db.query(`UPDATE task_comments SET deleted_at = NOW() WHERE id = ?`, [id]);

 // 6. Add task history
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
      return errorResponse(res, null, "Failed to log history for task comment", 500);
    }


    return successResponse(res, null, "Comment deleted successfully");
  } catch (error) {
    console.error("Error deleting comment:", error);
    return errorResponse(res, error.message, "Failed to delete comment", 500);
  }
};