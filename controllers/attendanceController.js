const db = require("../config/db");
const { successResponse, errorResponse } = require("../helpers/responseHelper");
const moment = require('moment');
const {attendanceValidator}=  require("../validators/AttendanceValidator")

exports.getAttendanceList = async (req, res) => {
    try {
      const { search, status, date, page = 1, size = 10 } = req.body;
  
      // Ensure `page` and `size` are numbers and default values are handled
      const pageNum = Math.max(parseInt(page, 10), 1);
      const pageSize = Math.max(parseInt(size, 10), 1);
  
      const offset = (pageNum - 1) * pageSize;
  
      let query = '';
      const authUser = 3;
  
      if (status === 'Present'){
        // Query for Present
        query = `
          SELECT 
            users.id,
            users.name,
            users.employee_id,
            teams.reporting_user_id,
            employee_leave.date,
            CASE 
                WHEN employee_leave.day_type = 1 THEN 'Full Day'
                WHEN employee_leave.day_type = 2 THEN 'Half Day'
                ELSE 'Unknown'
            END AS day_type,
            CASE 
                WHEN employee_leave.half_type = 1 THEN 'First Half'
                WHEN employee_leave.half_type = 2 THEN 'Second Half'
                ELSE 'Unknown'
            END AS half_type
          FROM 
            users
          LEFT JOIN 
            teams ON users.team_id = teams.id 
          LEFT JOIN 
            employee_leave ON users.id = employee_leave.user_id 
            AND employee_leave.day_type != 1
            AND DATE(employee_leave.date)
          WHERE 
            users.role_id != 2 
            AND teams.reporting_user_id = ? 
            AND users.id != ?
        `;
      } else if (status === 'Absent') {
        // Query for Absent
        query = `
        SELECT 
          users.id,
          users.name,
          users.employee_id,
          teams.reporting_user_id,
          employee_leave.date,
          CASE 
            WHEN employee_leave.day_type = 1 THEN 'Full Day'
            WHEN employee_leave.day_type = 2 THEN 'Half Day'
            ELSE 'Unknown'
        END AS day_type,
        CASE 
            WHEN employee_leave.half_type = 1 THEN 'First Half'
            WHEN employee_leave.half_type = 2 THEN 'Second Half'
            ELSE 'Unknown'
        END AS half_type
        FROM 
          employee_leave
        JOIN 
          users ON employee_leave.user_id = users.id
        JOIN 
          teams ON users.team_id = teams.id
        WHERE 
          users.role_id != 2 
          AND teams.reporting_user_id = ? 
          AND users.id != ? 
          
      `;
      } else {
        return errorResponse(res, "Invalid status provided", "Error fetching data", 400);
      }
  
      const queryParams = [authUser, authUser];

    //   if (date) {
    //     if (!moment(date, 'YYYY-MM-DD', true).isValid()) {

    //       return errorResponse(res, "Invalid date format. Use 'YYYY-MM-DD'.", "Error fetching data", 400);
    //     }
    //     query += ` AND DATE(employee_leave.date) = ? `;
    //     queryParams.push(date);
    //   }
      console.log(query); // This will print the full query with placeholders
      console.log(queryParams);
      // Apply search filter if provided
      if (search) {
        query += `
          AND (users.name LIKE ? OR users.employee_id LIKE ?)
        `;
        queryParams.push(`%${search}%`, `%${search}%`);
      }
  
      // Pagination
      query += `
        LIMIT ? OFFSET ?
      `;
      queryParams.push(pageSize, offset);
  
      // Execute query
      const [result] = await db.query(query, queryParams);
  
      // Count total records for pagination
      const countQuery = `
        SELECT COUNT(*) AS total
        FROM (${query}) AS count_table
      `;
      const [countResult] = await db.query(countQuery, queryParams);
      const total_records = countResult[0].total;
  
      // Calculate pagination details
      const total_pages = Math.ceil(total_records / pageSize);
      const rangeFrom = `Showing ${(pageNum - 1) * pageSize + 1}-${Math.min(
        pageNum * pageSize,
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
        "Attendance data fetched successfully",
        200
      );
    } catch (error) {
      return errorResponse(res, error.message, "Error fetching attendance data", 500);
    }
  };


// Controller function
exports.updateAttendance = async (req, res) => {
    const { ids, date, attendanceType, halfDay, statusFilter } = req.body;
  
    // Validate the request data
    const { error } = attendanceValidator.validate(
      { ids, date, attendanceType, halfDay, statusFilter },
      { abortEarly: false }
    );
    if (error) {
      const errorMessages = error.details.reduce((acc, err) => {
        acc[err.path[0]] = err.message;
        return acc;
      }, {});
      return errorResponse(res, errorMessages, "Validation Error", 400);
    }
  
    const updated_by = 1;
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
          
              if (conflictingRecord[0]?.length) {
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
  


  


