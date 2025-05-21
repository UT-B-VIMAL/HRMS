const db = require("../../config/db");
const {
  successResponse,
  errorResponse,
  getPagination,
} = require("../../helpers/responseHelper");
const moment = require("moment");
const { Parser } = require("json2csv");
const { userSockets } = require("../../helpers/notificationHelper");
const {
  getUserIdFromAccessToken,
} = require("../../api/functions/commonFunction");

// Insert OT
exports.createOt = async (payload, res, req) => {
  const { date, time, project_id, task_id, comments } =
    payload;

     const accessToken = req.headers.authorization?.split(' ')[1];
            if (!accessToken) {
                return errorResponse(res, 'Access token is required', 401);
            }
        const user_id = await getUserIdFromAccessToken(accessToken);
        const created_by = await getUserIdFromAccessToken(accessToken);
  const missingFields = [];
  if (!date) missingFields.push("date");
  if (!project_id) missingFields.push("project_id");
  if (!user_id) missingFields.push("user_id");

  const userQuery = `
        SELECT id,team_id,role_id 
        FROM users 
        WHERE deleted_at IS NULL AND id = ?
      `;
  const [userResult] = await db.query(userQuery, [user_id]);

  if (userResult.length === 0) {
    return errorResponse(
      res,
      "User not found or deleted",
      "Error creating OT",
      404
    );
  }
  const { team_id, role_id } = userResult[0];

  if (role_id == 4) {
    if (!task_id) missingFields.push("task_id");
  }

  // If any field is missing, return an error response
  if (missingFields.length > 0) {
    return errorResponse(
      res,
      `Missing required fields: ${missingFields.join(", ")}`,
      "Validation Error",
      400
    );
  }
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!date.match(dateRegex) || isNaN(Date.parse(date))) {
    return errorResponse(
      res,
      "Invalid date format. Expected format: YYYY-MM-DD",
      "Validation Error",
      400
    );
  }

  const today = new Date();
  const inputDate = new Date(date);
  today.setHours(0, 0, 0, 0); // Reset to midnight
  inputDate.setHours(0, 0, 0, 0); // Reset to midnight

  if (inputDate > today) {
    return errorResponse(
      res,
      "Future dates are not allowed for OT",
      "Validation Error",
      400
    );
  }

 if (time) {
  // Regex only for h, m, s (no days allowed)
  const timeMatch = time.match(/^((\d+)h\s*)?((\d+)m\s*)?((\d+)s)?$/);

  if (!timeMatch) {
    return errorResponse(
      res,
      null,
      'Invalid format. Use like "2h 30m", "60m", "1h 10s". Days (d) not allowed.',
      400
    );
  }

  const hours = parseInt(timeMatch[2] || "0", 10);
  const minutes = parseInt(timeMatch[4] || "0", 10);
  const seconds = parseInt(timeMatch[6] || "0", 10);

  // Basic value validation
  if (
    hours < 0 ||
    minutes < 0 || minutes > 60 ||
    seconds < 0 || seconds >= 60
  ) {
    return errorResponse(res, null, "Invalid time values", 400);
  }

  // Calculate total seconds
  const totalSeconds = (hours * 3600) + (minutes * 60) + seconds;

  if (totalSeconds < 3600) {
    return errorResponse(res, null, "Total time must be at least 1 hour", 400);
  }

  if (totalSeconds > 43200) {
    return errorResponse(res, null, "Total time must not exceed 12 hours", 400);
  }

  // Format as "HH:MM:SS"
  const totalHours = Math.floor(totalSeconds / 3600);
  const totalMinutes = Math.floor((totalSeconds % 3600) / 60);
  const totalRemSeconds = totalSeconds % 60;

  payload.time = `${String(totalHours).padStart(2, "0")}:${String(
    totalMinutes
  ).padStart(2, "0")}:${String(totalRemSeconds).padStart(2, "0")}`;
}




  try {
    const projectQuery = `
        SELECT product_id 
        FROM projects 
        WHERE deleted_at IS NULL AND id = ?
      `;
    const [projectResult] = await db.query(projectQuery, [project_id]);

    if (projectResult.length === 0) {
      return errorResponse(
        res,
        "Project not found or deleted",
        "Error creating OT",
        404
      );
    }
    const { product_id } = projectResult[0];

    const productQuery = `
        SELECT id 
        FROM products 
        WHERE deleted_at IS NULL AND id = ?
      `;
    const [productResult] = await db.query(productQuery, [product_id]);

    if (productResult.length === 0) {
      return errorResponse(
        res,
        "Product not found or deleted",
        "Error creating OT",
        404
      );
    }

    if (role_id == 4) {
      const taskQuery = `
        SELECT id 
        FROM tasks 
        WHERE deleted_at IS NULL AND id = ? AND project_id = ?
      `;
      const [taskResult] = await db.query(taskQuery, [task_id, project_id]);

      if (taskResult.length === 0) {
        return errorResponse(
          res,
          "Task not found or does not belong to the specified project",
          "Error creating OT",
          404
        );
      }
    }

    let tl_status;
    let statuss;

    if (role_id == 1 || role_id == 2 || role_id == 3) {
      tl_status = 2;
      statuss = 2;
    } else {
      tl_status = 0;
      statuss = 0;
    }
    // Check for duplicate OT entry for same user, date, and project
    let duplicateCheckQuery = `
SELECT id 
FROM ot_details 
WHERE user_id = ? AND project_id = ? AND date = ? AND deleted_at IS NULL
`;
    let queryParams = [user_id, project_id, date];
    if (role_id == 4) {
      duplicateCheckQuery += " AND task_id = ?";
      queryParams.push(task_id);
    } else {
      duplicateCheckQuery += " AND task_id IS NULL";
    }
    const [duplicateCheckResult] = await db.query(
      duplicateCheckQuery,
      queryParams
    );

    if (duplicateCheckResult.length > 0) {
      return errorResponse(
        res,
        "OT already submitted for this task and date",
        "Duplicate OT entry",
        409
      );
    }

    console.log("task", task_id);

    let taskValue = null;
    if (role_id == 4) {
      taskValue = task_id;
    }

    const insertQuery = `
      INSERT INTO ot_details (
        user_id, product_id, project_id, task_id, team_id, comments, status, tl_status, date, time, created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;
    const values = [
      user_id,
      product_id,
      project_id,
      taskValue,
      team_id,
      comments,
      statuss,
      tl_status,
      date,
      payload.time,
      created_by,
      created_by,
    ];

    const [result] = await db.query(insertQuery, values);
    const selectQuery = `
      SELECT status 
      FROM ot_details 
      WHERE id = ?
    `;
    const [statusResult] = await db.query(selectQuery, [result.insertId]);

    const status = statusResult.length > 0 ? statusResult[0].status : 0;

    // Check if created_by user has role_id == 4
    const createdByQuery = `
      SELECT role_id, team_id 
      FROM users 
      WHERE id = ?
    `;
    const [createdByResult] = await db.query(createdByQuery, [created_by]);

    if (createdByResult.length > 0 && createdByResult[0].role_id == 4) {
      const teamId = createdByResult[0].team_id;

      // Fetch reporting_user_id from teams table
      const teamQuery = `
        SELECT reporting_user_id 
        FROM teams 
        WHERE id = ?
      `;
      const [teamResult] = await db.query(teamQuery, [teamId]);

      if (teamResult.length > 0 && teamResult[0].reporting_user_id) {
        const reportingUserId = teamResult[0].reporting_user_id;

        // Notification payload
        const notificationPayload = {
          title: "Review Employee OT Requests",
          body: "Pending overtime requests for your team. Review and approve/reject as necessary.",
        };

        const socketIds = userSockets[reportingUserId];

        if (Array.isArray(socketIds)) {
          socketIds.forEach((socketId) => {
            req.io
              .of("/notifications")
              .to(socketId)
              .emit("push_notification", notificationPayload);
          });
        }

        await db.execute(
          "INSERT INTO notifications (user_id, title, body, read_status, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())",
          [
            reportingUserId,
            notificationPayload.title,
            notificationPayload.body,
            0,
          ]
        );
      }
    }

    // Return success response
    return successResponse(
      res,
      {
        id: result.insertId,
        task_id,
        project_id,
        product_id,
        status,
        user_id,
        created_by,
      },
      "OT detail added successfully",
      201
    );
  } catch (error) {
    console.error("Error inserting OT detail:", error.message);
    return errorResponse(res, error.message, "Error inserting OT detail", 500);
  }
};
// Show OT
exports.getOt = async (id, res) => {
  try {
    const otdetailQuery = `
       SELECT 
    od.id, 
    DATE_FORMAT(od.date, '%Y-%m-%d') AS date, 
    IFNULL(od.time, '00:00:00') AS time, 
    od.comments, 
    od.product_id, 
    p.name AS product_name, 
    od.project_id, 
    pr.name AS project_name, 
    od.task_id, 
    t.name AS task_name,
    od.user_id, 
    u.employee_id, 
    CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) AS user_name,
    IFNULL(od.tledited_time, '00:00:00') AS tl_edited_time,
    IFNULL(od.pmedited_time, '00:00:00') AS pm_edited_time,
    od.status,
    od.tl_status,
    od.pm_status
