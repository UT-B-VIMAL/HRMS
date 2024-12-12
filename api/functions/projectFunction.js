const moment = require("moment");
const db = require("../../config/db");
const {
  successResponse,
  errorResponse,
} = require("../../helpers/responseHelper");
const {projectSchema}=require("../../validators/projectValidator")


const getPagination = (page, perPage, totalRecords) => {
    page = parseInt(page, 10);
    const totalPages = Math.ceil(totalRecords / perPage);
    const nextPage = page < totalPages ? page + 1 : null;
    const prevPage = page > 1 ? page - 1 : null;
  
    // Calculate range
    const startRecord = (page - 1) * perPage + 1;
    const endRecord = Math.min(page * perPage, totalRecords); // Ensure it doesn't exceed total records
  
    return {
      total_records: totalRecords,
      total_pages: totalPages,
      current_page: page,
      per_page: perPage,
      range_from: `Showing ${startRecord}-${endRecord} of ${totalRecords} entries`,
      next_page: nextPage,
      prev_page: prevPage,
    };
  };
  
// Create Project
exports.createProject = async (payload, res) => {
    const { name, product } = payload;

  const { error } = projectSchema.validate(
    { name, product },
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

    const checkQuery = "SELECT COUNT(*) as count FROM projects WHERE name = ?";
    const [checkResult] = await db.query(checkQuery, [name]);

    if (checkResult[0].count > 0) {
      return errorResponse(res, "Project with this name already exists", "Duplicate Project Error", 400);
    }
    const checkProduct =
    "SELECT COUNT(*) as count FROM products WHERE id = ? and deleted_at IS NULL";
    const [checkProductResults] = await db.query(checkProduct, [product]);
    if (checkProductResults[0].count == 0) {
        return errorResponse(res, "Product Not Found", "Product Not Found", 404);
      }
  
    const created_by =1;
    const updated_by =created_by;
    const query = "INSERT INTO projects (name, product_id, created_by, updated_by) VALUES (?, ?, ?, ?)";
    const values = [name, product, created_by, updated_by];
    const [result] = await db.query(query, values);

    return successResponse(res, { id: result.insertId, name }, 'Project added successfully', 201);
  } catch (error) {
    console.error('Error inserting project:', error.message);
    return errorResponse(res, error.message, 'Error inserting project', 500);
  }
};

// Update Project
exports.updateProject = async (id, payload, res) => {
    const { name, product } =payload;

  const { error } = projectSchema.validate(
    { name, product },
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
    const checkQuery = "SELECT COUNT(*) as count FROM projects WHERE id = ? AND deleted_at IS NULL";
    const [checkResult] = await db.query(checkQuery, [id]);

    if (checkResult[0].count === 0) {
      return errorResponse(res, "Project not found or deleted", "Not Found", 404);
    }
    const checkProduct =
    "SELECT COUNT(*) as count FROM products WHERE id = ? and deleted_at IS NULL";
    const [checkProductResults] = await db.query(checkProduct, [product]);
    if (checkProductResults[0].count == 0) {
        return errorResponse(res, "Product Not Found", "Product Not Found", 404);
      }
    const updated_by=1;
    const query = "UPDATE projects SET name = ?, product_id = ?, updated_by = ? WHERE id = ?";
    const values = [name, product, updated_by, id];
    await db.query(query, values);

    return successResponse(res, { id, name }, 'Project updated successfully', 200);
  } catch (error) {
    console.error('Error updating project:', error.message);
    return errorResponse(res, error.message, 'Error updating project', 500);
  }
};

// Delete Project
exports.deleteProject = async (id, res) => {
  try {
    const checkQuery = "SELECT COUNT(*) as count FROM projects WHERE id = ? AND deleted_at IS NULL";
    const [checkResult] = await db.query(checkQuery, [id]);

    if (checkResult[0].count === 0) {
      return errorResponse(res, "Project not found or already deleted", "Not Found", 404);
    }
    const checkReferencesQuery = `SELECT COUNT(*) as count FROM tasks WHERE project_id = ?`;
    const [checkReferencesResult] = await db
      
      .query(checkReferencesQuery, [id]);

    if (checkReferencesResult[0].count > 0) {
      return errorResponse(
        res,
        `Project is referenced in the User table and cannot be deleted`,
        "Reference Error",
        400
      );
    }
    const query = "UPDATE projects SET deleted_at = NOW() WHERE id = ?";
    await db.query(query, [id]);

    return successResponse(res, { id }, 'Project deleted successfully', 200);
  } catch (error) {
    console.error('Error deleting project:', error.message);
    return errorResponse(res, error.message, 'Error deleting project', 500);
  }
};

// Get Single Project
exports.getProject = async (id, res) => {
  try {
    const query = "SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL";
    const [result] = await db.query(query, [id]);

    if (result.length === 0) {
      return errorResponse(res, "Project not found or deleted", "Not Found", 404);
    }

    return successResponse(res, result[0], 'Project fetched successfully', 200);
  } catch (error) {
    console.error('Error fetching project:', error.message);
    return errorResponse(res, error.message, 'Error fetching project', 500);
  }
};

