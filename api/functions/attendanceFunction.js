const db = require("../../config/db");
const {successResponse,errorResponse,} = require("../../helpers/responseHelper");

const moment = require('moment');
const {attendanceValidator, attendanceFetch}=  require("../../validators/AttendanceValidator");
const getPagination = require("../../helpers/pagination");
const { getAuthUserDetails, getUserIdFromAccessToken, getExcludedRoleIdsByPermission } = require("./commonFunction");
const { Parser } = require('json2csv');
const { userSockets } = require("../../helpers/notificationHelper");
const { hasPermission } = require("../../controllers/permissionController");


exports.getAttendance = async (req, res) => {
  const { date, search, page = 1, perPage = 10 } = req.query;

  try {
    const accessToken = req.headers.authorization?.split(" ")[1];
    if (!accessToken) {
      return errorResponse(res, "Access token is required", 401);
    }

    const user_id = await getUserIdFromAccessToken(accessToken);
    const today = new Date().toISOString().slice(0, 10);
    const dynamicDate = date || today;

    const hasAllAttendance = await hasPermission("attendance.all_view_attendance", accessToken);
    const hasTeamAttendance = await hasPermission("attendance.team_view_attendance", accessToken);
    const hasExceedRole = await hasPermission("attendance.show_excluded_roles", accessToken);
    const hasExcludeFromAssociates = await hasPermission("attendance.exclude_from_associates", accessToken);

    if (!hasAllAttendance && !hasTeamAttendance) {
      return errorResponse(res, null, "Access denied", 403);
    }

    const { error } = attendanceFetch.validate({ user_id }, { abortEarly: false });
    if (error) {
      const errorMessages = error.details.reduce((acc, err) => {
        acc[err.path[0]] = err.message;
        return acc;
      }, {});
      return errorResponse(res, errorMessages, "Validation Error", 400);
    }

    const user = await getAuthUserDetails(user_id, res);

    if (hasTeamAttendance) {
      const [teamResult] = await db.query(
        "SELECT id FROM teams WHERE deleted_at IS NULL AND reporting_user_id = ?",
        [user_id]
      );
      if (!teamResult.length) {
        return errorResponse(res, null, "You are not currently assigned a reporting TL for your team", 400);
      }
    }

    let baseQuery = `
      FROM 
        users u
      LEFT JOIN 
        employee_leave el ON u.id = el.user_id AND el.date = ?
      LEFT JOIN 
        teams t ON FIND_IN_SET(t.id, u.team_id)
      WHERE 
        u.deleted_at IS NULL
    `;
    let queryParams = [dynamicDate];

    let excludedRoleIds = hasExceedRole ? await getExcludedRoleIdsByPermission("attendance.show_excluded_roles") : [];
    let excludeAssociateRoleIds = hasExcludeFromAssociates ? await getExcludedRoleIdsByPermission("attendance.exclude_from_associates") : [];

    // Role filters
    if (hasAllAttendance && excludeAssociateRoleIds.length > 0) {
      console.log("Excluding associate roles:", excludeAssociateRoleIds);
      baseQuery += ` AND u.role_id NOT IN (${excludeAssociateRoleIds.map(() => '?').join(',')})`;
      queryParams.push(...excludeAssociateRoleIds);
    }
    if (hasTeamAttendance) {
      baseQuery += ` AND (t.reporting_user_id = ? OR FIND_IN_SET(?, u.team_id))`;
      queryParams.push(user_id, user.team_id);

      if (excludedRoleIds.length > 0) {
        baseQuery += ` AND u.role_id NOT IN (${excludedRoleIds.map(() => '?').join(',')})`;
        queryParams.push(...excludedRoleIds);
      }

      baseQuery += ` AND u.id != ?`;
      queryParams.push(user_id);
    }
    // Search
    if (search) {
      baseQuery += `
        AND (
          REPLACE(CONCAT(u.first_name, ' ', u.last_name), ' ', '') LIKE REPLACE(?, ' ', '')
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

    baseQuery += ' AND (u.created_at <= ? OR u.created_at LIKE ?)';
    queryParams.push(dynamicDate, `${dynamicDate}%`);

    // First run COUNT query
    const [countResult] = await db.query(`SELECT COUNT(*) AS total ${baseQuery}`, queryParams);
    const totalRecords = countResult[0]?.total || 0;

    const pagination = getPagination(page, perPage, totalRecords);
    const offset = (Number(page) - 1) * Number(perPage);

    // Now fetch paginated data
    const paginatedQuery = `
      SELECT 
        u.id AS user_id, 
        COALESCE(CONCAT(u.first_name, ' ', u.last_name)) AS first_name, 
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
      ${baseQuery}
      LIMIT ?, ?
    `;

    const paginatedParams = [...queryParams, offset, Number(perPage)];
    const [result] = await db.query(paginatedQuery, paginatedParams);

    const rowsWithSerialNo = result.map((row, index) => ({
      s_no: offset + index + 1,
      ...row,
    }));

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

  let { id, date, attendanceType, halfDay, status , import_status } = req.body;
  const accessToken = req.headers.authorization?.split(" ")[1];
  if (!accessToken) {
    return errorResponse(res, "Access token is required", 401);
  }
  console.log(accessToken)
  const updated_by = await getUserIdFromAccessToken(accessToken);
  if( import_status == 1) {
    const [empUsers] = await db.query(`SELECT id FROM users WHERE employee_id = ?`, [id]);
    if (!empUsers.length) {
      return errorResponse(res, "Employee Id Not Found", `Employee ID ${id} does not exist in the users table.`, 404);
    }
    id = empUsers[0].id; // Use the ID from the users table
  }
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
    // const accessToken = req.headers.authorization?.split(" ")[1];
    // if (!accessToken) {
    //   return errorResponse(res, "Access token is required", 401);
    // }

    // const user_id = await getUserIdFromAccessToken(accessToken);
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

  // const hasAllAttendance = await hasPermission("attendance.team_all_present", accessToken);
  // const hasTeamAttendance = await hasPermission("attendance.all_all_present", accessToken);
  // const hasExceedRole = await hasPermission("attendance.excluded_roles_all_present", accessToken);
  // const hasExcludeFromAssociates = await hasPermission("attendance.exclude_from_associates", accessToken);
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
        if (export_status == 1) {
        const { Parser } = require("json2csv");

        // Group by user_id
        const groupedData = {};

        rowsWithSerialNo.forEach(row => {
          const userId = row.user_ids;

          if (!groupedData[userId]) {
            groupedData[userId] = {
              employee_id: row.employee_id,
              employee_name: row.employee_name,
              joining_date: row.joining_date,
              team_name: row.team_name,
              dates: [],
              statuses: [],
              day_types: [],
              half_types: [],
            };
          }

          groupedData[userId].dates.push(row.date);
          groupedData[userId].statuses.push(row.status);
          groupedData[userId].day_types.push(row.day_type);
          groupedData[userId].half_types.push(row.half_type);
        });

        // Prepare export array
        const exportData = Object.values(groupedData).map((user,index )=> ({
          "S.No": index + 1,
          "Employee ID": user.employee_id,
          "Employee Name": user.employee_name,
          "Team Name": user.team_name,
          "Dates": user.dates.join(', '),
          "Day Types(L)": user.day_types.join(', '),
          "Half Types(L)": user.half_types.join(', '),
          "Attendance Statuses": user.statuses.join(', '),

        }));

        const json2csvParser = new Parser({ });
        const csv = json2csvParser.parse(exportData);

        res.header('Content-Type', 'text/csv');
        res.attachment('attendance_data.csv');
        return res.send(csv);
      }

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





