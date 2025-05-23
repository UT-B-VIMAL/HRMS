const db = require("../../config/db");
const {
  successResponse,
  errorResponse,
  getPagination,
} = require("../../helpers/responseHelper");
const { getAuthUserDetails } = require("../functions/commonFunction");

exports.getTickets = async (id, res) => {
  try {
    const query = `
        SELECT 
            t.user_id,
            COALESCE(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(NULLIF(u.last_name, ''), '')), 'Unknown User') AS name, 
            t.created_at,
            t.description,
            i.issue_name AS issue_type,
            CONVERT_TZ(t.issue_date, '+00:00', '+05:30') AS issue_date,
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
        WHERE t.deleted_at IS NULL AND t.id = ?;
      `;

    const [rows] = await db.query(query, [id]);

    if (rows.length === 0) {
      return errorResponse(res, null, "Ticket not found", 200);
    }

    return successResponse(res, rows[0], "Ticket retrieved successfully");
  } catch (error) {
    console.error("Error retrieving ticket:", error.message);
    return errorResponse(res, error.message, "Error retrieving ticket", 500);
  }
};

// exports.getAlltickets = async (req, res) => {
//   const {
//     user_id,
//     search,
//     status,
//     flag = 0,
//     page = 1,
//     perPage = 10,
//   } = req.query;
//   const offset = (page - 1) * perPage;

//   if (!user_id) {
//     return errorResponse(
//       res,
//       "User ID is required",
//       "Missing user_id in request",
//       400
//     );
//   }

//   const users = await getAuthUserDetails(user_id, res);
//   if (!users) {
//     return errorResponse(res, "User not found", "Auth User not found", 404);
//   }

//   try {
//     let query = `
//             SELECT
//                 (@rownum := @rownum + 1) AS s_no,
//                 t.id,
//                 t.user_id,
//                 COALESCE(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(NULLIF(u.last_name, ''), '')), 'Unknown User') AS name,
//                 t.created_at AS created_at,
//                 t.description,
//                 i.issue_name AS issue_type,
//                 CONVERT_TZ(t.issue_date, '+00:00', '+05:30') AS issue_date,
//                 t.status,
//                 CASE
//                     WHEN t.status = 0 THEN 'Pending'
//                     WHEN t.status = 1 THEN 'Pending'
//                     WHEN t.status = 2 THEN 'Approved'
//                     WHEN t.status = 3 THEN 'Rejected'
//                     ELSE 'Unknown'
//                 END AS status_type,
//                CONCAT('https://', t.file_name) AS file_name,
//                 COALESCE((SELECT COUNT(*)
//                           FROM ticket_comments tc
//                           WHERE tc.ticket_id = t.id
//                           AND tc.receiver_id = ?
//                           AND tc.type = 0), 0) AS unread_counts
//             FROM tickets t
//             LEFT JOIN users u ON t.user_id = u.id
//             LEFT JOIN issue_types i ON t.issue_type = i.id,
//             (SELECT @rownum := ${offset || 0}) AS r
//             WHERE t.deleted_at IS NULL
//         `;

//     let countQuery = `
//             SELECT COUNT(*) AS total_records
//             FROM tickets t
//             LEFT JOIN users u ON t.user_id = u.id
//             LEFT JOIN issue_types i ON t.issue_type = i.id
//             WHERE t.deleted_at IS NULL
//         `;

//     let values = [users.id];
//     let countValues = [];

//     if (users.role_id === 1 && flag == 1) {
//       query += ` AND t.created_by = ?`;
//       countQuery += ` AND t.created_by = ?`;
//       values.push(users.id);
//       countValues.push(users.id);
//     } else if (users.role_id !== 1) {
//       query += ` AND t.created_by = ?`;
//       countQuery += ` AND t.created_by = ?`;
//       values.push(users.id);
//       countValues.push(users.id);
//     }

//     if (status) {
//       query += ` AND t.status = ?`;
//       countQuery += ` AND t.status = ?`;
//       values.push(parseInt(status));
//       countValues.push(parseInt(status));
//     }

//     if (search) {
//       query += ` AND (
//               CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(NULLIF(u.last_name, ''), '')) LIKE ?
//               OR t.id LIKE ?
//               OR DATE_FORMAT(CONVERT_TZ(t.created_at, '+00:00', '+05:30'), '%d-%m-%Y') LIKE ?
//               OR t.description LIKE ?
//               OR i.issue_name LIKE ?
//               OR DATE_FORMAT(CONVERT_TZ(t.issue_date,  '+00:00', '+05:30'), '%d-%m-%Y') LIKE ?
//           )`;

//       countQuery += ` AND (
//               CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(NULLIF(u.last_name, ''), '')) LIKE ?
//               OR t.id LIKE ?
//               OR DATE_FORMAT(CONVERT_TZ(t.created_at, '+00:00', '+05:30'), '%d-%m-%Y') LIKE ?
//               OR t.description LIKE ?
//               OR i.issue_name LIKE ?
//               OR DATE_FORMAT(CONVERT_TZ(t.issue_date,  '+00:00', '+05:30'), '%d-%m-%Y') LIKE ?
//           )`;

