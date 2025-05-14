const moment = require("moment");
const db = require("../../config/db");
const {
  successResponse,
  errorResponse,
  getPagination,
} = require("../../helpers/responseHelper");
const { projectSchema } = require("../../validators/projectValidator");
const { getAuthUserDetails } = require("./commonFunction");
const { userSockets } = require("../../helpers/notificationHelper");

// Create Project
exports.createProject = async (payload, res) => {
  const { name, product, user_id } = payload;

  const { error } = projectSchema.validate(
    { name, product, user_id },
    { abortEarly: false }
  );
  if (error) {
    const errorMessages = error.details.reduce((acc, err) => {
      acc[err.path[0]] = err.message;
      return acc;
    }, {});
    return errorResponse(res, errorMessages, "Validation Error", 400);
  }
  try {
    const user = await getAuthUserDetails(user_id, res);
    if (!user) return;
    const checkQuery =
      "SELECT COUNT(*) as count FROM projects WHERE name = ? AND deleted_at IS NULL";
    const [checkResult] = await db.query(checkQuery, [name]);

    if (checkResult[0].count > 0) {
      return errorResponse(
        res,
        "Project with this name already exists",
        "Duplicate Project Error",
        400
      );
    }
    const checkProduct =
      "SELECT COUNT(*) as count FROM products WHERE id = ? and deleted_at IS NULL";
    const [checkProductResults] = await db.query(checkProduct, [product]);
    if (checkProductResults[0].count == 0) {
      return errorResponse(res, "Product Not Found", "Product Not Found", 404);
    }

    const query =
      "INSERT INTO projects (name, product_id, created_by, updated_by) VALUES (?, ?, ?, ?)";
    const values = [name, product, user_id, user_id];
    const [result] = await db.query(query, values);

    return successResponse(
      res,
      { id: result.insertId, name },
      "Project added successfully",
      201
    );
  } catch (error) {
    console.error("Error inserting project:", error.message);
    return errorResponse(res, error.message, "Error inserting project", 500);
  }
};

// Update Project
exports.updateProject = async (id, payload, res) => {
  const { name, product, user_id } = payload;

  const { error } = projectSchema.validate(
    { name, product, user_id },
    { abortEarly: false }
  );
  if (error) {
    const errorMessages = error.details.reduce((acc, err) => {
      acc[err.path[0]] = err.message;
      return acc;
    }, {});
    return errorResponse(res, errorMessages, "Validation Error", 400);
  }

  try {
    const user = await getAuthUserDetails(user_id, res);
    if (!user) return;
    const checkQuery =
      "SELECT COUNT(*) as count FROM projects WHERE id = ? AND deleted_at IS NULL";
    const [checkResult] = await db.query(checkQuery, [id]);

    if (checkResult[0].count === 0) {
      return errorResponse(
        res,
        "Project not found or deleted",
        "Not Found",
        404
      );
    }
    const checkProduct =
      "SELECT COUNT(*) as count FROM products WHERE id = ? and deleted_at IS NULL";
    const [checkProductResults] = await db.query(checkProduct, [product]);
    if (checkProductResults[0].count == 0) {
      return errorResponse(res, "Product Not Found", "Product Not Found", 404);
    }
    const checkProjectQuery =
      "SELECT COUNT(*) as count FROM projects WHERE name = ? AND id != ? AND deleted_at IS NULL";
    const [checkProject] = await db.query(checkProjectQuery, [name, id]);
    if (checkProject[0].count > 0) {
      return errorResponse(
        res,
        "Project with this name already exists",
        "Duplicate Project Error",
        400
      );
    }
    const query =
      "UPDATE projects SET name = ?, product_id = ?, updated_by = ? WHERE id = ?";
    const values = [name, product, user_id, id];
    await db.query(query, values);

    return successResponse(
      res,
      { id, name },
      "Project updated successfully",
      200
    );
  } catch (error) {
    console.error("Error updating project:", error.message);
    return errorResponse(res, error.message, "Error updating project", 500);
  }
};

// Delete Project
exports.deleteProject = async (id, res) => {
  try {
    const checkQuery =
      "SELECT COUNT(*) as count FROM projects WHERE id = ? AND deleted_at IS NULL";
    const [checkResult] = await db.query(checkQuery, [id]);

    if (checkResult[0].count === 0) {
      return errorResponse(
        res,
        "Project not found or already deleted",
        "Not Found",
        404
      );
    }
    const checkReferencesQuery = `SELECT COUNT(*) as count FROM tasks WHERE project_id = ? AND deleted_at IS NULL`;
    const [checkReferencesResult] = await db.query(checkReferencesQuery, [id]);

    if (checkReferencesResult[0].count > 0) {
      return errorResponse(
        res,
        `This project is referenced in the Tasks and cannot be deleted`,
        "Reference Error",
        400
      );
    }
    const query = "UPDATE projects SET deleted_at = NOW() WHERE id = ?";
    await db.query(query, [id]);

    return successResponse(res, { id }, "Project deleted successfully", 200);
  } catch (error) {
    console.error("Error deleting project:", error.message);
    return errorResponse(res, error.message, "Error deleting project", 500);
  }
};

// Get Single Project
exports.getProject = async (id, res) => {
  try {
    const query = "SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL";
    const [result] = await db.query(query, [id]);

    if (result.length === 0) {
      return errorResponse(
        res,
        "Project not found or deleted",
        "Not Found",
        404
      );
    }

    return successResponse(res, result[0], "Project fetched successfully", 200);
  } catch (error) {
    console.error("Error fetching project:", error.message);
    return errorResponse(res, error.message, "Error fetching project", 500);
  }
};

