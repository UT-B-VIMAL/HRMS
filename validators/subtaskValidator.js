const Joi = require('joi');

const validationshems = {
 createSubTaskSchema : Joi.object({
  // product_id: Joi.number().integer().required().messages({
  //   'number.base': 'Product ID must be a number',
  //   'number.integer': 'Product ID must be an integer',
  //   'any.required': 'Product ID is required',
  // }),
  // project_id: Joi.number().integer().required().messages({
  //   'number.base': 'Project ID must be a number',
  //   'number.integer': 'Project ID must be an integer',
  //   'any.required': 'Project ID is required',
  // }),
  task_id: Joi.number().integer().required().messages({
    'number.base': 'Task ID must be a number',
    'number.integer': 'Task ID must be an integer',
    'any.required': 'Task ID is required',
  }),
  name: Joi.string().required().messages({
    'string.empty': 'Task name is required',
    'any.required': 'Task name is required',
  }),
  // estimated_hours: Joi.number().integer().required().messages({
  //   'number.base': 'Estimated hours must be a number',
  //   'number.integer': 'Estimated hours must be an integer',
  //   'any.required': 'Estimated hours are required',
  // }),
  // start_date: Joi.date().required().messages({
  //   'date.base': 'Start date must be a valid date',
  //   'any.required': 'Start date is required',
  // }),
  // end_date: Joi.date().greater(Joi.ref('start_date')).required().messages({
  //   'date.base': 'End date must be a valid date',
  //   'date.greater': 'End date must be greater than the start date',
  //   'any.required': 'End date is required',
  // }),
}).unknown(true),

// Validation schema for updating a task
updateSubTaskSchema : Joi.object({
  name: Joi.string().min(3).optional().messages({
    'string.empty': 'Task name is required',
    'string.min': 'Task name must be at least 3 characters long',
  }),
  estimated_hours: Joi.number().integer().optional().messages({
    'number.base': 'Estimated hours must be a number',
    'number.integer': 'Estimated hours must be an integer',
  }),
  start_date: Joi.date().optional().messages({
    'date.base': 'Start date must be a valid date',
  }),
  end_date: Joi.date().greater(Joi.ref('start_date')).optional().messages({
    'date.base': 'End date must be a valid date',
    'date.greater': 'End date must be greater than the start date',
  }),
}).unknown(true),

updatesubTaskDataSchema: Joi.object({
}).unknown(true),


};

module.exports = validationshems;