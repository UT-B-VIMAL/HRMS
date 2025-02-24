const { successResponse, errorResponse } = require('../helpers/responseHelper');
const Joi = require('joi');
const { createTicketSchema, updateTicketSchema, ticketCommentSchema } = require("../validators/ticketValidator");
const fileUpload = require('express-fileupload');
const { uploadFileToS3 } = require('../config/s3');
const db = require('../config/db');
const { getAlltickets, getTickets, updateTickets } = require("../api/functions/ticketFunction");
const { userSockets } = require('../helpers/notificationHelper');

exports.createTicket = async (req, res) => { 
  const io = req.io; 
  try {
    const { user_id, issue_type, issue_date = null, description, created_by } = req.body;

    const missingFields = [];
    if (!issue_type) missingFields.push("issue_type");
    if (!description) missingFields.push("description");
    if (!user_id) missingFields.push("user_id");

    if (missingFields.length > 0) {
      return errorResponse(
        res,
        `Missing required fields: ${missingFields.join(", ")}`,
        "Validation Error",
        400
      );
    }

    let fileUrl = null;

    if (req.files && req.files.file) {
      const file = req.files.file;
      const fileBuffer = file.data;
      const originalFileName = file.name;
      const uniqueFileName = `${Date.now()}_${originalFileName}`;
      fileUrl = await uploadFileToS3(fileBuffer, uniqueFileName);
    }

    const [result] = await db.execute(
      'INSERT INTO tickets (user_id, issue_type, issue_date, description, file_name, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
      [user_id, issue_type, issue_date, description, fileUrl, created_by]
    );

    const [admins] = await db.execute('SELECT id FROM users WHERE role_id = 1');
    const adminIds = admins.map(admin => admin.id);

    if (adminIds.length > 0) {
      const notificationPayload = {
        title: 'New Ticket Created',
        body: `A new support ticket has been submitted. Please review.`,
      };
      adminIds.forEach(async (adminId) => {
        const socketId = userSockets[adminId]; // Get the socket ID for the admin
        if (socketId) {
          io.to(socketId).emit('push_notification', notificationPayload);
        }
        // Insert notification into the database
        await db.execute(
          'INSERT INTO notifications (user_id, title, body, read_status, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
          [adminId, notificationPayload.title, notificationPayload.body, 0]
        );
      });
    }

    return successResponse(
      res,
      { id: result.insertId, user_id, issue_type, issue_date, description, file_url: fileUrl, created_by },
      "Ticket created successfully",
      201
    );
  } catch (error) {
    console.error("Error creating ticket:", error.message);
    return errorResponse(res, error.message, "Error creating ticket", 500);
  }
};

exports.getAlltickets = async (req, res) => {
  try {
    await getAlltickets(req, res);
  } catch (error) {
    return errorResponse(res, error.message, 'Error retrieving tasks', 500);
  }
};

exports.getTickets = async (req, res) => {
  try {
    const { id } = req.params;
    console.log(id);

    await getTickets(id, res);
  } catch (error) {
    return errorResponse(res, error.message, 'Error retrieving tasks', 500);
  }
};

exports.updateTickets = async (req, res) => {
  const io = req.io;
  try {
    const { id } = req.params;
    const payload = req.body;

    const idValidation = Joi.string().required().validate(id);
    if (idValidation.error) {
      return errorResponse(res, { id: 'Ticket ID is required and must be valid' }, 'Validation Error', 403);
    }

    const { error } = updateTicketSchema.validate(payload, { abortEarly: false });
    if (error) {
      const errorMessages = error.details.reduce((acc, err) => {
        acc[err.path[0]] = err.message;
        return acc;
      }, {});
      return errorResponse(res, errorMessages, "Validation Error", 403);
    }

    await updateTickets(id, payload, res);

    // Fetch the created_by user ID from the database
    const [ticket] = await db.execute('SELECT created_by FROM tickets WHERE id = ?', [id]);
    if (ticket.length === 0) {
      return errorResponse(res, 'Ticket not found', 'Error retrieving ticket', 404);
    }

    const createdBy = ticket[0].created_by;

    // Send notification based on the ticket status
    let notificationPayload;
    if (payload.status === "2") {
      notificationPayload = {
        title: 'Ticket Resolved',
        body: 'The ticket has been successfully resolved.',
      };
    } else if (payload.status === "3") {
      notificationPayload = {
        title: 'Ticket Rejected',
        body: 'The support ticket has been marked as rejected.',
      };
    }

    if (notificationPayload) {
      const socketIds = userSockets[createdBy]; // Get the array of socket IDs for the created_by user
      if (Array.isArray(socketIds)) {
        socketIds.forEach(socketId => {
          io.to(socketId).emit('push_notification', notificationPayload);
        });
      }
      // Insert notification into the database
      await db.execute(
        'INSERT INTO notifications (user_id, title, body, read_status, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
        [createdBy, notificationPayload.title, notificationPayload.body, 0]
      );
    }

  } catch (error) {
    return errorResponse(res, error.message, 'Error updating ticket', 500);
  }
};

