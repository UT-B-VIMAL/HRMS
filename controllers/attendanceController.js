const db = require("../config/db");
const { successResponse, errorResponse } = require("../helpers/responseHelper");


exports.getAttendanceList = async (req, res) => {
    // try {
    //   const { search, status, page = 1, size = 10 } = req.body;
  
    //   // Ensure `page` and `size` are numbers and default values are handled
    //   const pageNum = Math.max(parseInt(page, 10), 1);
    //   const pageSize = Math.max(parseInt(size, 10), 1);
  
    //   const offset = (pageNum - 1) * pageSize;
  
    //   let query = '';
    //   const queryParams = [];
    //   const authUser =10;
    //   if (status === 'Present') {
    //     // Query for Present
    //     query = `
    //       SELECT 
    //         users.id,
    //         users.name,
    //         users.employee_id,
    //         teams.reporting_user_id
    //       FROM 
    //         users
    //       LEFT JOIN 
    //         teams ON users.team_id = teams.id 
    //       LEFT JOIN 
    //         employee_leave ON users.id = employee_leave.user_id 
    //         AND employee_leave.day_type != 1
    //       WHERE 
    //         users.role_id != 2 
    //         AND teams.reporting_user_id = 10 
    //     `;
    //   } else if (status === 'Absent') {
    //     // Query for Absent
    //     query = `
    //       SELECT 
    //         users.id,
    //         users.name,
    //         users.employee_id,
    //       FROM 
    //         users
    //       LEFT JOIN 
    //         employee_leave ON users.id = employee_leave.user_id 
    //       WHERE 
    //         users.role_id != 2
           
    //     `;
    //   } else {
    //     return errorResponse(res, "Invalid status provided", "Error fetching data", 400);
    //   }
  
    //   // Apply search filter if provided
    //   if (search) {
    //     query += `
    //       AND (users.name LIKE ? OR users.employee_id LIKE ?)
    //     `;
    //     queryParams.push(`%${search}%`, `%${search}%`);
    //   }
  
    //   // Pagination
    //   query += `
    //     LIMIT ? OFFSET ?
    //   `;
    //   queryParams.push(pageSize, offset);
  
    //   // Execute query
    //   const [result] = await db.query(query, queryParams);
  
    //   // Count total records for pagination
    //   const countQuery = `
    //     SELECT COUNT(*) AS total
    //     FROM (${query}) AS count_table
    //   `;
    //   const [countResult] = await db.query(countQuery, queryParams);
    //   const total_records = countResult[0].total;
  
    //   // Calculate pagination details
    //   const total_pages = Math.ceil(total_records / pageSize);
    //   const rangeFrom = `Showing ${(pageNum - 1) * pageSize + 1}-${Math.min(
    //     pageNum * pageSize,
    //     total_records
    //   )} of ${total_records} entries`;
  
    //   // Return paginated data with results
    //   return successResponse(
    //     res,
    //     {
    //       data: result,
    //       pagination: {
    //         total_records,
    //         total_pages,
    //         current_page: pageNum,
    //         per_page: pageSize,
    //         range_from: rangeFrom,
    //       },
    //     },
    //     "Attendance data fetched successfully",
    //     200
    //   );
    // } catch (error) {
    //   return errorResponse(res, error.message, "Error fetching attendance data", 500);
    // }
    return null;
  };
  