//       const searchPattern = `%${search}%`;
//       values.push(
//         searchPattern,
//         searchPattern,
//         searchPattern,
//         searchPattern,
//         searchPattern,
//         searchPattern
//       );
//       countValues.push(
//         searchPattern,
//         searchPattern,
//         searchPattern,
//         searchPattern,
//         searchPattern,
//         searchPattern
//       );
//     }

//     query += ` ORDER BY t.updated_at DESC LIMIT ? OFFSET ?`;
//     values.push(parseInt(perPage), parseInt(offset));

//     const [result] = await db.query(query, values);
//     const [countResult] = await db.query(countQuery, countValues);

//     const totalRecords = countResult[0]?.total_records || 0;

//     let pendingCountQuery = `
//         SELECT COUNT(*) AS total_pending
//         FROM tickets t
//         WHERE t.deleted_at IS NULL AND (t.status = 0 OR t.status = 1)
//     `;

//     let pendingValues = [];

//     if (users.role_id === 1 && flag == 1) {
//       pendingCountQuery += ` AND t.created_by = ?`;
//       pendingValues.push(users.id);
//     } else if (users.role_id !== 1) {
//       pendingCountQuery += ` AND t.created_by = ?`;
//       pendingValues.push(users.id);
//     }

//     const [pendingResult] = await db.query(pendingCountQuery, pendingValues);
//     const totalPending = pendingResult[0]?.total_pending || 0;

//     const pagination = getPagination(page, perPage, totalRecords);
//     const statusZeroCount  = totalPending;

//     return successResponse(
//       res,
//       result,
//       result.length === 0
//         ? "No Tickets found"
//         : "Tickets retrieved successfully",
//       200,
//       pagination,
//       {
//         total_records: totalRecords,
//         total_pending: statusZeroCount,
//       }
//     );
//   } catch (error) {
//     console.error("Error retrieving tickets:", error.stack || error.message);
//     return errorResponse(res, error.message, "Error retrieving tickets", 500);
//   }
// };

