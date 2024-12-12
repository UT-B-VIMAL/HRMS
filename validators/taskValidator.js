const Joi = require('joi');

// Define all schemas in a single const
const validationshems = {
  createTaskSchema: Joi.object({
    product_id: Joi.number().integer().required().messages({
      'number.base': 'Product ID must be a number',
      'number.integer': 'Product ID must be an integer',
      'any.required': 'Product ID is required',
    }),
    project_id: Joi.number().integer().required().messages({
      'number.base': 'Project ID must be a number',
      'number.integer': 'Project ID must be an integer',
      'any.required': 'Project ID is required',
    }),
    user_id: Joi.number().integer().required().messages({
      'number.base': 'User ID must be a number',
      'number.integer': 'User ID must be an integer',
      'any.required': 'User ID is required',
    }),
    name: Joi.string().required().messages({
      'string.empty': 'Task name is required',
      'any.required': 'Task name is required',
    }),
    estimated_hours: Joi.string().pattern(/^([0-9]{2}):([0-9]{2}):([0-9]{2})$/).required().messages({
      'string.pattern.base': 'Estimated hours must be in the format HH:MM:SS (e.g., 00:00:00)',
      'any.required': 'Estimated hours is required',
    }),
    start_date: Joi.date().required().messages({
      'date.base': 'Start date must be a valid date',
      'any.required': 'Start date is required',
    }),
    end_date: Joi.date().greater(Joi.ref('start_date')).required().messages({
      'date.base': 'End date must be a valid date',
      'date.greater': 'End date must be greater than the start date',
      'any.required': 'End date is required',
    }),
  }).unknown(true),

  updateTaskSchema: Joi.object({
 
    name: Joi.string().required().messages({
      'string.empty': 'Subtask name is required',
      'any.required': 'Subtask name is required',
    }),
    estimated_hours: Joi.string().pattern(/^([0-9]{2}):([0-9]{2}):([0-9]{2})$/).required().messages({
      'string.pattern.base': 'Estimated hours must be in the format HH:MM:SS (e.g., 00:00:00)',
      'any.required': 'Estimated hours is required',
    }),
    start_date: Joi.date().optional().messages({
      'date.base': 'Start date must be a valid date',
    }),
    end_date: Joi.date().greater(Joi.ref('start_date')).optional().messages({
      'date.base': 'End date must be a valid date',
      'date.greater': 'End date must be greater than the start date',
    }),
  }).unknown(true),

  updateTaskDataSchema: Joi.object({

   
  }).unknown(true),
};

module.exports = validationshems;