exports.ticketComments = async (req, res, io) => {
  const { ticket_id, sender_id, receiver_id, comments } = req.body;

  // Perform validation or other necessary operations
  const { error } = ticketCommentSchema.validate(req.body, { abortEarly: false });
  if (error) {
    const errorMessages = error.details.reduce((acc, err) => {
      acc[err.path[0]] = err.message;
      return acc;
    }, {});
    return res.status(400).json({ status: 'error', message: 'Validation Error', errors: errorMessages });
  }

  try {
    // Insert the ticket comment into the database
    const [result] = await db.execute(
      `INSERT INTO ticket_comments (ticket_id, sender_id, receiver_id, comments, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, NOW(), NOW(), NULL)`,
      [ticket_id, sender_id, receiver_id, comments]
    );

    // Fetch the sender and receiver names and roles
    const [userResult] = await db.execute(
      `SELECT 
              CONCAT(COALESCE(sender.first_name, ''), ' ', COALESCE(NULLIF(sender.last_name, ''), '')) AS sender_name,
              CONCAT(COALESCE(receiver.first_name, ''), ' ', COALESCE(NULLIF(receiver.last_name, ''), '')) AS receiver_name,
              receiver.role_id AS receiver_role_id
           FROM ticket_comments tc
           JOIN users sender ON tc.sender_id = sender.id
           JOIN users receiver ON tc.receiver_id = receiver.id
           WHERE tc.id = ?`,
      [result.insertId]
    );

    if (userResult && userResult.length > 0) {
      const { sender_name, receiver_name, receiver_role_id } = userResult[0]; // Access sender and receiver names and roles

      const newComment = {
        id: result.insertId,
        ticket_id,
        sender_id,
        receiver_id,
        comments,
        sender_name,
        receiver_name,
        formatted_time: new Date().toLocaleString(),
        created_at: new Date(),
      };

      // Emit WebSocket event to all connected users who should receive this comment
      io.sockets.emit('new_ticket_comment', newComment);  // Send the new comment to all connected users

      // Send notification to the receiver
      let notificationPayload;
      if (receiver_role_id === 1) {
        notificationPayload = {
          title: 'Ticket Update Received',
          body: `${sender_name} has provided an update.`,
        };
      } else {
        notificationPayload = {
          title: 'New Message in Ticket Chat',
          body: 'You have a new message in your support ticket.',
        };
      }
      const socketIds = userSockets[receiver_id]; // Get the array of socket IDs for the receiver
      if (Array.isArray(socketIds)) {
        socketIds.forEach(socketId => {
          io.to(socketId).emit('push_notification', notificationPayload);
        });
      }
      // Insert notification into the database
      await db.execute(
        'INSERT INTO notifications (user_id, title, body, read_status, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
        [receiver_id, notificationPayload.title, notificationPayload.body, 0]
      );

      // Return success response
      return res.status(201).json({ status: 'success', message: 'Ticket Comment created successfully', data: newComment });
    } else {
      return res.status(404).json({ status: 'error', message: 'User data not found' });
    }
  } catch (error) {
    console.error('Error creating ticket comment:', error.message);
    return res.status(500).json({ status: 'error', message: 'Error creating ticket comment', error: error.message });
  }
};
