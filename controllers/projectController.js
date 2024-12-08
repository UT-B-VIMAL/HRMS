const db = require("../config/db");
const {
  successResponse,
  errorResponse,
} = require("../helpers/responseHelper");
const { projectSchema } = require("../validators/projectValidator");

exports.insert = async (req, res) => {
  const { name, product } = req.body;

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

  const created_by = 1; //  Replace with `req.user?.id` in production
  const updated_by = created_by;

  if (!created_by) {
    return errorResponse(
      res,
      "Authenticated user required",
      "Authentication Error",
      401
    );
  }

  try {
    // Check if a project with the same name already exists
    const checkQuery = "SELECT COUNT(*) as count FROM projects WHERE name = ?";
    const checkProduct =
      "SELECT COUNT(*) as count FROM products WHERE id = ? and delete_status=0";
    const [checkResult] = await db.query(checkQuery, [name]);
    const [checkProductResults] = await db
      
      .query(checkProduct, [product]);

    if (checkResult[0].count > 0) {
      return errorResponse(
        res,
        "Project with this name already exists",
        "Duplicate Project Error",
        400
      );
    }
    if (checkProductResults[0].count == 0) {
      return errorResponse(res, "Product Not Found", "Product Not Found", 404);
    }

    // Insert the new project
    const insertQuery =
      "INSERT INTO projects (name, product_id, created_by, updated_by) VALUES (?, ?, ?, ?)";
    const values = [name, product, created_by, updated_by];
    const [result] = await db.query(insertQuery, values);

    // Return a success response
    return successResponse(
      res,
      {
        id: result.insertId,
        name,
        product,
        created_by,
        updated_by,
      },
      "Project added successfully",
      200
    );
  } catch (error) {
    // Handle server errors
    return errorResponse(res, error.message, "Error inserting project", 500);
  }
};

exports.getAll = async (req, res) => {
  const { search, page = 1, size = 10 } = req.body;

  const pageNum = parseInt(page, 10);
  const pageSize = parseInt(size, 10);

  const offset = (pageNum - 1) * pageSize;

  let query = `
      SELECT 
        projects.*, 
        products.name as product_name
      FROM projects
      LEFT JOIN products ON projects.product_id = products.id
      WHERE projects.delete_status = 0
    `;

  let countQuery = `
      SELECT 
        COUNT(*) AS total 
      FROM projects
      LEFT JOIN products ON projects.product_id = products.id
      WHERE projects.delete_status = 0
    `;

  const queryParams = [];

  if (search && search.trim() !== "") {
    // Add search filter for both project name and product name
    query += ` AND (projects.name LIKE ? OR products.name LIKE ?)`;
    countQuery += ` AND (projects.name LIKE ? OR products.name LIKE ?)`;
    queryParams.push(`%${search.trim()}%`, `%${search.trim()}%`); // Add search term for both fields
  }

  query += " LIMIT ? OFFSET ?";
  queryParams.push(pageSize, offset);

  try {
    const [result] = await db.query(query, queryParams);

    // Execute the count query to get the total number of filtered records
    const [countResult] = await db.query(countQuery, queryParams);
    const totalItems = countResult[0].total;

    const totalPages = Math.ceil(totalItems / pageSize);

    return successResponse(
      res,
      {
        data: result,
        pagination: {
          page: pageNum,
          size: pageSize,
          totalItems,
          totalFilteredRecords: totalItems, // Add filtered records key
          totalPages,
        },
      },
      "Projects fetched successfully",
      200
    );
  } catch (error) {
    return errorResponse(res, error.message, "Error fetching Projects", 500);
  }
};

exports.find = async (req, res) => {
  const { id } = req.params;

  try {
    // Query to find the project by ID
    const query = "SELECT * FROM projects WHERE id = ? AND delete_status = 0";
    const [result] = await db.query(query, [id]);

    if (result.length === 0) {
      return errorResponse(res, "Project not found", "Not Found", 404);
    }

    return successResponse(res, result[0], "Project found successfully", 200);
  } catch (error) {
    return errorResponse(res, error.message, "Error fetching project", 500);
  }
};

exports.delete = async (req, res) => {
  const { id } = req.params;

  try {
    const checkQuery =
      "SELECT COUNT(*) as count FROM projects WHERE id = ? AND delete_status = 0";
    const [checkResult] = await db.query(checkQuery, [id]);

    if (checkResult[0].count === 0) {
      return errorResponse(res, "Project not found", "Not Found", 404);
    }

    const deleteQuery = "UPDATE projects SET delete_status = 1 WHERE id = ?";
    await db.query(deleteQuery, [id]);

    return successResponse(res, {}, "Project deleted successfully", 200);
  } catch (error) {
    return errorResponse(res, error.message, "Error deleting project", 500);
  }
};
exports.update = async (req, res) => {
  const { id } = req.params;
  const { name, product } = req.body;

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

  const updated_by = 1; // Replace with `req.user?.id` in production
  if (!updated_by) {
    return errorResponse(
      res,
      "Authenticated user required",
      "Authentication Error",
      401
    );
  }
  try {
    const checkQuery =
      "SELECT COUNT(*) as count FROM projects WHERE id = ? AND delete_status = 0";
    const [checkResult] = await db.query(checkQuery, [id]);

    if (checkResult[0].count === 0) {
      return errorResponse(res, "Project not found", "Not Found", 404);
    }

    const checkProduct =
      "SELECT COUNT(*) as count FROM products WHERE id = ? AND delete_status = 0";
    const [checkProductResults] = await db
      
      .query(checkProduct, [product]);

    if (checkProductResults[0].count === 0) {
      return errorResponse(res, "Product Not Found", "Product Not Found", 404);
    }

    const updateQuery =
      "UPDATE projects SET name = ?, product_id = ?, updated_by = ? WHERE id = ?";
    const values = [name, product, updated_by, id];
    await db.query(updateQuery, values);

    return successResponse(
      res,
      { id, name, product, updated_by },
      "Project updated successfully",
      200
    );
  } catch (error) {
    return errorResponse(res, error.message, "Error updating project", 500);
  }
};