// Get All Projects
exports.getAllProjects = async (queryParams, res) => {
  const { search, page, perPage = 10 } = queryParams;

  let query = `SELECT 
        projects.*, 
        products.name as product_name
      FROM projects
      LEFT JOIN products ON projects.product_id = products.id
      WHERE projects.deleted_at IS NULL
    `;
  let countQuery = `
  SELECT 
    COUNT(*) AS total 
  FROM projects
  LEFT JOIN products ON projects.product_id = products.id
  WHERE projects.deleted_at IS NULL
`;
  const queryParamsArray = [];
  if (search && search.trim() !== "") {
    query += ` AND (projects.name LIKE ? OR products.name LIKE ?)`;
    countQuery += ` AND (projects.name LIKE ? OR products.name LIKE ?)`;
    queryParamsArray.push(`%${search.trim()}%`, `%${search.trim()}%`); // Add search term for both fields
  }
  if (page && perPage) {
    const offset = (parseInt(page, 10) - 1) * parseInt(perPage, 10);
    query += " ORDER BY `id` DESC LIMIT ? OFFSET ?";
    queryParamsArray.push(parseInt(perPage, 10), offset);
  } else {
    query += " ORDER BY `id` DESC"; // Default sorting
  }

  try {
    const [rows] = await db.query(query, queryParamsArray);
    const [countResult] = await db.query(countQuery, queryParamsArray);
    const totalRecords = countResult[0].total;
    const rowsWithSerialNo = rows.map((row, index) => ({
      s_no:
        page && perPage
          ? (parseInt(page, 10) - 1) * parseInt(perPage, 10) + index + 1
          : index + 1,
      ...row,
    }));

    const pagination =
      page && perPage ? getPagination(page, perPage, totalRecords) : null;

    return successResponse(
      res,
      rowsWithSerialNo,
      rowsWithSerialNo.length === 0
        ? "No projects found"
        : "Projects fetched successfully",
      200,
      pagination
    );
  } catch (error) {
    console.error("Error fetching all projects:", error.message);
    return errorResponse(
      res,
      error.message,
      "Error fetching all projects",
      500
    );
  }
};

