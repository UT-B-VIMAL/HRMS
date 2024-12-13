const db = require("../../config/db");
const { ratingSchema } = require("../../validators/ratingValidator");
const {
  errorResponse,
  successResponse,
} = require("../../helpers/responseHelper");

const getPagination = (page, perPage, totalRecords) => {
  const totalPages = Math.ceil(totalRecords / perPage);
  return {
    total_records: totalRecords,
    total_pages: totalPages,
    current_page: page,
    per_page: perPage,
    range_from: `Showing ${(page - 1) * perPage + 1}-${Math.min(
      page * perPage,
      totalRecords
    )} of ${totalRecords} entries`,
  };
};

exports.getAllRatings = async (queryParamsval, res) => {
  const { search, teamId, page = 1, size = 10 } = queryParamsval;

  // Ensure page and size are numbers
  const pageNum = Math.max(parseInt(page, 10), 1);
  const pageSize = Math.max(parseInt(size, 10), 1);

  const offset = (pageNum - 1) * pageSize;

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
  queryParams.push(pageSize, offset);

  try {
    const [result] = await db.query(query, queryParams);

    let countQuery = query.replace(" LIMIT ? OFFSET ?", "");
    const [countResult] = await db.query(countQuery, queryParams);
    const total_records = countResult.length > 0 ? countResult.length : 0;

    // Calculate total pages
    const total_pages = Math.ceil(total_records / pageSize);
    const rangeFrom = `Showing ${(page - 1) * pageSize + 1}-${Math.min(
      page * pageSize,
      total_records
    )} of ${total_records} entries`;
    // Return paginated data with results
    return successResponse(
      res,
      {
        data: result,
        pagination: {
          total_records,
          total_pages,
          current_page: pageNum,
          per_page: pageSize,
          range_from: rangeFrom,
        },
      },
      "Ratings fetched successfully",
      200
    );
  } catch (error) {
    return errorResponse(res, error.message, "Error fetching ratings", 500);
  }
};

exports.updateRating = async (payload, res) => {
  const { average, rating, user_id,updated_by } = payload;

  const { error } = ratingSchema.validate(
    { average, rating, user_id },
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

  const checkUserQuery = "SELECT COUNT(*) as count FROM users WHERE id = ? AND deleted_status";
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
