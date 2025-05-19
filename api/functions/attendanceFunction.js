const db = require("../../config/db");
const {successResponse,errorResponse,} = require("../../helpers/responseHelper");

const moment = require('moment');
const {attendanceValidator, attendanceFetch}=  require("../../validators/AttendanceValidator");
const getPagination = require("../../helpers/pagination");
const { getAuthUserDetails } = require("./commonFunction");
const { Parser } = require('json2csv');
const { userSockets } = require("../../helpers/notificationHelper");


exports.getAttendance = async (req, res) => {
  const { date, search, page = 1, perPage = 10, user_id } = req.query;

  try {
    let query = '';
    let queryParams = [];

    // Validate user_id
    const { error } = attendanceFetch.validate({ user_id }, { abortEarly: false });
    if (error) {
      const errorMessages = error.details.reduce((acc, err) => {
        acc[err.path[0]] = err.message;
        return acc;
      }, {});
      return errorResponse(res, errorMessages, "Validation Error", 400);
    }

    // Fetch authenticated user details
    const user = await getAuthUserDetails(user_id, res);
    const today = new Date().toISOString().slice(0, 10);
    const dynamicDate = date || today;
    if (user.role_id == 3) {
      const [teamResult] = await db.query(
        `SELECT reporting_user_id FROM teams WHERE id = ?`,
        [user.team_id]
      );

      if (!teamResult.length || teamResult[0].reporting_user_id === null) {
        return errorResponse(res, null, "You currently have no teams assigned to you.", 400);
      }
    }
    // Base Query
    query = `
      SELECT 
          u.id AS user_id, 
          u.first_name, 
          u.employee_id,
          u.created_at AS joining_date,
          el.day_type, 
          el.date AS leave_date, 
          el.half_type as half_type_val,
          el.day_type as day_type_val,
          CASE 
            WHEN el.day_type = 1 THEN 'Absent'
            WHEN el.day_type = 2 THEN 'Half Day'
            ELSE 'Present'
          END AS status,
          CASE 
              WHEN el.day_type = 1 THEN 'Full Day' 
              WHEN el.day_type = 2 THEN 'Half Day' 
              ELSE 'Full Day' 
          END AS day_type,
          CASE 
              WHEN el.half_type = 1 THEN 'First Half' 
              WHEN el.half_type = 2 THEN 'Second Half' 
              ELSE NULL 
          END AS half_type
      FROM 
          users u
      LEFT JOIN 
          employee_leave el 
          ON u.id = el.user_id AND el.date = ? 
      LEFT JOIN 
          teams t 
          ON u.team_id = t.id  
      WHERE 
          u.deleted_at IS NULL
    `;

    queryParams.push(dynamicDate);

    // Role-Based Filtering Logic
    if (user.role_id === 1 || user.role_id === 2) {
      query += ` AND u.role_id IN (2, 3) `;
    } else {
      query += ` AND (t.reporting_user_id = ? OR u.team_id = ?) AND u.role_id != 2 AND u.id != ? `;
      queryParams.push(user_id, user.team_id, user_id);
    }

    // Search Filter
    if (search) {
      query += `
        AND (
          u.first_name LIKE ? 
          OR u.employee_id LIKE ?
          OR (CASE 
                WHEN el.day_type = 1 THEN 'Absent'
                WHEN el.day_type = 2 THEN 'Half Day'
                ELSE 'Present'
              END) LIKE ?
          OR (CASE 
                WHEN el.day_type = 1 THEN 'Full Day'
                WHEN el.day_type = 2 THEN 'Half Day'
                ELSE 'Full Day'
              END) LIKE ?
          OR (CASE 
                WHEN el.half_type = 1 THEN 'First Half'
                WHEN el.half_type = 2 THEN 'Second Half'
                ELSE NULL
              END) LIKE ?
        )
      `;
      queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    // Pagination
    const offset = (Number(page) - 1) * Number(perPage);
    query += ` LIMIT ?, ? `;
    queryParams.push(offset, Number(perPage));

    // Execute query
    const [result] = await db.query(query, queryParams);
    const totalRecords = result.length;

    // Add Serial Numbers
    const rowsWithSerialNo = result.map((row, index) => ({
      s_no: offset + index + 1,
      ...row,
    }));

    const pagination = getPagination(page, perPage, totalRecords);

    // Return Response
    return successResponse(
      res,
      rowsWithSerialNo,
      rowsWithSerialNo.length === 0 ? 'No Records found' : 'Records fetched successfully',
      200,
      pagination
    );

  } catch (error) {
    return errorResponse(res, error.message, "Error fetching attendance data", 500);
  }
};



// Controller function
exports.updateAttendanceData = async (req, res) => {
  let { id, date, attendanceType, halfDay, status, updated_by } = req.body;

  // Validate the request data
  const { error } = attendanceValidator.validate(
      { id, date, attendanceType, halfDay, status, updated_by },
      { abortEarly: false }
  );

  if (error) {
      const errorMessages = error.details.reduce((acc, err) => {
          acc[err.path[0]] = err.message;
          return acc;
      }, {});
      return errorResponse(res, errorMessages, "Validation Error", 400);
  }

  if (attendanceType == 1) {
      halfDay = null;
  }

  await getAuthUserDetails(updated_by, res);

  try {
      // Check if user ID exists
      const results = await db.query(`SELECT id FROM users WHERE id = ?`, [id]);

      if (results[0].length === 0) {
          return errorResponse(
              res,
              "User ID Not Found",
              `User ID ${id} does not exist in the users table.`,
              500
          );
      }

      // Check if record exists
      const query = `SELECT * FROM employee_leave WHERE user_id = ? AND date = ?`;
      const existingRecord = await db.query(query, [id, date]);

      // Handle Absent status
      if (status === "Absent") {
          if (!existingRecord[0]?.length) {
              // Insert record if it doesn't exist
              await db.query(
                  `INSERT INTO employee_leave (user_id, date, day_type, half_type, updated_by) 
                  VALUES (?, ?, ?, ?, ?)`,
                  [id, date, attendanceType, halfDay, updated_by]
              );
          } else {
              await db.query(
                  `UPDATE employee_leave 
                  SET day_type = ?, half_type = ?, updated_by = ? 
                  WHERE user_id = ? AND date = ?`,
                  [attendanceType, halfDay, updated_by, id, date]
              );
          }
      }

      // Handle Present status
      if (status === "Present") {
          const conflictingHalfTypeQuery = `
          SELECT * 
          FROM employee_leave 
          WHERE user_id = ? AND date = ? AND day_type= ? AND half_type= ?`;

          const conflictingRecord = await db.query(conflictingHalfTypeQuery, [id, date, attendanceType, halfDay]);

          if (attendanceType === 1 || conflictingRecord[0]?.length) {
              // Delete record if day_type = 1
              await db.query(`DELETE FROM employee_leave WHERE user_id = ? AND date = ?`, [id, date]);
          } else if (attendanceType === 2) {
              if (halfDay == 1) {
                  await db.query(
                      `UPDATE employee_leave 
                      SET day_type = 2, half_type = 2, updated_by = ? 
                      WHERE user_id = ? AND date = ?`,
                      [updated_by, id, date]
                  );
              } else if (halfDay == 2) {
                  await db.query(
                      `UPDATE employee_leave 
                      SET day_type = 2, half_type = 1, updated_by = ? 
                      WHERE user_id = ? AND date = ?`,
                      [updated_by, id, date]
                  );
              }
          }
      }

      return successResponse(res, null, "Attendance Updated Successfully", 200);
  } catch (error) {
      console.error("Error processing attendance:", error);
      return errorResponse(res, error, "Error updating Attendance", 500);
  }
};


exports.updateAttendanceAndNotify = async (req, res) => {
  const { user_id } = req.query;

  try {
    // Fetch user details
    const userQuery = `
      SELECT id, role_id, team_id 
      FROM users 
      WHERE id = ? AND deleted_at IS NULL
    `;
    const [userResult] = await db.query(userQuery, [user_id]);

    if (userResult.length === 0) {
      return errorResponse(res, "User not found or deleted", "Error updating attendance", 404);
    }

    const { role_id, team_id } = userResult[0];

    // Fetch team name
    const teamQuery = `
      SELECT name 
      FROM teams 
      WHERE id = ? AND deleted_at IS NULL
    `;
    const [teamResult] = await db.query(teamQuery, [team_id]);

    const teamName = teamResult.length > 0 ? teamResult[0].name : 'Unknown Team';

    // Prepare notification payload
    const notificationPayload = {
      title: `${teamName} Updated Attendance`,
      body: `${teamName} has updated the team's attendance records.`,
    };
    const today = new Date().toISOString().slice(0, 10);
    // Send notifications based on role
    if (role_id === 3) {
      // Send notification to all PMs
      const userQuery = `
          SELECT id 
          FROM users 
          WHERE deleted_at IS NULL AND team_id IN (?) AND id != ?
      `;
      const teamQuery = `
          SELECT id 
          FROM teams 
          WHERE deleted_at IS NULL AND reporting_user_id = ?
      `;
      const [rows] = await db.query(teamQuery, [user_id]);
      const teamIds = rows.map(row => row.id);
      const userIds = teamIds.length > 0 
          ? (await db.query(userQuery, [teamIds, user_id]))[0].map(row => row.id) 
          : [];
      console.log(today);
       
      await db.query(`DELETE FROM employee_leave WHERE user_id IN (?) AND date = ?`, [userIds, today]);

      const pmUsersQuery = `
        SELECT id 
        FROM users 
        WHERE role_id = 2 AND deleted_at IS NULL
      `;
      const [pmUsers] = await db.query(pmUsersQuery);

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
    } else if (role_id === 2 || role_id === 1) {
      // Send notification to all Admins

      const userQuery = `
          SELECT id 
          FROM users 
          WHERE deleted_at IS NULL  AND role_id IN (2,3);
      `;
      const [rows] = await db.query(userQuery, [user_id]);
      const userIds = rows.map(row => row.id);
      await db.query(`DELETE FROM employee_leave WHERE user_id IN (?) AND date = ?`, [userIds, today]);
 
      const adminUsersQuery = `
        SELECT id 
        FROM users 
        WHERE role_id = 1 AND deleted_at IS NULL
      `;
      const [adminUsers] = await db.query(adminUsersQuery);

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

    return successResponse(res, null, "Attendance updated and notifications sent successfully", 200);
  } catch (error) {
    console.error("Error updating attendance and sending notifications:", error.message);
    return errorResponse(res, error.message, "Error updating attendance", 500);
  }
};


exports.getEmployeeAttendance = async (req, res) => {
    const {
      from_date,
      to_date,
      team_id, // Use team_name instead of team_id
      search,
      page = 1,
      perPage = 10,
      export_status, // Parameter to trigger export
    } = req.query;
  
    try {
      const queryParams = [];
      let dateFilter = '';
      let teamFilter = '';
      let searchFilter = '';
      
      if (!from_date || !to_date) {
        return errorResponse(res, "Both 'from_date' and 'to_date' are required", "Validation error", 400);
      }
  
      // Define date filter
      dateFilter = `
        WITH RECURSIVE date_range AS (
          SELECT ? AS date
          UNION ALL
          SELECT DATE_ADD(date, INTERVAL 1 DAY)
          FROM date_range
          WHERE date < ?
        )
      `;
      queryParams.push(from_date, to_date);
  
      // Team filter
      if (team_id) {
        const teamIds = team_id.split(',').map((id) => id.trim());
        if (teamIds.length > 0) {
          teamFilter = `AND t.id IN (${teamIds.map(() => '?').join(',')})`;
          queryParams.push(...teamIds);
        }
      }
      
  
      // Search filter
      if (search) {
        searchFilter = `AND (u.first_name LIKE ? OR u.employee_id LIKE ? OR t.name LIKE ?)`; 
        queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }
  
      // Main query
      const query = `
        ${dateFilter}
        SELECT 
          u.first_name AS employee_name,
          u.employee_id,
          u.id as user_ids,
         DATE_FORMAT(dr.date, '%d-%m-%Y') AS date,
         DATE_FORMAT(u.created_at, '%d-%m-%Y') AS joining_date,
          t.name AS team_name,
          CASE 
            WHEN el.day_type = 1 THEN 'Absent'
            WHEN el.day_type = 2 THEN 'Half Day'
            ELSE 'Present'
          END AS status,
          CASE 
            WHEN el.day_type = 1 THEN 'Full Day'
            WHEN el.day_type = 2 THEN 'Half Day'
            WHEN el.day_type IS NULL THEN '-'
            ELSE '-'
          END AS day_type,
          CASE 
            WHEN el.half_type = 1 THEN 'First Half'
            WHEN el.half_type = 2 THEN 'Second Half'
            ELSE '-'
          END AS half_type
        FROM 
          date_range dr
        CROSS JOIN users u
        LEFT JOIN teams t ON t.id = u.team_id AND t.deleted_at IS NULL
        LEFT JOIN employee_leave el
          ON el.user_id = u.id AND el.date = dr.date
        WHERE u.deleted_at IS NULL AND u.role_id != 1
        AND DATE(u.created_at) <= dr.date 
        ${teamFilter}
        ${searchFilter}
        ORDER BY u.first_name, dr.date
        ${export_status == 1 ? '' : 'LIMIT ? OFFSET ?'}; -- Skip pagination for export
      `;
  
      // Add pagination if not exporting
      if (export_status == 0) {
        const offset = (page - 1) * perPage;
        queryParams.push(Number(perPage), Number(offset));
      }
  
      // Execute main query
      const [result] = await db.query(query, queryParams);
  
      // Add serial number (s_no) to the rows
      const rowsWithSerialNo = result.map((row, index) => ({
        s_no: export_status == 1
          ? index + 1
          : (parseInt(page, 10) - 1) * parseInt(perPage, 10) + index + 1,
        ...row,
      }));
  
      // Handle export
      if (export_status == 1) {
        const { Parser } = require("json2csv");
        const json2csvParser = new Parser();
        const csv = json2csvParser.parse(rowsWithSerialNo);
  
        res.header('Content-Type', 'text/csv');
        res.attachment('attendance_data.csv');
        return res.send(csv);
      }
  
      // Count total records
      const totalRecordsQuery = `
        ${dateFilter}
        SELECT COUNT(*) AS total
        FROM 
          date_range dr
        CROSS JOIN users u
        LEFT JOIN teams t ON t.id = u.team_id -- Join teams table
        LEFT JOIN employee_leave el
          ON el.user_id = u.id AND el.date = dr.date
        WHERE u.deleted_at IS NULL AND u.role_id != 1 
        AND DATE(u.created_at) <= dr.date
        ${teamFilter}
        ${searchFilter};
      `;
      const [totalRecordsResult] = await db.query(
        totalRecordsQuery,
        queryParams.slice(0, queryParams.length - 2) // Exclude LIMIT and OFFSET params
      );
  
      const totalRecords = totalRecordsResult[0]?.total || 0;
  
      // Pagination metadata
      const pagination = page && perPage ? getPagination(page, perPage, totalRecords) : null;
  
      return successResponse(
        res,
        rowsWithSerialNo,
        rowsWithSerialNo.length === 0 ? 'No Records found' : 'Records fetched successfully',
        200,
        pagination
      );
    } catch (error) {
      return errorResponse(res, error.message, "Error fetching Attendance Report", 500);
    }
  };





