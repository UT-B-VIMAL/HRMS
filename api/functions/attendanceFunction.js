const db = require("../../config/db");
const {successResponse,errorResponse,} = require("../../helpers/responseHelper");

const moment = require('moment');
const {attendanceValidator, attendanceFetch}=  require("../../validators/AttendanceValidator");
const getPagination = require("../../helpers/pagination");
const { getAuthUserDetails } = require("./commonFunction");
const { Parser } = require('json2csv');


exports.getAttendance = async (req, res) => {
  const { status, date, search, page = 1, perPage = 10, user_id } = req.query;

  try {
      let query = '';
      let queryParams = [];
   const { error } = attendanceFetch.validate(
      { status,user_id },
      { abortEarly: false }
    );
    if (error) {
      const errorMessages = error.details.reduce((acc, err) => {
        acc[err.path[0]] = err.message;
        return acc;
      }, {});
      return errorResponse(res, errorMessages, "Validation Error", 400);
    }
    if (status === 'Present') {
      // Use today's date as default if `date` is not provided
      const today = new Date().toISOString().slice(0, 10);
      const dynamicDate = date || today; // If `date` is provided, use it; otherwise, use today's date
    
      query = `
        SELECT 
            u.id AS user_id, 
            u.first_name, 
            u.employee_id,
            el.day_type, 
            el.date AS leave_date, 
            CASE 
                WHEN el.day_type = 1 THEN 'Full Day' 
                WHEN el.day_type = 2 THEN 'Half Day' 
                ELSE 'Full Day' 
            END AS day_type,
            CASE 
                WHEN el.half_type = 1 THEN 'Second Half' 
                WHEN el.half_type = 2 THEN 'First Half' 
                ELSE null 
            END AS half_type
        FROM 
            users u
        LEFT JOIN 
            employee_leave el 
            ON u.id = el.user_id AND el.day_type != 1  
        LEFT JOIN 
            teams t 
            ON u.team_id = t.id  
        WHERE 
            t.reporting_user_id = ?  
            AND u.id != ? 
            AND u.role_id != 2
            AND u.deleted_at IS NULL
            AND u.id NOT IN (
                SELECT user_id 
                FROM employee_leave 
                WHERE date = ? 
            )
            ${search ? 'AND (u.first_name LIKE ? OR u.employee_id LIKE ?)' : ''}  
        LIMIT ?, ?
      `;
    
      queryParams.push(user_id, user_id); 
      queryParams.push(dynamicDate); 
    
      if (search) {
        queryParams.push(`%${search}%`, `%${search}%`); 
      }
    
      queryParams.push((Number(page) - 1) * Number(perPage), Number(perPage)); // Pagination
    }else if (status === 'Absent') {
      const today = new Date().toISOString().slice(0, 10);
      const dynamicDate = date || today; 
      // Fetch records from the employee leave table only
      query = `SELECT  el.user_id,u.first_name, u.employee_id, 
              el.date, el.day_type as day_type_val, el.half_type as half_type_val,
          CASE 
              WHEN el.day_type = 1 THEN 'Full Day' 
              WHEN el.day_type = 2 THEN 'Half Day' 
              ELSE null
          END AS day_type,
          el.date AS leave_date,
          CASE 
              WHEN el.half_type = 1 THEN 'First Half' 
              WHEN el.half_type = 2 THEN 'Second Half' 
              ELSE null
          END AS half_type
      FROM employee_leave el
      INNER JOIN users u ON el.user_id = u.id  -- Join with users table to get user details
      INNER JOIN teams t ON t.reporting_user_id = ?  
      WHERE el.user_id IN (SELECT id FROM users WHERE team_id = t.id AND id != ? AND role_id != 2)
       AND u.deleted_at IS NULL
      ${dynamicDate ? 'AND el.date = ?' : ''}  -- Optional date filter
      ${search ? 'AND (u.first_name LIKE ? OR u.employee_id LIKE ?)' : ''}  -- Optional search filter
      LIMIT ?, ?
      `;
          
      queryParams.push(user_id,user_id); // reporting_user_id condition
      queryParams.push(dynamicDate); // Optional date filter
      if (search) {
          queryParams.push(`%${search}%`, `%${search}%`); // Search filter (first_name or email)
      }
  
      queryParams.push((Number(page) - 1) * Number(perPage), Number(perPage)); // Pagination
      }
  
    // Execute query
    const [result] = await db.query(query, queryParams);
      const totalRecords = result.length > 0 ? result.length : 0;
      const rowsWithSerialNo = result.map((row, index) => ({
          s_no: page && perPage ? (parseInt(page, 10) - 1) * parseInt(perPage, 10) + index + 1 : index + 1,
          ...row,
      }));
  
    const pagination = page && perPage ? getPagination(page, perPage, totalRecords) : null;

    // Return paginated data with results
    return successResponse(res, rowsWithSerialNo, rowsWithSerialNo.length === 0 ? 'No Records found' : 'Records fetched successfully', 200, pagination);

  } catch (error) {
    return errorResponse(res, error.message, "Error fetching attendance data", 500);
  }
};



