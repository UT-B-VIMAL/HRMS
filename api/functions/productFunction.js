const db = require('../../config/db');
const { successResponse, errorResponse } = require('../../helpers/responseHelper');
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
// Create Product
exports.createProduct = async (payload, res) => {
    const { name } = payload;
    if (!name) {
      return errorResponse(res,"Product name is required","Validation Error",400
      );
    }
  try {
    const checkQuery = "SELECT COUNT(*) as count FROM products WHERE name = ?";
    const [checkResult] = await db.query(checkQuery, [name]);

    if (checkResult[0].count > 0) {
      return errorResponse(res, "Product with this name already exists", "Duplicate Product Error", 400);
    }
    const created_by =1;
    const updated_by =created_by;
    const query = "INSERT INTO products (name, created_by, updated_by) VALUES (?, ?, ?)";
    const values = [name, created_by, updated_by];
    const [result] = await db.query(query, values);

    return successResponse(res, { id: result.insertId, name }, 'Product added successfully', 201);
  } catch (error) {
    console.error('Error inserting product:', error.message);
    return errorResponse(res, error.message, 'Error inserting product', 500);
  }
};

// Update Product
exports.updateProduct = async (id, payload, res) => {

  const { name } = payload;
  if (!name) {
    return errorResponse(res,"Product name is required","Validation Error",400
    );
  }
  try {
    const checkQuery = "SELECT COUNT(*) as count FROM products WHERE id = ? AND delete_status = 0";
    const [checkResult] = await db.query(checkQuery, [id]);

    if (checkResult[0].count === 0) {
      return errorResponse(res, "Product not found or deleted", "Not Found", 404);
    }
    const updated_by=1;
    const query = "UPDATE products SET name = ?, updated_by = ? WHERE id = ?";
    const values = [name, updated_by, id];
    await db.query(query, values);

    return successResponse(res, { id, name }, 'Product updated successfully', 200);
  } catch (error) {
    console.error('Error updating product:', error.message);
    return errorResponse(res, error.message, 'Error updating product', 500);
  }
};

// Delete Product
exports.deleteProduct = async (id, res) => {
  try {
    const checkQuery = "SELECT COUNT(*) as count FROM products WHERE id = ? AND delete_status = 0";
    const [checkResult] = await db.query(checkQuery, [id]);

    if (checkResult[0].count === 0) {
      return errorResponse(res, "Product not found or already deleted", "Not Found", 404);
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
    const query = "UPDATE products SET delete_status = 1 WHERE id = ?";
    await db.query(query, [id]);

    return successResponse(res, { id }, 'Product deleted successfully', 200);
  } catch (error) {
    console.error('Error deleting product:', error.message);
    return errorResponse(res, error.message, 'Error deleting product', 500);
  }
};

// Get Single Product
exports.getProduct = async (id, res) => {
  try {
    const query = "SELECT * FROM products WHERE id = ? AND delete_status = 0";
    const [result] = await db.query(query, [id]);

    if (result.length === 0) {
      return errorResponse(res, "Product not found or deleted", "Not Found", 404);
    }

    return successResponse(res, result[0], 'Product fetched successfully', 200);
  } catch (error) {
    console.error('Error fetching product:', error.message);
    return errorResponse(res, error.message, 'Error fetching product', 500);
  }
};

// Get All Products
exports.getAllProducts = async (queryParams, res) => {
  const { search, page = 1, perPage = 10 } = queryParams;
  const offset = (page - 1) * perPage;

  let query = "SELECT * FROM products WHERE delete_status = 0";
  let countQuery = "SELECT COUNT(*) AS total FROM products WHERE delete_status = 0";
  const queryParamsArray = [];

  if (search && search.trim() !== "") {
    query += " AND name LIKE ?";
    countQuery += " AND name LIKE ?";
    queryParamsArray.push(`%${search.trim()}%`);
  }

  query += " LIMIT ? OFFSET ?";
  queryParamsArray.push(parseInt(perPage, 10), parseInt(offset, 10));

  try {
    const [rows] = await db.query(query, queryParamsArray);
    const [countResult] = await db.query(countQuery, queryParamsArray);
    const totalRecords = countResult[0].total;
    const rowsWithSerialNo = rows.map((row, index) => ({
        s_no: offset + index + 1, // Calculate the serial number
        ...row,
      }));
    const pagination = getPagination(page, perPage, totalRecords);

    return successResponse(res, rowsWithSerialNo, rowsWithSerialNo.length === 0 ? 'No products found' : 'Products fetched successfully', 200, pagination);
  } catch (error) {
    console.error('Error fetching all products:', error.message);
    return errorResponse(res, error.message, 'Error fetching all products', 500);
  }
};
