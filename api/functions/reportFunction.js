const db = require('../../config/db');
const { successResponse, errorResponse, getPagination } = require('../../helpers/responseHelper');
const moment = require('moment');


function formatHoursToHHMM(hours) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h} hours and ${m} minutes`;
}

exports.getTimeListReport = async (req, res) => {
    const { from_date, to_date, team_id, search, export_status, page = 1, perPage = 10 } = req.query;

    const offset = (parseInt(page, 10) - 1) * parseInt(perPage, 10);
    const limit = parseInt(perPage, 10);

    try {
        let query = `
            WITH date_range AS (
                SELECT ADDDATE('${from_date}', t4.i * 1000 + t3.i * 100 + t2.i * 10 + t1.i * 1) AS date
                FROM (SELECT 0 i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) t1,
                     (SELECT 0 i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) t2,
                     (SELECT 0 i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) t3,
                     (SELECT 0 i UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) t4
                WHERE ADDDATE('${from_date}', t4.i * 1000 + t3.i * 100 + t2.i * 10 + t1.i * 1) <= '${to_date}'
            )
            SELECT u.id AS user_id,
                   CONCAT(u.first_name, ' ', u.last_name) AS name,
                   u.employee_id,
                   t.name AS team_name,
                   DATE_FORMAT(dr.date, '%Y-%m-%d') AS date,
                   COALESCE(ROUND(SUM(TIMESTAMPDIFF(SECOND, stut.start_time, stut.end_time)) / 3600, 2), 0) AS logged_hours,
                   CASE
                       WHEN el.id IS NOT NULL AND el.day_type = 1 THEN 0
                       WHEN el.id IS NOT NULL AND el.day_type = 2 THEN 4
                       ELSE 8
                   END AS total_work_hours,
                   CASE
                       WHEN el.id IS NOT NULL AND el.day_type = 1 THEN 0
                       ELSE CASE
                           WHEN el.id IS NOT NULL AND el.day_type = 2 THEN GREATEST(4 - COALESCE(ROUND(SUM(TIMESTAMPDIFF(SECOND, stut.start_time, stut.end_time)) / 3600, 2), 0), 0)
                           ELSE GREATEST(8 - COALESCE(ROUND(SUM(TIMESTAMPDIFF(SECOND, stut.start_time, stut.end_time)) / 3600, 2), 0), 0)
                       END
                   END AS idle_hours
            FROM date_range dr
            CROSS JOIN users u
            LEFT JOIN teams t ON u.team_id = t.id
            LEFT JOIN employee_leave el ON u.id = el.user_id AND el.date = dr.date
            LEFT JOIN sub_tasks_user_timeline stut ON u.id = stut.user_id AND DATE(stut.start_time) = dr.date
            WHERE dr.date BETWEEN '${from_date}' AND '${to_date}'
        `;

        if (team_id) {
            query += ` AND u.team_id = '${team_id}'`;
        }

        // Add search filters
        if (search) {
            query += ` AND (
        CONCAT(u.first_name, ' ', u.last_name) LIKE '%${search}%'
        OR u.employee_id LIKE '%${search}%'
        OR t.name LIKE '%${search}%'
    )`;
        }


        query += `
            GROUP BY u.id, dr.date, el.day_type, el.id, t.name
            ORDER BY dr.date, u.id
            LIMIT ${limit} OFFSET ${offset};
        `;

        const [results] = await db.query(query);

        if (export_status == 1) {
            if (results.length === 0) {
                return res.status(404).json({ error: "No data available for export", message: "No data found" });
            }

            const fields = [
                { label: 'S.No', value: 's_no' },
                { label: 'Date', value: 'date' },
                { label: 'Employee ID', value: 'employee_id' },
                { label: 'Name', value: 'name' },
                { label: 'Team Name', value: 'team_name' },
                { label: 'Logged Hours', value: 'logged_hours' },
                { label: 'Total Work Hours', value: 'total_work_hours' },
                { label: 'Idle Hours', value: 'idle_hours' },
            ];

            const result = results.map((item, index) => ({
                s_no: index + 1,
                ...item,
            }));

            const { Parser } = require('json2csv');
            const json2csvParser = new Parser({ fields });
            const csv = json2csvParser.parse(result);

            res.header('Content-Type', 'text/csv');
            res.attachment('time_list_report.csv');
            return res.send(csv);
        }

        const totalRecordsQuery = `
            SELECT COUNT(DISTINCT u.id) AS total
            FROM users u
            LEFT JOIN employee_leave el ON u.id = el.user_id
            LEFT JOIN sub_tasks_user_timeline stut ON u.id = stut.user_id
            WHERE DATE(stut.start_time) BETWEEN '${from_date}' AND '${to_date}'
        `;

        if (team_id) {
            totalRecordsQuery += ` AND u.team_id = '${team_id}'`;
        }

        const [totalRecordsResult] = await db.query(totalRecordsQuery);
        const totalRecords = totalRecordsResult[0].total;
        const totalPages = Math.ceil(totalRecords / perPage);

        const pagination = {
            total_records: totalRecords,
            total_pages: totalPages,
            current_page: parseInt(page, 10),
            per_page: perPage,
            range_from: `Showing ${(offset + 1)}-${Math.min(offset + perPage, totalRecords)} of ${totalRecords} entries`,
            next_page: page < totalPages ? page + 1 : null,
            prev_page: page > 1 ? page - 1 : null,
        };

        return res.json({
            data: results,
            pagination,
            message: results.length === 0 ? "No data found" : "Time list report retrieved successfully",
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Internal server error' });
    }
};










