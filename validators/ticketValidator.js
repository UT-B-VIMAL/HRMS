const Joi = require('joi');

const validationshems = {
  createTicketSchema: Joi.object({
    issue_type: Joi.number().integer().required().messages({
      'any.required': 'Issue is required',
    }),
    description: Joi.string().optional().messages({
      'string.base': 'Description should be a string',
    }),
    user_id: Joi.number().integer().optional().messages({
      'number.base': 'User ID should be an integer',
    }),
    file_url: Joi.string().uri().optional().messages({
      'string.uri': 'File URL should be a valid URI',
    }),
  }).unknown(true),

  // Schema for updating a ticket
  updateTicketSchema: Joi.object({
    status: Joi.number().integer().valid(0, 1, 2, 3).required().messages({
      'any.required': 'Status is required',
      'number.base': 'Status should be an integer',
      'any.only': 'Status must be one of the following values: 0 (Pending), 1 (In Progress), 2 (Done), 3 (Rejected)',
    }),
  }).unknown(true),
};

module.exports = validationshems;