FROM 
    ot_details od
LEFT JOIN 
    users u ON od.user_id = u.id
LEFT JOIN 
    products p ON od.product_id = p.id
LEFT JOIN 
    projects pr ON od.project_id = pr.id
LEFT JOIN 
    tasks t ON od.task_id = t.id
WHERE 
    od.id = ? 
    AND od.deleted_at IS NULL;
      `;
    const [otdetail] = await db.query(otdetailQuery, [id]);

    if (!otdetail || otdetail.length === 0) {
      return errorResponse(
        res,
        "OT detail not found",
        "Error retrieving OT detail",
        404
      );
    }

    const result = otdetail[0];

    return successResponse(
      res,
      result,
      "OT detail retrieved successfully",
      200
    );
  } catch (error) {
    return errorResponse(res, error.message, "Error retrieving OT detail", 500);
  }
};
// Show All OT
// exports.getAllOts = async (req, res) => {
//   try {
//     const {
//       project_id,
//       user_id,
//       date,
//       status,
//       product_id,
//       search,
//       page = 1,
//       perPage = 10,
//     } = req.query;

//     if (!user_id) {
//       return errorResponse(
//         res,
//         "user_id is required",
//         "Error fetching OT details",
//         400
//       );
//     }
//     if (!status) {
//       return errorResponse(
//         res,
//         "status is required",
//         "Error fetching OT details",
//         400
//       );
//     }

//     const [userCheck] = await db.query(
//       "SELECT id FROM users WHERE id = ? AND deleted_at IS NULL",
//       [user_id]
//     );
//     if (userCheck.length === 0) {
//       return errorResponse(
//         res,
//         "User not found or deleted",
//         "Error fetching OT details",
//         404
//       );
//     }

//     const offset = (page - 1) * perPage;

//     const otConditions = [];
//     const otValues = [];

//     if (project_id) {
//       const projectIds = project_id.split(",");
//       otConditions.push(`ot.project_id IN (?)`);
//       otValues.push(projectIds);
//     }
//     if (user_id) {
//       otConditions.push("ot.user_id = ?");
//       otValues.push(user_id);
//     }
//     if (date) {
//       otConditions.push("DATE(ot.date) = ?");
//       otValues.push(date);
//     }
//     if (product_id) {
//       const productIds = product_id.split(",");
//       otConditions.push(`ot.product_id IN (?)`);
//       otValues.push(productIds);
//     }
//     if (search) {
//       const searchTerm = `%${search}%`;
//       otConditions.push(
//         `(t.name LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR pr.name LIKE ? OR ot.comments LIKE ?)`
//       );
//       otValues.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
//     }

//     if (status) {
//       const statusArray = status.split(",");
//       otConditions.push(`ot.status IN (?)`);
//       otValues.push(statusArray);
//     }

//     const otWhereClause =
//       otConditions.length > 0 ? `WHERE ${otConditions.join(" AND ")}` : "";

//     const otQuery = `
//         SELECT
//           pr.name AS project_name,
//           t.name AS task_name,
//           DATE_FORMAT(ot.date, '%Y-%m-%d') AS date,
//           ot.time,
//           ot.comments,
//           ot.status,
//           ot.tl_status,
//           ot.pm_status,
//           ot.id AS ot_id,
//           ot.user_id,
//           u.employee_id,
//           u.role_id,
//           u.first_name AS user_first_name,
//           u.last_name AS user_last_name
//         FROM
//           ot_details ot
//         LEFT JOIN
//           tasks t ON t.id = ot.task_id
//         LEFT JOIN
//           projects pr ON pr.id = ot.project_id
//         LEFT JOIN
//           users u ON u.id = ot.user_id
//         ${otWhereClause}
//         AND ot.deleted_at IS NULL
//         ORDER BY
//           ot.id DESC
//       `;

//     const [ots] = await db.query(otQuery, otValues);

//     // Pagination logic
//     const totalRecords = ots.length;
//     const paginatedData = ots.slice(offset, offset + parseInt(perPage));
//     const pagination = getPagination(page, perPage, totalRecords);

//     // Add serial numbers and include id, user_id in the paginated data
//     const data = paginatedData.map((row, index) => ({
//       s_no: offset + index + 1,
//       id: row.ot_id,
//       user_id: row.user_id,
//       employee_id: row.employee_id,
//       role_id: row.role_id,
//       date: row.date,
//       time: row.time,
//       project_name: row.project_name,
//       task_name: row.task_name,
//       comments: row.comments,
//       status: row.status,
//       tl_status: row.tl_status,
//       pm_status: row.pm_status,
//       user_name: `${row.user_first_name} ${row.user_last_name}`,
//     }));

//     successResponse(
//       res,
//       data,
//       data.length === 0
//         ? "No OT details found"
//         : "OT details retrieved successfully",
//       200,
//       pagination
//     );
//   } catch (error) {
//     console.error("Error fetching OT details:", error);
//     return errorResponse(res, error.message, "Server error", 500);
//   }
// };

