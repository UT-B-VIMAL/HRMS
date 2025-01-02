const Joi = require('joi');

const validationshems = {
  createTicketSchema : Joi.object({
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
};

module.exports = validationshems;
