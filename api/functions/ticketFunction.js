const db = require('../../config/db');
const { successResponse, errorResponse, getPagination } = require('../../helpers/responseHelper');
const {getAuthUserDetails}=  require('../functions/commonFunction')

exports.getTickets = async (id, res) => {
    try {
      const query = `
        SELECT 
            t.user_id,
            COALESCE(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(NULLIF(u.last_name, ''), '')), 'Unknown User') AS name, 
            t.created_at,
            t.description,
            i.issue_name AS issue_type,
            t.status,
            CASE 
                WHEN t.status = 0 THEN 'Pending'
                WHEN t.status = 1 THEN 'In Progress'
                WHEN t.status = 2 THEN 'Approved'
                WHEN t.status = 3 THEN 'Rejected'
                ELSE 'Unknown'
            END AS status_type,
            t.file_name
        FROM tickets t
        LEFT JOIN users u ON t.user_id = u.id 
        LEFT JOIN issue_type i ON t.issue_type = i.id 
        WHERE t.deleted_at IS NULL AND t.id = ?;
      `;
  
      const [rows] = await db.query(query, [id]);
  
      if (rows.length === 0) {
        return errorResponse(res, null, 'Ticket not found', 200);
      }
  
      return successResponse(res, rows[0], 'Ticket retrieved successfully');
    } catch (error) {
      console.error('Error retrieving ticket:', error.message);
      return errorResponse(res, error.message, 'Error retrieving ticket', 500);
    }
  };
  

  exports.getAlltickets = async (req, res) => {
    const { user_id, search, status, page = 1, perPage = 10 } = req.query;
    const offset = (page - 1) * perPage;

    let users;
    if (user_id) {
        users = await getAuthUserDetails(user_id, res);  
        if (!users) {
            return errorResponse(res, 'User not found', 'Auth User not found', 404);
        }
    }

    try {
        let query = `
            SELECT 
                (@rownum := @rownum + 1) AS s_no,
                t.id,
                t.user_id,
                COALESCE(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(NULLIF(u.last_name, ''), '')), 'Unknown User') AS name, 
                t.created_at,
                t.description,
                i.issue_name AS issue_type,
                t.status,
                CASE 
                    WHEN t.status = 0 THEN 'Pending'
                    WHEN t.status = 1 THEN 'In Progress'
                    WHEN t.status = 2 THEN 'Approved'
                    WHEN t.status = 3 THEN 'Rejected'
                    ELSE 'Unknown'
                END AS status_type,
                t.file_name
            FROM tickets t
            LEFT JOIN users u ON t.user_id = u.id 
            LEFT JOIN issue_types i ON t.issue_type = i.id 
            , (SELECT @rownum := 0) AS r
            WHERE t.deleted_at IS NULL`;

        let countQuery = `
            SELECT COUNT(*) AS total_records
            FROM tickets t
            LEFT JOIN users u ON t.user_id = u.id
            LEFT JOIN issue_types i ON t.issue_type = i.id
            WHERE t.deleted_at IS NULL`;

        let values = [];
        let countValues = [];

        // Check role and filter tickets accordingly
        if (users && users.role_id !== 1 && users.role_id !== 2) {
          query += ` AND t.user_id = ?`;  
          countQuery += ` AND t.user_id = ?`;
          values.push(users.id); 
          countValues.push(users.id);
      }

        // Apply status filter if provided
        if (status) {
            query += ` AND t.status = ?`;
            countQuery += ` AND t.status = ?`;
            values.push(parseInt(status));
            countValues.push(parseInt(status));
        }

        // Apply search filter if provided
        if (search) {
            query += ` AND (
                t.user_id LIKE ? 
                OR CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(NULLIF(u.last_name, ''), '')) LIKE ? 
                OR t.description LIKE ? 
                OR i.issue_name LIKE ? 
                OR t.status LIKE ? 
                OR t.file_name LIKE ?
            )`;

            countQuery += ` AND (
                t.user_id LIKE ? 
                OR CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(NULLIF(u.last_name, ''), '')) LIKE ? 
                OR t.description LIKE ? 
                OR i.issue_name LIKE ? 
                OR t.status LIKE ? 
                OR t.file_name LIKE ?
            )`;

            const searchPattern = `%${search}%`;
            values.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
            countValues.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
        }

        query += ` ORDER BY t.created_at DESC LIMIT ? OFFSET ?`;
        values.push(parseInt(perPage), parseInt(offset));

        const [result] = await db.query(query, values);
        const [countResult] = await db.query(countQuery, countValues);

        const totalRecords = countResult[0]?.total_records || 0;

        const pagination = getPagination(page, perPage, totalRecords);

        // Sending the response with pagination data
        return successResponse(
            res,
            result,
            result.length === 0 ? 'No Tickets found' : 'Tickets retrieved successfully',
            200,
            pagination
        );
    } catch (error) {
        console.error('Error retrieving tickets:', error.stack || error.message);
        return errorResponse(res, error.message, 'Error retrieving tickets', 500);
    }
};



  exports.updateTickets = async (id, payload, res) => {
    const { status } = payload;  
    try {
      const query = `
        UPDATE tickets
        SET status = ?, updated_at = NOW()
        WHERE id = ? AND deleted_at IS NULL;
      `;
    
      const [result] = await db.query(query, [status, id]);
  
      if (result.affectedRows === 0) {
        return errorResponse(res, null, 'Ticket not found or already deleted', 200);
      }
  
      return successResponse(res,  { id, ...payload },'Ticket status updated successfully', 200);
  
    } catch (error) {
      console.error('Error updating ticket status:', error.message);
      return errorResponse(res, error.message, 'Error updating ticket status', 500);
    }
  };
  
  
  


