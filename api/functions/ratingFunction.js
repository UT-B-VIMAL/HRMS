const db = require("../../config/db");
const { ratingSchema, UpdateRatingSchema } = require("../../validators/ratingValidator");
const {
  errorResponse,
  successResponse,
} = require("../../helpers/responseHelper");

const getPagination  = require("../../helpers/pagination");
const { getAuthUserDetails } = require("./commonFunction");







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

  // Main query for the paginated data
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
      AND SUBSTRING(ratings.month, 1, 4) = ?  AND ratings.status = 1
    WHERE 
      users.role_id NOT IN (1,2)
      AND users.deleted_at IS NULL
      AND YEAR(users.created_at) <= ?
  `;

  const queryParams = [year, year];

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

  // Query for counting total records (without pagination)
  let countQuery = `
    SELECT 
      COUNT(DISTINCT users.id) AS totalRecords
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

  // Apply the same conditions for the count query
  const countQueryParams = [...queryParams];
  if (search && search.trim() !== "") {
    const searchWildcard = `%${search.trim()}%`;
    countQuery += `
      AND (
        users.first_name LIKE ? 
        OR users.employee_id LIKE ? 
        OR teams.name LIKE ?
      )
    `;
    countQueryParams.push(searchWildcard, searchWildcard, searchWildcard);
  }

  // Add pagination to the main query
  query += ` 
    GROUP BY users.id, users.first_name, users.employee_id, teams.name
    LIMIT ? OFFSET ?
  `;
  queryParams.push(parseInt(perPage, 10), offset);

  try {
    // Execute the count query for total records
    const [countResult] = await db.query(countQuery, countQueryParams);
    const totalRecords = countResult[0]?.totalRecords || 0;

    // Execute the main query for paginated data
    const [result] = await db.query(query, queryParams);

    // Add serial numbers to rows
    const rowsWithSerialNo = result.map((row, index) => ({
      s_no: page && perPage ? (parseInt(page, 10) - 1) * parseInt(perPage, 10) + index + 1 : index + 1,
      ...row,
    }));

    // Calculate pagination
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
  const { status,month,rater, quality, timelines,agility,attitude,responsibility,remarks,user_id,updated_by } = payload;

  const { error } = UpdateRatingSchema.validate(
    { status,month,rater, quality, timelines,agility,attitude,responsibility,user_id,updated_by,remarks },
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
        WHERE user_id = ? AND month = ? AND rater = ? AND status = ?`;
    const values = [quality, timelines, agility, attitude, responsibility, average, updated_by,remarks, user_id, month, rater ,status];
    await db.query(updateQuery, values);
  } else {
    const insertQuery = `
        INSERT INTO ratings 
        (user_id, quality, timelines, agility, attitude, responsibility, average, month, rater, updated_by,remarks,status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const values = [user_id, quality, timelines, agility, attitude, responsibility, average, month, rater, updated_by,remarks,status];
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
    status,
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
    let whereClause = " WHERE users.role_id != 1 AND users.deleted_at IS NULL";
    
    if (users.role_id === 2) {
      whereClause += "  AND users.role_id NOT IN (1, 2) AND users.deleted_at IS NULL";
    }
    
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

    // Check if the user was created before the selected month
    const firstDayOfMonth = `${selectedMonth}-01`;
    whereClause += ' AND (users.created_at <= ? OR users.created_at LIKE ?)';
    values.push(firstDayOfMonth, `${selectedMonth}%`);

    // Get total records count
    const countQuery = `SELECT COUNT(*) as total FROM users LEFT JOIN teams ON users.team_id = teams.id ${whereClause}`;
    const [countResult] = await db.query(countQuery, values);
    const totalRecords = countResult[0].total;

    // Get paginated users
    const userQuery = `
      SELECT users.id as user_id, users.first_name, users.team_id, users.employee_id, teams.name AS team_name, users.created_at as joining_date, role_id
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
      SELECT r.*, ((r.quality + r.timelines + r.agility + r.attitude + r.responsibility) / 5) AS average, status
      FROM ratings r 
      WHERE r.user_id IN (?) AND r.month = ?`;
      
    const [ratingResults] = await db.query(ratingQuery, [userIds, selectedMonth]);

    const groupedResults = userResults.map((user, index) => {
      const employeeRatings = ratingResults.filter(rating => rating.user_id === user.user_id);
      
      const defaultRatings = [
        { rater: "TL", quality: 0, timelines: 0, agility: 0, attitude: 0, responsibility: 0, average: 0, rating_id: null, remarks: "-", status: 0 },
        { rater: "PM", quality: 0, timelines: 0, agility: 0, attitude: 0, responsibility: 0, average: 0, rating_id: null, remarks: "-", status: 0 }
      ];

      employeeRatings.forEach(rating => {
        const index = rating.rater === "TL" ? 0 : 1;
        
        if (rating.updated_by == user_id || rating.status == 1) {
          defaultRatings[index] = {
            rater: rating.rater,
            quality: rating.quality,
            role_id: user.role_id,
            joining_date: user.joining_date,
            timelines: rating.timelines,
            agility: rating.agility,
            attitude: rating.attitude,
            responsibility: rating.responsibility,
            average: rating.average !== null ? parseFloat(rating.average).toFixed(1) : "-",
            rating_id: rating.id,
            status: rating.status,
            remarks: rating.remarks && rating.remarks.trim() ? rating.remarks : "-"
          };
        } else {
          defaultRatings[index].status = rating.status;
          defaultRatings[index].rating_id = rating.id;
        }
      });

      // Fixing overall score calculation
      const tlRating = defaultRatings.find(r => r.rater === "TL") || {};
      const pmRating = defaultRatings.find(r => r.rater === "PM") || {};

      const tlScore = tlRating.average !== "-" ? parseFloat(tlRating.average) : null;
      const pmScore = pmRating.average !== "-" ? parseFloat(pmRating.average) : null;

      let overallScore;
      if (tlScore !== null && pmScore !== null) {
        overallScore = (tlScore + pmScore).toFixed(1);
      } else if (tlScore !== null) {
        overallScore = tlScore.toFixed(1);
      } else if (pmScore !== null) {
        overallScore = pmScore.toFixed(1);
      } else {
        overallScore = "-";
      }

      // Adjust for TLs
      if (user.role_id === 3 && overallScore !== "-") {
        overallScore = (parseFloat(overallScore) * 2).toFixed(1);
      }

      return {
        s_no: offset + index + 1,
        employee_id: user.employee_id,
        user_id: user.user_id,
        role_id: user.role_id,
        month: selectedMonth,
        joining_date: user.joining_date,
        employee_name: user.first_name,
        team: user.team_name,
        user_type: user.role_id === 4 ? "Employee" : user.role_id === 3 ? "TL" : "PM",
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


