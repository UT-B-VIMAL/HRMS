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
        const [result] = await db.promise().query(query, values);
        const [countResult] = await db.promise().query(countQuery, countValues);


        const totalRecords = countResult[0].total_records;
        const totalPages = Math.ceil(totalRecords / perPage);
        const rangeFrom = `Showing ${(page - 1) * perPage + 1}-${Math.min(page * perPage, totalRecords)} of ${totalRecords} entries`;

        const finalResult = result.map(row => {
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

        
        if ( finalResult.length === 0) {
            return successResponse(res, {
                total_records: totalRecords,
                total_pages: totalPages,
                range_from: rangeFrom,
                data: []
            }, 'No Teamwise split found');
        }
        
        return successResponse(res, {
            total_records: totalRecords,
            total_pages: totalPages,
            current_page: parseInt(page),
            per_page: parseInt(perPage),
            range_from: rangeFrom,
            data:  finalResult
        }, 'Idle employees retrieved successfully');
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ success: false, message: 'An error occurred', error: error.message });
    }
};