// Get All Projects
exports.getAllProjects = async (queryParams, res) => {
  const { search, page , perPage = 10 } = queryParams;

  let query = `SELECT 
        projects.*, 
        products.name as product_name
      FROM projects
      LEFT JOIN products ON projects.product_id = products.id
      WHERE projects.deleted_at IS NULL
    `;
  let countQuery =  `
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
    query += " ORDER BY `created_at` DESC LIMIT ? OFFSET ?";
    queryParamsArray.push(parseInt(perPage, 10), offset);
  } else {
    query += " ORDER BY `created_at` DESC"; // Default sorting
  }

  try {
    const [rows] = await db.query(query, queryParamsArray);
    const [countResult] = await db.query(countQuery, queryParamsArray);
    const totalRecords = countResult[0].total;
    const rowsWithSerialNo = rows.map((row, index) => ({
        s_no: page && perPage ? (parseInt(page, 10) - 1) * parseInt(perPage, 10) + index + 1 : index + 1,
        ...row,
    }));
  
    const pagination = page && perPage ? getPagination(page, perPage, totalRecords) : null;

    return successResponse(res, rowsWithSerialNo, rowsWithSerialNo.length === 0 ? 'No projects found' : 'Projects fetched successfully', 200, pagination);
  } catch (error) {
    console.error('Error fetching all projects:', error.message);
    return errorResponse(res, error.message, 'Error fetching all projects', 500);
  }
};


exports.projectRequest = async (req, res) => {
    try {
      const { product_id, project_id, user_id, date, status = 0, search } = req.query;
  
      let query = `
        SELECT 
          t.id AS task_id,
          t.name AS task_name,
          t.estimated_hours AS task_estimated_hours,
          t.total_hours_worked AS task_total_hours_worked,
          t.updated_at AS task_updated_at,
          tsut.start_time AS task_start_time,
          tsut.end_time AS task_end_time,
          u.id AS user_id,
          u.first_name AS user_name,
          u.employee_id AS employee_id,
          p.id AS product_id,
          p.name AS product_name,
          pr.id AS project_id,
          pr.name AS project_name,
          st.id AS subtask_id,
          st.name AS subtask_name,
          st.estimated_hours AS subtask_estimated_hours,
          st.total_hours_worked AS subtask_total_hours_worked,
          st.updated_at AS subtask_updated_at,
          tsut_sub.start_time AS subtask_start_time,
          tsut_sub.end_time AS subtask_end_time,
          DATE(t.created_at) AS task_date,
          t.status AS task_status
        FROM 
          tasks t
        LEFT JOIN 
          users u ON u.id = t.user_id
        LEFT JOIN 
          products p ON p.id = t.product_id
        LEFT JOIN 
          projects pr ON pr.id = t.project_id
        LEFT JOIN 
          sub_tasks st ON st.task_id = t.id AND st.deleted_at IS NULL
        LEFT JOIN 
          sub_tasks_user_timeline tsut ON tsut.task_id = t.id AND tsut.deleted_at IS NULL
        LEFT JOIN 
          sub_tasks_user_timeline tsut_sub ON tsut_sub.subtask_id = st.id AND tsut_sub.deleted_at IS NULL
        WHERE 
          t.deleted_at IS NULL
          ${product_id ? `AND (t.product_id = ? OR st.product_id = ?)` : ""}  
          ${project_id ? `AND (t.project_id = ? OR st.project_id = ?)` : ""}  
          ${user_id ? `AND t.user_id = ?` : ""}  
          ${date ? `AND DATE(t.created_at) = ?` : ""}
          ${status !== undefined ? `AND t.status = ?` : ""}  
          ${search ? `AND (t.name LIKE ? OR st.name LIKE ?)` : ""}  
      `;
  
      const values = [];
      if (product_id) {
        values.push(product_id);  
        values.push(product_id); 
      }
      if (project_id) {
        values.push(project_id);  
        values.push(project_id); 
      }
      if (user_id) values.push(user_id);  
      if (date) values.push(date);
      if (status !== undefined) values.push(status);
      if (search) {
        const searchTerm = `%${search}%`; 
        values.push(searchTerm);  
        values.push(searchTerm);  
      }
  
      const [result] = await db.execute(query, values);
  
      const data = result.map((row) => {
        const taskStartTime = row.task_start_time ? moment(row.task_start_time).format("YYYY-MM-DD HH:mm:ss") : "Not started";
        const taskEndTime = row.task_end_time ? moment(row.task_end_time).format("YYYY-MM-DD HH:mm:ss") : "Not completed";
        
        const subtaskStartTime = row.subtask_start_time ? moment(row.subtask_start_time).format("YYYY-MM-DD HH:mm:ss") : "Not started";
        const subtaskEndTime = row.subtask_end_time ? moment(row.subtask_end_time).format("YYYY-MM-DD HH:mm:ss") : "Not completed";
  
        return {
          task_name: row.task_name || row.subtask_name,  
          task_start_time: taskStartTime,
          task_end_time: taskEndTime,
          subtask_start_time: subtaskStartTime,
          subtask_end_time: subtaskEndTime,
          estimated_time: row.task_estimated_hours || row.subtask_estimated_hours,
          task_duration: row.task_updated_at ? moment(row.task_updated_at).fromNow() : "Not started",
          user_id: row.user_id,
          employee_id: row.employee_id,
          assignee: row.user_name,
          product_id: row.product_id,
          product_name: row.product_name,
          project_id: row.project_id,
          project_name: row.project_name,
          task_date: moment(row.task_date).format("YYYY-MM-DD"),
          task_status: row.task_status === 0 ? 'TO DO' : row.task_status === 1 ? 'In Progress' : 'Done',
        };
      });
  
      successResponse(
        res,
        data,
        data.length === 0 ? "No tasks or subtasks found" : "Tasks and subtasks retrieved successfully",
        200
      );
    } catch (error) {
      console.error("Error fetching tasks and subtasks:", error);
      return errorResponse(res, error.message, "Server error", 500);
    }
  };
   
