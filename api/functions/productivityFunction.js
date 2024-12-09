const db = require('../../config/db'); 
const { successResponse, errorResponse } = require('../../helpers/responseHelper');
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

const getPagination = (page, perPage, totalRecords) => {
    const totalPages = Math.ceil(totalRecords / perPage);
    const rangeStart = (page - 1) * perPage + 1;
    const rangeEnd = Math.min(page * perPage, totalRecords);
    const rangeFrom = totalRecords > 0
        ? `Showing ${rangeStart}-${rangeEnd} of ${totalRecords} entries`
        : `Showing 0-0 of 0 entries`;

    return {
        total_records: totalRecords,
        total_pages: totalPages,
        current_page: parseInt(page, 10),
        per_page: perPage,
        range_from: rangeFrom,
    };
};

exports.getTeamwiseProductivity = async (req, res) => {
    try {
        const { team_id, month, search, page = 1, perPage = 10 } = req.query;

        const offset = (page - 1) * perPage;

        let query = `
            SELECT 
                u.id AS user_id, 
                u.employee_id, 
                u.name AS user_name, 
                u.email AS user_email,
                IFNULL(SUM(TIME_TO_SEC(t.estimated_hours)), 0) AS total_estimated_seconds_tasks,
                IFNULL(SUM(TIME_TO_SEC(t.total_hours_worked)), 0) AS total_worked_seconds_tasks,
                IFNULL(SUM(TIME_TO_SEC(t.extended_hours)), 0) AS total_extended_seconds_tasks,
                IFNULL(SUM(TIME_TO_SEC(st.estimated_hours)), 0) AS total_estimated_seconds_subtasks,
                IFNULL(SUM(TIME_TO_SEC(st.total_hours_worked)), 0) AS total_worked_seconds_subtasks,
                IFNULL(SUM(TIME_TO_SEC(st.extended_hours)), 0) AS total_extended_seconds_subtasks
            FROM 
                users u
            LEFT JOIN 
                tasks t ON t.user_id = u.id 
                AND NOT EXISTS (SELECT 1 FROM sub_tasks st1 WHERE st1.task_id = t.id)
                AND t.deleted_at IS NULL
                ${team_id ? `AND t.team_id = ?` : ''}
                ${month ? `AND MONTH(t.created_at) = ?` : ''}
            LEFT JOIN 
                sub_tasks st ON st.user_id = u.id
                AND st.deleted_at IS NULL
                ${team_id ? `AND st.team_id = ?` : ''}
                ${month ? `AND MONTH(st.created_at) = ?` : ''}
            WHERE 
                u.deleted_at IS NULL
                ${team_id ? `AND u.team_id = ?` : ''}
                ${search ? `AND (u.name LIKE ? OR u.email LIKE ?)` : ''}
            GROUP BY 
                u.id
            LIMIT ? OFFSET ?
        `;

        const values = [];
        if (team_id) values.push(team_id);
        if (month) values.push(month);
        if (team_id) values.push(team_id);
        if (month) values.push(month);
        if (team_id) values.push(team_id);
        if (search) {
            values.push(`%${search}%`, `%${search}%`);
        }
        values.push(parseInt(perPage), parseInt(offset));

        // Query to get the total count of records for pagination
        let countQuery = `
            SELECT COUNT(DISTINCT u.id) AS total_records
            FROM users u
            LEFT JOIN tasks t ON t.user_id = u.id 
                AND NOT EXISTS (SELECT 1 FROM sub_tasks st1 WHERE st1.task_id = t.id)
                AND t.deleted_at IS NULL
                ${team_id ? `AND t.team_id = ?` : ''}
                ${month ? `AND MONTH(t.created_at) = ?` : ''}
            LEFT JOIN sub_tasks st ON st.user_id = u.id
                AND st.deleted_at IS NULL
                ${team_id ? `AND st.team_id = ?` : ''}
                ${month ? `AND MONTH(st.created_at) = ?` : ''}
            WHERE u.deleted_at IS NULL
                ${team_id ? `AND u.team_id = ?` : ''}
                ${search ? `AND (u.name LIKE ? OR u.email LIKE ?)` : ''}
        `;

        const countValues = [];
        if (team_id) countValues.push(team_id);
        if (month) countValues.push(month);
        if (team_id) countValues.push(team_id);
        if (month) countValues.push(month);
        if (team_id) countValues.push(team_id);
        if (search) {
            countValues.push(`%${search}%`, `%${search}%`);
        }

        // Execute both queries concurrently
        const [result] = await db.query(query, values);
        const [countResult] = await db.query(countQuery, countValues);

        const totalRecords = countResult[0].total_records;
        const pagination = getPagination(page, perPage, totalRecords);

        const data = result.map(row => {
            const totalEstimatedSeconds = row.total_estimated_seconds_tasks + row.total_estimated_seconds_subtasks;
            const totalWorkedSeconds = row.total_worked_seconds_tasks + row.total_worked_seconds_subtasks;
            const totalExtendedSeconds = row.total_extended_seconds_tasks + row.total_extended_seconds_subtasks;

            return {
                user_id: row.user_id,
                employee_id: row.employee_id,
                user_name: row.user_name,
                user_email: row.user_email,
                total_estimated_hours: convertSecondsToReadableTime(totalEstimatedSeconds),
                total_hours_worked: convertSecondsToReadableTime(totalWorkedSeconds),
                total_extended_hours: convertSecondsToReadableTime(totalExtendedSeconds),
            };
        });

        successResponse(res, data, data.length === 0 ? 'No Teamwise split found' : 'Teamwise split retrieved successfully', 200, pagination);

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
                users.name AS employee_name,
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
        if (team_id) whereConditions.push(`users.team_id = ?`);
        if (month) whereConditions.push(`MONTH(tasks.created_at) = ?`);
        if (search) {
            whereConditions.push(`(users.name LIKE ? OR users.employee_id LIKE ?)`); 
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



