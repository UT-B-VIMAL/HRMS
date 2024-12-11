const db = require("../config/db");
const { successResponse, errorResponse } = require("../helpers/responseHelper");
const moment = require('moment');

exports.getAttendanceList = async (req, res) => {
    try {
      const { search, status, date, page = 1, size = 10 } = req.body;
  
      // Ensure `page` and `size` are numbers and default values are handled
      const pageNum = Math.max(parseInt(page, 10), 1);
      const pageSize = Math.max(parseInt(size, 10), 1);
  
      const offset = (pageNum - 1) * pageSize;
  
      let query = '';
      const authUser = 3;
      let queryParams=[];
      if (status === 'Present') {
        // Query for Present
        query = `
          SELECT 
            users.id,
            users.first_name,
            users.employee_id,
            teams.reporting_user_id,
            
            'Full Day' AS day_type,
            'N/A' AS half_type
          FROM 
            users
          LEFT JOIN 
            teams ON users.team_id = teams.id
          WHERE 
            users.role_id != 2 
            AND teams.reporting_user_id = ?
            AND users.id != ?
            AND NOT EXISTS (
              SELECT 1 
              FROM employee_leave
              WHERE employee_leave.user_id = users.id
                AND DATE(employee_leave.date) = CURDATE()
            )
          
          UNION ALL
          
          SELECT 
            users.id,
            users.first_name,
            users.employee_id,
            teams.reporting_user_id,
            
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
        queryParams = [authUser, authUser, authUser, authUser];
      } else if (status === 'Absent') {
        // Query for Absent
        query = `
        SELECT 
          users.id,
          users.first_name,
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
     queryParams = [authUser, authUser];

      } else {
        return errorResponse(res, "Invalid status provided", "Error fetching data", 400);
      }
  

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
          AND (users.first_name LIKE ? OR users.employee_id LIKE ?)
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
  
  


