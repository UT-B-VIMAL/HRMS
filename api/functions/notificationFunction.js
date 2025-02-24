const db = require('../../config/db');
const { successResponse, errorResponse } = require('../../helpers/responseHelper');

exports.getNotifications = async (user_id, res) => {
  try {
    const query = `
      SELECT id, title, body, read_status, created_at
      FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
    `;
    const [notifications] = await db.query(query, [user_id]);

    const unreadCountQuery = `
      SELECT COUNT(*) AS unread_count
      FROM notifications
      WHERE user_id = ? AND read_status = 0
    `;
    const [unreadCountResult] = await db.query(unreadCountQuery, [user_id]);
    const unreadCount = unreadCountResult[0].unread_count;

    return successResponse(res, { notifications, unread_count: unreadCount }, 'Notifications retrieved successfully');
  } catch (error) {
    console.error('Error retrieving notifications:', error.message);
    return errorResponse(res, error.message, 'Error retrieving notifications', 500);
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
