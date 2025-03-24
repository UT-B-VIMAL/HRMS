const db = require('../../config/db');
const { successResponse, errorResponse } = require('../../helpers/responseHelper');
const getPagination = require('../../helpers/pagination');

exports.getNotifications = async (req, res) => {
  try {
    const { user_id } = req.params; // Get user_id from req.params
    const { page = 1, perPage = 10 } = req.query; // Get page and perPage from req.query
    const offset = (page - 1) * perPage;

    const query = `
      SELECT id, title, body, read_status, created_at
      FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;
    const [notifications] = await db.query(query, [user_id, parseInt(perPage), parseInt(offset)]);

    const countQuery = `
      SELECT COUNT(*) AS total
      FROM notifications
      WHERE user_id = ?
    `;
    const [countResult] = await db.query(countQuery, [user_id]);
    const totalRecords = countResult[0].total;

    const unreadCountQuery = `
      SELECT COUNT(*) AS unreadCount
      FROM notifications
      WHERE user_id = ? AND read_status = 0
    `;
    const [unreadCountResult] = await db.query(unreadCountQuery, [user_id]);
    const unread_count = unreadCountResult[0].unreadCount;

    const pagination = getPagination(page, perPage, totalRecords);

    return successResponse(res, { notifications, pagination, unread_count }, 'Notifications retrieved successfully');
  } catch (error) {
    console.error('Error retrieving notifications:', error.message);
    return errorResponse(res, error.message, 'Error retrieving notifications', 500);
  }
};

exports.getUnreadNotifications = async (user_id, res) => {
  try {
    const query = `
      SELECT id, title, body, read_status, created_at
      FROM notifications
      WHERE user_id = ? AND read_status = 0
      ORDER BY created_at DESC
    `;
    const [notifications] = await db.query(query, [user_id]);

    return successResponse(res, notifications, 'Unread notifications retrieved successfully');
  } catch (error) {
    console.error('Error retrieving unread notifications:', error.message);
    return errorResponse(res, error.message, 'Error retrieving unread notifications', 500);
  }
};

exports.markAsRead = async (notification_id, res) => {
  try {
    const query = `
      UPDATE notifications
      SET read_status = 1, updated_at = NOW()
      WHERE id = ?
    `;
    const [result] = await db.query(query, [notification_id]);

    if (result.affectedRows === 0) {
      return errorResponse(res, 'Notification not found', 'Error updating notification', 404);
    }

    return successResponse(res, null, 'Notification marked as read successfully');
  } catch (error) {
    console.error('Error updating notification:', error.message);
    return errorResponse(res, error.message, 'Error updating notification', 500);
  }
};

exports.markAllAsRead = async (user_id, res) => {
  try {
    const query = `
      UPDATE notifications
      SET read_status = 1, updated_at = NOW()
      WHERE user_id = ? AND read_status = 0
    `;
    const [result] = await db.query(query, [user_id]);

    if (result.affectedRows === 0) {
      return errorResponse(res, 'No unread notifications found', 'Error updating notifications', 404);
    }

    return successResponse(res, null, 'All notifications marked as read successfully');
  } catch (error) {
    console.error('Error updating notifications:', error.message);
    return errorResponse(res, error.message, 'Error updating notifications', 500);
  }
};