// Controller function
exports.updateAttendanceData = async (req, res) => {
    let { ids, date, attendanceType, halfDay, statusFilter ,updated_by} = req.body;
  
    // Validate the request data
    const { error } = attendanceValidator.validate(
      { ids, date, attendanceType, halfDay, statusFilter ,updated_by},
      { abortEarly: false }
    );
    if (error) {
      const errorMessages = error.details.reduce((acc, err) => {
        acc[err.path[0]] = err.message;
        return acc;
      }, {});
      return errorResponse(res, errorMessages, "Validation Error", 400);
    }
    if(attendanceType == 1){
      halfDay=null;
    }
    await getAuthUserDetails(updated_by, res)
    try {
      const results = await db.query(`SELECT id FROM users WHERE id IN (?)`, [ids]);
      const existingIds = results[0].map((row) => row.id);
      const missingIds = ids.filter((id) => !existingIds.includes(id));
      
      if (missingIds.length > 0) {
        return errorResponse(
          res,
          "User Ids Not found",
          `The following IDs do not exist in the users table: ${missingIds.join(", ")}`,
          500
        );
      }
  
      for (const id of ids) {
        // Check if record exists
        const query = `SELECT * FROM employee_leave WHERE user_id = ? AND date = ?`;
        const existingRecord = await db.query(query, [id, date]);
        
        // Handle Absent status
        if (statusFilter === "Absent") {
            if (!existingRecord[0]?.length) {
              // Insert record if it doesn't exist
              await db.query(
                `INSERT INTO employee_leave (user_id, date, day_type, half_type, updated_by) 
                VALUES (?, ?, ?, ?, ?)`,
                [id, date, attendanceType, halfDay, updated_by]
              );
            } else {
              // Check for conflicting half_type values
              const conflictingHalfTypeQuery = `
                SELECT * 
                FROM employee_leave 
                WHERE user_id = ? AND date = ? AND 
                ((half_type = 2 AND ? = 1) OR (half_type = 1 AND ? = 2))`;
              
              const conflictingRecord = await db.query(conflictingHalfTypeQuery, [id, date, halfDay, halfDay]);
            // console.log(conflictingRecord[0]?.length)
              if (conflictingRecord[0]?.length) {
                // return errorResponse(res, conflictingRecord[0]?.length, "Validation Error", 400);
                // Update record to set half_type = NULL
                await db.query(
                  `UPDATE employee_leave 
                  SET day_type = 1, half_type = NULL, updated_by = ? 
                  WHERE user_id = ? AND date = ?`,
                  [ updated_by, id, date]
                );
              } else {
                // Update existing record without conflicts
                await db.query(
                  `UPDATE employee_leave 
                  SET day_type = ?, half_type = ?, updated_by = ? 
                  WHERE user_id = ? AND date = ?`,
                  [attendanceType, halfDay, updated_by, id, date]
                );
              }
            }
          }
          
  
        // Handle Present status
        if (statusFilter === "Present") {
            const conflictingHalfTypeQuery = `
            SELECT * 
            FROM employee_leave 
            WHERE user_id = ? AND date = ? AND day_type= ? AND half_type= ?  `
            const conflictingRecord = await db.query(conflictingHalfTypeQuery, [id, date, attendanceType, halfDay]);

          if (attendanceType === 1|| conflictingRecord[0]?.length) {
            // Delete record if day_type = 1
            await db.query(`DELETE FROM employee_leave WHERE user_id = ? AND date = ?`, [id, date]);
          } else if (attendanceType === 2) {
            // Check for record with day_type = 2, half_type = 1
            // const halfDayCheckQuery = `SELECT * FROM employee_leave WHERE user_id = ? AND date = ? AND day_type = 2 AND half_type = 1`;
            // const halfDayRecord = await db.query(halfDayCheckQuery, [id, date]);
  
            if (halfDay==1) {
              // Update record to day_type = 1 and half_type = NULL
              await db.query(
                `UPDATE employee_leave 
                SET day_type = 2, half_type = 2, updated_by = ? 
                WHERE user_id = ? AND date = ?`,
                [updated_by, id, date]
              );
            }else if(halfDay == 2){
                await db.query(
                    `UPDATE employee_leave 
                    SET day_type = 2, half_type = 1, updated_by = ? 
                    WHERE user_id = ? AND date = ?`,
                    [updated_by, id, date]
                  );
            }
          }
        }
      }
  
      return successResponse(res, null, "Attendance Updated Successfully", 200);
    } catch (error) {
      console.error("Error processing attendance:", error);
      return errorResponse(res, error, "Error updating Attendance", 500);
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
        searchFilter = `AND u.first_name LIKE ?`;
        queryParams.push(`%${search}%`);
      }
  
      // Main query
      const query = `
        ${dateFilter}
        SELECT 
          u.first_name AS employee_name,
          u.employee_id,
          dr.date AS date,
          t.name AS team_name,
          CASE 
            WHEN el.user_id IS NOT NULL THEN 'Absent'
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
        s_no: export_status
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
  
  

  

