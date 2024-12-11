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
  
// Create Team
exports.createTeam = async (payload, res) => {
    const { name } = payload;
    if (!name) {
      return errorResponse(res,"Team name is required","Validation Error",400
      );
    }
  try {
    const checkQuery = "SELECT COUNT(*) as count FROM teams WHERE name = ?";
    const [checkResult] = await db.query(checkQuery, [name]);

    if (checkResult[0].count > 0) {
      return errorResponse(res, "Team with this name already exists", "Duplicate Team Error", 400);
    }
    const created_by =1;
    const updated_by =created_by;
    const query = "INSERT INTO teams (name, created_by, updated_by) VALUES (?, ?, ?)";
    const values = [name, created_by, updated_by];
    const [result] = await db.query(query, values);

    return successResponse(res, { id: result.insertId, name }, 'Team added successfully', 201);
  } catch (error) {
    console.error('Error inserting team:', error.message);
    return errorResponse(res, error.message, 'Error inserting team', 500);
  }
};

// Update Team
exports.updateTeam = async (id, payload, res) => {
    const { name } = payload;
    if (!name) {
      return errorResponse(res,"Team name is required","Validation Error",400
      );
    }

  try {
    const checkQuery = "SELECT COUNT(*) as count FROM teams WHERE id = ? AND delete_status = 0";
    const [checkResult] = await db.query(checkQuery, [id]);

    if (checkResult[0].count === 0) {
      return errorResponse(res, "Team not found or deleted", "Not Found", 404);
    }
    const updated_by=1;
    const query = "UPDATE teams SET name = ?, updated_by = ? WHERE id = ?";
    const values = [name, updated_by, id];
    await db.query(query, values);

    return successResponse(res, { id, name }, 'Team updated successfully', 200);
  } catch (error) {
    console.error('Error updating team:', error.message);
    return errorResponse(res, error.message, 'Error updating team', 500);
  }
};

// Delete Team
exports.deleteTeam = async (id, res) => {
  try {
    const checkQuery = "SELECT COUNT(*) as count FROM teams WHERE id = ? AND delete_status = 0";
    const [checkResult] = await db.query(checkQuery, [id]);

    if (checkResult[0].count === 0) {
      return errorResponse(res, "Team not found or already deleted", "Not Found", 404);
    }
    const checkReferencesQuery = `SELECT COUNT(*) as count FROM users WHERE team_id = ?`;
    const [checkReferencesResult] = await db
      
      .query(checkReferencesQuery, [id]);

    if (checkReferencesResult[0].count > 0) {
      return errorResponse(
        res,
        `Team is referenced in the User table and cannot be deleted`,
        "Reference Error",
        400
      );
    }
    const query = "UPDATE teams SET delete_status = 1 WHERE id = ?";
    await db.query(query, [id]);

    return successResponse(res, { id }, 'Team deleted successfully', 200);
  } catch (error) {
    console.error('Error deleting team:', error.message);
    return errorResponse(res, error.message, 'Error deleting team', 500);
  }
};

// Get Single Team
exports.getTeam = async (id, res) => {
  try {
    const query = "SELECT * FROM teams WHERE id = ? AND delete_status = 0";
    const [result] = await db.query(query, [id]);

    if (result.length === 0) {
      return errorResponse(res, "Team not found or deleted", "Not Found", 404);
    }

    return successResponse(res, result[0], 'Team fetched successfully', 200);
  } catch (error) {
    console.error('Error fetching team:', error.message);
    return errorResponse(res, error.message, 'Error fetching team', 500);
  }
};

// Get All Teams
exports.getAllTeams = async (queryParams, res) => {
  const { search, page = 1, perPage = 10 } = queryParams;
  const offset = (page - 1) * perPage;

  let query = "SELECT * FROM teams WHERE delete_status = 0 ";
  let countQuery = "SELECT COUNT(*) AS total FROM teams WHERE delete_status = 0";
  const queryParamsArray = [];

  if (search && search.trim() !== "") {
    query += " AND name LIKE ?";
    countQuery += " AND name LIKE ?";
    queryParamsArray.push(`%${search.trim()}%`);
  }

  query += " ORDER BY `created_at` DESC LIMIT ? OFFSET ?";
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

    return successResponse(res, rowsWithSerialNo, rowsWithSerialNo.length === 0 ? 'No teams found' : 'Teams fetched successfully', 200, pagination);
  } catch (error) {
    console.error('Error fetching all teams:', error.message);
    return errorResponse(res, error.message, 'Error fetching all teams', 500);
  }
};