exports.projectStatus_ToDo = async (req, res) => {
  try {
    const {
      product_id,
      project_id,
      user_id,
      employee_id,
      date,
      status,
      search,
      page = 1,
      perPage = 10,
    } = req.query;
    const offset = (page - 1) * perPage;
    const users = await getAuthUserDetails(user_id, res);
    if (!users) return;
    const taskConditions = [];
    const taskValues = [];
    const subtaskConditions = [];
    const subtaskValues = [];
    if (users.role_id === 3) {
      taskConditions.push("tm.reporting_user_id = ?");
      taskValues.push(users.id);
      subtaskConditions.push("tm.reporting_user_id = ?");
      subtaskValues.push(users.id);
    }
    if (product_id) {
      taskConditions.push("t.product_id = ?");
      taskValues.push(product_id);
      subtaskConditions.push("st.product_id = ?");
      subtaskValues.push(product_id);
    }
    if (project_id) {
      taskConditions.push("t.project_id = ?");
      taskValues.push(project_id);
      subtaskConditions.push("st.project_id = ?");
      subtaskValues.push(project_id);
    }
    if (employee_id) {
      taskConditions.push("t.user_id = ?");
      taskValues.push(employee_id);
      subtaskConditions.push("st.user_id = ?");
      subtaskValues.push(employee_id);
    }
    if (date) {
      taskConditions.push("DATE(t.created_at) = ?");
      taskValues.push(date);
      subtaskConditions.push("DATE(st.created_at) = ?");
      subtaskValues.push(date);
    }
    if (status === "0") {
      taskConditions.push("t.status = 0");
      taskConditions.push("t.active_status = 0");
      taskConditions.push("t.reopen_status = 0");
      subtaskConditions.push("st.status = 0");
      subtaskConditions.push("st.active_status = 0");
      subtaskConditions.push("st.reopen_status = 0");
    } else if (status === "1") {
      taskConditions.push("t.status = 1");
      taskConditions.push("t.active_status = 1");
      taskConditions.push("t.reopen_status = 0");
      subtaskConditions.push("st.status = 1");
      subtaskConditions.push("st.active_status = 1");
      subtaskConditions.push("st.reopen_status = 0");
    } else if (status === "3") {
      taskConditions.push("t.status = 3");
      subtaskConditions.push("st.status = 3");
    }
    if (search) {
      const searchTerm = `%${search}%`;
      taskConditions.push(
        `(t.name LIKE ? OR p.name LIKE ? OR pr.name LIKE ? OR CONCAT(u.first_name, ' ', u.last_name) LIKE ? OR t.created_at LIKE ?)`
      );
      taskValues.push(
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm
      );
      subtaskConditions.push(
        `(t.name LIKE ? OR st.name LIKE ? OR p.name LIKE ? OR pr.name LIKE ? OR CONCAT(u.first_name, ' ', u.last_name) LIKE ? OR st.created_at LIKE ?)`
      );
      subtaskValues.push(
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm
      );
    }
    const taskWhereClause =
      taskConditions.length > 0 ? `AND ${taskConditions.join(" AND ")}` : "";
    const subtaskWhereClause =
      subtaskConditions.length > 0
        ? `AND ${subtaskConditions.join(" AND ")}`
        : "";
    const tasksQuery = `
      SELECT
        t.id AS task_id,
        t.name AS task_name,
        t.estimated_hours AS estimated_time,
        t.total_hours_worked AS task_duration,
        CONVERT_TZ(stut.start_time, '+00:00', 'Asia/Kolkata') AS start_time,
        CONVERT_TZ(stut.end_time, '+00:00', 'Asia/Kolkata') AS end_time,
        t.rating AS rating,
        p.id AS product_id,
        p.name AS product_name,
        pr.id AS project_id,
        pr.name AS project_name,
        tm.id AS team_id,
        tm.name AS team_name,
        u.id AS user_id,
        t.status AS task_status,
        COALESCE(CONCAT(u.first_name, ' ', u.last_name), u.first_name, u.last_name) AS assignee,
        DATE(t.created_at) AS date
      FROM tasks t
      LEFT JOIN
        users u ON u.id = t.user_id
      LEFT JOIN products p ON p.id = t.product_id
      LEFT JOIN sub_tasks_user_timeline stut ON stut.task_id = t.id
      LEFT JOIN projects pr ON pr.id = t.project_id
      LEFT JOIN teams tm ON tm.id = t.team_id
      WHERE t.deleted_at IS NULL
      AND t.id NOT IN (SELECT task_id FROM sub_tasks WHERE deleted_at IS NULL)
      ${taskWhereClause}
      GROUP BY
        t.id
    `;
    const subtasksQuery = `
      SELECT
        p.name AS product_name,
        pr.name AS project_name,
        t.name AS task_name,
        st.name AS subtask_name,
        DATE(st.created_at) AS date,
        st.total_hours_worked AS subtask_duration,
        CONVERT_TZ(stut.start_time, '+00:00', 'Asia/Kolkata') AS start_time,
        CONVERT_TZ(stut.end_time, '+00:00', 'Asia/Kolkata') AS end_time,
        st.estimated_hours AS estimated_time,
        st.total_hours_worked AS time_taken,
        st.rating AS subtask_rating,
        tm.id AS team_id,
        tm.name AS team_name,
        t.id AS task_id,
        st.id AS subtask_id,
        u.id AS user_id,
        COALESCE(CONCAT(u.first_name, ' ', u.last_name), u.first_name, u.last_name) AS assignee,
        st.status AS subtask_status
      FROM
        sub_tasks st
      LEFT JOIN
        tasks t ON t.id = st.task_id
      LEFT JOIN
        users u ON u.id = st.user_id
      LEFT JOIN
        products p ON p.id = t.product_id
      LEFT JOIN
        projects pr ON pr.id = t.project_id
      LEFT JOIN
        sub_tasks_user_timeline stut ON stut.subtask_id = st.id
      LEFT JOIN
        teams tm ON tm.id = st.team_id
      WHERE
        st.deleted_at IS NULL
        ${subtaskWhereClause}
     GROUP BY
        st.id
    `;
    // First fetch tasks
    const [tasks] = await db.query(tasksQuery, taskValues);
    // Then fetch subtasks
    const [subtasks] = await db.query(subtasksQuery, subtaskValues);
    const mapStatus = (status, reopenStatus = 0, activeStatus = 0) => {
      if (status === 3) return "Done";
      if (status === 1 && activeStatus === 1) return "In Progress";
      if (status === 0 && reopenStatus === 0 && activeStatus === 0)
        return "To Do";
      return "Unknown";
    };
    const formatDuration = (start, end) => {
      if (!start || !end) return "-";
      const startTime = moment(start, "HH:mm:ss");
      const endTime = moment(end, "HH:mm:ss");
      if (!startTime.isValid() || !endTime.isValid()) return "-";
      const duration = moment.duration(endTime.diff(startTime));
      return duration.asMilliseconds() > 0
        ? `${duration.hours()}h ${duration.minutes()}m ${duration.seconds()}s`
        : "-"; // If negative or zero duration, return "-"
    };
    const Subtasks = subtasks.map((subtask) => ({
      type: "SubTask",
      status: mapStatus(subtask.subtask_status),
      date: moment(subtask.date).format("YYYY-MM-DD"),
      product_name: subtask.product_name,
      project_name: subtask.project_name,
      task_id: subtask.task_id,
      task_name: subtask.task_name,
      subtask_id: subtask.subtask_id,
      subtask_name: subtask.subtask_name,
      user_id: subtask.user_id,
      assignee: subtask.assignee,
      estimated_time: subtask.estimated_time,
      time_taken: subtask.time_taken,
      rating: subtask.subtask_rating,
      team_id: subtask.team_id,
      team_name: subtask.team_name,
      start_time: subtask.start_time
        ? moment(subtask.start_time, "HH:mm:ss").format("hh:mm:ss A")
        : "-",
      end_time: subtask.end_time
        ? moment(subtask.end_time, "HH:mm:ss").format("hh:mm:ss A")
        : "-",
      subtask_duration: formatDuration(subtask.start_time, subtask.end_time),
    }));
    const Tasks = tasks.map((task) => ({
      type: "Task",
      status: mapStatus(task.task_status),
      date: moment(task.date).format("YYYY-MM-DD"),
      product_name: task.product_name,
      project_name: task.project_name,
      task_id: task.task_id,
      task_name: task.task_name,
      subtask_name: null,
      user_id: task.user_id,
      assignee: task.assignee,
      estimated_time: task.estimated_time,
      rating: task.rating,
      team_id: task.team_id,
      team_name: task.team_name,
      start_time: task.start_time
        ? moment(task.start_time, "HH:mm:ss").format("hh:mm:ss A")
        : "-",
      end_time: task.end_time
        ? moment(task.end_time, "HH:mm:ss").format("hh:mm:ss A")
        : "-",
      task_duration: formatDuration(task.start_time, task.end_time),
    }));
    const groupedTasks = [...Subtasks, ...Tasks];
    const totalRecords = groupedTasks.length;
    const paginatedData = groupedTasks.slice(
      offset,
      offset + parseInt(perPage)
    );
    const pagination = getPagination(page, perPage, totalRecords);
    const data = paginatedData.map((row, index) => ({
      s_no: offset + index + 1,
      ...row,
    }));
    // Now wrap the tasks and pagination inside 'data'
    successResponse(
      res,
      data,
      data.length === 0
        ? "No data found"
        : "Tasks and subtasks retrieved successfully",
      200,
      pagination
    );
  } catch (error) {
    console.error("Error fetching tasks and subtasks:", error);
    return errorResponse(res, error.message, "Server error", 500);
  }
};

