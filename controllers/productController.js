const db = require("../config/db");
const {
  successResponse,
  errorResponse,
} = require("../helpers/responseHelper");

exports.insert = async (req, res) => {
  const payload = req.body;
  const { name } = payload;

  if (!name) {
    return errorResponse(
      res,
      "Product name is required",
      "Validation Error",
      400
    );
  }

  //   const created_by = req.user?.id;
  const created_by = 1;
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
    const checkQuery = "SELECT COUNT(*) as count FROM products WHERE name = ?";
    const [checkResult] = await db.query(checkQuery, [name]);

    if (checkResult[0].count > 0) {
      return errorResponse(
        res,
        "Product with this name already exists",
        "Duplicate Product Error",
        400
      );
    }

    const query =
      "INSERT INTO products (name, created_by, updated_by) VALUES (?, ?, ?)";
    const values = [name, created_by, updated_by];
    const [result] = await db.query(query, values);

    // Return a success response
    return successResponse(
      res,
      {
        id: result.insertId,
        name,
        created_by,
        updated_by,
      },
      "Product added successfully",
      200
    );
  } catch (error) {
    return errorResponse(res, error.message, "Error inserting product", 500);
  }
};

exports.getAll = async (req, res) => {
  const { search, page = 1, size = 10 } = req.body; // Default page = 1, size = 10

  // Ensure page and size are numbers
  const pageNum = parseInt(page, 10);
  const pageSize = parseInt(size, 10);

  // Calculate the offset for pagination
  const offset = (pageNum - 1) * pageSize;

  // Base query to fetch products
  let query = "SELECT * FROM products WHERE delete_status = 0";
  let countQuery =
    "SELECT COUNT(*) AS total FROM products WHERE delete_status = 0";

  // Add search filter to the query only if the search parameter is provided
  const queryParams = [];

  if (search && search.trim() !== "") {
    // Ensure search is non-empty
    query += ` AND name LIKE ?`; // Search only in the 'name' field
    countQuery += ` AND name LIKE ?`; // Count query should also reflect the search filter
    queryParams.push(`%${search.trim()}%`); // Append the search term with wildcards
  }

  // Add pagination (LIMIT and OFFSET) to the query
  query += " LIMIT ? OFFSET ?";
  queryParams.push(pageSize, offset); // Add size and offset values as numbers

  try {
    // Execute the data query
    const [result] = await db.query(query, queryParams);

    // Execute the count query to get the total number of filtered records
    const [countResult] = await db.query(countQuery, queryParams);
    const totalItems = countResult[0].total;

    // Calculate total pages
    const totalPages = Math.ceil(totalItems / pageSize);

    // Return paginated data with search results and total filtered records
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
      "Products fetched successfully",
      200
    );
  } catch (error) {
    return errorResponse(res, error.message, "Error fetching products", 500);
  }
};

exports.find = async (req, res) => {
  const { id } = req.params;

  try {
    const query = "SELECT * FROM products WHERE id = ? AND delete_status = 0";
    const [result] = await db.query(query, [id]);

    if (result.length === 0) {
      return errorResponse(
        res,
        "Product not found or deleted",
        "Not Found",
        404
      );
    }

    return successResponse(res, result[0], "Product fetched successfully", 200);
  } catch (error) {
    return errorResponse(res, error.message, "Error fetching product", 500);
  }
};

exports.update = async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  if (!name) {
    return errorResponse(
      res,
      "Product name is required",
      "Validation Error",
      400
    );
  }
  const updated_by = 1;

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
      "SELECT COUNT(*) as count FROM products WHERE id = ? AND delete_status = 0";
    const [checkResult] = await db.query(checkQuery, [id]);

    if (checkResult[0].count === 0) {
      return errorResponse(
        res,
        "Product not found or deleted",
        "Not Found",
        404
      );
    }

    const query = "UPDATE products SET name = ?, updated_by = ? WHERE id = ?";
    // const values = [name, req.user?.id, id];
    const values = [name, updated_by, id];
    const [result] = await db.query(query, values);

    return successResponse(
      res,
      { id, name },
      "Product Updated successfully",
      200
    );
  } catch (error) {
    return errorResponse(res, error.message, "Error updating product", 500);
  }
};

exports.delete = async (req, res) => {
  const { id } = req.params;
  console.log(id);
  try {
    const checkQuery =
      "SELECT COUNT(*) as count FROM products WHERE id = ? AND delete_status = 0";
    const [checkResult] = await db.query(checkQuery, [id]);
    console.log(checkResult[0].count);

    const updated_by = 1;

    if (!updated_by) {
      return errorResponse(
        res,
        "Authenticated user required",
        "Authentication Error",
        401
      );
    }
    if (checkResult[0].count === 0) {
      return errorResponse(
        res,
        "Product not found or already deleted",
        "Not Found",
        404
      );
    }
    const checkReferencesQuery = `SELECT COUNT(*) as count FROM projects WHERE product_id = ?`;
    const [checkReferencesResult] = await db
      
      .query(checkReferencesQuery, [id]);

    if (checkReferencesResult[0].count > 0) {
      return errorResponse(
        res,
        `Product is referenced in the projects table and cannot be deleted`,
        "Reference Error",
        400
      );
    }
    const query =
      "UPDATE products SET delete_status = 1, updated_by = ? WHERE id = ?";
    //   const values = [req.user?.id, id];
    const values = [updated_by, id];
    const [result] = await db.query(query, values);
    return successResponse(res, { id }, "Product deleted successfully", 200);
  } catch (error) {
    return errorResponse(res, error.message, "Error deleting product", 500);
  }
};
