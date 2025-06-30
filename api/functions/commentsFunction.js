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
  console.log(req.files, "req.files in addComments function");

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

exports.updateComments = async (id, payload, res, req) => {
  const { comments } = payload;

  const accessToken = req.headers.authorization?.split(" ")[1];
  if (!accessToken) return errorResponse(res, "Access token is required", 401);

  const userId = await getUserIdFromAccessToken(accessToken);

  // 📌 Validate existing comment
  const [existing] = await db.query(`SELECT * FROM task_comments WHERE id = ? AND deleted_at IS NULL`, [id]);
  if (!existing.length) return errorResponse(res, null, "Comment not found", 404);

  // 📁 Handle new file uploads
  let files = [];
  if (req.files?.files) {
    files = Array.isArray(req.files.files) ? req.files.files : [req.files.files];
  }

  const uploadedFiles = [];

  for (const file of files) {
    const fileBuffer = file.buffer;
    const fileName = `${Date.now()}_${file.name}`;
    const fileUrl = await uploadcommentsFileToS3(fileBuffer, fileName);

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

  // ✏️ Update comment text
  await db.query(`UPDATE task_comments SET comments = ?, is_edited = 1, updated_at = NOW() WHERE id = ?`, [
    comments.trim(),
    id,
  ]);

  // 📜 Log history
  await db.query(
    `INSERT INTO task_histories (old_data, new_data, task_id, subtask_id, text, updated_by, status_flag, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NULL)`,
    [
      existing[0].comments,
      comments.trim(),
      existing[0].task_id,
      existing[0].subtask_id,
      "Comment Updated",
      userId,
      7,
    ]
  );

  return successResponse(res, {
    comment_id: id,
    updated_comment: comments,
    new_files: uploadedFiles,
  }, "Comment updated successfully");
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