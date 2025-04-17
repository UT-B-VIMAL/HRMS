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


exports.getTeamwiseProductivity = async (req, res) => {
    try {
        const { team_id, from_date,to_date, user_id, employee_id, search, page = 1, perPage = 10 } = req.query;

        const offset = (page - 1) * perPage;

        // Task query
        let taskQuery = `
            SELECT 
                t.user_id,
                t.team_id,
                TIME_TO_SEC(t.estimated_hours) AS estimated_seconds,
                TIME_TO_SEC(t.total_hours_worked) AS worked_seconds,
                TIME_TO_SEC(t.extended_hours) AS extended_seconds,
                t.created_at
            FROM 
                tasks t
            WHERE 
                t.deleted_at IS NULL
        `;

        // Subtask query
        let subtaskQuery = `
            SELECT 
                st.user_id,
                st.team_id,
                TIME_TO_SEC(st.estimated_hours) AS estimated_seconds,
                TIME_TO_SEC(st.total_hours_worked) AS worked_seconds,
                TIME_TO_SEC(st.extended_hours) AS extended_seconds,
                st.created_at
            FROM 
                sub_tasks st
            WHERE 
                st.deleted_at IS NULL
           
        `;

        // Combine task and subtask queries
        let query = `
            SELECT 
                u.id AS user_id,
                COALESCE(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(NULLIF(u.last_name, ''), '')), 'Unknown User') AS employee_name,
                u.employee_id,
                combined.team_id,
                COALESCE(SUM(combined.estimated_seconds), 0) AS total_estimated_seconds,
                COALESCE(SUM(combined.worked_seconds), 0) AS total_worked_seconds,
                COALESCE(SUM(combined.extended_seconds), 0) AS total_extended_seconds
            FROM users u
            LEFT JOIN (
                (${taskQuery})
                UNION ALL
                (${subtaskQuery})
            ) AS combined
            ON u.id = combined.user_id
            WHERE u.deleted_at IS NULL
            ${team_id ? `AND combined.team_id = ?` : ''}
            ${from_date ? `AND combined.created_at >= ?` : ''}
            ${to_date ? `AND combined.created_at <= ?` : ''}
            ${user_id ? `AND u.id = ?` : ''}
            ${employee_id ? `AND u.employee_id = ?` : ''}
            ${search ? `AND (u.employee_id LIKE ? OR CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(NULLIF(u.last_name, ''), '')) LIKE ?)` : ''}
            GROUP BY u.id, u.first_name, u.last_name, u.employee_id, combined.team_id
            LIMIT ? OFFSET ?
        `;

        // Query parameters for task and subtask
        let queryParams = [];
        if (team_id) {
            queryParams.push(team_id);
        }
        if (from_date){
             queryParams.push(from_date);
        }
        if (to_date) {
            queryParams.push(to_date);
        }
        if (user_id) {
            queryParams.push(user_id);
        }
        if (employee_id) {
            queryParams.push(employee_id);
        }
        if (search) {
            queryParams.push(`%${search}%`);
            queryParams.push(`%${search}%`);
        }

        // Add pagination limit and offset
        queryParams.push(parseInt(perPage));
        queryParams.push(parseInt(offset));

        // Query to count total users
        const countQuery = `
            SELECT COUNT(DISTINCT u.id) AS total_users
            FROM users u
            LEFT JOIN (
                (${taskQuery})
                UNION ALL
                (${subtaskQuery})
            ) AS combined
            ON u.id = combined.user_id
            WHERE u.deleted_at IS NULL
            ${team_id ? `AND combined.team_id = ?` : ''}
            ${from_date ? `AND combined.created_at >= ?` : ''}
            ${to_date ? `AND combined.created_at <= ?` : ''}
            ${user_id ? `AND u.id = ?` : ''}
            ${employee_id ? `AND u.employee_id = ?` : ''}
            ${search ? `AND (u.employee_id LIKE ? OR CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(NULLIF(u.last_name, ''), '')) LIKE ?)` : ''}
        `;
        const countValues = [];
        if (team_id) {
            countValues.push(team_id);
        }
        if (from_date){
            countValues.push(from_date);
       }
       if (to_date) {
            countValues.push(to_date);
       }
        if (user_id) {
            countValues.push(user_id);
        }
        if (employee_id) {
            countValues.push(employee_id);
        }
        if (search) {
            countValues.push(`%${search}%`);
            countValues.push(`%${search}%`);
        }

        // Execute the queries
        const [results] = await db.query(query, queryParams);
        const [countResults] = await db.query(countQuery, countValues);

        const totalUsers = countResults[0].total_users;

        // Format data
        const data = results.map((item, index) => ({
            s_no: offset + index + 1,
            user_id: item.user_id,
            employee_name: item.employee_name,
            employee_id: item.employee_id,
            team_id: item.team_id || null,
            total_estimated_hours: convertSecondsToReadableTime(item.total_estimated_seconds),
            total_worked_hours:   convertSecondsToReadableTime(item.total_worked_seconds),
            total_extended_hours: convertSecondsToReadableTime(item.total_extended_seconds),
        }));

        const pagination = getPagination(page, perPage, totalUsers);

        successResponse(
            res,
            data,
            data.length === 0 ? 'No data found' : 'Teamwise productivity retrieved successfully',
            200,
            pagination
        );

    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ success: false, message: 'An error occurred', error: error.message });
    }
};






