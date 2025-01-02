const { successResponse, errorResponse } = require('../helpers/responseHelper');
const Joi = require('joi');
const { createTicketSchema,updateTicketSchema  } = require("../validators/ticketValidator");
const fileUpload =require('express-fileupload');
const {  uploadFileToS3 } = require('../config/s3');
const db = require('../config/db');
const {getAlltickets,getTickets,updateTickets}= require("../api/functions/ticketFunction")

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
console.log(req.params);

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