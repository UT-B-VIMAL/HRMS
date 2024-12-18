const Joi = require('joi');
const db = require('../../config/db');
const { successResponse, errorResponse } = require('../../helpers/responseHelper');
// const getPagination = require('../../helpers/paginationHelper');
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

  const productSchema = Joi.object({
    name: Joi.string().max(100).required().messages({
      'string.empty': 'Product name is required',
      'string.max': 'Product name must not exceed 100 characters'
    }),
    user_id: Joi.number().integer().required().messages({
      'number.base': 'User Id must be a valid user ID',
      'any.required': 'User Id field is required'
    })
  });
// Create Product
exports.createProduct = async (payload, res) => {
    const { name ,user_id } = payload;
    const { error } = productSchema.validate(
      { name, user_id },
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
    const checkQuery = "SELECT COUNT(*) as count FROM products WHERE name = ?";
    const [checkResult] = await db.query(checkQuery, [name]);

    if (checkResult[0].count > 0) {
      return errorResponse(res, "Product with this name already exists", "Duplicate Product Error", 400);
    }
    const query = "INSERT INTO products (name, created_by, updated_by) VALUES (?, ?, ?)";
    const values = [name, user_id, user_id];
    const [result] = await db.query(query, values);

    return successResponse(res, { id: result.insertId, name }, 'Product added successfully', 201);
  } catch (error) {
    console.error('Error inserting product:', error.message);
    return errorResponse(res, error.message, 'Error inserting product', 500);
  }
};

// Update Product
exports.updateProduct = async (id, payload, res) => {

    const { name ,user_id } = payload;
    const { error } = productSchema.validate(
      { name, user_id },
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
    const checkQuery = "SELECT COUNT(*) as count FROM products WHERE id = ? AND deleted_at IS NULL";
    const [checkResult] = await db.query(checkQuery, [id]);

    if (checkResult[0].count === 0) {
      return errorResponse(res, "Product not found or deleted", "Not Found", 404);
    }
    const query = "UPDATE products SET name = ?, updated_by = ? WHERE id = ?";
    const values = [name, user_id, id];
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
    const checkQuery = "SELECT COUNT(*) as count FROM products WHERE id = ? AND deleted_at IS NULL";
    const [checkResult] = await db.query(checkQuery, [id]);

    if (checkResult[0].count === 0) {
      return errorResponse(res, "Product not found or already deleted", "Not Found", 404);
    }
    const checkReferencesQuery = `SELECT COUNT(*) as count FROM projects WHERE product_id = ? AND deleted_at IS NULL`;
    const [checkReferencesResult] = await db
      
      .query(checkReferencesQuery, [id]);

    if (checkReferencesResult[0].count > 0) {
      return errorResponse(
        res,
        `This product is referenced in the Projects and cannot be deleted`,
        "Reference Error",
        400
      );
    }
    const query = "UPDATE products SET deleted_at = NOW() WHERE id = ?";
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
    const query = "SELECT * FROM products WHERE id = ? AND deleted_at IS NULL";
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
  const { search, page , perPage =10 } = queryParams;

  let query = "SELECT * FROM products WHERE deleted_at IS NULL";
  let countQuery = "SELECT COUNT(*) AS total FROM products WHERE  deleted_at IS NULL";
  const queryParamsArray = [];

  if (search && search.trim() !== "") {
    query += " AND name LIKE ?";
    countQuery += " AND name LIKE ?";
    queryParamsArray.push(`%${search.trim()}%`);
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
        s_no: page && perPage ? (parseInt(page, 10) - 1) * parseInt(perPage, 10) + index + 1 : index + 1,
        ...row,
    }));
  
    const pagination = page && perPage ? getPagination(page, perPage, totalRecords) : null;

    return successResponse(res, rowsWithSerialNo, rowsWithSerialNo.length === 0 ? 'No products found' : 'Products fetched successfully', 200, pagination);
  } catch (error) {
    console.error('Error fetching all products:', error.message);
    return errorResponse(res, error.message, 'Error fetching all products', 500);
  }
};
