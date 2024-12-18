const db = require('../../config/db'); 
const { successResponse, errorResponse,getPagination } = require('../../helpers/responseHelper');
const moment = require('moment');


exports.get_idleEmployee = async (req, res) => {
    try {
        const { user_id, team_id, page = 1, perPage = 10 } = req.query;

        const [[user]] = await db.query('SELECT id, role_id FROM users WHERE id = ?', [user_id]);
        if (!user) {
            return errorResponse(res, 'User not found', 'Invalid user', 404);
        }

        const offset = (page - 1) * perPage;

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

        if (team_id) {
            query += ` AND team_id = ?`;
            queryParams.push(team_id);
        }

        if (user.role_id === 3) {
            query += `
                AND (
                    team_id = ? OR EXISTS (
                        SELECT 1
                        FROM teams
                        WHERE teams.reporting_user_id = ?
                        AND teams.id = users.team_id
                    )
                )
            `;
            queryParams.push(user.team_id, user.id);
        }

        // Add pagination
        query += ` ORDER BY id DESC LIMIT ? OFFSET ?`;
        queryParams.push(parseInt(perPage, 10), parseInt(offset, 10));

        // Count query for pagination
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

        const countQueryParams = [];
        if (team_id) {
            countQuery += ` AND team_id = ?`;
            countQueryParams.push(team_id);
        }

        const [result] = await db.query(query, queryParams);
        const [countResult] = await db.query(countQuery, countQueryParams);

        const totalRecords = countResult[0].total_records;

        // Calculate pagination
        const pagination = getPagination(page, perPage, totalRecords);

        // Add serial numbers to results
        const data = result.map((row, index) => ({
            s_no: (page - 1) * perPage + index + 1,
            ...row,
        }));

        successResponse(res, data, data.length === 0 ? 'No idle employees found' : 'Idle employees retrieved successfully', 200, pagination);

    } catch (error) {
        console.error('Caught Error:', error);
        return errorResponse(res, error.message || 'An unknown error occurred', 'Error retrieving idle employees', 500);
    }
};






