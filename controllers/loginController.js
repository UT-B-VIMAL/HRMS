const { signInUser, logoutUser, changePassword, forgotPassword, resetPasswordWithKeycloak } = require("../api/functions/keycloakFunction");
const { changePasswordSchema } = require("../validators/authValidator");
const { successResponse, errorResponse } = require('../helpers/responseHelper');
const db = require("../config/db");
const moment = require("moment");

exports.login = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  try {
    const tokens = await signInUser(username, password);
    res.status(200).json({ message: "Login successful", tokens });
  } catch (error) {
    res.status(401).json({ error: "Failed to login", details: error.response?.data || error.message });
  }
};


exports.logout = async (req, res) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(400).json({ error: "refresh_token is required" });
  }

  try {
    await logoutUser(refresh_token);
  } catch (error) {
    res.status(401).json({ error: "Failed to logout", details: error.response?.data || error.message });
  }
};




exports.changePassword = async (req, res) => {
  try {
    const { id } = req.params;
    const payload = req.body;
    const { error } = changePasswordSchema.validate(payload, { abortEarly: false });

    if (error) {
      const errorMessages = error.details.reduce((acc, err) => {
        const key = err.path[0] || "general";
        acc[key] = err.message;
        return acc;
      }, {});

      return errorResponse(res, errorMessages, "Validation Error", 403);
    }

    await changePassword(id, payload, res);

  } catch (error) {
    return errorResponse(res, error.message, 'Error updating change password', 500);
  }
};


exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "email is required" });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    await forgotPassword(email, res);

  } catch (error) {
    return errorResponse(res, error.message, 'Error updating task', 500);
  }
};

exports.verifyOtp = async (req, res) => {
  const { id, enteredOtp } = req.body;

  try {
    const query = "SELECT reset_token, reset_token_expiry FROM users WHERE id = ?";
    const [user] = await db.query(query, [id]);

    if (!user || user.length === 0) {
      return errorResponse(res, null, 'User not found', 404);
    }

    const currentUser = user[0];

    // Validate OTP
    if (currentUser.reset_token !== enteredOtp) {
      return errorResponse(res, null, 'Invalid OTP', 400);
    }

    // Check expiry
    if (new Date(currentUser.reset_token_expiry) < new Date()) {
      return errorResponse(res, null, 'OTP expired', 400);
    }

    return successResponse(res, null, 'OTP verified successfully.');
  } catch (error) {
    console.error("OTP verification failed:", error);
    return errorResponse(res, error.message, 'Error verifying OTP', 500);
  }
};


