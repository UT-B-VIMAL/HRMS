const express = require('express');
const router = express.Router();
const { getNotifications, markAsRead, markAllAsRead, getUnreadNotifications } = require('../api/functions/notificationFunction');

router.get('/notifications/:user_id', async (req, res) => {
  const { user_id } = req.params;
  req.query.user_id = user_id; // Ensure user_id is included in req.query
  await getNotifications(req, res);
});

router.get('/notifications/:user_id/unread', async (req, res) => {
  const { user_id } = req.params;
  await getUnreadNotifications(user_id, res);
});

router.put('/notifications/:notification_id/read', async (req, res) => {
  const { notification_id } = req.params;
  await markAsRead(notification_id, res);
});

router.put('/notifications/:user_id/read-all', async (req, res) => {
  const { user_id } = req.params;
  await markAllAsRead(user_id, res);
});

module.exports = router;