exports.get_individualStatus = async (req, res) => {
    try {
        const { team_id, from_date, to_date, search, page = 1, perPage = 10 } = req.query;
        const offset = (page - 1) * perPage;

        let baseQuery = `
            SELECT 
                users.id,
                COALESCE(CONCAT(COALESCE(users.first_name, ''), ' ', COALESCE(NULLIF(users.last_name, ''), '')), 'Unknown User') AS employee_name, 
                users.employee_id,
                COUNT(tasks.id) AS assigned_tasks,
                SUM(CASE WHEN tasks.status = 1 THEN 1 ELSE 0 END) AS ongoing_tasks,
                SUM(CASE WHEN tasks.status = 3 THEN 1 ELSE 0 END) AS completed_tasks
            FROM users
            LEFT JOIN tasks ON tasks.user_id = users.id AND tasks.deleted_at IS NULL
            WHERE users.deleted_at IS NULL
        `;

        let countQuery = `
            SELECT COUNT(DISTINCT users.id) AS total
            FROM users
            LEFT JOIN tasks ON tasks.user_id = users.id AND tasks.deleted_at IS NULL
            WHERE users.deleted_at IS NULL
        `;

        let whereConditions = [];

        if (team_id) whereConditions.push(`users.team_id = ?`);
        if (from_date && to_date) {
            whereConditions.push(`tasks.created_at BETWEEN ? AND ?`);
        }

        if (search) {
            whereConditions.push(`(users.first_name LIKE ? OR users.employee_id LIKE ?)`); 
        }

        const queryParams = [];
        if (team_id) queryParams.push(team_id);
        if (from_date && to_date) {
            queryParams.push(from_date, to_date);
        }

        if (search) {
            queryParams.push(`%${search}%`, `%${search}%`);
        }

        if (whereConditions.length > 0) {
            const whereClause = ` AND ${whereConditions.join(' AND ')}`;
            baseQuery += whereClause;
            countQuery += whereClause;
        }

        baseQuery += ` GROUP BY users.id LIMIT ? OFFSET ?`;
        queryParams.push(perPage, offset);

        const [results] = await db.query(baseQuery, queryParams);
        const [countResult] = await db.query(countQuery, queryParams.slice(0, -2));
        const totalRecords = countResult[0]?.total || 0;
        const pagination = getPagination(page, perPage, totalRecords);

        const data = results.map(user => ({
            employee_name: user.employee_name,
            employee_id: user.employee_id,
            assigned_tasks: user.assigned_tasks || 0,
            ongoing_tasks: user.ongoing_tasks || 0,
            completed_tasks: user.completed_tasks || 0,
        }));

        successResponse(res, data, data.length === 0 ? 'No Individual status found' : 'Individual status retrieved successfully', 200, pagination);

    } catch (error) {
        console.error('Error fetching individual status:', error);
        return errorResponse(res, error.message, 'Server error', 500);
    }
};




