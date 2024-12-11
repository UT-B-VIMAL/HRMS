const Joi = require("joi");

const attendanceValidator= Joi.object({
    ids: Joi.array()
      .items(Joi.number().integer().positive().required())
      .required()
      .messages({
        "array.base": "IDs must be an array",
        "array.includes": "Each ID must be a valid integer",
      }),
    date: Joi.date().required().messages({
      "date.base": "Invalid date format",
      "any.required": "The date field is required",
    }),
    attendanceType: Joi.number().integer().required().messages({
      "any.required": "The Attendance Type field is required",
    }),
    halfDay: Joi.number().integer().optional(),
    statusFilter: Joi.string().valid("Present", "Absent").required().messages({
      "any.required": "The Status Filter field is required",
      "any.only": "The Status Filter must be 'Present' or 'Absent'",
    }),
  }).with("halfDay", "attendanceType");

  module.exports = { attendanceValidator };