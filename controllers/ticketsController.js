const { successResponse, errorResponse } = require('../helpers/responseHelper');
const Joi = require('joi');
const { createTicketSchema  } = require("../validators/ticketValidator");
const fileUpload =require('express-fileupload');
const {  uploadFileToS3 } = require('../config/s3');
const db = require('../config/db');
const {getAlltickets}= require("../api/functions/ticketFunction")

exports.createTicket = async (req, res) => {
    try {
      const { user_id, issue_type, description, created_by } = req.body;
      let fileUrl = null;
  
      if (req.files && req.files.file) {
        const file = req.files.file;
        const fileBuffer = file.data;  
        const fileName = file.name;  
       fileUrl = await uploadFileToS3(fileBuffer, fileName);
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
