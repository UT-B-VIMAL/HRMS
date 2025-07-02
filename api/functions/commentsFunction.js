const db = require("../../config/db");
const {
  successResponse,
  errorResponse,
} = require("../../helpers/responseHelper");
const { getUserIdFromAccessToken } = require("./commonFunction");
const { uploadcommentsFileToS3, deleteFileFromS3 } = require("../../config/s3");
const path = require("path");
const moment = require("moment");
const { log } = require("console");

// add task and subtask Comments
exports.addComments = async (payload, res, req) => {
  const { task_id, subtask_id, user_id, comments, html_content } = payload;

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

    // ✅ Insert comment first (html_content will be updated after file upload)
    const insertCommentQuery = `
      INSERT INTO task_comments (
        task_id, subtask_id, user_id, comments, html_content, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;
    const commentValues = [
      task_id,
      validSubtaskId,
      user_id,
      comments?.trim() || null,
      null,
      userId,
    ];
    const [commentResult] = await db.query(insertCommentQuery, commentValues);
    const commentId = commentResult.insertId;

    let uploadedFiles = [];
    let updatedHtmlContent = html_content || "";

    for (const file of files) {
      const fileBuffer = file.data;
      const fileName = `${Date.now()}_${file.name}`;
      const fileUrl = await uploadcommentsFileToS3(fileBuffer, fileName);

      const ext = path.extname(file.name).toLowerCase();
      let fileType = "other";

      if ([".jpg", ".jpeg", ".png"].includes(ext)) fileType = "image";
      else if ([".mp4", ".mov", ".avi", ".webm"].includes(ext))
        fileType = "video";
      else if ([".pdf", ".docx"].includes(ext)) fileType = "document";

      if (fileType === "other") continue;

      // ✅ Insert file into DB
      await db.query(
        `INSERT INTO task_comment_files (comment_id, file_url, file_type) VALUES (?, ?, ?)`,
        [commentId, fileUrl, fileType]
      );
      uploadedFiles.push({ url: fileUrl, type: fileType });

      // ✅ Replace only the src="..." for matching data-name="filename"
      const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\%]/g, "\\$&");
      const escapedFileName = escapeRegExp(file.name);

      // Match both <img> or <video> with src="..." AND data-name="filename" in any order
      const regex = new RegExp(
        `<(img|video)([^>]*?)src=["'][^"']*["']([^>]*?)data-name=["']${escapedFileName}["']([^>]*?)>`,
        "gi"
      );

      // Replace src value only
      updatedHtmlContent = updatedHtmlContent.replace(
        regex,
        (match, tag, beforeSrc, between, after) => {
          // Extract all parts but replace src with the new fileUrl
          return `<${tag}${beforeSrc}src="${fileUrl}"${between}data-name="${file.name}"${after}>`;
        }
      );
    }

    // ✅ Update html_content in the DB
    if (updatedHtmlContent) {
      await db.query(`UPDATE task_comments SET html_content = ? WHERE id = ?`, [
        updatedHtmlContent,
        commentId,
      ]);
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
        html_content: updatedHtmlContent,
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

exports.getCommentById = async (id, res) => {
  try {
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
      html_content: comment.html_content || "",
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
  const { task_id, subtask_id, user_id, comments, html_content } = payload;

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
    if (!accessToken)
      return errorResponse(res, "Access token is required", 401);

    const userId = await getUserIdFromAccessToken(accessToken);

    const [existing] = await db.query(
      "SELECT * FROM task_comments WHERE id = ? AND deleted_at IS NULL",
      [id]
    );
    if (existing.length === 0)
      return errorResponse(res, null, "Comment not found", 404);

    const [existingFiles] = await db.query(
      "SELECT id, file_url, file_type FROM task_comment_files WHERE comment_id = ?",
      [id]
    );

    let updatedHtmlContent = payload.html_content || "";
    console.log("📝 Initial HTML content for update:", updatedHtmlContent);

    // Step 1: Replace all escaped quotes (\\\" or \") with real quotes
    updatedHtmlContent = updatedHtmlContent
      .replace(/\\+"/g, '"')
      .replace(/\\"/g, '"');
    console.log("🔧 Cleaned HTML content for regex:", updatedHtmlContent);

    // Step 2: Extract URLs from <img> and <video> tags
    const usedUrls = [];
    const srcRegex = /<(img|video)[^>]+src=["']([^"']+)["']/gi;
    let match;

    while ((match = srcRegex.exec(updatedHtmlContent)) !== null) {
      let url = match[2].trim();

      // Fix missing protocol
      if (!url.startsWith("http")) {
        url = "https://" + url.replace(/^https?:\/\//, "");
      }

      try {
        usedUrls.push(decodeURIComponent(url));
      } catch {
        usedUrls.push(url);
      }
    }

    console.log("🔍 Normalized used file URLs:", usedUrls);

    const getFileName = (url) => {
      try {
        return decodeURIComponent(url).split("/").pop().trim();
      } catch {
        return url.split("/").pop().trim();
      }
    };

    const usedFileNames = usedUrls.map(getFileName);

    for (const file of existingFiles) {
      const dbFileName = getFileName(file.file_url);
      const isUsed = usedFileNames.includes(dbFileName);

      console.log(`🔍 Checking file: ${file.file_url} - Used: ${isUsed}`);

      if (!isUsed) {
        console.log(`🗑️ Deleting unused file: ${file.file_url}`);
        try {
          await db.query("DELETE FROM task_comment_files WHERE id = ?", [
            file.id,
          ]);
          // Optional: await deleteFileFromS3(file.file_url);
        } catch (err) {
          console.warn("⚠️ Failed to delete file record:", err.message);
        }
      } else {
        console.log(`✅ Keeping file in use: ${file.file_url}`);
      }
    }

    let uploadedFiles = [];

    // 🟡 Step 2: Upload new files and replace blob src
    for (const file of files) {
      const fileBuffer = file.data;
      const fileName = `${Date.now()}_${file.name}`;
      const fileUrl = await uploadcommentsFileToS3(fileBuffer, fileName);

      const ext = path.extname(file.name).toLowerCase();
      let fileType = "other";
      if ([".jpg", ".jpeg", ".png"].includes(ext)) fileType = "image";
      else if ([".mp4", ".mov", ".avi", ".webm"].includes(ext))
        fileType = "video";
      else if ([".pdf", ".docx"].includes(ext)) fileType = "document";
      if (fileType === "other") continue;

      await db.query(
        "INSERT INTO task_comment_files (comment_id, file_url, file_type) VALUES (?, ?, ?)",
        [id, fileUrl, fileType]
      );

      uploadedFiles.push({ url: fileUrl, type: fileType });

      // Replace the blob or temp src with the final URL
      const escapedFileName = file.name.replace(/[.*+?^${}()|[\]\\%]/g, "\\$&");
      const blobRegex = new RegExp(
        `<(img|video)([^>]*?)src=["'][^"']*["']([^>]*?)data-name=["']${escapedFileName}["']([^>]*?)>`,
        "gi"
      );
      updatedHtmlContent = updatedHtmlContent.replace(
        blobRegex,
        `<$1$2src="${fileUrl}"$3data-name="${file.name}"$4>`
      );
    }

    // 🟡 Step 3: Update the comment
    await db.query(
      `UPDATE task_comments
       SET comments = ?, html_content = ?, updated_by = ?, updated_at = NOW(), is_edited = 1
       WHERE id = ?`,
      [comments?.trim() || null, updatedHtmlContent, userId, id]
    );

    // 🟡 Step 4: History
    await db.query(
      `INSERT INTO task_histories (
        old_data, new_data, task_id, subtask_id, text,
        updated_by, status_flag, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NULL)`,
      [
        existing[0].comments,
        comments?.trim() || "[Files Only]",
        task_id,
        validSubtaskId,
        "Comment Updated",
        userId,
        8,
      ]
    );

    // 🟡 Step 5: Final files for response
    const finalFiles = existingFiles
      .filter((f) => usedUrls.includes(f.file_url))
      .map((f) => ({
        url: f.file_url,
        type: f.file_type,
      }))
      .concat(uploadedFiles);

    return successResponse(
      res,
      {
        id,
        task_id,
        subtask_id,
        user_id,
        comments,
        html_content: updatedHtmlContent,
        files: finalFiles,
      },
      "Task comment updated successfully"
    );
  } catch (error) {
    console.error("❌ Error in updateComments:", error);
    return errorResponse(
      res,
      error.message,
      "Error updating task comment",
      500
    );
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
    const [commentRows] = await db.query(
      `SELECT * FROM task_comments WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
    if (!commentRows.length) {
      return errorResponse(
        res,
        null,
        "Comment not found or already deleted",
        404
      );
    }

    const comment = commentRows[0];
    const task_id = comment.task_id;
    const subtask_id = comment.subtask_id;

    // 2. Get all file URLs
    const [files] = await db.query(
      `SELECT file_url FROM task_comment_files WHERE comment_id = ?`,
      [id]
    );

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
    await db.query(`UPDATE task_comments SET deleted_at = NOW() WHERE id = ?`, [
      id,
    ]);

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
      return errorResponse(
        res,
        null,
        "Failed to log history for task comment",
        500
      );
    }

    return successResponse(res, null, "Comment deleted successfully");
  } catch (error) {
    console.error("Error deleting comment:", error);
    return errorResponse(res, error.message, "Failed to delete comment", 500);
  }
};
