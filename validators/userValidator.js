const Joi = require('joi');

const UserSchema = Joi.object({
  first_name: Joi.string().min(3).max(100).required().messages({
    'string.base': 'Fisrt Name must be a string',
    'string.empty': 'Fisrt Name is required',
    'string.min': 'Fisrt Name must be at least 3 characters long',
    'string.max': 'Fisrt Name must be less than 100 characters',
    'any.required': 'Fisrt Name is required',
  }),

  employee_id: Joi.number().integer().required().messages({
    'number.base': 'Employee ID must be a number',
    'number.integer': 'Employee ID must be an integer',
    'any.required': 'Employee ID is required',
  }),

  email: Joi.string().email().required().messages({
    'string.base': 'Email must be a string',
    'string.email': 'Email must be a valid email address',
    'any.required': 'Email is required',
  }),

  password: Joi.string().min(6).required().messages({
    'string.base': 'Password must be a string',
    'string.min': 'Password must be at least 6 characters long',
    'any.required': 'Password is required',
  }),

  role_id: Joi.number().integer().required().messages({
    'number.base': 'Role ID must be a number',
    'number.integer': 'Role ID must be an integer',
    'any.required': 'Role ID is required',
  }),

  designation_id: Joi.number().integer().required().messages({
    'number.base': 'Designation ID must be a number',
    'number.integer': 'Designation ID must be an integer',
    'any.required': 'Designation ID is required',
  }),

}).unknown(true);

module.exports = UserSchema;