exports.logTaskTimeline = async (req, res) => {

  try {
    const payload = req.body;
    const { employee_id, task_name, start_time, end_time, status, comment } = payload;


    if (!employee_id || !task_name || !start_time || !end_time || !status) {
      return errorResponse(res, null, "Missing required fields", 400);
    }

    const formattedStartTime = moment(new Date("2025-04-28 09:05:43")).format("YYYY-MM-DD HH:mm:ss");
    const formattedEndTime = moment(new Date("2025-04-28 17:45:43")).format("YYYY-MM-DD HH:mm:ss");

    const workedDurationSec = moment(formattedEndTime).diff(moment(formattedStartTime), 'seconds');

    // Step 2: Convert to HH:MM:SS format
    const formatSecondsToHHMMSS = (totalSeconds) => {
      const hrs = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
      const mins = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
      const secs = (totalSeconds % 60).toString().padStart(2, '0');
      return `${hrs}:${mins}:${secs}`;
    };

    const total_worked_hours = formatSecondsToHHMMSS(workedDurationSec);

    // Get user_id from employee_id
    const [userRows] = await db.query(
      "SELECT id AS user_id FROM users WHERE employee_id = ? AND deleted_at IS NULL",
      [employee_id]
    );
    if (userRows.length === 0) return errorResponse(res, null, "User not found", 404);

    const user_id = userRows[0].user_id;
    const formattedStart = moment(new Date(start_time)).format("YYYY-MM-DD");

    // Get task_id, product_id, project_id using task_name
    const [taskRows] = await db.query(
      `SELECT id AS task_id, product_id, project_id, estimated_hours
   FROM tasks 
   WHERE name = ? 
     AND user_id = ? 
     AND deleted_at IS NULL 
     AND DATE(?) BETWEEN DATE(start_date) AND DATE(end_date)`,
      [task_name, user_id, formattedStart]
    );
    if (taskRows.length === 0) return errorResponse(res, null, "Task not found", 404);

    const { task_id, product_id, project_id } = taskRows[0];

    // === Optional: Insert into sub_tasks_user_timeline (without created_by/updated_by) ===

    if (taskRows.length > 0) {
      const task = taskRows[0];

      const estimatedSeconds = parseFloat(task.estimated_hours) * 3600;

      let updateQuery = `UPDATE tasks SET total_hours_worked = ?`;
      const updateParams = [total_worked_hours];

      if (workedDurationSec > estimatedSeconds) {
        const extendedSeconds = workedDurationSec - estimatedSeconds;
        const extended_hours = formatSecondsToHHMMSS(extendedSeconds);
        updateQuery += `, extended_hours = ?`;
        updateParams.push(extended_hours);
      }

      updateQuery += ` WHERE id = ?`;
      updateParams.push(task.task_id);

      await db.query(updateQuery, updateParams);
    }


    if (status === "On Hold") {
      // Check if timeline entry exists for this task
      const [timelineRows] = await db.query(
        "SELECT id FROM sub_tasks_user_timeline WHERE task_id = ? LIMIT 1",
        [task_id]
      );

      let firstOld = "To Do";
      let firstNew = "In Progress";
      // If timeline already has entry, switch first transition to On Hold → In Progress
      if (timelineRows.length > 0) {
        firstOld = "On Hold";
        firstNew = "In Progress";
      }

      // First history entry
      await db.query(`
    INSERT INTO task_histories (
      old_data, new_data, task_id, subtask_id, text,
      updated_by, status_flag, created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL)
  `, [
        firstOld,
        firstNew,
        task_id,
        `Status changed from ${firstOld} to ${firstNew}`,
        user_id,
        1,
        formattedStartTime,
        formattedStartTime
      ]);

      // Second history entry: In Progress → On Hold
      await db.query(`
    INSERT INTO task_histories (
      old_data, new_data, task_id, subtask_id, text,
      updated_by, status_flag, created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL)
  `, [
        "In Progress",
        "On Hold",
        task_id,
        "Status changed from In Progress to On Hold",
        user_id,
        1,
        formattedEndTime,
        formattedEndTime
      ]);
    }

    if (status === "In Review") {
      // On Hold → In Progress (start_time)
      await db.query(`
    INSERT INTO task_histories (
      old_data, new_data, task_id, subtask_id, text,
      updated_by, status_flag, created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL)
  `, [
        "On Hold",
        "In Progress",
        task_id,
        "Status changed from On Hold to In Progress",
        user_id,
        1,
        formattedStartTime,
        formattedStartTime
      ]);

      // In Progress → In Review (end_time)
      await db.query(`
    INSERT INTO task_histories (
      old_data, new_data, task_id, subtask_id, text,
      updated_by, status_flag, created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL)
  `, [
        "In Progress",
        "In Review",
        task_id,
        "Status changed from In Progress to In Review",
        user_id,
        1,
        formattedEndTime,
        formattedEndTime
      ]);
    }

    // === Insert comment if available ===
    if (comment) {
      const updateTaskCommentQuery = `
    UPDATE tasks
    SET command = ?, updated_at = ?
    WHERE id = ?
  `;
      await db.query(updateTaskCommentQuery, [
        comment,
        formattedEndTime, // make sure this is formatted as discussed
        task_id
      ]);
    }


    const insertTimelineQuery = `
      INSERT INTO sub_tasks_user_timeline (
        user_id, task_id, product_id, project_id, subtask_id,
        start_time, end_time, created_at, updated_at
      ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)
    `;
    await db.query(insertTimelineQuery, [
      user_id,
      task_id,
      product_id,
      project_id,
      formattedStartTime,
      formattedEndTime,
      formattedStartTime,
      formattedEndTime
    ]);


    return successResponse(
      res,
      {
        user_id,
        task_id,
        product_id,
        project_id,
        status,
        comment
      },
      "Task history and comments logged successfully",
      201
    );
  } catch (error) {
    console.error("Error logging task timeline:", error.message);
    return errorResponse(res, error.message, "Internal Server Error", 500);
  }
};




exports.reset_password = async (req, res) => {
  try {
    const { id, newPassword, confirmPassword } = req.body;

    if (!id || !newPassword || !confirmPassword) {
      return errorResponse(res, null, 'id, newPassword, and confirmPassword are required', 400);
    }

    if (newPassword !== confirmPassword) {
      return errorResponse(res, null, 'New password and confirm password do not match', 400);
    }

    await resetPasswordWithKeycloak(id, newPassword, res);

  } catch (error) {
    return errorResponse(res, error.message, 'Error resetting password', 500);
  }
};



