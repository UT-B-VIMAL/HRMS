const db = require("../config/db");
const { successResponse, errorResponse } = require("../helpers/responseHelper");
const moment = require('moment');
const {attendanceSchema}=  require("../validators/AttendanceValidator")

exports.getAttendanceList = async (req, res) => {
    try {
      const { search, status, date, page = 1, size = 10 } = req.body;
  
      // Ensure `page` and `size` are numbers and default values are handled
      const pageNum = Math.max(parseInt(page, 10), 1);
      const pageSize = Math.max(parseInt(size, 10), 1);
  
      const offset = (pageNum - 1) * pageSize;
  
      let query = '';
      const authUser = 3;
  
      if (status === 'Present') {
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
exports.store = async (req, res) => {

  // Validate the request data
  const { error, value } = attendanceSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ errors: error.details.map((err) => err.message) });
  }

  const { ids, date, attendanceType, statusFilter, halfDay } = value;

  try {
    for (const id of ids) {
      // Check if record exists
      const existingRecord = await db.raw(
        `SELECT * FROM employee_leave WHERE user_id = ? AND date = ?`,
        [id, date]
      );

      if (existingRecord[0]?.length > 0) {
        // Update record if it exists
        await db.raw(
          `UPDATE employee_leave 
          SET day_type = ?, half_type = ?, updated_by = ? 
          WHERE user_id = ? AND date = ?`,
          [attendanceType, halfDay, req.user.id, id, date]
        );
      } else {
        // Insert a new record if it does not exist
        await db.raw(
          `INSERT INTO employee_leave (user_id, date, day_type, half_type, updated_by) 
          VALUES (?, ?, ?, ?, ?)`,
          [id, date, attendanceType, halfDay, req.user.id]
        );
      }

      // Specific logic for Present status with half-day
      if (statusFilter === "Present" && attendanceType === 2) {
        const newHalfType = halfDay === 1 ? 2 : 1;
        await db.raw(
          `UPDATE employee_leave SET half_type = ? WHERE user_id = ? AND date = ?`,
          [newHalfType, id, date]
        );
      }
    }

    // Handle deletion for Present status and full-day attendance
    if (statusFilter === "Present" && attendanceType === 1) {
      for (const id of ids) {
        await db.raw(`DELETE FROM employee_leave WHERE user_id = ? AND date = ?`, [id, date]);
      }
    }

    return res.status(200).json({ success: "Successfully Submitted" });
  } catch (error) {
    console.error("Error processing attendance:", error);
    return res.status(500).json({ error: "Something went wrong" });
  }
};


  


