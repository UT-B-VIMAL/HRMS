const db = require('../../config/db'); 
const { successResponse, errorResponse ,getPagination} = require('../../helpers/responseHelper');
const moment = require('moment');


function formatHoursToHHMM(hours) {
    const h = Math.floor(hours); 
    const m = Math.round((hours - h) * 60); 
    return `${h} hours and ${m} minutes`;
}

exports.getTimeListReport = async (req, res) => {
    try {
        const { fromDate, toDate, teamId, search, exportType, page = 1, perPage = 10 } = req.query;
        const offset = (page - 1) * perPage;

        let query = `SELECT 
                        u.id AS user_id, 
                        u.employee_id, 
                        COALESCE(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(NULLIF(u.last_name, ''), '')), 'Unknown User') AS user_name, 
                        u.email AS user_email,
                        u.team_id,
                        tm.name AS team_name, 
                        el.date AS leave_date,
                        
                        -- Total Leave Type (1 for full day leave, 2 for half day leave)
                        SUM(CASE 
                            WHEN el.day_type = 1 THEN 1 
                            WHEN el.day_type = 2 THEN 0.5 
                            ELSE 0 -- No leave
                        END) AS leave_type,
                        
                        -- Total Worked Hours (in hours), considering day_type logic
                        COALESCE(SUM(CASE 
                            WHEN el.day_type = 1 THEN 0 -- Full day leave (no work)
                            WHEN el.day_type = 2 THEN 4 -- Half day leave (4 hours of work)
                            ELSE TIMESTAMPDIFF(SECOND, sut.start_time, sut.end_time) / 3600 -- Otherwise calculate worked hours
                        END), 0) AS total_worked_hours,
                        
                        -- Total Idle Hours (assuming 8 hours workday, and no idle hours for full day leave)
                        COALESCE(SUM(CASE 
                            WHEN el.day_type = 1 THEN 0 -- Full day leave (no idle time)
                            WHEN el.day_type = 2 THEN 4 -- Half day leave (considering 4 hours of idle)
                            ELSE (8 - (TIMESTAMPDIFF(SECOND, sut.start_time, sut.end_time) / 3600)) -- Idle time is 8 hours - worked time
                        END), 0) AS total_idle_hours
                    FROM users u
                    LEFT JOIN tasks t ON t.user_id = u.id 
                    AND t.deleted_at IS NULL
                    LEFT JOIN sub_tasks st ON st.user_id = u.id
                    AND st.deleted_at IS NULL
                    LEFT JOIN employee_leave el ON el.user_id = u.id 
                    AND el.date BETWEEN ? AND ?  
                    LEFT JOIN sub_tasks_user_timeline sut ON sut.user_id = u.id
                    AND sut.created_at BETWEEN ? AND ? 
                    LEFT JOIN teams tm ON u.team_id = tm.id  
                    WHERE u.deleted_at IS NULL
                    GROUP BY u.id, u.team_id, el.date`;

        const values = [fromDate, toDate, fromDate, toDate];

        if (teamId) {
            query += ` AND u.team_id = ?`;
            values.push(teamId);
        }

        if (search) {
            query += ` AND (u.first_name LIKE ? OR u.email LIKE ?)`;
            values.push('%' + search + '%', '%' + search + '%');
        }

        if (exportType != 1) {
            query += ` LIMIT ? OFFSET ?`;
            values.push(parseInt(perPage), parseInt(offset));
        }

        const [result] = await db.query(query, values);

        if (exportType == 1) {
            const { Parser } = require('json2csv');
            const json2csvParser = new Parser();
            const csv = json2csvParser.parse(result);

            res.header('Content-Type', 'text/csv');
            res.attachment('work_report_data.csv');
            return res.send(csv);
        }

        if (!result || result.length === 0) {
            return successResponse(res, [], "No records found", 200, { page, perPage });
        }

        const totalRecords = await db.query(`
            SELECT COUNT(*) AS count
            FROM users u
            LEFT JOIN employee_leave el ON el.user_id = u.id
            WHERE u.deleted_at IS NULL
        `);
       
        const pagination = getPagination(page, perPage, totalRecords[0]?.[0]?.count  || 0);

        result.forEach(item => {
            item.total_worked_hours = formatHoursToHHMM(item.total_worked_hours);
            item.total_idle_hours = formatHoursToHHMM(item.total_idle_hours);
        });

        successResponse(
            res,
            result,
            "Time list report retrieved successfully",
            200,
            pagination
        );
    } catch (error) {
        console.error('Error:', error.message);
        return errorResponse(res, 'An error occurred', error.message, 500);
    }
};




