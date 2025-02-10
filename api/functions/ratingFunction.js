const db = require("../../config/db");
const { ratingSchema, UpdateRatingSchema } = require("../../validators/ratingValidator");
const {
  errorResponse,
  successResponse,
} = require("../../helpers/responseHelper");

const getPagination  = require("../../helpers/pagination");
const { getAuthUserDetails } = require("./commonFunction");



exports.getAllRatings = async (queryParamsval, res) => {
  const { search, team_id, page = 1, perPage = 10 } = queryParamsval;

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
        users.role_id != 2 AND users.deleted_at IS NULL
    `;

  const queryParams = [currentMonth];

  // Add filters for `teamId` and `search`
  if (team_id) {
    query += ` AND users.team_id = ?`;
    queryParams.push(team_id);
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
  const user = await getAuthUserDetails(updated_by, res);
  if (!user) return;
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



// phase 2

exports.getAnnualRatings = async (queryParamsval, res) => {
  const { search, year, page = 1, perPage = 10 } = queryParamsval;
  const offset = (parseInt(page, 10) - 1) * parseInt(perPage, 10);

  // Define all 12 months
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  // Construct SQL to fetch all months dynamically
  const monthColumns = months.map((month, index) => {
    const monthNum = (index + 1).toString().padStart(2, '0'); // Convert index to "01", "02", etc.
    return `COALESCE(ROUND(SUM(CASE WHEN SUBSTRING(ratings.month, 6, 2) = '${monthNum}' THEN ratings.average END), 1), '-') AS ${month}`;
  }).join(', ');

  let query = `
    SELECT 
      users.id AS user_id,
      users.first_name AS employee_name,
      users.employee_id,
      teams.name AS team_name,
      ${monthColumns}, 
      CASE 
          WHEN COUNT(DISTINCT CASE WHEN ratings.average IS NOT NULL THEN SUBSTRING(ratings.month, 1, 7) END) = 0 THEN '-'
          ELSE 
              ROUND(
                  SUM(ratings.average) / 
                  COUNT(DISTINCT CASE WHEN ratings.average IS NOT NULL THEN SUBSTRING(ratings.month, 1, 7) END), 
                  1
              )
      END AS overall_average
    FROM 
      users
    LEFT JOIN 
      teams ON users.team_id = teams.id
    LEFT JOIN 
      ratings ON users.id = ratings.user_id
      AND SUBSTRING(ratings.month, 1, 4) = ? 
    WHERE 
      users.role_id NOT IN (1,2)
      AND users.deleted_at IS NULL
      AND YEAR(users.created_at) <= ?
  `;

  const queryParams = [year,year];

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

  query += ` 
    GROUP BY users.id, users.first_name, users.employee_id, teams.name
    LIMIT ? OFFSET ?
  `;
  queryParams.push(parseInt(perPage, 10), offset);

  try {
    const [result] = await db.query(query, queryParams);

    const totalRecords = result.length > 0 ? result.length : 0;
    const rowsWithSerialNo = result.map((row, index) => ({
      s_no: page && perPage ? (parseInt(page, 10) - 1) * parseInt(perPage, 10) + index + 1 : index + 1,
      ...row,
    }));
    const pagination = getPagination(page, perPage, totalRecords);

    return successResponse(
      res,
      rowsWithSerialNo,
      rowsWithSerialNo.length === 0 ? 'No Ratings found' : 'Ratings fetched successfully',
      200,
      pagination
    );
  } catch (error) {
    return errorResponse(res, error.message, "Error fetching ratings", 500);
  }
};



exports.ratingUpdation = async (payload, res) => {
  const { month,rater, quality, timelines,agility,attitude,responsibility,remarks,user_id,updated_by } = payload;

  const { error } = UpdateRatingSchema.validate(
    { month,rater, quality, timelines,agility,attitude,responsibility,user_id,updated_by,remarks },
    { abortEarly: false }
  );
  if (error) {
    const errorMessages = error.details.reduce((acc, err) => {
      acc[err.path[0]] = err.message;
      return acc;
    }, {});

    return errorResponse(res, errorMessages, "Validation Error", 400);
  }
  const user = await getAuthUserDetails(updated_by, res);
  if (!user) return;

  const checkUserQuery = "SELECT COUNT(*) as count FROM users WHERE id = ? AND deleted_at IS NULL";
  const [checkUserResult] = await db.query(checkUserQuery, [user_id]);
  if (checkUserResult[0].count == 0) {
    return errorResponse(res, "User not found or already deleted", "Not Found", 404);
  }
  // Check if a rating exists for the user and month
  const checkQuery =
    "SELECT COUNT(*) as count FROM ratings WHERE user_id = ? AND month = ? AND rater = ?";
  const [checkResult] = await db.query(checkQuery, [user_id, month,rater]);
  const ratings = [quality, timelines, agility, attitude, responsibility].map(Number);
  const validRatings = ratings.filter(r => !isNaN(r));
  const average = validRatings.length > 0 ? validRatings.reduce((a, b) => a + b, 0) / validRatings.length : 0;
  
  if (checkResult[0].count > 0) {
    const updateQuery = `
        UPDATE ratings
        SET quality = ?, timelines = ?, agility = ?, attitude = ?, responsibility = ?, average = ?, updated_by = ?,remarks = ?
        WHERE user_id = ? AND month = ? AND rater = ?`;
    const values = [quality, timelines, agility, attitude, responsibility, average, updated_by,remarks, user_id, month, rater];
    await db.query(updateQuery, values);
  } else {
    const insertQuery = `
        INSERT INTO ratings 
        (user_id, quality, timelines, agility, attitude, responsibility, average, month, rater, updated_by,remarks)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const values = [user_id, quality, timelines, agility, attitude, responsibility, average, month, rater, updated_by,remarks];
    await db.query(insertQuery, values);
  }
  const responsePayload = {
    user_id,
    month,
    rater,
    ratings: {
      quality,
      timelines,
      agility,
      attitude,
      responsibility,
    },
    remarks,
    average,
    updated_by,
  };
  return successResponse(res, responsePayload, "Rating Updated successfully", 200);
};

