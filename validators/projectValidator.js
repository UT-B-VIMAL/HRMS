const Joi = require("joi");

// Define the schema for project validation
const projectSchema = Joi.object({
  name: Joi.string().required().messages({
    "string.empty": "Project name is required",
    "any.required": "Project name is required",
  }),
  product: Joi.number().integer().required().messages({
    "number.base": "Product ID must be a number",
    "number.integer": "Product ID must be an integer",
    "any.required": "Product ID is required",
  }),
  user_id: Joi.number().integer().required().messages({
    'number.base': 'User Id must be a valid user ID',
    'any.required': 'User Id field is required'
  })
});

module.exports = { projectSchema };
