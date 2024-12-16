const db = require("../../config/db");
const { ratingSchema } = require("../../validators/ratingValidator");
const {
  errorResponse,
  successResponse,
} = require("../../helpers/responseHelper");

const getPagination  = require("../../helpers/pagination");



exports.getAllRatings = async (queryParamsval, res) => {
  const { search, teamId, page = 1, perPage = 10 } = queryParamsval;

  const offset = (parseInt(page, 10) - 1) * parseInt(perPage, 10);

  const currentMonth = new Date().toISOString().slice(0, 7);

  let query = `
      SELECT 
        users.id,
        users.first_name,
        users.employee_id,
        teams.name AS team_name,
        COALESCE(ratings.rating, 0) AS rating,
        COALESCE(ratings.average, 0) AS average
      FROM 
        users
      LEFT JOIN 
        teams ON users.team_id = teams.id
      LEFT JOIN 
        ratings ON users.id = ratings.user_id AND ratings.month = ?
      WHERE 
        users.role_id != 2
    `;

  const queryParams = [currentMonth];

  // Add filters for `teamId` and `search`
  if (teamId) {
    query += ` AND users.team_id = ?`;
    queryParams.push(teamId);
  }

  if (search && search.trim() !== "") {
    const searchWildcard = `%${search.trim()}%`;
    query += `
        AND (
          users.first_name LIKE ? 
          OR users.employee_id LIKE ? 
          OR teams.name LIKE ?
        )
      `;
    queryParams.push(searchWildcard, searchWildcard, searchWildcard);
  }

  query += " LIMIT ? OFFSET ?";
  queryParams.push(parseInt(perPage, 10), offset);

  try {
    const [result] = await db.query(query, queryParams);

    const totalRecords = result.length > 0 ? result.length : 0;
    const rowsWithSerialNo = result.map((row, index) => ({
        s_no: page && perPage ? (parseInt(page, 10) - 1) * parseInt(perPage, 10) + index + 1 : index + 1,
        ...row,
    }));
   const pagination =getPagination(page, perPage, totalRecords);
  
    // Return paginated data with results
    return successResponse(res, rowsWithSerialNo, rowsWithSerialNo.length === 0 ? 'No Ratings found' : 'Ratings fetched successfully', 200, pagination);

  } catch (error) {
    return errorResponse(res, error.message, "Error fetching ratings", 500);
  }
};

exports.updateRating = async (payload, res) => {
  const { average, rating, user_id,updated_by } = payload;

  const { error } = ratingSchema.validate(
    { average, rating, user_id,updated_by },
    { abortEarly: false }
  );
  if (error) {
    const errorMessages = error.details.reduce((acc, err) => {
      acc[err.path[0]] = err.message;
      return acc;
    }, {});
    return errorResponse(res, errorMessages, "Validation Error", 400);
  }

  const currentMonth = new Date().toISOString().slice(0, 7);

  const checkUserQuery = "SELECT COUNT(*) as count FROM users WHERE id = ? AND deleted_at IS NULL";
  const [checkUserResult] = await db.query(checkUserQuery, [user_id]);
  if (checkUserResult[0].count == 0) {
    return errorResponse(res, "User not found or already deleted", "Not Found", 404);
  }
  // Check if a rating exists for the user and month
  const checkQuery =
    "SELECT COUNT(*) as count FROM ratings WHERE user_id = ? AND month = ?";
  const [checkResult] = await db.query(checkQuery, [user_id, currentMonth]);

  if (checkResult[0].count > 0) {
    const updateQuery = `
        UPDATE ratings
        SET rating = ?, average = ?, updated_by = ?
        WHERE user_id = ? AND month = ?`;
    const values = [rating, average, updated_by, user_id, currentMonth];
    await db.query(updateQuery, values);
  } else {
    const insertQuery = `
        INSERT INTO ratings 
        (user_id, rating, average, month, updated_by) 
        VALUES (?, ?, ?, ?, ?)`;
    const values = [user_id, rating, average, currentMonth, updated_by];
    await db.query(insertQuery, values);
  }
  return successResponse(res, null, "Rating Updated successfully", 200);
};