exports.getRatingById = async (req, res) => {
  try {
    // Extract rating_id from the request body
    const { rating_id } = req;


    // Query to fetch the rating by ID
    const query = `
      SELECT id AS rating_id, user_id, quality, timelines, agility, attitude, responsibility, remarks 
      FROM ratings 
      WHERE id = ?
    `;
    const values = [rating_id];

    const [ratings] = await db.query(query, values);

    // If no record is found, return default values
    if (ratings.length === 0) {
      return successResponse(
        res,
        {
          rating_id: 0,
          user_id: 0,
          quality: 0,
          timelines: 0,
          agility: 0,
          attitude: 0,
          responsibility: 0,
          remarks: null
        },
        "No rating found. Default values returned.",
        200
      );
    }

    return successResponse(
      res,
      ratings[0],
      "Rating fetched successfully",
      200
    );
  } catch (error) {
    console.error("Error fetching rating by ID:", error);
    return errorResponse(
      res,
      "An error occurred while fetching the rating.",
      "Internal Server Error",
      500
    );
  }
};

exports.getRatings = async (req, res) => {
  try {
    const { team_id, month, user_id, search, page = 1, perPage = 10 } = req;
    const offset = (page - 1) * perPage;

    const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
    const currentMonth = new Date().toISOString().slice(0, 7);
    const selectedMonth = month || currentMonth;

    if (!monthRegex.test(selectedMonth)) {
      return errorResponse(res, 'Month should be in the format YYYY-MM', 'Bad Request', 400);
    }

    const users = await getAuthUserDetails(user_id, res);
    if (!users) return;

    const values = [];
    let whereClause = " WHERE users.role_id NOT IN (1, 2) AND users.deleted_at IS NULL";

    if (team_id) {
      whereClause += ' AND users.team_id = ?';
      values.push(team_id);
    }

    if (users.role_id === 3) {
      const [teamRows] = await db.query(
        `SELECT id FROM teams WHERE deleted_at IS NULL AND reporting_user_id = ?`,
        [user_id]
      );
      const teamIds = teamRows.length > 0 ? teamRows.map(row => row.id) : [users.team_id];
      whereClause += ' AND users.team_id IN (?) AND users.role_id != 3';
      values.push(teamIds);
    }

    if (search) {
      whereClause += ` AND (users.first_name LIKE ? OR users.employee_id LIKE ? OR teams.name LIKE ?)`;
      const searchPattern = `%${search}%`;
      values.push(searchPattern, searchPattern, searchPattern);
    }

    // Get total records count
    const countQuery = `SELECT COUNT(*) as total FROM users LEFT JOIN teams ON users.team_id = teams.id ${whereClause}`;
    const [countResult] = await db.query(countQuery, values);
    const totalRecords = countResult[0].total;

    // Get paginated users
    const userQuery = `
      SELECT users.id as user_id, users.first_name, users.team_id, users.employee_id, teams.name AS team_name
      FROM users
      LEFT JOIN teams ON users.team_id = teams.id
      ${whereClause}
      ORDER BY users.id
      LIMIT ? OFFSET ?`;
    values.push(parseInt(perPage, 10), parseInt(offset, 10));

    const [userResults] = await db.query(userQuery, values);
    if (userResults.length === 0) {
      return successResponse(res, [], 'No ratings found', 200, getPagination(page, perPage, totalRecords));
    }

    const userIds = userResults.map(user => user.user_id);
    const ratingQuery = `
      SELECT r.*, ((r.quality + r.timelines + r.agility + r.attitude + r.responsibility) / 5) AS average
      FROM ratings r 
      WHERE r.user_id IN (?) AND r.month = ?`;
    const [ratingResults] = await db.query(ratingQuery, [userIds, selectedMonth]);

    const groupedResults = userResults.map((user, index) => {
      const employeeRatings = ratingResults.filter(rating => rating.user_id === user.user_id);
      const defaultRatings = [
        { rater: "TL", quality: 0, timelines: 0, agility: 0, attitude: 0, responsibility: 0, average: 0, rating_id: null, remarks: "-" },
        { rater: "PM", quality: 0, timelines: 0, agility: 0, attitude: 0, responsibility: 0, average: 0, rating_id: null, remarks: "-" }
      ];

      employeeRatings.forEach(rating => {
        const index = rating.rater === "TL" ? 0 : 1;
        defaultRatings[index] = {
          rater: rating.rater,
          quality: rating.quality,
          timelines: rating.timelines,
          agility: rating.agility,
          attitude: rating.attitude,
          responsibility: rating.responsibility,
          average: rating.average !== null ? parseFloat(rating.average).toFixed(1) : "-",
          rating_id: rating.id,
          remarks: rating.remarks && rating.remarks.trim() ? rating.remarks : "-"
        };
      });

      const overallScore = employeeRatings.length
        ? (employeeRatings.reduce((acc, curr) => acc + (curr.average || 0), 0) / employeeRatings.length).toFixed(1)
        : "-";

      return {
        s_no: offset + index + 1,
        employee_id: user.employee_id,
        user_id: user.user_id,
        month: selectedMonth,
        employee_name: user.first_name,
        team: user.team_name,
        raters: users.role_id === 3 ? defaultRatings.filter(r => r.rater === "TL") : defaultRatings,
        overall_score: overallScore
      };
    });

    return successResponse(res, groupedResults, 'Ratings fetched successfully', 200, getPagination(page, perPage, totalRecords));
  } catch (error) {
    console.error('Error fetching ratings:', error);
    return errorResponse(res, 'An error occurred while fetching ratings', 'Internal Server Error', 500);
  }
};