exports.getAlltickets = async (req, res) => {
  const {
    user_id,
    search,
    status,
    flag = 0,
    page = 1,
    perPage = 10,
  } = req.query;
  const offset = (page - 1) * perPage;

  if (!user_id) {
    return errorResponse(
      res,
      "User ID is required",
      "Missing user_id in request",
      400
    );
  }

  const users = await getAuthUserDetails(user_id, res);
  if (!users) {
    return errorResponse(res, "User not found", "Auth User not found", 404);
  }

  try {
    let query = `
            SELECT 
                (@rownum := @rownum + 1) AS s_no,
                t.id,
                t.user_id,
                COALESCE(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(NULLIF(u.last_name, ''), '')), 'Unknown User') AS name, 
                t.created_at AS created_at,
                t.description,
                i.issue_name AS issue_type,
                CONVERT_TZ(t.issue_date, '+00:00', '+05:30') AS issue_date,
                t.status,
                CASE 
                    WHEN t.status = 0 THEN 'Pending'
                    WHEN t.status = 1 THEN 'IN Progress'
                    WHEN t.status = 2 THEN 'Approved'
                    WHEN t.status = 3 THEN 'Rejected'
                    ELSE 'Unknown'
                END AS status_type,
               CONCAT('https://', t.file_name) AS file_name,
                COALESCE((SELECT COUNT(*) 
                          FROM ticket_comments tc
                          WHERE tc.ticket_id = t.id
                          AND tc.receiver_id = ? 
                          AND tc.type = 0), 0) AS unread_counts
            FROM tickets t
            LEFT JOIN users u ON t.user_id = u.id 
            LEFT JOIN issue_types i ON t.issue_type = i.id,
            (SELECT @rownum := ${offset || 0}) AS r
            WHERE t.deleted_at IS NULL
        `;

    let countQuery = `
            SELECT COUNT(*) AS total_records
            FROM tickets t
            LEFT JOIN users u ON t.user_id = u.id
            LEFT JOIN issue_types i ON t.issue_type = i.id
            WHERE t.deleted_at IS NULL
        `;

    let values = [users.id];
    let countValues = [];

    if (users.role_id === 1 && flag == 1) {
      query += ` AND t.created_by = ?`;
      countQuery += ` AND t.created_by = ?`;
      values.push(users.id);
      countValues.push(users.id);
    } else if (users.role_id !== 1) {
      query += ` AND t.created_by = ?`;
      countQuery += ` AND t.created_by = ?`;
      values.push(users.id);
      countValues.push(users.id);
    }

    if (status) {
      query += ` AND t.status = ?`;
      countQuery += ` AND t.status = ?`;
      values.push(parseInt(status));
      countValues.push(parseInt(status));
    }

          if (search) {
                query += ` AND (
                (
                CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(NULLIF(u.last_name, ''), '')) LIKE ? 
                OR (t.user_id = 0 AND 'Anonymous' LIKE ?)
                )
              OR t.id LIKE ? 
              OR DATE_FORMAT(CONVERT_TZ(t.created_at, '+00:00', '+05:30'), '%d-%m-%Y') LIKE ? 
              OR t.description LIKE ? 
              OR i.issue_name LIKE ? 
              OR DATE_FORMAT(CONVERT_TZ(t.issue_date,  '+00:00', '+05:30'), '%d-%m-%Y') LIKE ? 
              OR (
              CASE 
            WHEN t.status = 0 THEN 'Pending'
            WHEN t.status = 1 THEN 'IN Progress'
            WHEN t.status = 2 THEN 'Approved'
            WHEN t.status = 3 THEN 'Rejected'
            ELSE 'Unknown'
            END
             ) LIKE ?
          )`;

              countQuery += ` AND (
               (
               CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(NULLIF(u.last_name, ''), '')) LIKE ? 
               OR (t.user_id = 0 AND ? = 'Anonymous')
               )
              OR t.id LIKE ? 
              OR DATE_FORMAT(CONVERT_TZ(t.created_at, '+00:00', '+05:30'), '%d-%m-%Y') LIKE ? 
              OR t.description LIKE ? 
              OR i.issue_name LIKE ? 
              OR DATE_FORMAT(CONVERT_TZ(t.issue_date,  '+00:00', '+05:30'), '%d-%m-%Y') LIKE ? 
                OR (
              CASE 
              WHEN t.status = 0 THEN 'Pending'
              WHEN t.status = 1 THEN 'IN Progress'
              WHEN t.status = 2 THEN 'Approved'
              WHEN t.status = 3 THEN 'Rejected'
              ELSE 'Unknown'
              END
            ) LIKE ?
          )`;

      const searchPattern = `%${search}%`;
      values.push(
        searchPattern, 
        searchPattern,
        searchPattern, 
        searchPattern, 
        searchPattern, 
        searchPattern,
        searchPattern, 
        searchPattern 
      );

      countValues.push(
        searchPattern,
        searchPattern,
        searchPattern,
        searchPattern,
        searchPattern,
        searchPattern,
        searchPattern,
        searchPattern
      );
    }

    query += ` ORDER BY t.updated_at DESC LIMIT ? OFFSET ?`;
    values.push(parseInt(perPage), parseInt(offset));

    const [result] = await db.query(query, values);
    const [countResult] = await db.query(countQuery, countValues);

    const totalRecords = countResult[0]?.total_records || 0;

    let pendingCountQuery = `
        SELECT COUNT(*) AS total_pending
        FROM tickets t
        WHERE t.deleted_at IS NULL AND (t.status = 0 OR t.status = 1)
    `;

    let pendingValues = [];

    if (users.role_id === 1 && flag == 1) {
      pendingCountQuery += ` AND t.created_by = ?`;
      pendingValues.push(users.id);
    } else if (users.role_id !== 1) {
      pendingCountQuery += ` AND t.created_by = ?`;
      pendingValues.push(users.id);
    }

    const [pendingResult] = await db.query(pendingCountQuery, pendingValues);
    const totalPending = pendingResult[0]?.total_pending || 0;

    const pagination = getPagination(page, perPage, totalRecords);
    const statusZeroCount = totalPending;

    let unreadPendingAdmin = 0;

    if (users.role_id === 1) {
      const [adminUnreadRes] = await db.query(
        `SELECT COUNT(*) AS unread_pending_admin 
         FROM tickets 
         WHERE (status = 0 OR status = 1) 
         AND admin_is_read = 0 
         AND deleted_at IS NULL`
      );
      unreadPendingAdmin = adminUnreadRes[0]?.unread_pending_admin || 0;
    }

    return successResponse(
      res,
      result,
      result.length === 0
        ? "No Tickets found"
        : "Tickets retrieved successfully",
      200,
      pagination,
      {
        total_records: totalRecords,
        total_pending: statusZeroCount,
        unread_pending_admin: unreadPendingAdmin,
      }
    );
  } catch (error) {
    console.error("Error retrieving tickets:", error.stack || error.message);
    return errorResponse(res, error.message, "Error retrieving tickets", 500);
  }
};

exports.readPendingTickets = async (req, res) => {
  const { user_id } = req.body;

  if (!user_id) {
    return errorResponse(res, "User ID required", "Missing user_id", 400);
  }

  const users = await getAuthUserDetails(user_id, res);
  if (!users || users.role_id !== 1) {
    return errorResponse(
      res,
      "Unauthorized",
      "Only admin can perform this",
      403
    );
  }

  try {
    await db.query(
      `UPDATE tickets 
       SET admin_is_read = 1 
       WHERE (status = 0 OR status = 1) 
       AND admin_is_read = 0 
       AND deleted_at IS NULL`
    );

    return successResponse(
      res,
      [],
      "All unread pending tickets marked as read by admin",
      200
    );
  } catch (err) {
    console.error(err);
    return errorResponse(res, err.message, "Error updating tickets", 500);
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
      return errorResponse(
        res,
        null,
        "Ticket not found or already deleted",
        200
      );
    }

    return successResponse(
      res,
      { id, ...payload },
      "Ticket status updated successfully",
      200
    );
  } catch (error) {
    console.error("Error updating ticket status:", error.message);
    return errorResponse(
      res,
      error.message,
      "Error updating ticket status",
      500
    );
  }
};