exports.getAllOts = async (req, res) => {
  try {
    const {
      project_id,
      date,
      status,
      product_id,
      search,
      page = 1,
      perPage = 10,
    } = req.query;

    const accessToken = req.headers.authorization?.split(' ')[1];
            if (!accessToken) {
                return errorResponse(res, 'Access token is required', 401);
            }
        const user_id = await getUserIdFromAccessToken(accessToken);
    if (!user_id || !status) {
      return errorResponse(
        res,
        "user_id and status are required",
        "Validation error",
        400
      );
    }

    const [user] = await db.query(
      "SELECT id, role_id FROM users WHERE id = ? AND deleted_at IS NULL",
      [user_id]
    );
    if (user.length === 0) {
      return errorResponse(res, "User not found", "Error", 404);
    }

    const { role_id } = user[0];
    const offset = (page - 1) * perPage;

    const conditions = ["ot.deleted_at IS NULL"];
    const values = [];

    if (project_id) {
      conditions.push(`ot.project_id IN (?)`);
      values.push(project_id.split(","));
    }

    conditions.push(`ot.user_id = ?`);
    values.push(user_id);

    if (date) {
      conditions.push(`DATE(ot.date) = ?`);
      values.push(date);
    }

    if (product_id) {
      conditions.push(`ot.product_id IN (?)`);
      values.push(product_id.split(","));
    }

    if (search) {
      const keyword = `%${search}%`;
      conditions.push(`(
        t.name LIKE ? OR 
        u.first_name LIKE ? OR 
        u.last_name LIKE ? OR 
        pr.name LIKE ? OR 
        ot.comments LIKE ?
      )`);
      values.push(keyword, keyword, keyword, keyword, keyword);
    }

    // Handle status filtering based on role
    const statusArray = status.split(",");
    const statusFilters = [];

    statusArray.forEach((s) => {
      if (s === "0") {
        if (role_id == 3)
          statusFilters.push(`(ot.pm_status = 0 AND ot.user_id = ${user_id})`);
        else if (role_id == 4)
          statusFilters.push(
            `(ot.tl_status = 0 OR ot.pm_status = 0) AND ot.user_id = ${user_id}`
          );
        else
          statusFilters.push(
            `ot.status = 2  AND ot.tl_status = 2  AND ot.pm_status = 0`
          );
      } else if (s === "1") {
        statusFilters.push(`ot.status = 1`);
      } else if (s === "2") {
        if (role_id == 3) statusFilters.push(`ot.pm_status = 2`);
        else if (role_id == 4)
          statusFilters.push(`(ot.tl_status = 2 AND ot.pm_status = 2)`);
        else
          statusFilters.push(
            `ot.status = 2  AND ot.tl_status = 2  AND ot.pm_status = 2`
          );
      }
    });

    if (statusFilters.length > 0) {
      conditions.push(`(${statusFilters.join(" OR ")})`);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const otQuery = `
      SELECT 
        pr.name AS project_name,
        t.name AS task_name,
        DATE_FORMAT(ot.date, '%Y-%m-%d') AS date,
        CASE 
          WHEN ot.pmedited_time IS NOT NULL AND ot.pmedited_time != '00:00:00' THEN ot.pmedited_time
          WHEN ot.tledited_time IS NOT NULL AND ot.tledited_time != '00:00:00' THEN ot.tledited_time
          ELSE ot.time
        END AS time,
        ot.comments,
        ot.status,
        ot.tl_status,
        ot.pm_status,
        ot.id AS ot_id,
        ot.user_id,
        u.employee_id,
        u.role_id,
        u.first_name,
        u.last_name
      FROM ot_details ot
      LEFT JOIN tasks t ON t.id = ot.task_id
      LEFT JOIN projects pr ON pr.id = ot.project_id
      LEFT JOIN users u ON u.id = ot.user_id
      ${whereClause}
      ORDER BY ot.id DESC
    `;

    const [result] = await db.query(otQuery, values);

    const paginated = result.slice(offset, offset + parseInt(perPage));
    const pagination = getPagination(page, perPage, result.length);

    const data = paginated.map((row, i) => ({
      s_no: offset + i + 1,
      id: row.ot_id,
      user_id: row.user_id,
      employee_id: row.employee_id,
      role_id: row.role_id,
      date: row.date,
      time: row.time,
      project_name: row.project_name,
      task_name: row.task_name,
      comments: row.comments,
      status: row.status,
      tl_status: row.tl_status,
      pm_status: row.pm_status,
      user_name: `${row.first_name} ${row.last_name}`,
    }));

    return successResponse(
      res,
      data,
      data.length ? "OT details fetched" : "No OT records found",
      200,
      pagination
    );
  } catch (err) {
    console.error("Error:", err);
    return errorResponse(res, err.message, "Server Error", 500);
  }
};

// Update OT
exports.updateOt = async (req, payload, res) => {
   const { id } = req.params;
  const {
    date,
    time,
    tltime,
    pmtime,
    user_id,
    project_id,
    task_id,
    comments,
  } = req.body;

  const accessToken = req.headers.authorization?.split(' ')[1];
            if (!accessToken) {
                return errorResponse(res, 'Access token is required', 401);
            }
        const updated_by = await getUserIdFromAccessToken(accessToken);

  const formatTime = (timeValue, fieldName) => {
  if (timeValue) {
    // Only match h, m, s (no d)
    const timeMatch = timeValue.match(/^((\d+)h\s*)?((\d+)m\s*)?((\d+)s)?$/);

    if (!timeMatch) {
      return errorResponse(
        res,
        null,
        `Invalid format for ${fieldName}. Use formats like "1h 30m", "45m", or "2h 10s". Days (d) not allowed.`,
        400
      );
    }

    const hours = parseInt(timeMatch[2] || "0", 10);
    const minutes = parseInt(timeMatch[4] || "0", 10);
    const seconds = parseInt(timeMatch[6] || "0", 10);

    // Validate value ranges
    if (
      hours < 0 ||
      minutes < 0 || minutes > 60 ||
      seconds < 0 || seconds >= 60
    ) {
      return errorResponse(
        res,
        null,
        `Invalid time values in ${fieldName}.`,
        400
      );
    }

    // Calculate total time in seconds
    const totalSeconds = (hours * 3600) + (minutes * 60) + seconds;

    if (totalSeconds < 3600) {
      return errorResponse(
        res,
        null,
        `Total time in ${fieldName} must be at least 1 hour.`,
        400
      );
    }

    if (totalSeconds > 43200) {
      return errorResponse(
        res,
        null,
        `Total time in ${fieldName} must not exceed 12 hours.`,
        400
      );
    }

    // Format as HH:MM:SS
    const totalHours = Math.floor(totalSeconds / 3600);
    const totalMinutes = Math.floor((totalSeconds % 3600) / 60);
    const totalRemSeconds = totalSeconds % 60;

    return `${String(totalHours).padStart(2, "0")}:${String(
      totalMinutes
    ).padStart(2, "0")}:${String(totalRemSeconds).padStart(2, "0")}`;
  }

  return null; // If no timeValue provided
};


  // Apply the function to time, pmtime, and tltime
  payload.time = formatTime(time, "time");
  payload.pmtime = formatTime(pmtime, "pmtime");
  payload.tltime = formatTime(tltime, "tltime");

  try {
    const checkQuery = `
        SELECT id 
        FROM ot_details 
        WHERE id = ? AND deleted_at IS NULL
      `;
    const [existingOt] = await db.query(checkQuery, [id]);

    if (existingOt.length === 0) {
      return errorResponse(
        res,
        "OT detail not found or already deleted",
        "Error updating OT",
        404
      );
    }

    const projectQuery = `
        SELECT product_id 
        FROM projects 
        WHERE deleted_at IS NULL AND id = ?
      `;
    const [projectResult] = await db.query(projectQuery, [project_id]);

    if (projectResult.length === 0) {
      return errorResponse(
        res,
        "Project not found or deleted",
        "Error updating OT",
        404
      );
    }
    const { product_id } = projectResult[0];

    const productQuery = `
        SELECT id 
        FROM products 
        WHERE deleted_at IS NULL AND id = ?
      `;
    const [productResult] = await db.query(productQuery, [product_id]);

    if (productResult.length === 0) {
      return errorResponse(
        res,
        "Product not found or deleted",
        "Error updating OT",
        404
      );
    }
    const userQuery = `
        SELECT id,team_id,role_id 
        FROM users 
        WHERE deleted_at IS NULL AND id = ?
      `;
  const [userResult] = await db.query(userQuery, [user_id]);

  if (userResult.length === 0) {
    return errorResponse(
      res,
      "User not found or deleted",
      "Error creating OT",
      404
    );
  }
  const { role_id } = userResult[0];
if (role_id == 4) {
    const taskQuery = `
        SELECT id 
        FROM tasks 
        WHERE deleted_at IS NULL AND id = ? AND project_id = ?
      `;
    const [taskResult] = await db.query(taskQuery, [task_id, project_id]);

    if (taskResult.length === 0) {
      return errorResponse(
        res,
        "Task not found or does not belong to the specified project",
        "Error updating OT",
        404
      );
    }
  }

    const updateQuery = `
        UPDATE ot_details 
        SET 
          user_id = ?, 
          product_id = ?, 
          project_id = ?, 
          task_id = ?, 
          comments = ?, 
          date = ?, 
          time = ?, 
          tledited_time = ?, 
          pmedited_time = ?, 
          updated_by = ?, 
          updated_at = NOW() 
        WHERE id = ? AND deleted_at IS NULL
      `;
    const values = [
      user_id,
      product_id,
      project_id,
      task_id,
      comments,
      date,
      payload.time,
      payload.tltime,
      payload.pmtime,
      updated_by,
      id,
    ];

    const [result] = await db.query(updateQuery, values);

    if (result.affectedRows === 0) {
      return errorResponse(
        res,
        "OT detail not found or no changes made",
        "Error updating OT",
        404
      );
    }

    const selectQuery = `
        SELECT status 
        FROM ot_details 
        WHERE id = ?
      `;
    const [statusResult] = await db.query(selectQuery, [id]);

    const status = statusResult.length > 0 ? statusResult[0].status : 0;

    return successResponse(
      res,
      {
        id,
        task_id,
        project_id,
        product_id,
        status,
        user_id,
        updated_by,
        date,
        tltime,
        pmtime,
        comments,
      },
      "OT detail updated successfully",
      200
    );
  } catch (error) {
    console.error("Error updating OT detail:", error.message);
    return errorResponse(res, error.message, "Error updating OT detail", 500);
  }
};
// Delete OT
exports.deleteOt = async (id, res) => {
  try {
    const checkQuery =
      "SELECT id FROM ot_details WHERE id = ? AND deleted_at IS NULL";
    const [existingOt] = await db.query(checkQuery, [id]);

    if (existingOt.length === 0) {
      return errorResponse(
        res,
        null,
        "OT detail not found or already deleted",
        404
      );
    }

    const updateQuery =
      "UPDATE ot_details SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL";
    const [result] = await db.query(updateQuery, [id]);

    if (result.affectedRows === 0) {
      return errorResponse(
        res,
        null,
        "OT detail not found or already deleted",
        204
      );
    }

    return successResponse(res, null, "OT detail deleted successfully");
  } catch (error) {
    return errorResponse(res, error.message, "Error deleting OT detail", 500);
  }
};

// PM Employee OT Details
// exports.getAllpmemployeeOts = async (req, res) => {
//   try {
//     const {
//       team_id,
//       start_date,
//       end_date,
//       status,
//       search,
//       page = 1,
//       perPage = 10,
//     } = req.query;

//     if (!status) {
//       return errorResponse(
//         res,
//         "status is required",
//         "Error fetching OT details",
//         400
//       );
//     }

//     const offset = (page - 1) * perPage;

//     const otConditions = [];
//     const otValues = [];

//     if (team_id) {
//       const teamIds = team_id.split(",");
//       if (teamIds.length > 0) {
//         otConditions.push("ot.team_id IN (?)");
//         otValues.push(teamIds);
//       }
//     }

//     if (start_date && end_date) {
//       const startDate = new Date(start_date);
//       const endDate = new Date(end_date);

//       if (endDate < startDate) {
//         return errorResponse(
//           res,
//           "End date cannot be earlier than start date.",
//           "Error fetching OT details",
//           400
//         );
//       }
//       otConditions.push("DATE(ot.date) BETWEEN ? AND ?");
//       otValues.push(start_date, end_date);
//     } else if (start_date) {
//       otConditions.push("DATE(ot.date) >= ?");
//       otValues.push(start_date);
//     } else if (end_date) {
//       otConditions.push("DATE(ot.date) <= ?");
//       otValues.push(end_date);
//     }

//     if (search) {
//       const searchTerm = `%${search}%`;
//       otConditions.push(
//         `(t.name LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR pr.name LIKE ? OR ot.comments LIKE ?)`
//       );
//       otValues.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
//     }

//     if (status) {
//       if (status.includes(",")) {
//         return errorResponse(
//           res,
//           "Only a single status value is allowed.",
//           "Error fetching OT details",
//           400
//         );
//       }

//       switch (status) {
//         case "0":
//           otConditions.push("ot.tl_status = 2 AND ot.pm_status = 0");
//           break;

//         case "1":
//           otConditions.push("ot.tl_status = 1 OR ot.pm_status = 1");
//           break;

//         case "2":
//           otConditions.push("ot.pm_status = 2 OR ot.tl_status = 2");
//           break;

//         default:
//           return errorResponse(
//             res,
//             "Invalid status value.",
//             "Error fetching OT details",
//             400
//           );
//       }
//     }

//     const otWhereClause =
//       otConditions.length > 0 ? `WHERE ${otConditions.join(" AND ")}` : "";

//     const otQuery = `
//       SELECT
//         pr.name AS project_name,
//         t.name AS task_name,
//         DATE_FORMAT(ot.date, '%Y-%m-%d') AS date,
//         ot.time AS employee_time,
//         ot.comments,
//         ot.status,
//         ot.tl_status,
//         ot.pm_status,
//         ot.tledited_time AS tl_time,
//         ot.pmedited_time AS pm_time,
//         ot.id AS ot_id,
//         ot.user_id,
//         u.first_name AS user_first_name,
//         u.last_name AS user_last_name,
//         u.employee_id,
//         u.role_id,
//         d.name AS designation,
//         te.name AS team_name
//       FROM
//         ot_details ot
//       LEFT JOIN
//         tasks t ON t.id = ot.task_id
//       LEFT JOIN
//         projects pr ON pr.id = ot.project_id
//       LEFT JOIN
//         users u ON u.id = ot.user_id
//       LEFT JOIN
//         teams te ON te.id = u.team_id
//       LEFT JOIN
//         designations d ON d.id = u.designation_id
//       ${otWhereClause}
//       AND ot.deleted_at IS NULL
//       ORDER BY
//         ot.created_at DESC
//     `;

//     const [ots] = await db.query(otQuery, otValues);

//     const totalRecords = ots.length;
//     const paginatedData = ots.slice(offset, offset + parseInt(perPage));
//     const pagination = getPagination(page, perPage, totalRecords);

//     const data = Object.values(
//       paginatedData.reduce((acc, row, index) => {
//         const userId = row.user_id;

//         if (!acc[userId]) {
//           acc[userId] = {
//             employee_name: `${row.user_first_name} ${row.user_last_name}`,
//             employee_id: row.employee_id,
//             designation: row.designation,
//             role_id: row.role_id,
//             team_name: row.team_name,
//             total_hours: "00:00:00",
//             pending_counts: 0,
//             details: [],
//           };
//         }

//         if (row.status === 0) {
//           acc[userId].pending_counts += 1;
//         }

//         acc[userId].details.push({
//           s_no: offset + index + 1,
//           id: row.ot_id,
//           user_id: row.user_id,
//           date: row.date,
//           employee_time: row.employee_time || "00:00:00",
//           tl_time: row.tl_time || "00:00:00",
//           pm_time: row.pm_time || "00:00:00",
//           project_name: row.project_name,
//           task_name: row.task_name,
//           comments: row.comments,
//           status: row.status,
//           tlstatus: row.tl_status,
//           pmstatus: row.pm_status,
//         });

//         const currentHours = row.employee_time || "00:00:00";
//         acc[userId].total_hours = addTimes(
//           acc[userId].total_hours,
//           currentHours
//         );

//         return acc;
//       }, {})
//     );

//     const totalPendingCounts = data.reduce(
//       (sum, user) => sum + user.pending_counts,
//       0
//     );

//     const formattedData = data.map((group) => ({
//       employee_name: group.employee_name,
//       employee_id: group.employee_id,
//       designation: group.designation,
//       role_id: group.role_id,
//       team_name: group.team_name,
//       total_hours: group.total_hours,
//       pending_counts: group.pending_counts,
//       details: group.details,
//     }));

//     const countZeroQuery = `
//     SELECT COUNT(*) AS count
//     FROM ot_details ot
//     WHERE ot.tl_status = 2
//       AND ot.pm_status = 0
//       AND ot.deleted_at IS NULL
//   `;
//     const [countResult] = await db.query(countZeroQuery);
//     const statusZeroCount = countResult[0]?.count || 0;
//     successResponse(
//       res,
//       {
//         data: formattedData,
//         pagination,
//         otpm_status_zero_count: statusZeroCount,
//       },
//       formattedData.length === 0
//         ? "No OT details found"
//         : "OT details retrieved successfully",
//       200
//     );
//   } catch (error) {
//     console.error("Error fetching OT details:", error);
//     return errorResponse(res, error.message, "Server error", 500);
//   }
// };

exports.getAllpmemployeeOts = async (req, res) => {
  try {
    const {
      team_id,
      start_date,
      end_date,
      status,
      search,
      page = 1,
      perPage = 10,
    } = req.query;

    const accessToken = req.headers.authorization?.split(' ')[1];
            if (!accessToken) {
                return errorResponse(res, 'Access token is required', 401);
            }
        const user_id = await getUserIdFromAccessToken(accessToken);

    if (!user_id) {
      return errorResponse(
        res,
        "user_id is required",
        "Error fetching OT details",
        400
      );
    }

    if (!status) {
      return errorResponse(
        res,
        "status is required",
        "Error fetching OT details",
        400
      );
    }

    // Check user existence and role
    const [userCheck] = await db.query(
      "SELECT id, role_id FROM users WHERE id = ? AND deleted_at IS NULL",
      [user_id]
    );

    if (userCheck.length === 0) {
      return errorResponse(
        res,
        "User not found or deleted",
        "Error fetching OT details",
        404
      );
    }

    const currentRoleId = Number(userCheck[0].role_id);
    const offset = (page - 1) * perPage;
    const otConditions = [];
    const otValues = [];

    if (team_id) {
      const teamIds = team_id.split(",");
      if (teamIds.length > 0) {
        otConditions.push("ot.team_id IN (?)");
        otValues.push(teamIds);
      }
    }

    if (start_date && end_date) {
      if (new Date(end_date) < new Date(start_date)) {
        return errorResponse(
          res,
          "End date cannot be earlier than start date.",
          "Error fetching OT details",
          400
        );
      }
      otConditions.push("DATE(ot.date) BETWEEN ? AND ?");
      otValues.push(start_date, end_date);
    } else if (start_date) {
      otConditions.push("DATE(ot.date) >= ?");
      otValues.push(start_date);
    } else if (end_date) {
      otConditions.push("DATE(ot.date) <= ?");
      otValues.push(end_date);
    }

    if (search) {
      const searchTerm = `%${search}%`;
      otConditions.push(
        `(t.name LIKE ? OR u.employee_id LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR pr.name LIKE ? OR ot.comments LIKE ?)`
      );
      otValues.push(
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm
      );
    }

    if (status) {
      if (status.includes(",")) {
        return errorResponse(
          res,
          "Only a single status value is allowed.",
          "Error fetching OT details",
          400
        );
      }

      switch (status) {
        case "0": // Pending
          if ([1, 2, 3].includes(currentRoleId)) {
            otConditions.push("ot.pm_status = 0");
          } else if (currentRoleId === 4) {
            otConditions.push("ot.tl_status = 2 AND ot.pm_status = 0");
          }
          otConditions.push("ot.status = 2");
          break;

        case "1": // Rejected
          otConditions.push("ot.pm_status = 1");
          break;

        case "2": // Approved
          if ([1, 2, 3].includes(currentRoleId)) {
            otConditions.push("ot.pm_status = 2 AND ot.tl_status = 2");
          } else if (currentRoleId === 4) {
            otConditions.push("ot.tl_status = 2 AND ot.pm_status = 2");
          }
          otConditions.push("ot.status = 2 AND ot.tl_status = 2");
          break;

        default:
          return errorResponse(
            res,
            "Invalid status value.",
            "Error fetching OT details",
            400
          );
      }
    }

    // Add deleted_at filter with AND or WHERE correctly
    const otWhereClause =
      otConditions.length > 0
        ? `WHERE ${otConditions.join(" AND ")} AND ot.deleted_at IS NULL`
        : `WHERE ot.deleted_at IS NULL`;

    const otQuery = `
      SELECT 
        pr.name AS project_name,
        t.name AS task_name,
        DATE_FORMAT(ot.date, '%Y-%m-%d') AS date,
        ot.time AS employee_time,
        ot.comments,
        ot.status,
        ot.tl_status,
        ot.pm_status,
        ot.tledited_time AS tl_time,
        ot.pmedited_time AS pm_time,
        ot.id AS ot_id,
        ot.user_id,
        u.first_name AS user_first_name,
        u.last_name AS user_last_name,
        u.employee_id,
        u.role_id,
        d.name AS designation,
        te.name AS team_name
      FROM 
        ot_details ot
      LEFT JOIN 
        tasks t ON t.id = ot.task_id
      LEFT JOIN 
        projects pr ON pr.id = ot.project_id
      LEFT JOIN 
        users u ON u.id = ot.user_id
      LEFT JOIN 
        teams te ON te.id = u.team_id
      LEFT JOIN 
        designations d ON d.id = u.designation_id
      ${otWhereClause}
      ORDER BY ot.updated_at DESC
    `;

    const [ots] = await db.query(otQuery, otValues);

    // Filter out role_id=2 if current user is role_id=2
    const filteredOts = ots.filter((row) => {
      if (currentRoleId === 2 && row.role_id === 2) {
        return false;
      }
      return true;
    });

    function timeToSeconds(timeStr) {
      const [h, m, s] = timeStr.split(":").map(Number);
      return h * 3600 + m * 60 + s;
    }

    function secondsToHHMMSS(totalSeconds) {
      const h = Math.floor(totalSeconds / 3600)
        .toString()
        .padStart(2, "0");
      const m = Math.floor((totalSeconds % 3600) / 60)
        .toString()
        .padStart(2, "0");
      const s = Math.floor(totalSeconds % 60)
        .toString()
        .padStart(2, "0");
      return `${h}:${m}:${s}`;
    }

    const groupedData = Object.values(
      filteredOts.reduce((acc, row) => {
        const userId = row.user_id;

        if (!acc[userId]) {
          acc[userId] = {
            employee_name: `${row.user_first_name} ${row.user_last_name}`,
            employee_id: row.employee_id,
            designation: row.designation,
            role_id: row.role_id,
            team_name: row.team_name,
            total_hours: "00:00:00",
            pending_counts: 0,
            totalSeconds: 0,
            details: [],
          };
        }

        if (row.status === 0) {
          acc[userId].pending_counts += 1;
        }

        // Calculate time to add (pm_time > tl_time > employee_time)
        const calculatedTime =
          row.pm_time && row.pm_time !== "00:00:00"
            ? row.pm_time
            : row.tl_time && row.tl_time !== "00:00:00"
            ? row.tl_time
            : row.employee_time || "00:00:00";

        acc[userId].totalSeconds += timeToSeconds(calculatedTime);

        acc[userId].details.push({
          id: row.ot_id,
          user_id: row.user_id,
          date: row.date,
          employee_time: row.employee_time || "00:00:00",
          tl_time: row.tl_time || "00:00:00",
          pm_time: row.pm_time || "00:00:00",
          calculated_time: calculatedTime,
          project_name: row.project_name,
          task_name: row.task_name,
          comments: row.comments,
          status: row.status,
          tlstatus: row.tl_status,
          pmstatus: row.pm_status,
        });

        return acc;
      }, {})
    );

    // Convert total seconds to HH:mm:ss per employee
    groupedData.forEach((emp) => {
      emp.total_hours = secondsToHHMMSS(emp.totalSeconds);
      delete emp.totalSeconds; // clean up
    });

    const totalEmployees = groupedData.length;
    const paginatedEmployees = groupedData.slice(
      offset,
      offset + Number(perPage)
    );
    const pagination = getPagination(page, perPage, totalEmployees);

    // Add s_no to each detail
    const formattedData = paginatedEmployees.map((empGroup) => {
      empGroup.details = empGroup.details.map((item, index) => ({
        s_no: index + 1,
        ...item,
      }));
      return empGroup;
    });

    // Count OT with tl_status=2 and pm_status=0 for notification
    let countZeroQuery = `
      SELECT COUNT(*) AS count
      FROM ot_details ot
      LEFT JOIN users u ON u.id = ot.user_id
      WHERE ot.tl_status = 2
        AND ot.pm_status = 0
        AND ot.deleted_at IS NULL
    `;

    if (currentRoleId === 2) {
      countZeroQuery += ` AND u.role_id != 2`;
    }

    const [countResult] = await db.query(countZeroQuery);
    const statusZeroCount = countResult[0]?.count || 0;

    successResponse(
      res,
      {
        data: formattedData,
        pagination,
        otpm_status_zero_count: statusZeroCount,
      },
      formattedData.length === 0
        ? "No OT details found"
        : "OT details retrieved successfully",
      200
    );
  } catch (error) {
    console.error("Error fetching OT details:", error);
    return errorResponse(res, error.message, "Server error", 500);
  }
};

// Utility function to add times in "HH:MM:SS" format
const addTimes = (time1, time2) => {
  const [h1, m1, s1] = time1.split(":").map(Number);
  const [h2, m2, s2] = time2.split(":").map(Number);

  let seconds = s1 + s2;
  let minutes = m1 + m2 + Math.floor(seconds / 60);
  let hours = h1 + h2 + Math.floor(minutes / 60);

  seconds %= 60;
  minutes %= 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0"
  )}:${String(seconds).padStart(2, "0")}`;
};

// Approve or reject OT
exports.approve_reject_ot = async (payload, res, req) => {
  const { status, role, user_id } = payload;

  const accessToken = req.headers.authorization?.split(' ')[1];
            if (!accessToken) {
                return errorResponse(res, 'Access token is required', 401);
            }
        const updated_by = await getUserIdFromAccessToken(accessToken);

  try {
    // Validate required fields
    if (!user_id) {
      return errorResponse(
        res,
        "User ID is required",
        "Error updating OT details",
        400
      );
    }
    if (!status) {
      return errorResponse(
        res,
        "Status is required",
        "Error updating OT details",
        400
      );
    }
    if (!role) {
      return errorResponse(
        res,
        "Role is required",
        "Error updating OT details",
        400
      );
    }
    if (!updated_by) {
      return errorResponse(
        res,
        "Updated_by is required",
        "Error updating OT details",
        400
      );
    }

    // Verify the OT exists and fetch user_id and date
    const otQuery = `
      SELECT id, user_id, date FROM ot_details 
      WHERE deleted_at IS NULL AND user_id = ?
    `;
    const [otResult] = await db.query(otQuery, [user_id]);

    if (otResult.length === 0) {
      return errorResponse(
        res,
        "OT not found or deleted",
        "Error fetching OT details",
        404
      );
    }

    const { id, date } = otResult[0];

    // Verify the updating user exists
    const updatedByQuery = `
      SELECT id FROM users 
      WHERE deleted_at IS NULL AND id = ?
    `;
    const [updatedByResult] = await db.query(updatedByQuery, [updated_by]);

    if (updatedByResult.length === 0) {
      return errorResponse(
        res,
        "Updated_by user not found or deleted",
        "Error fetching OT details",
        404
      );
    }

    // Build the update query based on role
    let updateQuery = `
      UPDATE ot_details
      SET status = ?, updated_by = ?, updated_at = NOW(),`;

    if (role === "tl") {
      updateQuery += ` tl_status = ? `;
    } else if (role === "pm" || role === "admin") {
      updateQuery += ` pm_status = ? `;
    } else {
      return errorResponse(
        res,
        "Invalid role",
        "Error updating OT details",
        400
      );
    }

    updateQuery += ` WHERE user_id = ? AND pm_status = 0 AND deleted_at IS NULL`;
    const values = [status, updated_by, status, user_id];

    // Execute the query
    const [result] = await db.query(updateQuery, values);

    // Check if any records were updated
    if (result.affectedRows === 0) {
      return errorResponse(
        res,
        "No records updated, ensure the OT record exists and matches the criteria",
        "Error updating OT details",
        400
      );
    }
    if (role === "pm" && status === "2") {
      // Send notification to the user
      const notificationPayload = {
        title: status === 2 ? "Overtime Approved" : "Overtime Rejected",
        body: `Your overtime request for ${date} has been ${
          status === 2 ? "approved" : "rejected"
        }.`,
      };

      const socketIds = userSockets[user_id];
      if (Array.isArray(socketIds)) {
        socketIds.forEach((socketId) => {
          req.io
            .of("/notifications")
            .to(socketId)
            .emit("push_notification", notificationPayload);
        });
      }
      await db.execute(
        "INSERT INTO notifications (user_id, title, body, read_status, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())",
        [user_id, notificationPayload.title, notificationPayload.body, 0]
      );
    }

    // Return success response immediately
    successResponse(
      res,
      status === 2 ? "OT Approved successfully" : "OT Rejected successfully",
      200
    );

    // Handle notification sending asynchronously
    if (role == "tl" && status == "2") {
      (async () => {
        const pmUsersQuery = `
          SELECT id FROM users 
          WHERE role_id = 2 AND deleted_at IS NULL
        `;
        const [pmUsers] = await db.query(pmUsersQuery);

        const pmNotificationPayload = {
          title: "Review Employee OT Requests",
          body: "Pending overtime requests from employees require your review.",
        };
        for (const pmUser of pmUsers) {
          const pmSocketIds = userSockets[pmUser.id];
          if (Array.isArray(pmSocketIds)) {
            pmSocketIds.forEach((socketId) => {
              req.io
                .of("/notifications")
                .to(socketId)
                .emit("push_notification", pmNotificationPayload);
            });
          }

          await db.execute(
            "INSERT INTO notifications (user_id, title, body, read_status, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())",
            [
              pmUser.id,
              pmNotificationPayload.title,
              pmNotificationPayload.body,
              0,
            ]
          );
        }
      })();
    }
  } catch (error) {
    console.error("Error approving or rejecting OT details:", error.message);
    return errorResponse(res, error.message, "Error updating OT details", 500);
  }
};

// TL Employee OT Details
exports.getAlltlemployeeOts = async (req, res) => {
  try {
    const {
      start_date,
      end_date,
      status,
      search,
      page = 1,
      perPage = 10,
    } = req.query;

    const accessToken = req.headers.authorization?.split(' ')[1];
            if (!accessToken) {
                return errorResponse(res, 'Access token is required', 401);
            }
        const user_id = await getUserIdFromAccessToken(accessToken);
    if (!user_id) {
      return errorResponse(res, null, "User ID is required", 400);
    }
    const [userCheck] = await db.query(
      "SELECT id,role_id FROM users WHERE id = ? AND deleted_at IS NULL",
      [user_id]
    );

    // Check if no rows are returned
    if (userCheck.length === 0) {
      return errorResponse(res, null, "User Not Found", 400);
    }

    // Fetch team IDs for the reporting user
    const [teamResult] = await db.query(
      "SELECT id FROM teams WHERE reporting_user_id = ? AND deleted_at IS NULL",
      [user_id]
    );

    if (teamResult.length === 0) {
      return errorResponse(
        res,
        null,
        "You are not currently assigned a reporting TL for your team.",
        404
      );
    }

    const teamIds = teamResult.map((team) => team.id);
    // Ensure status is provided
    if (!status) {
      return errorResponse(
        res,
        "status is required",
        "Error fetching OT details",
        400
      );
    }

    const offset = (page - 1) * perPage;

    const otConditions = [];
    const otValues = [];

    otConditions.push(`ot.team_id IN (?)`);
    otValues.push(teamIds);

    // Handle date filters
    if (start_date && end_date) {
      const startDate = new Date(start_date);
      const endDate = new Date(end_date);

      if (endDate < startDate) {
        return errorResponse(
          res,
          "End date cannot be earlier than start date.",
          "Error fetching OT details",
          400
        );
      }
      // Both dates are provided; filter by range
      otConditions.push("DATE(ot.date) BETWEEN ? AND ?");
      otValues.push(start_date, end_date);
    } else if (start_date) {
      // Only start_date is provided; fetch data from start_date onward
      otConditions.push("DATE(ot.date) >= ?");
      otValues.push(start_date);
    } else if (end_date) {
      // Only end_date is provided; fetch all data up to and including end_date
      otConditions.push("DATE(ot.date) <= ?");
      otValues.push(end_date);
    }

    // Handle search term
    if (search) {
      const searchTerm = `%${search}%`;
      otConditions.push(
        `(t.name LIKE ? OR u.employee_id LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR pr.name LIKE ? OR ot.comments LIKE ?)`
      );
      otValues.push(
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm
      );
    }

    // Handle status conditions based on the provided status
    if (status) {
      if (status.includes(",")) {
        return errorResponse(
          res,
          "Only a single status value is allowed.",
          "Error fetching OT details",
          400
        );
      }

      const currentRoleId = userCheck[0].role_id;

      switch (status) {
        case "0":
          // All statuses must be 0
          otConditions.push(
            `ot.pm_status = 0 AND ot.tl_status = 0 AND ot.user_id != ${userCheck[0].id}`
          );
          break;

        case "1":
          // ot.status must be 1, and at least one of tl_status or pm_status must be 1
          otConditions.push(
            `(ot.tl_status = 1 OR ot.pm_status = 1) AND ot.user_id != ${userCheck[0].id}`
          );
          break;

        case "2":
          // All statuses must be 2
          otConditions.push(
            `(ot.tl_status = 2 OR ot.pm_status = 2) AND ot.user_id != ${userCheck[0].id}`
          );
          break;

        default:
          return errorResponse(
            res,
            "Invalid status value.",
            "Error fetching OT details",
            400
          );
      }
    }

    // Combine all conditions into a WHERE clause
    const otWhereClause =
      otConditions.length > 0 ? `WHERE ${otConditions.join(" AND ")}` : "";

    // Prepare the query to fetch OT details
    const otQuery = `
        SELECT 
          pr.name AS project_name,
          t.name AS task_name,
          DATE_FORMAT(ot.date, '%Y-%m-%d') AS date,
          ot.comments,
          ot.status,
          ot.tl_status,
          ot.pm_status,
          ot.time AS employee_time,
          ot.tledited_time AS tl_time,
          ot.pmedited_time AS pm_time,
          ot.id AS ot_id,
          ot.user_id,
          u.first_name AS user_first_name,
          u.last_name AS user_last_name,
          u.employee_id,
          u.role_id,
          d.name AS designation
        FROM 
          ot_details ot
        LEFT JOIN 
          tasks t ON t.id = ot.task_id
        LEFT JOIN 
          projects pr ON pr.id = ot.project_id
        LEFT JOIN 
          users u ON u.id = ot.user_id
        LEFT JOIN 
          designations d ON d.id = u.designation_id
        ${otWhereClause}
        AND ot.deleted_at IS NULL
        ORDER BY 
          ot.updated_at DESC
      `;

    // Execute the query
    const [ots] = await db.query(otQuery, otValues);

    // Pagination logic
    const totalRecords = ots.length;
    const paginatedData = ots.slice(offset, offset + parseInt(perPage));
    const pagination = getPagination(page, perPage, totalRecords);

    // Helper functions to convert time strings to seconds and back
    function timeToSeconds(timeStr) {
      const [h, m, s] = timeStr.split(":").map(Number);
      return h * 3600 + m * 60 + s;
    }

    function secondsToHHMMSS(totalSeconds) {
      const h = Math.floor(totalSeconds / 3600)
        .toString()
        .padStart(2, "0");
      const m = Math.floor((totalSeconds % 3600) / 60)
        .toString()
        .padStart(2, "0");
      const s = Math.floor(totalSeconds % 60)
        .toString()
        .padStart(2, "0");
      return `${h}:${m}:${s}`;
    }

    // Group the data by user_id and calculate pending counts for status 0
    const data = Object.values(
      paginatedData.reduce((acc, row, index) => {
        const userId = row.user_id;

        // Initialize user group if not already present
        if (!acc[userId]) {
          if (row.status === 0) {
            acc[userId] = {
              employee_name: `${row.user_first_name} ${row.user_last_name}`,
              employee_id: row.employee_id,
              designation: row.designation,
              role_id: row.role_id,
              pending_counts: 0,
              totalSeconds: 0,
              details: [],
            };
          } else {
            acc[userId] = {
              employee_name: `${row.user_first_name} ${row.user_last_name}`,
              employee_id: row.employee_id,
              designation: row.designation,
              role_id: row.role_id,
              totalSeconds: 0,
              details: [],
            };
          }
        }

        // Increment pending count if status is 0
        if (row.status === 0) {
          acc[userId].pending_counts += 1;
        }

        // Calculate the time to use
        const calculatedTime =
          row.pm_time && row.pm_time !== "00:00:00"
            ? row.pm_time
            : row.tl_time && row.tl_time !== "00:00:00"
            ? row.tl_time
            : row.employee_time || "00:00:00";

        // Add to total seconds
        acc[userId].totalSeconds += timeToSeconds(calculatedTime);
        // Add individual OT details
        acc[userId].details.push({
          s_no: offset + index + 1,
          id: row.ot_id,
          user_id: row.user_id,
          date: row.date,
          employee_time: row.employee_time || "00:00:00",
          tl_time: row.tl_time || "00:00:00",
          pm_time: row.pm_time || "00:00:00",
          project_name: row.project_name,
          task_name: row.task_name,
          comments: row.comments,
          status: row.status,
          tlstatus: row.tl_status,
          pmstatus: row.pm_status,
        });

        return acc;
      }, {})
    );
    const totalPendingCounts = Object.values(data).reduce(
      (sum, user) => sum + user.pending_counts,
      0
    );

    // Format the data for the response
    const formattedData = data.map((group) => ({
      employee_name: group.employee_name,
      employee_id: group.employee_id,
      designation: group.designation,
      role_id: group.role_id,
      pending_counts: group.pending_counts,
      total_hours: secondsToHHMMSS(group.totalSeconds || 0),

      details: group.details,
    }));

    const countZeroQuery = `
      SELECT COUNT(*) AS count
      FROM ot_details et
      WHERE et.status = 0
        AND et.tl_status = 0
        AND et.team_id IN (?)
        AND et.deleted_at IS NULL
    `;
    const [countResult] = await db.query(countZeroQuery, [teamIds]);
    const statusZeroCount = countResult[0]?.count || 0;

    // Send success response with formatted data and pagination
    successResponse(
      res,
      {
        data: formattedData,
        pagination,
        ottl_status_zero_count: statusZeroCount, // Or totalPendingCounts if that's what you meant
      },
      formattedData.length === 0
        ? "No OT details found"
        : "OT details retrieved successfully",
      200
    );
  } catch (error) {
    console.error("Error fetching OT details:", error);
    return errorResponse(res, error.message, "Server error", 500);
  }
};

exports.getOtReportData = async (queryParams, res) => {
  try {
    const {
      from_date,
      to_date,
      team_id,
      search,
      export_status,
      page = 1,
      perPage = 10,
    } = queryParams.query;

    const offset = (page - 1) * perPage;

    if (!from_date || !to_date) {
      return errorResponse(
        res,
        "Both 'from_date' and 'to_date' are required",
        "Validation error",
        400
      );
    }

    // Base query for fetching data
    let baseQuery = `
      SELECT 
          user_id,
          JSON_ARRAYAGG(DATE_FORMAT(date, '%d-%m-%Y')) AS date,
          users.employee_id AS employee_id,
          users.first_name AS user_name,
          JSON_ARRAYAGG(
            CASE 
              WHEN pmedited_time != '00:00:00' THEN pmedited_time
              WHEN tledited_time != '00:00:00' THEN tledited_time
              ELSE time
            END
          ) AS time,

          JSON_ARRAYAGG(projects.name) AS projects,
          JSON_ARRAYAGG(comments) AS work_done,
              SEC_TO_TIME(SUM(
        TIME_TO_SEC(
          CASE 
            WHEN pmedited_time != '00:00:00' THEN pmedited_time
            WHEN tledited_time != '00:00:00' THEN tledited_time
            ELSE time
          END
        )
      )) AS total_hours
      FROM 
          ot_details
      LEFT JOIN projects ON projects.id = ot_details.project_id
      LEFT JOIN teams ON teams.id = ot_details.team_id
      LEFT JOIN users ON users.id = ot_details.user_id
      WHERE 
          ot_details.deleted_at IS NULL AND
          users.deleted_at IS NULL
          AND ot_details.pm_status = 2
          AND (ot_details.date BETWEEN ? AND ?)
    `;

    // Query parameters
    const params = [from_date, to_date];

    if (team_id) {
      const teamIds = team_id.split(",").map((id) => id.trim());
      baseQuery += `AND users.team_id IN (${teamIds
        .map(() => "?")
        .join(",")}) `;
      params.push(...teamIds);
    }

    if (search) {
      baseQuery += `
        AND (
          users.first_name LIKE ? OR 
          users.employee_id LIKE ? OR 
          teams.name LIKE ? OR 
          projects.name LIKE ?
        )
      `;
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam);
    }

    // Base query for total count (without pagination)
    const countQuery = `
      SELECT COUNT(DISTINCT user_id) AS total_records
      FROM (${baseQuery} GROUP BY user_id, user_name) AS temp
    `;

    // Get total records
    const [countResult] = await db.query(countQuery, params);
    const totalRecords = countResult[0]?.total_records || 0;

    // Add GROUP BY to base query
    baseQuery += `GROUP BY user_id, user_name `;

    // Add pagination if not exporting
    if (export_status !== "1") {
      baseQuery += `LIMIT ? OFFSET ? `;
      params.push(parseInt(perPage, 10), parseInt(offset, 10));
    }

    // Execute data query
    const [results] = await db.query(baseQuery, params);

    // Format data
    const data = results.map((row, index) => {
      const totalSeconds = row.total_hours
        ? row.total_hours.split(":")
        : [0, 0, 0];
      const hours = parseInt(totalSeconds[0], 10) || 0;
      const minutes = parseInt(totalSeconds[1], 10) || 0;
      const formattedTotalTime = `${hours} hrs ${minutes} mins`;

      const formattedTimeArray = Array.isArray(row.time)
        ? row.time.map((timeString) => {
            if (timeString) {
              const timeParts = timeString.split(":");
              const timeHours = parseInt(timeParts[0], 10) || 0;
              const timeMinutes = parseInt(timeParts[1], 10) || 0;
              return `${timeHours} hrs ${timeMinutes} mins`;
            }
            return "0 hrs 0 mins";
          })
        : ["0 hrs 0 mins"];

      return {
        s_no: export_status === "1" ? index + 1 : offset + index + 1,
        ...(export_status !== "1" && { user_id: row.user_id }),
        employee_id: row.employee_id || "",
        date: export_status === "1" ? row.date.join(", ") : row.date,
        projects:
          export_status === "1" ? row.projects.join(", ") : row.projects,
        time:
          export_status === "1"
            ? formattedTimeArray.join(", ")
            : formattedTimeArray,
        work_done:
          export_status === "1" ? row.work_done.join(", ") : row.work_done,
        team_name: row.team_name || "",
        total_hours: formattedTotalTime,
        user_name: row.user_name || "",
      };
    });

    // Handle CSV export
    if (export_status === "1") {
      const json2csvParser = new Parser();
      const csv = json2csvParser.parse(data);
      res.header("Content-Type", "text/csv");
      res.attachment("ot_report_data.csv");
      return res.send(csv);
    }

    // Pagination metadata
    const pagination = getPagination(page, perPage, totalRecords);

    // Standard response
    successResponse(
      res,
      data,
      data.length === 0 ? "No OT records found" : "OT records successfully",
      200,
      pagination
    );
  } catch (error) {
    console.error("Error generating OT report:", error);
    return errorResponse(res, error.message, "Server error", 500);
  }
};

// Update OT
exports.approve_reject_updateOt = async (req,id, payload, res) => {
  const {
    date,
    time,
    tltime,
    pmtime,
    project_id,
    task_id,
    user_id,
    comments,
    approve_reject_flag,
    role,
  } = payload;

  const accessToken = req.headers.authorization?.split(' ')[1];
            if (!accessToken) {
                return errorResponse(res, 'Access token is required', 401);
            }
        const updated_by = await getUserIdFromAccessToken(accessToken);

  if (!approve_reject_flag || ![1, 2].includes(Number(approve_reject_flag))) {
    return errorResponse(
      res,
      "approve_reject_flag is required and must be either 1 (reject) or 2 (approve)",
      "Error updating OT details",
      400
    );
  }

  if (!role) {
    return errorResponse(
      res,
      "Role is required",
      "Error updating OT details",
      400
    );
  }
  if (!updated_by) {
    return errorResponse(
      res,
      "Updated_by is required",
      "Error updating OT details",
      400
    );
  }

  const updatedByQuery = `
  SELECT id FROM users 
  WHERE deleted_at IS NULL AND id = ?
