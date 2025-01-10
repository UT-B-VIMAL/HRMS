const moment = require("moment");
const db = require("../../config/db");
const {
  successResponse,
  errorResponse,
  getPagination
} = require("../../helpers/responseHelper");
const { projectSchema } = require("../../validators/projectValidator");
const { getAuthUserDetails } = require("./commonFunction");


// Create Project
exports.createProject = async (payload, res) => {
    const { name, product,user_id } = payload;

  const { error } = projectSchema.validate(
    { name, product,user_id },
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
    const checkQuery = "SELECT COUNT(*) as count FROM projects WHERE name = ?";
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
  
    const query = "INSERT INTO projects (name, product_id, created_by, updated_by) VALUES (?, ?, ?, ?)";
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
    const { name, product,user_id } =payload;

  const { error } = projectSchema.validate(
    { name, product ,user_id},
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
    const checkProjectQuery = "SELECT COUNT(*) as count FROM projects WHERE name = ? AND id != ? AND deleted_at IS NULL";
    const [checkProject] = await db.query(checkProjectQuery, [name, id]);
    if (checkProject[0].count > 0) {
      return errorResponse(res, "Project with this name already exists", "Duplicate Project Error", 400);
    }
    const query = "UPDATE projects SET name = ?, product_id = ?, updated_by = ? WHERE id = ?";
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
// exports.projectStatus = async (req, res) => {
//   try {
//     const {
//       product_id,
//       project_id,
//       user_id,
//       date,
//       status = 0,
//       search,
//     } = req.query;

//     let query = `
//         SELECT 
//           t.id AS task_id,
//           t.name AS task_name,
//           t.estimated_hours AS task_estimated_hours,
//           t.total_hours_worked AS task_total_hours_worked,
//           t.updated_at AS task_updated_at,
//           tsut.start_time AS task_start_time,
//           tsut.end_time AS task_end_time,
//           u.id AS user_id,
//           u.first_name AS user_name,
//           u.employee_id AS employee_id,
//           p.id AS product_id,
//           p.name AS product_name,
//           pr.id AS project_id,
//           pr.name AS project_name,
//           st.id AS subtask_id,
//           st.name AS subtask_name,
//           st.estimated_hours AS subtask_estimated_hours,
//           st.total_hours_worked AS subtask_total_hours_worked,
//           st.updated_at AS subtask_updated_at,
//           tsut_sub.start_time AS subtask_start_time,
//           tsut_sub.end_time AS subtask_end_time,
//           DATE(t.created_at) AS task_date,
//           t.status AS task_status
//         FROM 
//           tasks t
//         LEFT JOIN 
//           users u ON u.id = t.user_id
//         LEFT JOIN 
//           products p ON p.id = t.product_id
//         LEFT JOIN 
//           projects pr ON pr.id = t.project_id
//         LEFT JOIN 
//           sub_tasks st ON st.task_id = t.id AND st.deleted_at IS NULL
//         LEFT JOIN 
//           sub_tasks_user_timeline tsut ON tsut.task_id = t.id AND tsut.deleted_at IS NULL
//         LEFT JOIN 
//           sub_tasks_user_timeline tsut_sub ON tsut_sub.subtask_id = st.id AND tsut_sub.deleted_at IS NULL
//         WHERE 
//           t.deleted_at IS NULL
//           ${product_id ? `AND (t.product_id = ? OR st.product_id = ?)` : ""}  
//           ${project_id ? `AND (t.project_id = ? OR st.project_id = ?)` : ""}  
//           ${user_id ? `AND t.user_id = ?` : ""}  
//           ${date ? `AND DATE(t.created_at) = ?` : ""}
//           ${status !== undefined ? `AND t.status = ?` : ""}  
//           ${search ? `AND (t.name LIKE ? OR st.name LIKE ?)` : ""}  
//       `;

//     const values = [];
//     if (product_id) {
//       values.push(product_id);
//       values.push(product_id);
//     }
//     if (project_id) {
//       values.push(project_id);
//       values.push(project_id);
//     }
//     if (user_id) values.push(user_id);
//     if (date) values.push(date);
//     if (status !== undefined) values.push(status);
//     if (search) {
//       const searchTerm = `%${search}%`;
//       values.push(searchTerm);
//       values.push(searchTerm);
//     }

//     const [result] = await db.execute(query, values);

//     const data = result.map((row) => {
//       const taskStartTime = row.task_start_time
//         ? moment(row.task_start_time).format("YYYY-MM-DD HH:mm:ss")
//         : "Not started";
//       const taskEndTime = row.task_end_time
//         ? moment(row.task_end_time).format("YYYY-MM-DD HH:mm:ss")
//         : "Not completed";

//       const subtaskStartTime = row.subtask_start_time
//         ? moment(row.subtask_start_time).format("YYYY-MM-DD HH:mm:ss")
//         : "Not started";
//       const subtaskEndTime = row.subtask_end_time
//         ? moment(row.subtask_end_time).format("YYYY-MM-DD HH:mm:ss")
//         : "Not completed";

//       return {
//         task_name: row.task_name || row.subtask_name,
//         task_start_time: taskStartTime,
//         task_end_time: taskEndTime,
//         subtask_start_time: subtaskStartTime,
//         subtask_end_time: subtaskEndTime,
//         estimated_time: row.task_estimated_hours || row.subtask_estimated_hours,
//         task_duration: row.task_updated_at
//           ? moment(row.task_updated_at).fromNow()
//           : "Not started",
//         user_id: row.user_id,
//         employee_id: row.employee_id,
//         assignee: row.user_name,
//         product_id: row.product_id,
//         product_name: row.product_name,
//         project_id: row.project_id,
//         project_name: row.project_name,
//         task_date: moment(row.task_date).format("YYYY-MM-DD"),
//         task_status:
//           row.task_status === 0
//             ? "TO DO"
//             : row.task_status === 1
//             ? "In Progress"
//             : "Done",
//       };
//     });

//     successResponse(
//       res,
//       data,
//       data.length === 0
//         ? "No tasks or subtasks found"
//         : "Tasks and subtasks retrieved successfully",
//       200
//     );
//   } catch (error) {
//     console.error("Error fetching tasks and subtasks:", error);
//     return errorResponse(res, error.message, "Server error", 500);
//   }
// };

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
    
    if (status === '0') {
      taskConditions.push("t.status = 0");
      taskConditions.push("t.active_status = 0");
      taskConditions.push("t.reopen_status = 0");
      subtaskConditions.push("st.status = 0");
      subtaskConditions.push("st.active_status = 0");
      subtaskConditions.push("st.reopen_status = 0");
    } else if (status === '1') {
      taskConditions.push("t.status = 1");
      taskConditions.push("t.active_status = 1");
      taskConditions.push("t.reopen_status = 0");
      subtaskConditions.push("st.status = 1");
      subtaskConditions.push("st.active_status = 1");
      subtaskConditions.push("st.reopen_status = 0");
    } else if (status === '3') {
      taskConditions.push("t.status = 3");
      subtaskConditions.push("st.status = 3");
    }
    if (search) {
      const searchTerm = `%${search}%`;
      taskConditions.push(
        `(t.name LIKE ? OR p.name LIKE ? OR pr.name LIKE ? OR CONCAT(u.first_name, ' ', u.last_name) LIKE ? OR t.created_at LIKE ?)`
      );
      taskValues.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);

      subtaskConditions.push(
        `(st.name LIKE ? OR p.name LIKE ? OR pr.name LIKE ? OR CONCAT(u.first_name, ' ', u.last_name) LIKE ? OR st.created_at LIKE ?)`
      );
      subtaskValues.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    const taskWhereClause = taskConditions.length > 0 ? `AND ${taskConditions.join(" AND ")}` : "";
    const subtaskWhereClause = subtaskConditions.length > 0 ? `AND ${subtaskConditions.join(" AND ")}` : "";

    const tasksQuery = `
      SELECT 
        t.id AS task_id,
        t.name AS task_name,
        t.estimated_hours AS estimated_time,
        t.total_hours_worked AS task_duration,
        stut.start_time AS start_time,
        stut.end_time AS end_time,
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
        stut.start_time AS start_time,
        stut.end_time AS end_time,
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

    const Subtasks = subtasks.map((subtask) => ({
      type: "SubTask",
      status: mapStatus(subtask.subtask_status),
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
      time_taken: subtask.time_taken,
      rating: subtask.subtask_rating,
      team_id: subtask.team_id,
      team_name: subtask.team_name,
      start_time: subtask.start_time,
      end_time: subtask.end_time,
      subtask_duration: subtask.subtask_duration,
    }));

    const Tasks = tasks.map((task) => ({
      type: "Task",
      status: mapStatus(task.task_status),
      date: task.date,
      product_name: task.product_name,
      project_name: task.project_name,
      task_id: task.task_id,
      task_name: task.task_name,
      subtask_name: null,
      user_id: task.user_id,
      assignee: task.assignee,
      estimated_time: task.estimated_time,
      task_duration: task.task_duration,
      rating: task.rating,
      team_id: task.team_id,
      team_name: task.team_name,
      start_time: task.start_time,
      end_time: task.end_time,
      task_duration: task.task_duration,
    }));

    const groupedTasks = [...Subtasks, ...Tasks];

    const totalRecords = groupedTasks.length;
    const paginatedData = groupedTasks.slice(offset, offset + parseInt(perPage));
    const pagination = getPagination(page, perPage, totalRecords);
    
    const data = paginatedData.map((row, index) => ({
      s_no: offset + index + 1,
      ...row,
    }));
    
    // Now wrap the tasks and pagination inside 'data'

      successResponse(
        res,
        data,
        data.length === 0 ? 'No data found' : 'Tasks and subtasks retrieved successfully',
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
    const { project_id, user_id, date, search, page = 1, perPage = 10 } = req.query;
    const offset = (page - 1) * perPage;

    const taskConditions = [];
    const taskValues = [];

    const subtaskConditions = [];
    const subtaskValues = [];

    // Task-specific filters
    if (project_id) {
      taskConditions.push("t.project_id = ?");
      taskValues.push(project_id);
    }
    if (user_id) {
      taskConditions.push("t.user_id = ?");
      taskValues.push(user_id);
    }
    if (date) {
      taskConditions.push("DATE(t.created_at) = ?");
      taskValues.push(date);
    }
    if (search) {
      const searchTerm = `%${search}%`;
      taskConditions.push(
        `(t.name LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR pr.name LIKE ? OR tm.name LIKE ?)`
      );
      taskValues.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Subtask-specific filters
    if (project_id) {
      subtaskConditions.push("st.project_id = ?");
      subtaskValues.push(project_id);
    }
    if (user_id) {
      subtaskConditions.push("st.user_id = ?");
      subtaskValues.push(user_id);
    }
    if (date) {
      subtaskConditions.push("DATE(st.created_at) = ?");
      subtaskValues.push(date);
    }
    if (search) {
      const searchTerm = `%${search}%`;
      subtaskConditions.push(
        `(st.name LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR pr.name LIKE ? OR tm.name LIKE ?)`
      );
      subtaskValues.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    const taskWhereClause =
      taskConditions.length > 0 ? `AND ${taskConditions.join(" AND ")}` : "";
    const subtaskWhereClause =
      subtaskConditions.length > 0 ? `AND ${subtaskConditions.join(" AND ")}` : "";

    // Query to fetch subtasks with status = 2
    const subtasksQuery = `
      SELECT 
        pr.name AS project_name,
        st.name AS name,
        tm.name AS team_name,
        DATE_FORMAT(st.created_at, '%Y-%m-%d') AS date,
        r_assigned.name AS assigned_by_designation,
        'Subtask' AS type,
        t.id AS task_id,
        st.id AS subtask_id,
        st.user_id AS subtask_user_id
      FROM 
        sub_tasks st
      LEFT JOIN 
        tasks t ON t.id = st.task_id
      LEFT JOIN 
        users u ON u.id = st.user_id
      LEFT JOIN 
        projects pr ON pr.id = t.project_id
      LEFT JOIN 
        teams tm ON tm.id = u.team_id
      LEFT JOIN 
        users u_assigned ON u_assigned.id = t.assigned_user_id
      LEFT JOIN 
        roles r_assigned ON r_assigned.id = u_assigned.role_id
      WHERE 
        st.status = 2
        AND st.deleted_at IS NULL
        ${subtaskWhereClause}
        ORDER BY 
        st.id
    `;

    // Query to fetch tasks without subtasks
    const tasksQuery = `
      SELECT 
        pr.name AS project_name,
        t.name AS name,
        tm.name AS team_name,
        DATE_FORMAT(t.created_at, '%Y-%m-%d') AS date,
        r_assigned.name AS assigned_by_designation,
        'Task' AS type,
        t.id AS task_id,
        NULL AS subtask_id,
        t.user_id AS task_user_id
      FROM 
        tasks t
      LEFT JOIN 
        users u ON u.id = t.user_id
      LEFT JOIN 
        projects pr ON pr.id = t.project_id
      LEFT JOIN 
        teams tm ON tm.id = u.team_id
      LEFT JOIN 
        users u_assigned ON u_assigned.id = t.assigned_user_id
      LEFT JOIN 
        roles r_assigned ON r_assigned.id = u_assigned.role_id
      WHERE 
        t.deleted_at IS NULL
        AND t.status = 2
        AND t.id NOT IN (SELECT task_id FROM sub_tasks WHERE deleted_at IS NULL)
        ${taskWhereClause}
        ORDER BY 
        t.id
    `;

    // Execute both queries
    const [subtasks] = await db.query(subtasksQuery, subtaskValues);
    const [tasks] = await db.query(tasksQuery, taskValues);

    // Combine the results
    const mergedResults = [...subtasks, ...tasks];

    // Fetch assignee names and remove user_id
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

    // Pagination logic
    const totalRecords = processedData.length;
    const paginatedData = processedData.slice(offset, offset + parseInt(perPage));
    const pagination = getPagination(page, perPage, totalRecords);

    // Add serial numbers to the paginated data
    const data = paginatedData.map((row, index) => ({
      s_no: offset + index + 1,
      ...row,
    }));

    successResponse(
      res,
      data,
      data.length === 0 ? "No tasks or subtasks found" : "Tasks and subtasks retrieved successfully",
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



exports.getRequestchange = async (id, payload, res) => {
  const { user_id, type, remark, rating, action } = payload;

  const requiredFields = [
    { key: 'type', message: 'Type is required' },
    { key: 'action', message: 'Action is required' },
    { key: 'user_id', message: 'User ID is required' },
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

  const validType = ['task', 'subtask'];
  if (!validType.includes(type)) {
    return errorResponse(res, null, 'Invalid type. It should be either task or subtask.', 400);
  }

  const validActions = ['reopen', 'close'];
  if (!validActions.includes(action)) {
    return errorResponse(res, null, 'Invalid action. It should be either reopen or close.', 400);
  }

  try {
    // Validate if the task or subtask exists
    const table = type === 'task' ? 'tasks' : 'sub_tasks';
    const [idRows] = await db.query(
      `SELECT id FROM ${table} WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );

    if (idRows.length === 0) {
      return errorResponse(
        res,
        null,
        `${type.charAt(0).toUpperCase() + type.slice(1)} not found or deleted`,
        404
      );
    }

    // Determine status values based on action
    let statusToSet, reopenstatusToSet;

    if (action === 'reopen') {
      statusToSet = 0;
      reopenstatusToSet = 1;
    } else if (action === 'close') {
      statusToSet = 3;
      reopenstatusToSet = 0;
    }

    // Prepare fields and values for update
    const fieldsToUpdate = ['status = ?', 'reopen_status = ?', 'updated_by = ?', 'updated_at = ?'];
    const updatedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const values = [statusToSet, reopenstatusToSet, user_id, updatedAt];

    if (remark !== undefined) {
      fieldsToUpdate.push('remark = ?');
      values.push(remark);
    }

    if (rating !== undefined) {
      fieldsToUpdate.push('rating = ?');
      values.push(rating);
    }

    // Construct and execute the update query
    const updateQuery = `
      UPDATE ${table}
      SET ${fieldsToUpdate.join(', ')}
      WHERE id = ? AND deleted_at IS NULL
    `;
    values.push(id);

    const [updateResult] = await db.query(updateQuery, values);

    if (updateResult.affectedRows === 0) {
      return errorResponse(
        res,
        null,
        `${type.charAt(0).toUpperCase() + type.slice(1)} not found or deleted`,
        404
      );
    }

    // Return success response
    return successResponse(
      res,
      { id },
      `Project request for ${type.charAt(0).toUpperCase() + type.slice(1)} updated successfully`,
      200
    );
  } catch (error) {
    console.error('Error updating task or subtask:', error.message);
    return errorResponse(res, error.message, 'Error updating task or subtask', 500);
  }
};