exports.projectStatus = async (req, res) => {
  try {
    const {
      product_id,
      project_id,
      user_id,
      employee_id,
      date,
      status,
      search,
      page = 1,
      perPage = 10,
    } = req.query;

    const offset = (page - 1) * perPage;
    const users = await getAuthUserDetails(user_id, res);
    if (!users) return;

    const conditions = [];
    const values = [];

    if (users.role_id === 3) {
      conditions.push("tm.reporting_user_id = ?");
      values.push(users.id);
    }
    if (product_id) {
      conditions.push("(t.product_id = ? OR st.product_id = ?)");
      values.push(product_id, product_id);
    }
    if (project_id) {
      conditions.push("(t.project_id = ? OR st.project_id = ?)");
      values.push(project_id, project_id);
    }
    if (employee_id) {
      conditions.push("(t.user_id = ? OR st.user_id = ?)");
      values.push(employee_id, employee_id);
    }
    if (date) {
      conditions.push("DATE(stut.start_time) = ?");
      values.push(date);
    }
    if (search) {
      const searchTerm = `%${search}%`;
      conditions.push(
        `(t.name LIKE ? OR st.name LIKE ? OR p.name LIKE ? OR pr.name LIKE ? OR CONCAT(u.first_name, ' ', u.last_name) LIKE ?)`
      );
      values.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    let query, countQuery;

    if (status == 0) {
      query = `
        WITH TaskData AS (
          SELECT 
            t.id AS id,
            t.name AS name,
            t.estimated_hours AS estimated_time,
            t.total_hours_worked AS duration,
            NULL AS start_time,
            NULL AS end_time,
            t.rating AS rating,
            NULL AS subtask_id,
            NULL AS subtask_name,
            p.id AS product_id,
            p.name AS product_name,
            pr.id AS project_id,
            pr.name AS project_name,
            tm.id AS team_id,
            tm.name AS team_name,
            u.id AS user_id,
            t.status AS status,
            CONCAT(u.first_name, ' ', u.last_name) AS assignee,
            t.created_at AS date,
            NULL AS task_id,
            NULL AS task_name,
            'Task' AS type
          FROM tasks t
          LEFT JOIN users u ON u.id = t.user_id
          LEFT JOIN products p ON p.id = t.product_id
          LEFT JOIN projects pr ON pr.id = t.project_id
          LEFT JOIN teams tm ON tm.id = t.team_id
          WHERE t.status = 0 
            AND t.active_status = 0 
            AND t.reopen_status = 0
            AND t.deleted_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM sub_tasks st WHERE st.task_id = t.id)
        ),
        SubTaskData AS (
          SELECT 
            st.id AS id,
            st.name AS name,
            st.estimated_hours AS estimated_time,
            st.total_hours_worked AS duration,
            NULL AS start_time,
            NULL AS end_time,
            st.rating AS rating,
            st.id AS subtask_id,
            st.name AS subtask_name,
            p.id AS product_id,
            p.name AS product_name,
            pr.id AS project_id,
            pr.name AS project_name,
            tm.id AS team_id,
            tm.name AS team_name,
            u.id AS user_id,
            st.status AS status,
            CONCAT(u.first_name, ' ', u.last_name) AS assignee,
            st.created_at AS date,
            t.id AS task_id,
            t.name AS task_name,
            'SubTask' AS type
          FROM sub_tasks st
          LEFT JOIN products p ON p.id = st.product_id
          LEFT JOIN projects pr ON pr.id = st.project_id
          LEFT JOIN teams tm ON tm.id = st.team_id
          LEFT JOIN users u ON u.id = st.user_id
          LEFT JOIN tasks t ON t.id = st.task_id
          WHERE st.status = 0 
            AND st.active_status = 0 
            AND st.reopen_status = 0
            AND st.deleted_at IS NULL
        )
        SELECT * FROM (
          SELECT * FROM TaskData
          UNION ALL
          SELECT * FROM SubTaskData
        ) AS final_data
        ORDER BY date DESC
        LIMIT ?, ?
      `;

      countQuery = `
        SELECT COUNT(*) AS total_records FROM (
          SELECT t.id FROM tasks t 
          WHERE t.status = 0 AND t.active_status = 0 AND t.reopen_status = 0 AND t.deleted_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM sub_tasks st WHERE st.task_id = t.id)
          UNION ALL
          SELECT st.id FROM sub_tasks st 
          WHERE st.status = 0 AND st.active_status = 0 AND st.reopen_status = 0 AND st.deleted_at IS NULL
        ) AS combined_records
      `;
    } else {
      if (status == 1) {
        conditions.push(`(
          (stut.subtask_id IS NULL AND t.status = 1 AND t.active_status = 1 AND t.reopen_status = 0 AND stut.end_time IS NULL)
          OR
          (stut.subtask_id IS NOT NULL AND st.status = 1 AND st.active_status = 1 AND st.reopen_status = 0 AND stut.end_time IS NULL)
        )`);
      } else if (status == 3) {
        conditions.push(`(
          (stut.subtask_id IS NULL AND t.status = 3 AND stut.end_time IS NOT NULL)
          OR
          (stut.subtask_id IS NOT NULL AND st.status = 3 AND stut.end_time IS NOT NULL)
        )`);
      }
      const whereClause =
        conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";

      query = `
       SELECT * FROM (
  SELECT 
    COALESCE(st.id, t.id) AS id,
    COALESCE(st.name, t.name) AS name,
    COALESCE(st.estimated_hours, t.estimated_hours) AS estimated_time,
    COALESCE(st.total_hours_worked, t.total_hours_worked) AS duration,
    CONVERT_TZ(stut.start_time, '+00:00', 'Asia/Kolkata') AS start_time,
    CONVERT_TZ(stut.end_time, '+00:00', 'Asia/Kolkata') AS end_time,
    COALESCE(st.rating, t.rating) AS rating,
    stut.subtask_id,
    st.name AS subtask_name,
    p.id AS product_id,
    p.name AS product_name,
    pr.id AS project_id,
    pr.name AS project_name,
    tm.id AS team_id,
    tm.name AS team_name,
    u.id AS user_id,
    COALESCE(st.status, t.status) AS status,
    COALESCE(CONCAT(u.first_name, ' ', u.last_name), u.first_name, u.last_name) AS assignee,
    DATE(stut.start_time) AS date,
    t.id AS task_id,
    t.name AS task_name,
    CASE 
      WHEN st.id IS NOT NULL THEN 'SubTask'
      ELSE 'Task'
    END AS type,
    stut.updated_at
  FROM sub_tasks_user_timeline stut
  LEFT JOIN sub_tasks st ON st.id = stut.subtask_id AND st.deleted_at IS NULL
  LEFT JOIN tasks t ON t.id = stut.task_id AND stut.subtask_id IS NULL AND t.deleted_at IS NULL
  LEFT JOIN users u ON u.id = COALESCE(st.user_id, t.user_id)
  LEFT JOIN products p ON p.id = COALESCE(st.product_id, t.product_id)
  LEFT JOIN projects pr ON pr.id = COALESCE(st.project_id, t.project_id)
  LEFT JOIN teams tm ON tm.id = COALESCE(st.team_id, t.team_id)
  WHERE stut.start_time IS NOT NULL
    AND (
      (stut.subtask_id IS NULL AND t.status = 3 AND stut.end_time IS NOT NULL)
      OR
      (stut.subtask_id IS NOT NULL AND st.status = 3 AND stut.end_time IS NOT NULL)
    )
    ${conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : ""}
  ORDER BY stut.updated_at DESC
) AS ranked_data
GROUP BY user_id
ORDER BY updated_at DESC
LIMIT ?, ?

      `;

      countQuery = `
        SELECT COUNT(COALESCE(st.id, t.id)) AS total_records
        FROM sub_tasks_user_timeline stut
        LEFT JOIN sub_tasks st ON st.id = stut.subtask_id AND st.deleted_at IS NULL
        LEFT JOIN tasks t ON t.id = stut.task_id AND stut.subtask_id IS NULL AND t.deleted_at IS NULL
        LEFT JOIN users u ON u.id = COALESCE(st.user_id, t.user_id)
        LEFT JOIN products p ON p.id = COALESCE(st.product_id, t.product_id)
        LEFT JOIN projects pr ON pr.id = COALESCE(st.project_id, t.project_id)
        LEFT JOIN teams tm ON tm.id = COALESCE(st.team_id, t.team_id)
        WHERE stut.start_time IS NOT NULL 
        ${whereClause}
      `;
    }

    values.push(offset, parseInt(perPage));
    const [results] = await db.query(query, values);

    const [[countResult]] = await db.query(countQuery, values.slice(0, -2));
    const totalRecords = countResult.total_records || 0;

    const formattedResults = results.map((row, index) => ({
      s_no: offset + index + 1,
      type: row.subtask_id ? "SubTask" : "Task",
      status:
        row.status === 0 ? "To Do" : row.status === 1 ? "In Progress" : "Done",
      date: row.date ? moment(row.date).format("YYYY-MM-DD") : "-",
      product_name: row.product_name,
      project_name: row.project_name,
      task_id: row.type === "Task" ? row.id : row.task_id || null,
      task_name: row.type === "Task" ? row.name : row.task_name || null,
      subtask_id: row.type === "SubTask" ? row.id : row.subtask_id || null,
      subtask_name:
        row.type === "SubTask" ? row.name : row.subtask_name || null,
      user_id: row.user_id,
      assignee: row.assignee,
      estimated_time: row.estimated_time,
      rating: row.rating,
      team_id: row.team_id,
      team_name: row.team_name,
      start_time: row.start_time
        ? moment(row.start_time, "DD/MM/YYYY hh:mm:ss A").format("DD/MM/YYYY hh:mm:ss A")
        : "-",
      end_time: row.end_time
        ? moment(row.end_time, "DD/MM/YYYY hh:mm:ss A").format("DD/MM/YYYY hh:mm:ss A")
        : "-",
      task_duration:
        row.start_time && row.end_time
          ? moment
              .utc(moment(row.end_time).diff(moment(row.start_time)))
              .format("HH:mm:ss")
          : "-",
    }));

    const pagination = getPagination(page, perPage, totalRecords);

    successResponse(
      res,
      formattedResults,
      formattedResults.length === 0
        ? "No data found"
        : "Data retrieved successfully",
      200,
      pagination
    );
  } catch (error) {
    console.error("Error fetching tasks and subtasks:", error);
    return errorResponse(res, error.message, "Server error", 500);
  }
};

exports.projectRequest = async (req, res) => {
  try {
    const {
      project_id,
      user_id,
      employee_id,
      date,
      search,
      page = 1,
      perPage = 10,
    } = req.query;
    const offset = (page - 1) * perPage;

    let effectiveUserIds = [];

    if (user_id) {
      // Step 1: Get the role_id of the provided user_id
      const roleQuery = `SELECT role_id FROM users WHERE id = ?`;
      const [roleResult] = await db.query(roleQuery, [user_id]);

      if (!roleResult.length) {
        return errorResponse(res, "User not found", "Invalid user_id", 404);
      }

      const { role_id } = roleResult[0];

      if (role_id === 3) {
        // Get all team IDs where the user is the reporting user
        const teamQuery = `SELECT id FROM teams WHERE reporting_user_id = ?`;
        const [teamResults] = await db.query(teamQuery, [user_id]);

        if (teamResults.length > 0) {
          const teamIds = teamResults.map((team) => team.id); // Extract all team IDs

          // Get all users belonging to these teams
          const teamUsersQuery = `SELECT id FROM users WHERE team_id IN (${teamIds
            .map(() => "?")
            .join(",")})`;
          const [teamUsers] = await db.query(teamUsersQuery, teamIds);

          if (teamUsers.length > 0) {
            effectiveUserIds = teamUsers.map((user) => user.id); // Extract all user IDs
          }
        }
      }
    }

    if (!user_id || effectiveUserIds.length === 0) {
      if (employee_id) {
        effectiveUserIds.push(employee_id);
      }
    }

    const taskConditions = [];
    const subtaskConditions = [];
    const taskValues = [];
    const subtaskValues = [];

    // Apply user filter only if necessary
    if (effectiveUserIds.length > 0) {
      taskConditions.push(
        `t.user_id IN (${effectiveUserIds.map(() => "?").join(",")})`
      );
      subtaskConditions.push(
        `st.user_id IN (${effectiveUserIds.map(() => "?").join(",")})`
      );
      taskValues.push(...effectiveUserIds);
      subtaskValues.push(...effectiveUserIds);
    }

    if (project_id) {
      taskConditions.push("t.project_id = ?");
      subtaskConditions.push("st.project_id = ?");
      taskValues.push(project_id);
      subtaskValues.push(project_id);
    }
    if (date) {
      taskConditions.push("DATE(t.created_at) = ?");
      subtaskConditions.push("DATE(st.created_at) = ?");
      taskValues.push(date);
      subtaskValues.push(date);
    }
    if (search) {
      const searchTerm = `%${search}%`;
      const searchCondition = `(
        t.name LIKE ? OR
        pr.name LIKE ? OR
        tm.name LIKE ? OR
        ua.first_name LIKE ? OR
        ua.last_name LIKE ? OR
        u.first_name LIKE ? OR
        u.last_name LIKE ?
      )`;

      taskConditions.push(
        searchCondition.replace(/t\./g, "t.").replace(/u\./g, "u.")
      );
      subtaskConditions.push(
        searchCondition.replace(/t\./g, "st.").replace(/u\./g, "u.")
      );

      const values = [
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
      ];
      taskValues.push(...values);
      subtaskValues.push(...values);
    }

    const taskWhereClause =
      taskConditions.length > 0 ? `AND ${taskConditions.join(" AND ")}` : "";
    const subtaskWhereClause =
      subtaskConditions.length > 0
        ? `AND ${subtaskConditions.join(" AND ")}`
        : "";

    // Fetch Subtasks
    const subtasksQuery = `
      SELECT 
        pr.name AS project_name,
        st.name AS name,
        tm.name AS team_name,
        DATE_FORMAT(st.created_at, '%Y-%m-%d') AS date,
        CONCAT(ua.first_name, ' ', ua.last_name) AS assigned_by_designation,
        'Subtask' AS type,
        t.id AS task_id,
        st.id AS subtask_id,
        st.user_id AS subtask_user_id
      FROM sub_tasks st
      LEFT JOIN tasks t ON t.id = st.task_id
      LEFT JOIN users u ON u.id = st.user_id
      LEFT JOIN users ua ON ua.id = st.created_by
      LEFT JOIN projects pr ON pr.id = t.project_id
      LEFT JOIN teams tm ON tm.id = u.team_id
      LEFT JOIN users u_assigned ON u_assigned.id = t.assigned_user_id
      WHERE st.status = 2 AND st.deleted_at IS NULL ${subtaskWhereClause}
      ORDER BY st.updated_at DESC
    `;

    // Fetch Tasks
    const tasksQuery = `
      SELECT 
        pr.name AS project_name,
        t.name AS name,
        tm.name AS team_name,
        DATE_FORMAT(t.created_at, '%Y-%m-%d') AS date,
        CONCAT(ua.first_name, ' ', ua.last_name) AS assigned_by_designation,
        'Task' AS type,
        t.id AS task_id,
        NULL AS subtask_id,
        t.user_id AS task_user_id
      FROM tasks t
      LEFT JOIN users u ON u.id = t.user_id
      LEFT JOIN users ua ON ua.id = t.created_by
      LEFT JOIN projects pr ON pr.id = t.project_id
      LEFT JOIN teams tm ON tm.id = u.team_id
      LEFT JOIN users u_assigned ON u_assigned.id = t.assigned_user_id
      WHERE t.deleted_at IS NULL AND t.status = 2 
        AND t.id NOT IN (SELECT task_id FROM sub_tasks WHERE deleted_at IS NULL)
        ${taskWhereClause}
      ORDER BY t.updated_at DESC
    `;

    // Execute queries
    const [subtasks] = await db.query(subtasksQuery, subtaskValues);
    const [tasks] = await db.query(tasksQuery, taskValues);

    // Merge and process results
    const mergedResults = [...subtasks, ...tasks];

    // Fetch assignee names
    const processedData = await Promise.all(
      mergedResults.map(async (item) => {
        const assigneeUserId = item.subtask_id
          ? item.subtask_user_id
          : item.task_user_id;
        const assigneeNameQuery = `SELECT COALESCE(CONCAT(first_name, ' ', last_name), first_name, last_name) AS assignee_name FROM users WHERE id = ?`;
        const [results] = await db.query(assigneeNameQuery, [assigneeUserId]);
        item.assignee_name = results[0] ? results[0].assignee_name : "Unknown";
        delete item.user_id;
        return item;
      })
    );

    // Pagination
    const totalRecords = processedData.length;
    const paginatedData = processedData.slice(
      offset,
      offset + parseInt(perPage)
    );
    const pagination = getPagination(page, perPage, totalRecords);

    // Add serial numbers
    const data = paginatedData.map((row, index) => ({
      s_no: offset + index + 1,
      ...row,
    }));

    successResponse(
      res,
      data,
      data.length === 0
        ? "No tasks or subtasks found"
        : "Tasks and subtasks retrieved successfully",
      200,
      pagination
    );
  } catch (error) {
    console.error("Error fetching tasks and subtasks:", error);
    return errorResponse(res, error.message, "Server error", 500);
  }
};

exports.getRequestupdate = async (req, res) => {
  try {
    const { type, id } = req.query;

    // Validate type and id
    if (!type) {
      return errorResponse(res, null, "Type is required", 400);
    }
    if (!id) {
      return errorResponse(res, null, "ID is required", 400);
    }

    let result;

    // Handle task or subtask based on type
    if (type === "task") {
      const query = `
        SELECT 
          t.*,
          CONCAT(u.first_name, ' ', u.last_name) AS user_name,
          p.name AS product_name,
          pr.name AS project_name,
          t.name AS task_name,
          CONCAT(au.first_name, ' ', au.last_name) AS assigned_user_name
        FROM tasks t
        LEFT JOIN users u ON t.user_id = u.id
        LEFT JOIN products p ON t.product_id = p.id
        LEFT JOIN projects pr ON t.project_id = pr.id
        LEFT JOIN users au ON t.assigned_user_id = au.id
        WHERE t.id = ? AND t.deleted_at IS NULL
      `;
      const [rows] = await db.query(query, [id]);
      result = rows[0];
    } else if (type === "subtask") {
      const query = `
        SELECT 
          st.*,
          CONCAT(u.first_name, ' ', u.last_name) AS user_name,
          p.name AS product_name,
          pr.name AS project_name,
          t.name AS task_name,
          CONCAT(au.first_name, ' ', au.last_name) AS assigned_user_name
        FROM sub_tasks st
        LEFT JOIN users u ON st.user_id = u.id
        LEFT JOIN products p ON st.product_id = p.id
        LEFT JOIN projects pr ON st.project_id = pr.id
        LEFT JOIN tasks t ON st.task_id = t.id
        LEFT JOIN users au ON st.assigned_user_id = au.id
        WHERE st.id = ? AND st.deleted_at IS NULL
      `;
      const [rows] = await db.query(query, [id]);
      result = rows[0];
    } else {
      return errorResponse(
        res,
        null,
        'Invalid type. It should be either "task" or "subtask".',
        400
      );
    }

    // If no rows are found, return an error
    if (!result) {
      return errorResponse(
        res,
        null,
        `${type.charAt(0).toUpperCase() + type.slice(1)} not found or deleted`,
        404
      );
    }

    // Return the result if found
    return successResponse(
      res,
      result,
      `${type.charAt(0).toUpperCase() + type.slice(1)} fetched successfully`,
      200
    );
  } catch (error) {
    console.error("Error fetching request update:", error.message);
    return errorResponse(res, null, "Error fetching request update", 500);
  }
};

// exports.getRequestchange = async (id, payload, res, req) => {
//   const { user_id, type, remark, rating, action } = payload;

//   const requiredFields = [
//     { key: 'type', message: 'Type is required' },
//     { key: 'action', message: 'Action is required' },
//     { key: 'user_id', message: 'User ID is required' },
//   ];

//   for (const field of requiredFields) {
//     if (!payload[field.key]) {
//       return errorResponse(res, null, field.message, 400);
//     }
//   }

//   const [userRows] = await db.query(
//     "SELECT id FROM users WHERE id = ? AND deleted_at IS NULL",
//     [user_id]
//   );

//   if (userRows.length === 0) {
//     return errorResponse(res, null, "User Not Found", 400);
//   }

//   const validType = ['task', 'subtask'];
//   if (!validType.includes(type)) {
//     return errorResponse(res, null, 'Invalid type. It should be either task or subtask.', 400);
//   }

//   const validActions = ['reopen', 'close'];
//   if (!validActions.includes(action)) {
//     return errorResponse(res, null, 'Invalid action. It should be either reopen or close.', 400);
//   }

//   try {
//     // Validate if the task or subtask exists
//     const table = type === 'task' ? 'tasks' : 'sub_tasks';
//     const [idRows] = await db.query(
//       `SELECT id, user_id FROM ${table} WHERE id = ? AND deleted_at IS NULL`,
//       [id]
//     );

//     if (idRows.length === 0) {
//       return errorResponse(
//         res,
//         null,
//         `${type.charAt(0).toUpperCase() + type.slice(1)} not found or deleted`,
//         404
//       );
//     }

//     const userId = idRows[0].user_id;

//     // Determine status values based on action
//     let statusToSet, reopenstatusToSet, notificationTitle, notificationBody;

//     if (action === 'reopen') {
//       statusToSet = 0;
//       reopenstatusToSet = 1;
//       notificationTitle = 'Task Reopened';
//       notificationBody = 'Your task has been reopened for further review. Please check the updates.';
//     } else if (action === 'close') {
//       statusToSet = 3;
//       reopenstatusToSet = 0;
//       notificationTitle = 'Task Approved';
//       notificationBody = 'Your submitted task has been successfully approved.';
//     }

//     // Prepare fields and values for update
//     const fieldsToUpdate = ['status = ?', 'reopen_status = ?', 'updated_by = ?', 'updated_at = ?'];
//     const updatedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
//     const values = [statusToSet, reopenstatusToSet, user_id, updatedAt];

//     if (remark !== undefined) {
//       fieldsToUpdate.push('remark = ?');
//       values.push(remark);
//     }

//     if (rating !== undefined) {
//       fieldsToUpdate.push('rating = ?');
//       values.push(rating);
//     }

//     // Construct and execute the update query
//     const updateQuery = `
//       UPDATE ${table}
//       SET ${fieldsToUpdate.join(', ')}
//       WHERE id = ? AND deleted_at IS NULL
//     `;
//     values.push(id);

//     const [updateResult] = await db.query(updateQuery, values);

//     if (updateResult.affectedRows === 0) {
//       return errorResponse(
//         res,
//         null,
//         `${type.charAt(0).toUpperCase() + type.slice(1)} not found or deleted`,
//         404
//       );
//     }

//     // Send notification to the user
//     const notificationPayload = {
//       title: notificationTitle,
//       body: notificationBody,
//     };
//     const socketIds = userSockets[userId];
//     if (Array.isArray(socketIds)) {
//       socketIds.forEach(socketId => {
//         req.io.of('/notifications').to(socketId).emit('push_notification', notificationPayload);
//       });
//     }
//     await db.execute(
//       'INSERT INTO notifications (user_id, title, body, read_status, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
//       [userId, notificationPayload.title, notificationPayload.body, 0]
//     );

//     // Return success response
//     return successResponse(
//       res,
//       { id },
//       `Project request for ${type.charAt(0).toUpperCase() + type.slice(1)} updated successfully`,
//       200
//     );
//   } catch (error) {
//     console.error('Error updating task or subtask:', error.message);
//     return errorResponse(res, error.message, 'Error updating task or subtask', 500);
//   }
// };

exports.getRequestchange = async (id, payload, res, req) => {
  const { user_id, type, remark, rating, action } = payload;

  const requiredFields = [
    { key: "type", message: "Type is required" },
    { key: "action", message: "Action is required" },
    { key: "user_id", message: "User ID is required" },
  ];

  for (const field of requiredFields) {
    if (!payload[field.key]) {
      return errorResponse(res, null, field.message, 400);
    }
  }

  const [userRows] = await db.query(
    "SELECT id FROM users WHERE id = ? AND deleted_at IS NULL",
    [user_id]
  );

  if (userRows.length === 0) {
    return errorResponse(res, null, "User Not Found", 400);
  }

  const validType = ["task", "subtask"];
  if (!validType.includes(type)) {
    return errorResponse(
      res,
      null,
      "Invalid type. It should be either task or subtask.",
      400
    );
  }

  const validActions = ["reopen", "close"];
  if (!validActions.includes(action)) {
    return errorResponse(
      res,
      null,
      "Invalid action. It should be either reopen or close.",
      400
    );
  }

  try {
    const table = type === "task" ? "tasks" : "sub_tasks";

    const [oldDataRows] = await db.query(
      `SELECT * FROM ${table} WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );

    if (oldDataRows.length === 0) {
      return errorResponse(
        res,
        null,
        `${type.charAt(0).toUpperCase() + type.slice(1)} not found or deleted`,
        404
      );
    }

    const oldData = oldDataRows[0];
    const userId = oldData.user_id;

    // Determine status values
    let statusToSet, reopenstatusToSet, notificationTitle, notificationBody;

    if (action === "reopen") {
      statusToSet = 0;
      reopenstatusToSet = 1;
      notificationTitle = "Task Reopened";
      notificationBody =
        "Your task has been reopened for further review. Please check the updates.";
    } else if (action === "close") {
      statusToSet = 3;
      reopenstatusToSet = 0;
      notificationTitle = "Task Approved";
      notificationBody = "Your submitted task has been successfully approved.";
    }

    const fieldsToUpdate = [
      "status = ?",
      "reopen_status = ?",
      "updated_by = ?",
      "updated_at = ?",
    ];
    const updatedAt = new Date().toISOString().slice(0, 19).replace("T", " ");
    const values = [statusToSet, reopenstatusToSet, user_id, updatedAt];

    if (remark !== undefined) {
      fieldsToUpdate.push("remark = ?");
      values.push(remark);
    }

    if (rating !== undefined) {
      fieldsToUpdate.push("rating = ?");
      values.push(rating);
    }

    values.push(id); // for WHERE clause

    const updateQuery = `
      UPDATE ${table}
      SET ${fieldsToUpdate.join(", ")}
      WHERE id = ? AND deleted_at IS NULL
    `;

    const [updateResult] = await db.query(updateQuery, values);

    if (updateResult.affectedRows === 0) {
      return errorResponse(
        res,
        null,
        `${type.charAt(0).toUpperCase() + type.slice(1)} not found or deleted`,
        404
      );
    }

    // Prepare status labels
    const getStatusLabel = (status, reopenStatus, activeStatus) => {
      if (status === 0 && reopenStatus === 0 && activeStatus === 0)
        return "To Do";
      if (status === 1 && reopenStatus === 0 && activeStatus === 0)
        return "On Hold";
      if (status === 2 && reopenStatus === 0) return "Pending Approval";
      if (reopenStatus === 1 && activeStatus === 0) return "Reopen";
      if (status === 1 && activeStatus === 1) return "InProgress";
      if (status === 3) return "Done";
      return "";
    };

    const oldStatusLabel = getStatusLabel(
      oldData.status,
      oldData.reopen_status,
      oldData.active_status
    );
    const newStatusLabel = getStatusLabel(
      statusToSet,
      reopenstatusToSet,
      oldData.active_status
    );

    // Insert into task history
    const historyQuery = `
      INSERT INTO task_histories (
        old_data, new_data, task_id, subtask_id, text,
        updated_by, status_flag, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NULL)
    `;

    const taskId = type === "task" ? id : oldData.task_id;
    const subtaskId = type === "subtask" ? id : null;

    const historyValues = [
      oldStatusLabel,
      newStatusLabel,
      taskId,
      subtaskId,
      "Change the status",
      user_id,
      1, // status_flag
    ];

    await db.query(historyQuery, historyValues);

    // Send notification
    const notificationPayload = {
      title: notificationTitle,
      body: notificationBody,
    };

    const socketIds = userSockets[userId];
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
      [userId, notificationPayload.title, notificationPayload.body, 0]
    );

    return successResponse(
      res,
      { id },
      `${type.charAt(0).toUpperCase() + type.slice(1)} updated successfully`,
      200
    );
  } catch (error) {
    console.error("Error:", error.message);
    return errorResponse(res, error.message, "Server error", 500);
  }
};
