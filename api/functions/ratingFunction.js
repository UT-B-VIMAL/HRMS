const db = require("../../config/db");
const { ratingSchema, UpdateRatingSchema } = require("../../validators/ratingValidator");
const {
  errorResponse,
  successResponse,
} = require("../../helpers/responseHelper");
const { userSockets } = require('../../helpers/notificationHelper');
const { getAuthUserDetails, getUserIdFromAccessToken } = require("./commonFunction");
const getPagination  = require("../../helpers/pagination");


// phase 2

exports.getAnnualRatings = async (req, res) => {
  const { search, year, page = 1, perPage = 10 , team_id} = req.query;
  const offset = (parseInt(page, 10) - 1) * parseInt(perPage, 10);
 const accessToken = req.headers.authorization?.split(" ")[1];
    if (!accessToken) {
      return errorResponse(res, "Access token is required", 401);
    }
    console.log(accessToken)

    const user_id = await getUserIdFromAccessToken(accessToken);
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
      COALESCE(CONCAT(first_name, ' ', last_name)) AS employee_name,
      users.employee_id,
      users.team_id,
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
  const users = await getAuthUserDetails(user_id, res);
  if (!users) return;
  if(users.role_id===3){
  const [teamRows] = await db.query(
      `SELECT id FROM teams WHERE deleted_at IS NULL AND reporting_user_id = ?`,
      [user_id]
    );
    if(teamRows.length == 0){
      return errorResponse(res, null, "You are not currently assigned a reporting TL for your team.", 400);
    }
    const teamIds = teamRows.length > 0 ? teamRows.map(row => row.id) : [users.team_id];
    query += ' AND users.team_id IN (?) AND users.role_id != 3 AND users.role_id != 2';
    queryParams.push(teamIds);
  }
 

  if (search && search.trim() !== "") {
    const searchWildcard = `%${search.trim()}%`;
    query += `
      AND (
        REPLACE(CONCAT(users.first_name, ' ', users.last_name), ' ', '') LIKE REPLACE(?, ' ', '')
        OR users.employee_id LIKE ? 
        OR teams.name LIKE ?
      )
    `;
    queryParams.push(searchWildcard, searchWildcard, searchWildcard);
  }
  if (team_id) {
    query += ' AND users.team_id = ?';
    queryParams.push(team_id);
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
  if (users.role_id === 3) {
    const [teamRows] = await db.query(
      `SELECT id FROM teams WHERE deleted_at IS NULL AND reporting_user_id = ?`,
      [user_id]
    );
    const teamIds = teamRows.length > 0 ? teamRows.map(row => row.id) : [users.team_id];
    countQuery += ' AND users.team_id IN (?) AND users.role_id != 3 AND users.role_id != 2';
    countQueryParams.push(teamIds);
  }
  if (search && search.trim() !== "") {
    const searchWildcard = `%${search.trim()}%`;
    countQuery += `
      AND (
        REPLACE(CONCAT(users.first_name, ' ', users.last_name), ' ', '') LIKE REPLACE(?, ' ', '') 
        OR users.employee_id LIKE ? 
        OR teams.name LIKE ?
      )
    `;
    countQueryParams.push(searchWildcard, searchWildcard, searchWildcard);
  }
  if(team_id) {
    countQuery += ' AND users.team_id = ?';
    countQueryParams.push(team_id);
  }
  // Add pagination to the main query
  query += ` 
    GROUP BY users.id, users.first_name, users.employee_id, teams.name
    ORDER BY  ratings.updated_at DESC
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




exports.ratingUpdation = async (payload, res, req) => {
  let { status, month, rater, quality, timelines, agility, attitude, responsibility, remarks, user_id, updated_by ,import_status} = payload;
  if( import_status == 1) {
    const [empUsers] = await db.query(`SELECT id FROM users WHERE employee_id = ?`, [user_id]);
    if (!empUsers.length) {
      return errorResponse(res, "Employee Id Not Found", `Employee ID ${id} does not exist in the users table.`, 404);
    }
    user_id = empUsers[0].id; // Use the ID from the users table
  }  const { error } = UpdateRatingSchema.validate(
    { status, month, rater, quality, timelines, agility, attitude, responsibility, user_id, updated_by, remarks },
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
  const [checkResult] = await db.query(checkQuery, [user_id, month, rater]);
  const ratings = [quality, timelines, agility, attitude, responsibility].map(Number);
  const validRatings = ratings.filter(r => !isNaN(r));
  const average = validRatings.length > 0 ? validRatings.reduce((a, b) => a + b, 0) / validRatings.length : 0;
  let pm_status = 0;
  if(user.role_id == 2 && status == 1){
    if(average > 0){
      pm_status = 1;
    }
  }
  if (checkResult[0].count > 0) {
    const updateQuery = `
        UPDATE ratings
        SET quality = ?, timelines = ?, agility = ?, attitude = ?, responsibility = ?, average = ?, updated_by = ?, remarks = ?, status = ? , pm_status = ? , updated_at = NOW()
        WHERE user_id = ? AND month = ? AND rater = ?`;
    const values = [quality, timelines, agility, attitude, responsibility, average, updated_by, remarks, status,pm_status, user_id, month, rater];
    await db.query(updateQuery, values);
  } else {
    const insertQuery = `
        INSERT INTO ratings 
        (user_id, quality, timelines, agility, attitude, responsibility, average, month, rater, updated_by, remarks, status,pm_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`;
    const values = [user_id, quality, timelines, agility, attitude, responsibility, average, month, rater, updated_by, remarks, status,pm_status];
    await db.query(insertQuery, values);
  }
  if(user.role_id == 2 && status == 1){
    const updateQuery = `
      UPDATE ratings SET pm_status = 1 where user_id = ? AND month = ? AND rater = "TL"`;
    const values = [user_id, month];
    await db.query(updateQuery, values);
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

  if (status == "1") {
    const notificationPayload = {
      title: 'Rating Updated',
      body: 'Your performance rating has been updated. Check dashboard for details.',
    };
    const socketIds = userSockets[user_id];
    if (Array.isArray(socketIds)) {
      socketIds.forEach(socketId => {
        req.io.of('/notifications').to(socketId).emit('push_notification', notificationPayload);
      });
    }
    await db.execute(
      'INSERT INTO notifications (user_id, title, body, read_status, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
      [user_id, notificationPayload.title, notificationPayload.body, 0]
    );
  }

  successResponse(res, responsePayload, "Rating Updated successfully", 200);

  // Asynchronous notification handling
  if (user.role_id === "3" && status == "1") {
    // Check if all ratings for the team are updated
    const teamQuery = `
      SELECT id, name FROM teams WHERE id = ? AND deleted_at IS NULL
    `;
    const [teamResult] = await db.query(teamQuery, [user.team_id]);
    const teamName = teamResult.length > 0 ? teamResult[0].name : 'Unknown Team';

    const teamMembersQuery = `
      SELECT id FROM users WHERE team_id = ? AND deleted_at IS NULL
    `;
    const [teamMembers] = await db.query(teamMembersQuery, [user.team_id]);

    const allRatingsUpdated = await Promise.all(teamMembers.map(async (member) => {
      const ratingCheckQuery = `
        SELECT COUNT(*) as count FROM ratings WHERE user_id = ? AND month = ? AND rater = ? AND status = 1
      `;
      const [ratingCheckResult] = await db.query(ratingCheckQuery, [member.id, month, 'TL']);
      return ratingCheckResult[0].count > 0;
    }));

    if (allRatingsUpdated.every(Boolean)) {
      // Send notification to all PMs
      const pmUsersQuery = `
        SELECT id FROM users WHERE role_id = 2 AND deleted_at IS NULL
      `;
      const [pmUsers] = await db.query(pmUsersQuery);

      const notificationPayload = {
        title: `${teamName} Updated Attendance`,
        body: `${teamName} has updated team attendance.`,
      };

      pmUsers.forEach(async (pmUser) => {
        const socketIds = userSockets[pmUser.id];
        if (Array.isArray(socketIds)) {
          socketIds.forEach((socketId) => {
            req.io.of('/notifications').to(socketId).emit('push_notification', notificationPayload);
          });
        }
        await db.execute(
          'INSERT INTO notifications (user_id, title, body, read_status, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
          [pmUser.id, notificationPayload.title, notificationPayload.body, 0]
        );
      });
    }
  }

  if (user.role_id === "2" && status == "1") {
    // Check if all ratings for all teams are updated
    const allTeamsQuery = `
      SELECT id, name FROM teams WHERE deleted_at IS NULL
    `;
    const [allTeams] = await db.query(allTeamsQuery);

    const allRatingsUpdated = await Promise.all(allTeams.map(async (team) => {
      const teamMembersQuery = `
        SELECT id FROM users WHERE team_id = ? AND deleted_at IS NULL
      `;
      const [teamMembers] = await db.query(teamMembersQuery, [team.id]);

      const teamRatingsUpdated = await Promise.all(teamMembers.map(async (member) => {
        const ratingCheckQuery = `
          SELECT COUNT(*) as count FROM ratings WHERE user_id = ? AND month = ? AND rater = ? AND status = 1
        `;
        const [ratingCheckResult] = await db.query(ratingCheckQuery, [member.id, month, 'PM']);
        return ratingCheckResult[0].count > 0;
      }));

      return teamRatingsUpdated.every(Boolean);
    }));

    if (allRatingsUpdated.every(Boolean)) {
      // Send notification to all Admins
      const adminUsersQuery = `
        SELECT id FROM users WHERE role_id = 1 AND deleted_at IS NULL
      `;
      const [adminUsers] = await db.query(adminUsersQuery);

      const notificationPayload = {
        title: 'Employee Rating Updated',
        body: `Performance rating has been updated successfully.`,
      };

      adminUsers.forEach(async (adminUser) => {
        const socketIds = userSockets[adminUser.id];
        if (Array.isArray(socketIds)) {
          socketIds.forEach((socketId) => {
            req.io.of('/notifications').to(socketId).emit('push_notification', notificationPayload);
          });
        }
        await db.execute(
          'INSERT INTO notifications (user_id, title, body, read_status, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
          [adminUser.id, notificationPayload.title, notificationPayload.body, 0]
        );
      });
    }
  }
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
  // try {
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
    let whereClause = "WHERE users.role_id NOT IN (1,2) AND users.deleted_at IS NULL";
    
    // if (users.role_id === 2) {
    //   whereClause += "  AND users.role_id NOT IN (1, 2) AND users.deleted_at IS NULL";
    // }
    
    if (team_id) {
      whereClause += ' AND users.team_id = ?';
      values.push(team_id);
    }

    if (users.role_id === 3) {
      const [teamRows] = await db.query(
        `SELECT id FROM teams WHERE deleted_at IS NULL AND reporting_user_id = ?`,
        [user_id]
      );

        if (teamRows.length == 0) {
          return errorResponse(res, null, "You are not currently assigned a reporting TL for your team.", 400);
        }
      const teamIds = teamRows.length > 0 ? teamRows.map(row => row.id) : [users.team_id];
      whereClause += ' AND users.team_id IN (?) AND users.role_id != 3 AND users.role_id != 2';
      values.push(teamIds);
    }

    if (search) {
       whereClause += ` AND (
        REPLACE(CONCAT(users.first_name, ' ', users.last_name), ' ', '') LIKE REPLACE(?, ' ', '') 
        OR users.employee_id LIKE ? 
        OR teams.name LIKE ?
      )`;
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
      SELECT users.id as user_id, COALESCE(CONCAT(first_name, ' ', last_name)) as empname, users.team_id, users.employee_id, teams.name AS team_name, users.created_at as joining_date, role_id
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
      if (user.role_id === 3 && overallScore !== "-" || user.role_id === 2 && overallScore !== "-") {
        overallScore = (parseFloat(overallScore) * 2).toFixed(1);
      }

      return {
        s_no: offset + index + 1,
        employee_id: user.employee_id,
        user_id: user.user_id,
        role_id: user.role_id,
        month: selectedMonth,
        joining_date: user.joining_date,
        employee_name: user.empname,
        team: user.team_name,
        user_type: user.role_id === 4 ? "Employee" : user.role_id === 3 ? "TL" : "PM",
        raters: users.role_id === 3 ? defaultRatings.filter(r => r.rater === "TL") : defaultRatings,
        overall_score: overallScore
      };
    });

    return successResponse(res, groupedResults, 'Ratings fetched successfully', 200, getPagination(page, perPage, totalRecords));
  // } catch (error) {
  //   console.error('Error fetching ratings:', error);
  //   return errorResponse(res, 'An error occurred while fetching ratings', 'Internal Server Error', 500);
  // }
};