`;
  const [updatedByResult] = await db.query(updatedByQuery, [updated_by]);

  if (updatedByResult.length === 0) {
    return errorResponse(
      res,
      "Updated_by user not found or deleted",
      "Error fetching OT details",
      404
    );
  }

  const formatTime = (timeValue, fieldName) => {
    if (timeValue) {
      const timeMatch = timeValue.match(
        /^((\d+)d\s*)?((\d+)h\s*)?((\d+)m\s*)?((\d+)s)?$/
      );

      if (!timeMatch) {
        return errorResponse(
          res,
          null,
          `Invalid format for ${fieldName}. Use formats like "1d 2h 30m 30s", "2h 30m", or "45m 15s".`,
          400
        );
      }

      const days = parseInt(timeMatch[2] || "0", 10);
      const hours = parseInt(timeMatch[4] || "0", 10);
      const minutes = parseInt(timeMatch[6] || "0", 10);
      const seconds = parseInt(timeMatch[8] || "0", 10);

      if (
        days < 0 ||
        hours < 0 ||
        minutes < 0 ||
        seconds < 0 ||
        minutes >= 60 ||
        seconds >= 60
      ) {
        return errorResponse(
          res,
          null,
          `Invalid time values in ${fieldName}`,
          400
        );
      }

      // Convert days to hours and calculate total hours
      const totalHours = days * 8 + hours;

      // Format as "HH:MM:SS"
      return `${String(totalHours).padStart(2, "0")}:${String(minutes).padStart(
        2,
        "0"
      )}:${String(seconds).padStart(2, "0")}`;
    }
    return null; // If timeValue is null/undefined, return null
  };

  // Apply the function to time, pmtime, and tltime
  payload.time = formatTime(time, "time");
  payload.pmtime = formatTime(pmtime, "pmtime");
  payload.tltime = formatTime(tltime, "tltime");

  try {
    const checkQuery = `
        SELECT id 
        FROM ot_details 
        WHERE id = ? AND deleted_at IS NULL
      `;
    const [existingOt] = await db.query(checkQuery, [id]);

    if (existingOt.length === 0) {
      return errorResponse(
        res,
        "OT detail not found or already deleted",
        "Error updating OT",
        404
      );
    }

    const projectQuery = `
        SELECT product_id 
        FROM projects 
        WHERE deleted_at IS NULL AND id = ?
      `;
    const [projectResult] = await db.query(projectQuery, [project_id]);

    if (projectResult.length === 0) {
      return errorResponse(
        res,
        "Project not found or deleted",
        "Error updating OT",
        404
      );
    }
    const { product_id } = projectResult[0];

    const productQuery = `
        SELECT id 
        FROM products 
        WHERE deleted_at IS NULL AND id = ?
      `;
    const [productResult] = await db.query(productQuery, [product_id]);

    if (productResult.length === 0) {
      return errorResponse(
        res,
        "Product not found or deleted",
        "Error updating OT",
        404
      );
    }

    const taskQuery = `
        SELECT id 
        FROM tasks 
        WHERE deleted_at IS NULL AND id = ? AND project_id = ?
      `;
    const [taskResult] = await db.query(taskQuery, [task_id, project_id]);

    if (taskResult.length === 0) {
      return errorResponse(
        res,
        "Task not found or does not belong to the specified project",
        "Error updating OT",
        404
      );
    }

    const userQuery = `
        SELECT id 
        FROM users 
        WHERE deleted_at IS NULL AND id = ?
      `;
    const [userResult] = await db.query(userQuery, [user_id]);

    if (userResult.length === 0) {
      return errorResponse(
        res,
        "User not found or deleted",
        "Error updating OT",
        404
      );
    }

    let statusColumn = "";
    if (role === "tl") {
      statusColumn = "tl_status = ?";
    } else if (role === "pm" || role === "admin") {
      statusColumn = "pm_status = ?";
    } else {
      return errorResponse(
        res,
        "Invalid role",
        "Error updating OT details",
        400
      );
    }

    // Final update query
    const updateQuery = `
  UPDATE ot_details 
  SET 
    ${statusColumn},
    status = ?, 
    user_id = ?, 
    product_id = ?, 
    project_id = ?, 
    task_id = ?, 
    comments = ?, 
    date = ?, 
    time = ?, 
    tledited_time = ?, 
    pmedited_time = ?, 
    updated_by = ?, 
    updated_at = NOW() 
  WHERE id = ? AND deleted_at IS NULL
`;

    // Match the ? placeholders in order
    const values = [
      approve_reject_flag, // tl_status or pm_status value
      approve_reject_flag, // tl_status or pm_status value
      user_id,
      product_id,
      project_id,
      task_id,
      comments,
      date,
      payload.time,
      payload.tltime,
      payload.pmtime,
      updated_by,
      id,
    ];

    const [result] = await db.query(updateQuery, values);

    if (result.affectedRows === 0) {
      return errorResponse(
        res,
        "OT detail not found or no changes made",
        "Error updating OT",
        404
      );
    }

    const selectQuery = `
        SELECT status 
        FROM ot_details 
        WHERE id = ?
      `;
    const [statusResult] = await db.query(selectQuery, [id]);

    const status = statusResult.length > 0 ? statusResult[0].status : 0;

    return successResponse(
      res,
      {
        id,
        task_id,
        project_id,
        product_id,
        status,
        user_id,
        updated_by,
        date,
        tltime,
        pmtime,
        comments,
      },
      "OT detail updated successfully",
      200
    );
  } catch (error) {
    console.error("Error updating OT detail:", error.message);
    return errorResponse(res, error.message, "Error updating OT detail", 500);
  }
};
