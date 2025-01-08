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
        const { team_id, month, search, page = 1, perPage = 10 } = req.query;

        const offset = (page - 1) * perPage;

        // Query to fetch grouped data by user_id, including task and subtask
        const query = `
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
                -- Task data
                SELECT 
                    t.user_id,
                    t.team_id,
                    TIME_TO_SEC(t.estimated_hours) AS estimated_seconds,
                    TIME_TO_SEC(t.total_hours_worked) AS worked_seconds,
                    TIME_TO_SEC(t.extended_hours) AS extended_seconds
                FROM 
                    tasks t
                WHERE 
                    t.deleted_at IS NULL
                    ${team_id ? `AND t.team_id = ?` : ''}
                    ${month ? `AND MONTH(t.created_at) = ?` : ''}
                    AND NOT EXISTS (
                        SELECT 1 
                        FROM sub_tasks st 
                        WHERE st.task_id = t.id
                    )
                    ${search ? `AND t.task_name LIKE ?` : ''}
                UNION ALL
                -- Subtask data
                SELECT 
                    st.user_id,
                    st.team_id,
                    TIME_TO_SEC(st.estimated_hours) AS estimated_seconds,
                    TIME_TO_SEC(st.total_hours_worked) AS worked_seconds,
                    TIME_TO_SEC(st.extended_hours) AS extended_seconds
                FROM 
                    sub_tasks st
                WHERE 
                    st.deleted_at IS NULL
                    ${team_id ? `AND st.team_id = ?` : ''}
                    ${month ? `AND MONTH(st.created_at) = ?` : ''}
                    ${search ? `AND st.subtask_name LIKE ?` : ''}
            ) AS combined
            ON u.id = combined.user_id
            WHERE u.deleted_at IS NULL
            GROUP BY u.id, u.first_name, u.last_name, u.employee_id, combined.team_id
            LIMIT ? OFFSET ?
        `;

        const values = [];
        if (team_id) values.push(team_id);
        if (month) values.push(month);
        if (search) values.push(`%${search}%`);
        if (team_id) values.push(team_id);
        if (month) values.push(month);
        if (search) values.push(`%${search}%`);
        values.push(parseInt(perPage), parseInt(offset));

        // Query to count total users
        const countQuery = `
            SELECT COUNT(DISTINCT u.id) AS total_users
            FROM users u
            WHERE u.deleted_at IS NULL
        `;

        // Execute the queries
        const [results] = await db.query(query, values);
        const [countResults] = await db.query(countQuery);

        const totalUsers = countResults[0].total_users;

        // Format data
        const data = results.map((item, index) => ({
            s_no: offset + index + 1,
            user_id: item.user_id,
            employee_name: item.employee_name,
            employee_id: item.employee_id,
            team_id: item.team_id || null,
            total_estimated_hours: convertSecondsToReadableTime(item.total_estimated_seconds),
            total_worked_hours: convertSecondsToReadableTime(item.total_worked_seconds),
            total_extended_hours: convertSecondsToReadableTime(item.total_extended_seconds),
        }));

        const pagination = getPagination(page, perPage, totalUsers);

        successResponse(res, data, data.length === 0 ? 'No data found' : 'Teamwise productivity retrieved successfully', 200, pagination);

    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ success: false, message: 'An error occurred', error: error.message });
    }
};




exports.get_individualStatus = async (req, res) => {
    try {
        const { team_id, month, search, page = 1 , perPage = 10} = req.query;
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
            LEFT JOIN tasks ON tasks.user_id = users.id
        `;

        // Count Query to get the total number of records
        let countQuery = `
            SELECT COUNT(DISTINCT users.id) AS total
            FROM users
            LEFT JOIN tasks ON tasks.user_id = users.id
        `;

        let whereConditions = [];
        whereConditions.push(`users.deleted_at IS NULL`);
        whereConditions.push(`(tasks.deleted_at IS NULL OR tasks.deleted_at IS NULL)`);

        if (team_id) whereConditions.push(`users.team_id = ?`);
        if (month) whereConditions.push(`MONTH(tasks.created_at) = ?`);
        if (search) {
            whereConditions.push(`(users.first_name LIKE ? OR users.employee_id LIKE ?)`); 
        }

        const queryParams = [];
        if (team_id) queryParams.push(team_id);
        if (month) queryParams.push(month);
        if (search) {
            queryParams.push(`%${search}%`, `%${search}%`);
        }

        if (whereConditions.length > 0) {
            const whereClause = ` WHERE ${whereConditions.join(' AND ')}`;
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



