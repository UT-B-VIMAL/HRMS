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

        // Base Query
        let query = `SELECT 
                        u.id AS user_id, 
                        u.employee_id, 
                        COALESCE(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(NULLIF(u.last_name, ''), '')), 'Unknown User') AS user_name, 
                        u.email AS user_email,
                        u.team_id,
                        tm.name AS team_name, 
                        el.date AS leave_date,                        
                        SUM(CASE 
                            WHEN el.day_type = 1 THEN 1 
                            WHEN el.day_type = 2 THEN 0.5 
                            ELSE 0 
                        END) AS leave_type,
                        COALESCE(SUM(CASE 
                            WHEN el.day_type = 1 THEN 0 
                            WHEN el.day_type = 2 THEN 4 
                            ELSE TIMESTAMPDIFF(SECOND, sut.start_time, sut.end_time) / 3600 
                        END), 0) AS total_worked_hours,
                        COALESCE(SUM(CASE 
                            WHEN el.day_type = 1 THEN 0 
                            WHEN el.day_type = 2 THEN 4 
                            ELSE (8 - (TIMESTAMPDIFF(SECOND, sut.start_time, sut.end_time) / 3600)) 
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
                    WHERE u.deleted_at IS NULL`;

        const values = [fromDate, toDate, fromDate, toDate];

        // Add Team Filter
        if (teamId) {
            query += ` AND u.team_id = ?`;
            values.push(teamId);
        }

        // Add Search Filter
        if (search) {
            query += ` AND (u.first_name LIKE ? OR u.email LIKE ?)`;
            values.push('%' + search + '%', '%' + search + '%');
        }

        // Add Group By Clause
        query += ` GROUP BY u.id, u.team_id, el.date`;

        // Handle Pagination for Non-Export
        if (exportType != 1) {
            query += ` LIMIT ? OFFSET ?`;
            values.push(parseInt(perPage), parseInt(offset));
        }

        // Debug: Log the query and values
        console.log('Generated Query:', query);
        console.log('Query Parameters:', values);

        const [result] = await db.query(query, values);

        // Export CSV Logic
        if (exportType == 1) {
            const { Parser } = require('json2csv');
            const json2csvParser = new Parser();
            const csv = json2csvParser.parse(result);

            res.header('Content-Type', 'text/csv');
            res.attachment('work_report_data.csv');
            return res.send(csv);
        }

        // Check if no records are found
        if (!result || result.length === 0) {
            return successResponse(res, [], "No records found", 200, { page, perPage });
        }

        // Get Total Record Count for Pagination
        let totalRecordsQuery = `
        SELECT COUNT(DISTINCT u.id) AS count
        FROM users u
        LEFT JOIN employee_leave el ON el.user_id = u.id
        WHERE u.deleted_at IS NULL`;
    
    const totalRecordsParams = [];
    
    // Add dynamic filter for teamId
    if (teamId) {
        totalRecordsQuery += ` AND u.team_id = ?`;
        totalRecordsParams.push(teamId);
    }
    
    // Add dynamic filter for search
    if (search) {
        totalRecordsQuery += ` AND (u.first_name LIKE ? OR u.email LIKE ?)`;
        totalRecordsParams.push(`%${search}%`, `%${search}%`);
    }
    
    // Execute the query
    const [totalRecordsResult] = await db.query(totalRecordsQuery, totalRecordsParams);
    const totalRecords = totalRecordsResult[0]?.count || 0;
    
        // Format Pagination
        const pagination = getPagination(page, perPage, totalRecords);

        // Format Hours
        result.forEach(item => {
            item.total_worked_hours = formatHoursToHHMM(item.total_worked_hours);
            item.total_idle_hours = formatHoursToHHMM(item.total_idle_hours);
        });

        // Success Response
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





