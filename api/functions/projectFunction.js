const moment = require("moment");
const db = require("../../config/db");
const {
  successResponse,
  errorResponse,
  getPagination,
} = require("../../helpers/responseHelper");
const { projectSchema } = require("../../validators/projectValidator");
const { getAuthUserDetails, getTeamuserids,commonStatusGroup } = require("./commonFunction");
const { getUserIdFromAccessToken } = require("../../api/utils/tokenUtils");

const { userSockets } = require("../../helpers/notificationHelper");
const { hasPermission } = require("../../controllers/permissionController");

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
      "SELECT COUNT(*) as count FROM projects WHERE name = ? AND product_id = ? AND deleted_at IS NULL";
    const [checkResult] = await db.query(checkQuery, [name, product]);

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
    const checkQuery1 =
      "SELECT COUNT(*) as count FROM projects WHERE name = ? AND product_id = ? AND deleted_at IS NULL AND id != ?";
    const [checkResult1] = await db.query(checkQuery1, [name, product, id]);

    if (checkResult1[0].count > 0) {
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
    const findProject =
      "SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL";
    const [projectResult] = await db.query(findProject, [id]);
    if (projectResult[0].product_id !== product) {
      const checkProductInTasksQuery = `
      SELECT COUNT(*) as count FROM tasks WHERE project_id = ? AND product_id = ? AND deleted_at IS NULL`;
      const [checkProductInTasks] = await db.query(checkProductInTasksQuery, [
        id,
        projectResult[0].product_id,
      ]);
      const checkProductInSubTasksQuery = `SELECT COUNT(*) as count FROM sub_tasks WHERE project_id = ? AND product_id = ? AND deleted_at IS NULL`;
      const [checkProductInSubTasks] = await db.query(
        checkProductInSubTasksQuery,
        [id, projectResult[0].product_id]
      );
      if (
        checkProductInTasks[0].count > 0 ||
        checkProductInSubTasks[0].count > 0
      ) {
        return errorResponse(
          res,
          "This project is referenced in the Tasks or Sub-Tasks and cannot be updated",
          "This project is referenced in the Tasks or Sub-Tasks and cannot be updated",
          400
        );
      }
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

exports.projectStatus = async (req, res) => {
  try {
    const {
      product_id,
      project_id,
      employee_id,
      date,
      status,
      search,
      page = 1,
      perPage = 10,
    } = req.query;




    
    const offset = (page - 1) * perPage;
    


    const accessToken = req.headers.authorization?.split(" ")[1];
    if (!accessToken) {
      return errorResponse(res, "Access token is required", 401);
    }

    const user_id = await getUserIdFromAccessToken(accessToken);

    const users = await getAuthUserDetails(user_id, res);
    if (!users) return;

    const hasTeamstatusView = await hasPermission(
      "project_status.view_team_project_status",
      accessToken
    );

    const taskConditions = [];
    const taskValues = [];
    const subtaskConditions = [];
    const subtaskValues = [];

    if (hasTeamstatusView) {
      // Convert comma-separated team_id string to array
      const teamIds = users.team_id.split(",").map(id => id.trim()).filter(Boolean);

      if (teamIds.length > 0) {
        const placeholders = teamIds.map(() => "?").join(",");

        // Task condition
        taskConditions.push(`u.team_id IN (${placeholders})`);
        taskValues.push(...teamIds);

        // Subtask condition
        subtaskConditions.push(`u.team_id IN (${placeholders})`);
        subtaskValues.push(...teamIds);
      }
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

    // if (status === "0") {
    //   taskConditions.push("t.status = 0");
    //   taskConditions.push("t.active_status = 0");
    //   taskConditions.push("t.reopen_status = 0");
    //   subtaskConditions.push("st.status = 0");
    //   subtaskConditions.push("st.active_status = 0");
    //   subtaskConditions.push("st.reopen_status = 0");
    // }
    if (status === "0") {
       taskConditions.push(`(
        (t.status = 0 AND t.active_status = 0 AND t.reopen_status = 0 AND t.hold_status = 0)
        OR
        (t.status = 1 AND t.active_status = 0 AND t.reopen_status = 0 AND t.hold_status = 0)
      )`);

          subtaskConditions.push(`(
        (st.status = 0 AND st.active_status = 0 AND st.reopen_status = 0 AND st.hold_status = 0)
        OR
        (st.status = 1 AND st.active_status = 0 AND st.reopen_status = 0 AND st.hold_status = 0)
      )`);
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
        `(t.name LIKE ? OR p.name LIKE ? OR pr.name LIKE ? OR CONCAT(u.first_name, ' ', u.last_name) LIKE ? OR DATE_FORMAT(t.created_at, '%d-%m-%Y') LIKE ?)`
      );
      taskValues.push(
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm
      );

      subtaskConditions.push(
        `(st.name LIKE ? OR p.name LIKE ? OR pr.name LIKE ? OR CONCAT(u.first_name, ' ', u.last_name) LIKE ? OR DATE_FORMAT(st.created_at, '%d-%m-%Y') LIKE ?)`
      );
      subtaskValues.push(
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
        (
          SELECT DATE_FORMAT(CONVERT_TZ(stut2.start_time, '+00:00', '+05:30'), '%d-%m-%Y %r')
          FROM sub_tasks_user_timeline stut2
          WHERE stut2.task_id = t.id
          ORDER BY stut2.updated_at ASC
          LIMIT 1
        ) AS start_time,
        (
          SELECT DATE_FORMAT(CONVERT_TZ(stut3.end_time, '+00:00', '+05:30'), '%d-%m-%Y %r')
          FROM sub_tasks_user_timeline stut3
          WHERE stut3.task_id = t.id
          ORDER BY stut3.updated_at DESC
          LIMIT 1
        ) AS end_time,
        t.rating AS rating,
        p.id AS product_id,
        p.name AS product_name,
        pr.id AS project_id,
        pr.name AS project_name,
        tm.id AS team_id,
        tm.name AS team_name,
        u.id AS user_id,
        t.status,
        t.reopen_status,
        t.active_status,
        t.hold_status,
        COALESCE(CONCAT(u.first_name, ' ', u.last_name), u.first_name, u.last_name) AS assignee,
        DATE(t.created_at) AS date,
        t.updated_at AS updated_at
      FROM tasks t
      LEFT JOIN users u ON u.id = t.user_id
      LEFT JOIN products p ON p.id = t.product_id
      LEFT JOIN sub_tasks_user_timeline stut ON stut.task_id = t.id
      LEFT JOIN projects pr ON pr.id = t.project_id
      LEFT JOIN teams tm ON tm.id = t.team_id
      WHERE t.deleted_at IS NULL
        AND t.id NOT IN (SELECT task_id FROM sub_tasks WHERE deleted_at IS NULL)
        ${taskWhereClause}
      GROUP BY t.id
      ORDER BY t.created_at DESC
    `;

    const subtasksQuery = `
      SELECT
        p.name AS product_name,
        pr.name AS project_name,
        t.name AS task_name,
        st.name AS subtask_name,
        DATE(st.created_at) AS date,
        st.total_hours_worked AS subtask_duration,
        (
          SELECT DATE_FORMAT(CONVERT_TZ(stut2.start_time, '+00:00', '+05:30'), '%d-%m-%Y %r')
          FROM sub_tasks_user_timeline stut2
          WHERE stut2.task_id = t.id
          ORDER BY stut2.updated_at ASC
          LIMIT 1
        ) AS start_time,
        (
          SELECT DATE_FORMAT(CONVERT_TZ(stut3.end_time, '+00:00', '+05:30'), '%d-%m-%Y %r')
          FROM sub_tasks_user_timeline stut3
          WHERE stut3.task_id = t.id
          ORDER BY stut3.updated_at DESC
          LIMIT 1
        ) AS end_time,
        st.estimated_hours AS estimated_time,
        st.total_hours_worked AS time_taken,
        st.rating AS subtask_rating,
        tm.id AS team_id,
        tm.name AS team_name,
        t.id AS task_id,
        st.id AS subtask_id,
        u.id AS user_id,
        COALESCE(CONCAT(u.first_name, ' ', u.last_name), u.first_name, u.last_name) AS assignee,
        st.status,
        st.reopen_status,
        st.active_status,
        st.hold_status,
        st.updated_at AS updated_at
      FROM sub_tasks st
      LEFT JOIN tasks t ON t.id = st.task_id
      LEFT JOIN users u ON u.id = st.user_id
      LEFT JOIN products p ON p.id = st.product_id
      LEFT JOIN projects pr ON pr.id = st.project_id
      LEFT JOIN sub_tasks_user_timeline stut ON stut.subtask_id = st.id
      LEFT JOIN teams tm ON tm.id = st.team_id
      WHERE st.deleted_at IS NULL
        ${subtaskWhereClause}
      GROUP BY st.id
      ORDER BY st.updated_at DESC
    `;

    const [tasks] = await db.query(tasksQuery, taskValues);
    const [subtasks] = await db.query(subtasksQuery, subtaskValues);

    const mapStatus = (statusCode) => {
      switch (statusCode) {
        case 0:
          return "To Do";
        case 1:
          return "In Progress";
        case 3:
          return "Done";
        default:
          return "Unknown";
      }
    };

    const Tasks = tasks.map((task) => ({
      type: "Task",
        status: commonStatusGroup(
                    task.status,
                    task.reopen_status,
                    task.active_status,
                    task.hold_status
                  ),
      date: task.date,
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
      start_time: task.start_time ? task.start_time : "-",
      end_time: task.task_status === 3 && task.end_time ? task.end_time : "-",
      task_duration: task.task_status === 3 ? task.task_duration : "-",
      task_updated_at: task.updated_at
        ? moment(task.updated_at).format("DD-MM-YYYY hh:mm:ss A")
        : "-",
    }));

    const Subtasks = subtasks.map((subtask) => ({
      type: "SubTask",
      status: commonStatusGroup(
                    subtask.status,
                    subtask.reopen_status,
                    subtask.active_status,
                    subtask.hold_status
                  ),
      date: subtask.date,
      product_name: subtask.product_name,
      project_name: subtask.project_name,
      task_id: subtask.task_id,
      task_name: subtask.task_name,
      subtask_id: subtask.subtask_id,
      subtask_name: subtask.subtask_name,
      user_id: subtask.user_id,
      assignee: subtask.assignee,
      estimated_time: subtask.estimated_time,
      rating: subtask.subtask_rating,
      team_id: subtask.team_id,
      team_name: subtask.team_name,
      start_time: subtask.start_time ? subtask.start_time : "-",
      end_time:
        subtask.subtask_status === 3 && subtask.end_time
          ? subtask.end_time
          : "-",
      time_taken: subtask.subtask_status === 3 ? subtask.time_taken : "-",
      subtask_duration:
        subtask.subtask_status === 3 ? subtask.subtask_duration : "-",
      task_updated_at: subtask.updated_at
        ? moment(subtask.updated_at).format("DD-MM-YYYY hh:mm:ss A")
        : "-",
    }));

    // Combine and sort both task types by updated_at
    const combinedData = [...Subtasks, ...Tasks].sort(
      (a, b) => new Date(b.task_updated_at) - new Date(a.task_updated_at)
    );

    const totalRecords = combinedData.length;
    const startIndex = (page - 1) * perPage;
    const endIndex = page * perPage;

    let paginatedData = combinedData.slice(startIndex, endIndex);

    // Add s_no to paginated data
    paginatedData = paginatedData.map((item, index) => ({
      ...item,
      s_no: startIndex + index + 1, // s_no is global
    }));

    const pagination = getPagination(page, perPage, totalRecords);

    successResponse(
      res,
      paginatedData, // ✅ return paginated data with s_no
      paginatedData.length === 0
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
      employee_id,
      date,
      search,
      page = 1,
      perPage = 10,
    } = req.query;

    const accessToken = req.headers.authorization?.split(" ")[1];
    if (!accessToken) {
      return errorResponse(res, "Access token is required", 401);
    }
    const user_id = await getUserIdFromAccessToken(accessToken);
    const offset = (page - 1) * perPage;

    let effectiveUserIds = [];
    const taskConditions = [];
    const subtaskConditions = [];
    const taskValues = [];
    const subtaskValues = [];

    if (user_id) {
      // Step 1: Get the role_id of the provided user_id
      const roleQuery = `SELECT role_id FROM users WHERE id = ?`;
      const [roleResult] = await db.query(roleQuery, [user_id]);

      if (!roleResult.length) {
        return errorResponse(res, "User not found", "Invalid user_id", 404);
      }

      const { role_id } = roleResult[0];

      if (employee_id) {
        effectiveUserIds = [employee_id]; // ✅ Always use only this employee’s data
      } else {
        if (
          await hasPermission(
            "project_request.team_project_request_view",
            accessToken
          )
        ) {
          effectiveUserIds = await getTeamuserids(user_id);
        } else if (
          await hasPermission(
            "project_request.all_project_request_view",
            accessToken
          )
        ) {
          taskConditions.push("t.assigned_user_id = ?");
          subtaskConditions.push("st.assigned_user_id = ?");
          taskValues.push(user_id);
          subtaskValues.push(user_id);
        } else if (
          await hasPermission(
            "project_request.exclude_project_request_view",
            accessToken
          )
        ) {
          // ✅ PM view: show all data → no user filter applied
          effectiveUserIds = []; // skip adding any user filter later
        }
      }
    }

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

    // Subtasks Query (Add st.updated_at)
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
    st.user_id AS subtask_user_id,
    st.updated_at
  FROM sub_tasks st
  LEFT JOIN tasks t ON t.id = st.task_id
  LEFT JOIN users u ON u.id = st.user_id
  LEFT JOIN users ua ON ua.id = st.assigned_user_id
  LEFT JOIN projects pr ON pr.id = t.project_id
  LEFT JOIN teams tm ON FIND_IN_SET(tm.id, u.team_id)
  LEFT JOIN users u_assigned ON u_assigned.id = t.assigned_user_id
  WHERE st.status = 2 AND st.deleted_at IS NULL ${subtaskWhereClause}
`;

    // Tasks Query (Add t.updated_at)
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
    t.user_id AS task_user_id,
    t.updated_at
  FROM tasks t
  LEFT JOIN users u ON u.id = t.user_id
  LEFT JOIN users ua ON ua.id = t.assigned_user_id
  LEFT JOIN projects pr ON pr.id = t.project_id
  LEFT JOIN teams tm ON FIND_IN_SET(tm.id, u.team_id)
  LEFT JOIN users u_assigned ON u_assigned.id = t.assigned_user_id
  WHERE t.deleted_at IS NULL AND t.status = 2 
    AND t.id NOT IN (SELECT task_id FROM sub_tasks WHERE deleted_at IS NULL)
    ${taskWhereClause}
`;

    // Execute queries
    const [subtasks] = await db.query(subtasksQuery, subtaskValues);
    const [tasks] = await db.query(tasksQuery, taskValues);

    // Merge and sort by updated_at
    const mergedResults = [...subtasks, ...tasks].sort(
      (a, b) => new Date(b.updated_at) - new Date(a.updated_at)
    );

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

exports.getRequestchange = async (_id, payload, res, req) => {
  let id = _id;
  let typeLocal = payload.type;
  const {
    remark,
    rating,
    action,
    import_status,
    employee_id,
    project_name,
    task_name,
    subtask_name,
  } = payload;

  if (import_status === "1") {
    if (!employee_id || !task_name || !project_name) {
      return errorResponse(res, null, "Missing required fields", 400);
    }

    const [projectRows] = await db.query(
      "SELECT id AS project_id FROM projects WHERE name = ? AND deleted_at IS NULL",
      [project_name]
    );

    if (projectRows.length === 0)
      return errorResponse(res, null, "Project not found", 404);
    const project_id = projectRows[0].project_id;

    const [userRows] = await db.query(
      "SELECT id AS user_id FROM users WHERE employee_id = ? AND deleted_at IS NULL",
      [employee_id]
    );
    if (userRows.length === 0)
      return errorResponse(res, null, "User not found", 404);
    const emp_user_id = userRows[0].user_id;

    if (!subtask_name) {
      typeLocal = "task";
      const [taskRows] = await db.query(
        `SELECT id AS task_id FROM tasks 
         WHERE name = ? AND user_id = ? AND deleted_at IS NULL AND project_id = ?`,
        [task_name, emp_user_id, project_id]
      );
      if (taskRows.length === 0)
        return errorResponse(res, null, "Task not found", 404);
      id = taskRows[0].task_id;
    } else {
      typeLocal = "subtask";
      const [subtaskRows] = await db.query(
        `SELECT id AS subtask_id FROM sub_tasks 
         WHERE name = ? AND user_id = ? AND deleted_at IS NULL AND project_id = ?`,
        [subtask_name, emp_user_id, project_id]
      );
      if (subtaskRows.length === 0)
        return errorResponse(res, null, "SubTask not found", 404);
      id = subtaskRows[0].subtask_id;
    }
    payload.type = typeLocal;
    payload.user_id = emp_user_id;
  }

  const accessToken = req.headers.authorization?.split(" ")[1];
  if (!accessToken) {
    return errorResponse(res, "Access token is required", 401);
  }
  const auth_user_id = await getUserIdFromAccessToken(accessToken);

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

  const [authUserRows] = await db.query(
    "SELECT id FROM users WHERE id = ? AND deleted_at IS NULL",
    [auth_user_id]
  );
  if (authUserRows.length === 0) {
    return errorResponse(res, null, "User Not Found", 400);
  }

  const validType = ["task", "subtask"];
  if (!validType.includes(typeLocal)) {
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
    const table = typeLocal === "task" ? "tasks" : "sub_tasks";

    const [oldDataRows] = await db.query(
      `SELECT * FROM ${table} WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
    if (oldDataRows.length === 0) {
      return errorResponse(
        res,
        null,
        `${
          typeLocal.charAt(0).toUpperCase() + typeLocal.slice(1)
        } not found or deleted`,
        404
      );
    }

    const oldData = oldDataRows[0];
    const userId = oldData.user_id;

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
    const values = [statusToSet, reopenstatusToSet, auth_user_id, updatedAt];

    if (remark !== undefined) {
      fieldsToUpdate.push("remark = ?");
      values.push(remark);
    }
    if (rating !== undefined) {
      fieldsToUpdate.push("rating = ?");
      values.push(rating);
    }

    values.push(id);

    const updateQuery = `
      UPDATE ${table}
      SET ${fieldsToUpdate.join(", ")}
      WHERE id = ? AND deleted_at IS NULL
    `;

    const [updateResult] = await db.query(updateQuery, values);
    // comments

    if (updateResult.affectedRows > 0) {
  const selectQuery = `
    SELECT id AS task_id, user_id, subtask_id
    FROM ${table}
    WHERE id = ? AND deleted_at IS NULL
    LIMIT 1
  `;
  const [rows] = await db.query(selectQuery, [values[values.length - 1]]);
  const updatedRecord = rows[0];

  // Extract values
  const task_Id = updatedRecord.task_id;
  const userId = updatedRecord.user_id;
  const subtask_Id = updatedRecord.subtask_id || null;

  // 3. Insert comment using these values
  const insertCommentQuery = `
    INSERT INTO task_comments (
      task_id, subtask_id, user_id, comments, html_content, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
  `;

  const [commentResult] = await db.query(insertCommentQuery, [
    task_Id,
    subtask_Id,
    userId,
    remark?.trim() || null,
     remark?.trim() || null,  
    auth_user_id       
  ]);
  const historyQuerys = `
      INSERT INTO task_histories (
        old_data, new_data, task_id, subtask_id, text,
        updated_by, status_flag, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NULL)
    `;
    const historyValuess = [
      NULL,
      remark,
      taskId,
      subtaskId,
      "Remarks added",
      auth_user_id,
      21,
    ];
    await db.query(historyQuerys, historyValuess);

  console.log(`✅ Comment inserted with ID: ${commentResult.insertId}`);
} else {
  console.log('⚠️ No rows updated, skipping comment insertion.');
}
    // comments

    if (updateResult.affectedRows === 0) {
      return errorResponse(
        res,
        null,
        `${
          typeLocal.charAt(0).toUpperCase() + typeLocal.slice(1)
        } not found or deleted`,
        404
      );
    }

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

    const taskId = typeLocal === "task" ? id : oldData.task_id;
    const subtaskId = typeLocal === "subtask" ? id : null;


    
    const historyQuery = `
      INSERT INTO task_histories (
        old_data, new_data, task_id, subtask_id, text,
        updated_by, status_flag, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NULL)
    `;
    const historyValues = [
      oldStatusLabel,
      newStatusLabel,
      taskId,
      subtaskId,
      "Change the status",
      auth_user_id,
      1,
    ];
    await db.query(historyQuery, historyValues);

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
      `${
        typeLocal.charAt(0).toUpperCase() + typeLocal.slice(1)
      } updated successfully`,
      200
    );
  } catch (error) {
    console.error("Error:", error.message);
    return errorResponse(res, error.message, "Server error", 500);
  }
};
