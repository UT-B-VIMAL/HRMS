const db = require('../../config/db'); 
const { successResponse, errorResponse } = require('../../helpers/responseHelper');
const moment = require('moment');

// exports.get_idleEmployee = async (req, res) => {
//     try {

        
//         const authUser = req.authUser; 
//         const today = moment().format('YYYY-MM-DD');

//         // Base query to get idle employees
//         let query = `
//             SELECT users.id, users.employee_id, users.name, users.team_id, users.role_id, teams.name AS team_name
//             FROM users
//             LEFT JOIN teams ON users.team_id = teams.id
//             WHERE NOT EXISTS (
//                 SELECT 1
//                 FROM sub_task_timelines
//                 WHERE sub_task_timelines.user_id = users.id
//                 AND DATE(sub_task_timelines.created_at) = ?
//             )
//             AND NOT EXISTS (
//                 SELECT 1
//                 FROM attendances
//                 WHERE attendances.user_id = users.id
//                 AND DATE(attendances.date) = ?
//             )
//         `;

//         const params = [today, today];

//         // Role-based filtering for role_id 3
//         if (authUser.role_id === 3) {
//             query += `
//                 AND (
//                     users.team_id = ?
//                     OR EXISTS (
//                         SELECT 1
//                         FROM teams
//                         WHERE teams.id = users.team_id
//                         AND teams.reporting_user_id = ?
//                     )
//                 )
//             `;
//             params.push(authUser.team_id, authUser.id);
//         }

//         // Team filter from request
//         if (req.query.team_id) {
//             query += ` AND users.team_id = ?`;
//             params.push(req.query.team_id);
//         }

//         query += ` ORDER BY users.team_id ASC`;

//         // Execute query
//         const [idleEmployees] = await db.promise().query(query, params);

//         // Check for empty result
//         if (idleEmployees.length === 0) {
//             return successResponse(res, [], 'No idle employees found', 200);
//         }

//         return successResponse(res, idleEmployees, 'Idle employees retrieved successfully');
//     } catch (error) {
//         return errorResponse(res, error.message, 'Error retrieving idle employees', 500);
//     }
// };


exports.get_idleEmployee = async (res) => {
    try {
        const query = `
            SELECT id, employee_id, name, team_id, role_id 
            FROM users 
            WHERE NOT EXISTS (
                SELECT 1 
                FROM sub_tasks_user_timeline 
                WHERE sub_tasks_user_timeline.user_id = users.id 
                AND DATE(sub_tasks_user_timeline.created_at) = CURRENT_DATE
            ) 
            AND NOT EXISTS (
                SELECT 1 
                FROM employee_leave 
                WHERE employee_leave.user_id = users.id 
                AND DATE(employee_leave.date) = CURRENT_DATE
            )`;

        const [rows] = await db.promise().query(query);

        if (rows.length === 0) {
            return errorResponse(res, null, 'No idle employees found', 200);
        }

        return successResponse(res, rows, 'Idle employees retrieved successfully');
    } catch (error) {
        return errorResponse(res, error.message, 'Error retrieving idle employees', 500);
    }
};



