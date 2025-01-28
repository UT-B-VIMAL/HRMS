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

exports.getAnnualRatings = async (queryParamsval, res) => {
  const { search, year, page = 1, perPage = 10 } = queryParamsval;
  const offset = (parseInt(page, 10) - 1) * parseInt(perPage, 10);

  const currentMonth = new Date().getMonth() + 1; // JavaScript months are zero-based

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const monthColumns = months.slice(0, currentMonth).map((month, index) => {
    const monthNum = (index + 1).toString().padStart(2, '0');
    return `COALESCE(SUM(CASE WHEN SUBSTRING(ratings.month, 6, 2) = '${monthNum}' THEN ratings.average END), '-') AS ${month}`;
  }).join(', ');

  // Base query with dynamic month columns
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
                  2
              )
      END AS overall_average
    FROM 
      users
    LEFT JOIN 
      teams ON users.team_id = teams.id
    LEFT JOIN 
      ratings ON users.id = ratings.user_id
      AND SUBSTRING(ratings.month, 1, 4) = ?  -- Use the provided year parameter here
    WHERE 
      users.role_id != 2 
      AND users.deleted_at IS NULL
    GROUP BY 
      users.id, users.first_name, users.employee_id, teams.name
    HAVING 
      ${months.slice(0, currentMonth).map(month => `${month} IS NOT NULL`).join(' OR ')}
  `;

  const queryParams = [year];

  // Apply search filter
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

  // Group and paginate
  query += ` LIMIT ? OFFSET ?`;
  queryParams.push(parseInt(perPage, 10), offset);

  try {
    const [result] = await db.query(query, queryParams);

    const totalRecords = result.length > 0 ? result.length : 0;
    const rowsWithSerialNo = result.map((row, index) => ({
      s_no: page && perPage ? (parseInt(page, 10) - 1) * parseInt(perPage, 10) + index + 1 : index + 1,
      ...row,
    }));
    const pagination = getPagination(page, perPage, totalRecords);

    // Return paginated data with results
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

  // Get the current year and current month
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1; // JavaScript months are zero-based, so we add 1

  // Dynamically generate month columns for the full year (January to December)
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  let monthColumns;

  // If the selected year is the current year, limit to the current month
  if (parseInt(year) === currentYear) {
    monthColumns = months.slice(0, currentMonth).map((month, index) => {
      const monthNum = (index + 1).toString().padStart(2, '0'); // Format months to MM (01, 02, etc.)
      return `COALESCE(SUM(CASE WHEN SUBSTRING(ratings.month, 6, 2) = '${monthNum}' THEN ratings.average END), '-') AS ${month}`;
    }).join(', ');
  } else {
    // For previous years (or any year other than the current year), show all months (January to December)
    monthColumns = months.map((month, index) => {
      const monthNum = (index + 1).toString().padStart(2, '0'); // Format months to MM (01, 02, etc.)
      return `COALESCE(SUM(CASE WHEN SUBSTRING(ratings.month, 6, 2) = '${monthNum}' THEN ratings.average END), '-') AS ${month}`;
    }).join(', ');
  }

  // Base query with dynamic month columns for the full year (January to December for previous years)
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
                  2
              )
      END AS overall_average
    FROM 
      users
    LEFT JOIN 
      teams ON users.team_id = teams.id
    LEFT JOIN 
      ratings ON users.id = ratings.user_id
      AND SUBSTRING(ratings.month, 1, 4) = ?  -- Use the provided year parameter here (e.g., '2024')
    WHERE 
      users.role_id != 2 
      AND users.deleted_at IS NULL
  `;

  const queryParams = [year];

  // Apply search filter if search is provided
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

  // Group and paginate
  query += ` GROUP BY users.id, users.first_name, users.employee_id, teams.name`;

  // Apply pagination (LIMIT & OFFSET)
  query += ` LIMIT ? OFFSET ?`;
  queryParams.push(parseInt(perPage, 10), offset);

  try {
    const [result] = await db.query(query, queryParams);

    const totalRecords = result.length > 0 ? result.length : 0;
    const rowsWithSerialNo = result.map((row, index) => ({
      s_no: page && perPage ? (parseInt(page, 10) - 1) * parseInt(perPage, 10) + index + 1 : index + 1,
      ...row,
    }));
    const pagination = getPagination(page, perPage, totalRecords);

    // Return paginated data with results
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
const average = (quality + timelines + agility + attitude + responsibility)/5;
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

    // Base query
    let baseQuery = `
      FROM 
        users
      LEFT JOIN 
        teams ON users.team_id = teams.id
      LEFT JOIN 
        ratings r ON users.id = r.user_id 
        AND r.month = ?
      WHERE 
        users.role_id NOT IN (1, 2) 
        AND users.deleted_at IS NULL`;

    const values = [selectedMonth];

    // Filter by team ID
    if (team_id) {
      baseQuery += ' AND users.team_id = ?';
      values.push(team_id);
    }

    if (users.role_id === 3) {
      const query1 = `
        SELECT id 
        FROM teams 
        WHERE deleted_at IS NULL AND reporting_user_id = ?`;
      const [rows] = await db.query(query1, [user_id]);

      const teamIds = rows.length > 0 ? rows.map((row) => row.id) : [users.team_id];
      baseQuery += ' AND users.team_id IN (?)';
      values.push(teamIds);
    }

    if (search) {
      baseQuery += `
        AND (users.first_name LIKE ? 
        OR users.employee_id LIKE ? 
        OR teams.name LIKE ?)`;
      const searchPattern = `%${search}%`;
      values.push(searchPattern, searchPattern, searchPattern);
    }

    // Count Query
    const countQuery = `SELECT COUNT(*) as total ${baseQuery}`;
    const [countResult] = await db.query(countQuery, values);
    const totalRecords = countResult[0].total;

    // Paginated Query
    const paginatedQuery = `
      SELECT 
        users.id as user_id,
        users.first_name,
        users.team_id,
        users.employee_id,
        teams.name AS team_name,
        r.month as month,
        r.id as rating_id,
        r.rater, 
        r.quality, 
        r.remarks, 
        r.timelines, 
        r.agility, 
        r.attitude, 
        r.responsibility,
        ((r.quality + r.timelines + r.agility + r.attitude + r.responsibility) / 5) AS average
      ${baseQuery}
      ORDER BY users.id 
      LIMIT ? OFFSET ?`;

    values.push(parseInt(perPage, 10), parseInt(offset, 10));
    const [results] = await db.query(paginatedQuery, values);

    const groupedResults = results.reduce((acc, curr, index) => {
      const {
        employee_id,
        user_id,
        rating_id,
        first_name,
        team_name,
        rater,
        remarks,
        quality,
        timelines,
        agility,
        attitude,
        responsibility,
        average,
        month,
      } = curr;
    
      let employee = acc.find((e) => e.employee_id === employee_id);
      if (!employee) {
        employee = {
          s_no: offset + acc.length + 1, // Sequence number starts from (offset + 1)
          employee_id,
          user_id,
          month: month || selectedMonth,
          employee_name: first_name,
          team: team_name,
          raters: [
            { rater: "TL", quality: 0, timelines: 0, agility: 0, attitude: 0, responsibility: 0, average: 0, rating_id: null, remarks: remarks && remarks.trim() ? remarks : "-" },
            { rater: "PM", quality: 0, timelines: 0, agility: 0, attitude: 0, responsibility: 0, average: 0, rating_id: null, remarks: remarks && remarks.trim() ? remarks : "-" },
          ],
          overall_score: 0,
        };
        acc.push(employee);
      }
    
      if (rater === "TL") {
        employee.raters[0] = { rater, quality, timelines, agility, attitude, responsibility, average: average !== null ? parseFloat(average).toFixed(1) : "-", rating_id, remarks: remarks && remarks.trim() ? remarks : "-" };
      } else if (rater === "PM") {
        employee.raters[1] = { rater, quality, timelines, agility, attitude, responsibility, average: average !== null ? parseFloat(average).toFixed(1) : "-", rating_id, remarks: remarks && remarks.trim() ? remarks : "-" };
      }
    
      if (average !== null && average !== "-") {
        employee.overall_score += parseFloat(average);
      }
    
      return acc;
    }, []);
    
    // Ensure `s_no` is based on pagination and calculated dynamically
    groupedResults.forEach((employee, index) => {
      employee.s_no = offset + index + 1; // Correct sequence based on offset and index
      employee.overall_score = employee.overall_score > 0 ? employee.overall_score.toFixed(1) : "-";
    
      if (users.role_id === 3) {
        employee.raters = employee.raters.filter((rater) => rater.rater === "TL");
      }
    });
    
    // Pagination metadata
    const pagination = getPagination(page, perPage, totalRecords);
    
    return successResponse(res, groupedResults, 'Ratings fetched successfully', 200, pagination);
    
  } catch (error) {
    console.error('Error fetching ratings:', error);
    return errorResponse(res, 'An error occurred while fetching ratings', 'Internal Server Error', 500);
  }
};

