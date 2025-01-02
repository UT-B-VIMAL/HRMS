const db = require('../../config/db');
const { successResponse, errorResponse, getPagination } = require('../../helpers/responseHelper');

exports.getAlltickets = async (req, res) => {
  const { search, page = 1, perPage = 10 } = req.query;
  const offset = (page - 1) * perPage;

  try {
    // Base query for fetching specific columns
    let query = `
SELECT 
    (@rownum := @rownum + 1) AS s_no,
    t.user_id,
    COALESCE(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(NULLIF(u.last_name, ''), '')), 'Unknown User') AS name, 
    t.created_at,
    t.description,
    i.issue_name AS issue_type,
    t.status,
    t.file_name
FROM tickets t
LEFT JOIN users u ON t.user_id = u.id 
LEFT JOIN issue_type i ON t.issue_type = i.id 
, (SELECT @rownum := 0) AS r
WHERE t.deleted_at IS NULL`;

    let countQuery = `
      SELECT COUNT(*) AS total_records
      FROM tickets t
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN issue_type i ON t.issue_type = i.id
      WHERE t.deleted_at IS NULL`;

    let values = [];
    let countValues = [];

    // If search is provided, modify the queries
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

      // Push search values to query parameters
      const searchPattern = `%${search}%`;
      values.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
      countValues.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }

    // Add pagination to the main query
    query += ` LIMIT ? OFFSET ?`;
    values.push(parseInt(perPage), parseInt(offset));

    // Execute both queries concurrently
    const [result] = await db.query(query, values);
    const [countResult] = await db.query(countQuery, countValues);

    const totalRecords = countResult[0]?.total_records || 0;

    // Create pagination data
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
    console.error('Error retrieving tickets:', error.message);
    return errorResponse(res, error.message, 'Error retrieving tickets', 500);
  }
};


