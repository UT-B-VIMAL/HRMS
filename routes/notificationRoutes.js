const express = require('express');
const router = express.Router();
const { getNotifications, markAsRead, markAllAsRead, getUnreadNotifications } = require('../api/functions/notificationFunction');

router.get('/notifications/:user_id', async (req, res) => {
  const { user_id } = req.params;
  const queryParams = req.query; // Get query parameters from the request
  await getNotifications(user_id, queryParams, res);
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
