const { successResponse, errorResponse } = require('../helpers/responseHelper');
const Joi = require('joi');
const { createTicketSchema,updateTicketSchema,ticketCommentSchema } = require("../validators/ticketValidator");
const fileUpload =require('express-fileupload');
const {  uploadFileToS3 } = require('../config/s3');
const db = require('../config/db');
const {getAlltickets,getTickets,updateTickets}= require("../api/functions/ticketFunction")

exports.createTicket = async (req, res) => {
    try {
      const { user_id, issue_type, description, created_by } = req.body;


      const missingFields = [];
  if (!issue_type) missingFields.push("issue_type");
  if (!description) missingFields.push("description");
  if (!user_id) missingFields.push("user_id");

  // If any field is missing, return an error response
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
        'INSERT INTO tickets (user_id, issue_type, description, file_name, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
        [user_id, issue_type, description, fileUrl, created_by]
      );
  
      // Return success response
      return successResponse(
        res,
        { id: result.insertId, user_id, issue_type, description, file_url: fileUrl, created_by },
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
        await getAlltickets(req,res);
    } catch (error) {
        return errorResponse(res, error.message, 'Error retrieving tasks', 500);
    }
};
    
exports.getTickets= async (req, res) => {
        try {
           const { id } = req.params;
           console.log(id);
           
            await getTickets(id, res);
        } catch (error) {
            return errorResponse(res, error.message, 'Error retrieving tasks', 500);
        }
};


exports.updateTickets= async (req, res) => {

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

      // Fetch the sender and receiver names
      const [userResult] = await db.execute(
          `SELECT 
              CONCAT(COALESCE(sender.first_name, ''), ' ', COALESCE(NULLIF(sender.last_name, ''), '')) AS sender_name,
              CONCAT(COALESCE(receiver.first_name, ''), ' ', COALESCE(NULLIF(receiver.last_name, ''), '')) AS receiver_name
           FROM ticket_comments tc
           JOIN users sender ON tc.sender_id = sender.id
           JOIN users receiver ON tc.receiver_id = receiver.id
           WHERE tc.id = ?`,
          [result.insertId]
      );

      if (userResult && userResult.length > 0) {
          const { sender_name, receiver_name } = userResult[0]; // Access sender and receiver names

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
