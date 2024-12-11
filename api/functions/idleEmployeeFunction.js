const db = require('../../config/db'); 
const { successResponse, errorResponse,getPagination } = require('../../helpers/responseHelper');
const moment = require('moment');


exports.get_idleEmployee = async (req, res) => {
    try {
        const { team_id, page = 1, perPage = 10 } = req.query;
        const offset = (page - 1) * perPage;

        // Base query to get idle employees
        let query = `
            SELECT id, employee_id,   
           COALESCE(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(NULLIF(last_name, ''), '')), '') AS user_name, 
           team_id, role_id 
            FROM users 
            WHERE NOT EXISTS (
                SELECT 1 
                FROM sub_tasks_user_timeline 
                WHERE sub_tasks_user_timeline.user_id = users.id 
                AND DATE(sub_tasks_user_timeline.created_at) = CURRENT_DATE
                AND sub_tasks_user_timeline.end_time IS NOT NULL
            ) 
            AND NOT EXISTS (
                SELECT 1 
                FROM employee_leave 
                WHERE employee_leave.user_id = users.id 
                AND DATE(employee_leave.date) = CURRENT_DATE
            )
        `;

        const queryParams = [];

        // If team_id is provided, add the condition
        if (team_id) {
            query += ` AND team_id = ?`;
            queryParams.push(team_id);
        }

        // Add pagination to the query
        query += ` LIMIT ? OFFSET ?`;
        queryParams.push(parseInt(perPage), parseInt(offset));

        // Query to get the total count of records for pagination, filtered by team_id if provided
        let countQuery = `
            SELECT COUNT(*) AS total_records
            FROM users 
            WHERE NOT EXISTS (
                SELECT 1 
                FROM sub_tasks_user_timeline 
                WHERE sub_tasks_user_timeline.user_id = users.id 
                AND DATE(sub_tasks_user_timeline.created_at) = CURRENT_DATE
                AND sub_tasks_user_timeline.end_time IS NOT NULL
            ) 
            AND NOT EXISTS (
                SELECT 1 
                FROM employee_leave 
                WHERE employee_leave.user_id = users.id 
                AND DATE(employee_leave.date) = CURRENT_DATE
            )
        `;

        // If team_id is provided, add the condition to the count query as well
        if (team_id) {
            countQuery += ` AND team_id = ?`;
            queryParams.push(team_id); // Ensure we add the same team_id to the count query
        }

        const [result] = await db.query(query, queryParams);
        const [countResult] = await db.query(countQuery, queryParams);

        const totalRecords = countResult[0].total_records;

        // Calculate pagination (ensure `getPagination` function exists and works)
        const pagination = getPagination(page, perPage, totalRecords);
        
        // Add serial number to the result
        const data = result.map((row, index) => ({
            s_no: (page - 1) * perPage + index + 1, // Serial number calculation based on page and perPage
            ...row, // Spread the rest of the row data
        }));

        successResponse(res, data, data.length === 0 ? 'No idle employees found' : 'Idle employees retrieved successfully', 200, pagination);

    } catch (error) {
        console.error('Caught Error:', error);
        return errorResponse(res, error.message || 'An unknown error occurred', 'Error retrieving idle employees', 500);
    }
};





