const db = require('../../config/db');
const { successResponse, errorResponse } = require('../../helpers/responseHelper');
const {projectSchema}= require('../../validators/projectValidator')
// const getPagination = require('../../helpers/paginationHelper');
const getPagination = (page, perPage, totalRecords) => {
    page = parseInt(page, 10);
    const totalPages = Math.ceil(totalRecords / perPage);
    const nextPage = page < totalPages ? page + 1 : null
    const prevPage = page > 1 ? page - 1 : null;
  
    return {
        total_records: totalRecords,
        total_pages: totalPages,
        current_page: page,
        per_page: perPage,
        range_from: `Showing ${(page - 1) * perPage + 1}-${page * perPage} of ${totalRecords} entries`,
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
    "SELECT COUNT(*) as count FROM products WHERE id = ? and delete_status=0";
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
    const checkQuery = "SELECT COUNT(*) as count FROM projects WHERE id = ? AND delete_status = 0";
    const [checkResult] = await db.query(checkQuery, [id]);

    if (checkResult[0].count === 0) {
      return errorResponse(res, "Project not found or deleted", "Not Found", 404);
    }
    const checkProduct =
    "SELECT COUNT(*) as count FROM products WHERE id = ? and delete_status=0";
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
    const checkQuery = "SELECT COUNT(*) as count FROM projects WHERE id = ? AND delete_status = 0";
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
    const query = "UPDATE projects SET delete_status = 1 WHERE id = ?";
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
    const query = "SELECT * FROM projects WHERE id = ? AND delete_status = 0";
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
  const { search, page = 1, size = 10 } = queryParams;
  const offset = (page - 1) * size;

  let query = `SELECT 
        projects.*, 
        products.name as product_name
      FROM projects
      LEFT JOIN products ON projects.product_id = products.id
      WHERE projects.delete_status = 0
    `;
  let countQuery =  `
  SELECT 
    COUNT(*) AS total 
  FROM projects
  LEFT JOIN products ON projects.product_id = products.id
  WHERE projects.delete_status = 0
`;
  const queryParamsArray = [];
  if (search && search.trim() !== "") {
    query += ` AND (projects.name LIKE ? OR products.name LIKE ?)`;
    countQuery += ` AND (projects.name LIKE ? OR products.name LIKE ?)`;
    queryParamsArray.push(`%${search.trim()}%`, `%${search.trim()}%`); // Add search term for both fields
  }
  query += " LIMIT ? OFFSET ?";
  queryParamsArray.push(parseInt(size, 10), parseInt(offset, 10));

  try {
    const [rows] = await db.query(query, queryParamsArray);
    const [countResult] = await db.query(countQuery, queryParamsArray);
    const totalRecords = countResult[0].total;

    const pagination = getPagination(page, size, totalRecords);

    return successResponse(res, rows, rows.length === 0 ? 'No projects found' : 'Projects fetched successfully', 200, pagination);
  } catch (error) {
    console.error('Error fetching all projects:', error.message);
    return errorResponse(res, error.message, 'Error fetching all projects', 500);
  }
};
