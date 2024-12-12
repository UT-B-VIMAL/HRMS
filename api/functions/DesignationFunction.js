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
  
// Create Designation
exports.createDesignation = async (payload, res) => {
  const { name} = payload;
  if (!name) {
    return errorResponse(res,"Designation name is required","Validation Error",400
    );
  }
  try {
    const checkQuery = "SELECT COUNT(*) as count FROM designations WHERE name = ?";
    const [checkResult] = await db.query(checkQuery, [name]);

    if (checkResult[0].count > 0) {
      return errorResponse(res, "Designation with this name already exists", "Duplicate Designation Error", 400);
    }
    const created_by =1;
    const updated_by =created_by;
    const query = "INSERT INTO designations (name, created_by, updated_by) VALUES (?, ?, ?)";
    const values = [name, created_by, updated_by];
    const [result] = await db.query(query, values);

    return successResponse(res, { id: result.insertId, name }, 'Designation added successfully', 201);
  } catch (error) {
    console.error('Error inserting designation:', error.message);
    return errorResponse(res, error.message, 'Error inserting designation', 500);
  }
};

// Update Designation
exports.updateDesignation = async (id, payload, res) => {
  const { name } = payload;
  if (!name) {
    return errorResponse(res,"Designation name is required","Validation Error",400
    );
  }
  try {
    const checkQuery = "SELECT COUNT(*) as count FROM designations WHERE id = ? AND deleted_at IS NULL";
    const [checkResult] = await db.query(checkQuery, [id]);

    if (checkResult[0].count === 0) {
      return errorResponse(res, "Designation not found or deleted", "Not Found", 404);
    }
    const updated_by=1;
    const query = "UPDATE designations SET name = ?, updated_by = ? WHERE id = ?";
    const values = [name, updated_by, id];
    await db.query(query, values);

    return successResponse(res, { id, name }, 'Designation updated successfully', 200);
  } catch (error) {
    console.error('Error updating designation:', error.message);
    return errorResponse(res, error.message, 'Error updating designation', 500);
  }
};

// Delete Designation
exports.deleteDesignation = async (id, res) => {
  try {
    const checkQuery = "SELECT COUNT(*) as count FROM designations WHERE id = ? AND deleted_at IS NULL";
    const [checkResult] = await db.query(checkQuery, [id]);

    if (checkResult[0].count === 0) {
      return errorResponse(res, "Designation not found or already deleted", "Not Found", 404);
    }
    const checkReferencesQuery = `SELECT COUNT(*) as count FROM users WHERE designation_id = ?`;
    const [checkReferencesResult] = await db
      
      .query(checkReferencesQuery, [id]);

    if (checkReferencesResult[0].count > 0) {
      return errorResponse(
        res,
        `Designation is referenced in the User table and cannot be deleted`,
        "Reference Error",
        400
      );
    }
    const query = "UPDATE designations SET deleted_at = NOW() WHERE id = ?";
    await db.query(query, [id]);

    return successResponse(res, { id }, 'Designation deleted successfully', 200);
  } catch (error) {
    console.error('Error deleting designation:', error.message);
    return errorResponse(res, error.message, 'Error deleting designation', 500);
  }
};

// Get Single Designation
exports.getDesignation = async (id, res) => {
  try {
    const query = "SELECT * FROM designations WHERE id = ? AND deleted_at IS NULL";
    const [result] = await db.query(query, [id]);

    if (result.length === 0) {
      return errorResponse(res, "Designation not found or deleted", "Not Found", 404);
    }

    return successResponse(res, result[0], 'Designation fetched successfully', 200);
  } catch (error) {
    console.error('Error fetching designation:', error.message);
    return errorResponse(res, error.message, 'Error fetching designation', 500);
  }
};

// Get All Designations
exports.getAllDesignations = async (queryParams, res) => {
  const { search, page , perPage = 10 } = queryParams;

  let query = "SELECT * FROM designations WHERE deleted_at IS NULL";
  let countQuery = "SELECT COUNT(*) AS total FROM designations WHERE deleted_at IS NULL";
  const queryParamsArray = [];

  if (search && search.trim() !== "") {
    query += " AND name LIKE ?";
    countQuery += " AND name LIKE ?";
    queryParamsArray.push(`%${search.trim()}%`);
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

    return successResponse(res, rowsWithSerialNo, rowsWithSerialNo.length === 0 ? 'No designations found' : 'Designations fetched successfully', 200, pagination);
  } catch (error) {
    console.error('Error fetching all designations:', error.message);
    return errorResponse(res, error.message, 'Error fetching all designations', 500);
  }
};
