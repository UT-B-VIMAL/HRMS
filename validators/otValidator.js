const Joi = require("joi");

const validationschema = {
  // Validation schema for creating OT data
  createOTSchema: Joi.object({
    project_id: Joi.number().integer().required().messages({
      "number.base": "Project ID must be a number",
      "number.integer": "Project ID must be an integer",
      "any.required": "Project ID is required",
    }),
    task_id: Joi.number().integer().required().messages({
      "number.base": "Task ID must be a number",
      "number.integer": "Task ID must be an integer",
      "any.required": "Task ID is required",
    }),
    date: Joi.date().required().messages({
      "date.base": "Date must be a valid date",
      "any.required": "Date is required",
    }),
    time: Joi.string()
      .regex(/^([0-1]?[0-9]|2[0-3]|24):[0-5][0-9](?::[0-5][0-9])?$/)
      .required()
      .messages({
        "string.base": "Time must be a string",
        "string.pattern.base": "Time must be in HH:mm or HH:mm:ss format",
        "any.required": "Time is required",
      }),
  }).unknown(true),

  // Validation schema for updating OT data
  updateOTSchema: Joi.object({
    project_id: Joi.number().integer().required().messages({
      "number.base": "Project ID must be a number",
      "number.integer": "Project ID must be an integer",
      "any.required": "Project ID is required",
    }),
    task_id: Joi.number().integer().required().messages({
      "number.base": "Task ID must be a number",
      "number.integer": "Task ID must be an integer",
      "any.required": "Task ID is required",
    }),
    date: Joi.date().required().messages({
      "date.base": "Date must be a valid date",
      "any.required": "Date is required",
    }),
    time: Joi.string()
      .regex(/^([0-1]?[0-9]|2[0-3]|24):[0-5][0-9](?::[0-5][0-9])?$/)
      .required()
      .messages({
        "string.base": "Time must be a string",
        "string.pattern.base": "Time must be in HH:mm or HH:mm:ss format",
        "any.required": "Time is required",
      }),
  }).unknown(true),

  // Validation schema for updating subtask data (empty schema)
  updatesubTaskDataSchema: Joi.object({}).unknown(true),
};

module.exports = validationschema;
