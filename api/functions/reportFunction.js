const db = require('../../config/db'); 
const { successResponse, errorResponse ,getPagination} = require('../../helpers/responseHelper');
const moment = require('moment');


const convertSecondsToReadableTime = (seconds) => {
    const days = Math.floor(seconds / 86400); // 1 day = 86400 seconds
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    let result = '';
    if (days > 0) result += `${days}d `;
    if (hours > 0 || days > 0) result += `${hours}h `;
    if (minutes > 0 || hours > 0 || days > 0) result += `${minutes}m `;
    if (remainingSeconds > 0 || minutes === 0) result += `${remainingSeconds}s`;

    return result.trim();
};

exports.getTimeListReport = async (req, res) => {
    try {
        const { fromDate, toDate, teamId, search, page = 1, perPage = 10 } = req.query;
        const offset = (page - 1) * perPage;

        // Base query to get user time, leave, and team information
        let query = `
            SELECT 
                u.id AS user_id, 
                u.employee_id, 
                COALESCE(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(NULLIF(u.last_name, ''), '')), 'Unknown User') AS user_name, 
                u.email AS user_email,
                u.team_id,
                tm.name AS team_name, 
                SUM(TIME_TO_SEC(t.total_hours_worked)) AS total_worked_seconds_tasks,
                SUM(TIME_TO_SEC(st.total_hours_worked)) AS total_worked_seconds_subtasks,
                SUM(CASE 
                    WHEN el.day_type = 1 THEN 1 -- Full-day leave
                    WHEN el.day_type = 2 THEN 2 -- Half-day leave
                    ELSE 0 -- No leave
                END) AS leave_type,
                el.date AS leave_date,
                COALESCE(SUM(TIME_TO_SEC(sut.end_time) - TIME_TO_SEC(sut.start_time)), 0) AS total_task_seconds
            FROM users u
            LEFT JOIN tasks t ON t.user_id = u.id 
            AND t.deleted_at IS NULL
            LEFT JOIN sub_tasks st ON st.user_id = u.id
            AND st.deleted_at IS NULL
            LEFT JOIN employee_leave el ON el.user_id = u.id 
            AND el.date BETWEEN ? AND ?  -- Filter leave records between fromDate and toDate
            LEFT JOIN sub_tasks_user_timeline sut ON sut.user_id = u.id
            AND sut.created_at BETWEEN ? AND ? 
            LEFT JOIN teams tm ON u.team_id = tm.id  
            WHERE u.deleted_at IS NULL`;

        // Filter conditions
        const values = [];
        values.push(fromDate, toDate); // leave date range
        values.push(fromDate, toDate); // timeline date range

        // Add filtering conditions based on teamId
        if (teamId) {
            query += ` AND u.team_id = ?`;
            values.push(teamId);
        }

        // Add search condition for user name or email
        if (search) {
            query += ` AND (u.first_name LIKE ? OR u.email LIKE ?)`;
            values.push('%' + search + '%', '%' + search + '%');
        }
        

        // Group by user ID and team ID
        query += `
            GROUP BY u.id, u.team_id
            LIMIT ? OFFSET ?`;

        // Add pagination
        values.push(parseInt(perPage), parseInt(offset));

        // Execute the query
        const [result] = await db.query(query, values);

        if (!result || result.length === 0) {
            return successResponse(res, [], "No records found", 200, { page, perPage });
        }

        // Calculate worked and idle hours
        const expectedWorkHoursInSeconds = 8 * 60 * 60; // 8 hours in seconds
        const data = result.map((row, index) => {
            const totalWorkedSeconds = 
                (row.total_worked_seconds_tasks || 0) + 
                (row.total_worked_seconds_subtasks || 0) + 
                (row.total_task_seconds || 0);
            
            let idleSeconds = 0;
            const leaveType = row.leave_type;

            // If the employee has not worked enough hours, calculate idle time
            if (leaveType === 0 && totalWorkedSeconds < expectedWorkHoursInSeconds) {
                idleSeconds = expectedWorkHoursInSeconds - totalWorkedSeconds;
            }

            // If the employee is on leave, skip idle hour calculation
            if (leaveType !== 0) {
                idleSeconds = 0;
            }

            return {
                s_no: offset + index + 1,
                user_id: row.user_id,
                employee_id: row.employee_id,
                user_name: row.user_name,
                user_email: row.user_email,
                team_id: row.team_id,
                team_name: row.team_name,  
                total_hours_worked: convertSecondsToReadableTime(totalWorkedSeconds),
                idle_hours: convertSecondsToReadableTime(idleSeconds),
                leave_date: row.leave_date ? row.leave_date : null,
            };
        });

        // Pagination logic
        const totalRecords = result.length;
        const pagination = getPagination(page, perPage, totalRecords);

        successResponse(
            res,
            data,
            data.length === 0 ? "No records found" : "Time list report retrieved successfully",
            200,
            pagination
        );
    } catch (error) {
        console.error('Error:', error.message);
        return errorResponse(res, 'An error occurred', error.message, 500);
    }
};
