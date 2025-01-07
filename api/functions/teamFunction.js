const Joi = require('joi');
const db = require('../../config/db');
const { successResponse, errorResponse } = require('../../helpers/responseHelper');
const { getAuthUserDetails } = require('./commonFunction');
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
  const teamSchema = Joi.object({
    name: Joi.string().max(100).required().messages({
      'string.empty': 'Team name is required',
      'string.max': 'Team name must not exceed 100 characters'
    }),
    user_id: Joi.number().integer().required().messages({
      'number.base': 'User Id must be a valid user ID',
      'any.required': 'User Id field is required'
    })
  });

  const teamUpdateSchema = Joi.object({
    name: Joi.string().max(100).required().messages({
      'string.empty': 'Team name is required',
      'string.max': 'Team name must not exceed 100 characters'
    }),
    user_id: Joi.number().integer().required().messages({
      'number.base': 'User Id must be a valid user ID',
      'any.required': 'User Id field is required'
    }),
    reporting_user_id: Joi.number().integer().required().messages({
      'number.base': 'Reporting User Id must be a valid user ID',
      'any.required': 'Reporting User Id field is required'
    })
  });

// Create Team
exports.createTeam = async (payload, res) => {
  const { name ,user_id } = payload;
  const { error } = teamSchema.validate(
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
    const user = await getAuthUserDetails(user_id, res);
    if (!user) return;
    const checkQuery = "SELECT COUNT(*) as count FROM teams WHERE name = ?";
    const [checkResult] = await db.query(checkQuery, [name]);

    if (checkResult[0].count > 0) {
      return errorResponse(res, "Team with this name already exists", "Duplicate Team Error", 400);
    }
    const query = "INSERT INTO teams (name, created_by, updated_by) VALUES (?, ?, ?)";
    const values = [name, user_id, user_id];
    const [result] = await db.query(query, values);

    return successResponse(res, { id: result.insertId, name }, 'Team added successfully', 201);
  } catch (error) {
    console.error('Error inserting team:', error.message);
    return errorResponse(res, error.message, 'Error inserting team', 500);
  }
};

// Update Team
exports.updateTeam = async (id, payload, res) => {
    const { name ,user_id,reporting_user_id} = payload;
    const { error } = teamUpdateSchema.validate(
      { name, user_id ,reporting_user_id},
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
    const checkQuery = "SELECT COUNT(*) as count FROM teams WHERE id = ? AND deleted_at IS NULL";
    const [checkResult] = await db.query(checkQuery, [id]);

    if (checkResult[0].count === 0) {
      return errorResponse(res, "Team not found or deleted", "Not Found", 404);
    }
    const query = "UPDATE teams SET name = ?, updated_by = ?, reporting_user_id=? WHERE id = ?";
    const values = [name, user_id,reporting_user_id, id];
    await db.query(query, values);
    return successResponse(res, { id, name,reporting_user_id }, 'Teams updated successfully', 200);
  } catch (error) {
    console.error('Error updating team:', error.message);
    return errorResponse(res, error.message, 'Error updating team', 500);
  }
};

// Delete Team
exports.deleteTeam = async (id, res) => {
  try {
    const checkQuery = "SELECT COUNT(*) as count FROM teams WHERE id = ? AND deleted_at IS NULL";
    const [checkResult] = await db.query(checkQuery, [id]);

    if (checkResult[0].count === 0) {
      return errorResponse(res, "Team not found or already deleted", "Not Found", 404);
    }
    const checkReferencesQuery = `SELECT COUNT(*) as count FROM users WHERE team_id = ? AND deleted_at IS NULL`;
    const [checkReferencesResult] = await db
      
      .query(checkReferencesQuery, [id]);

    if (checkReferencesResult[0].count > 0) {
      return errorResponse(
        res,
        `This Team is referenced in the User and cannot be deleted`,
        "Reference Error",
        400
      );
    }
    const query = "UPDATE teams SET deleted_at = NOW() WHERE id = ?";
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
    const query = "SELECT * FROM teams WHERE id = ? AND deleted_at IS NULL";
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
  const { search, page , perPage = 10 } = queryParams;

  let query = "SELECT * FROM teams WHERE deleted_at IS NULL ";
  let countQuery = "SELECT COUNT(*) AS total FROM teams WHERE deleted_at IS NULL";
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
  
      // Prepare pagination data
      const pagination = page && perPage ? getPagination(page, perPage, totalRecords) : null;

    return successResponse(res, rowsWithSerialNo, rowsWithSerialNo.length === 0 ? 'No teams found' : 'Teams fetched successfully', 200, pagination);
  } catch (error) {
    console.error('Error fetching all teams:', error.message);
    return errorResponse(res, error.message, 'Error fetching all teams', 500);
  }
};
