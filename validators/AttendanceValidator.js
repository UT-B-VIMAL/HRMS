const Joi = require("joi");

const attendanceValidator = Joi.object({
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
  attendanceType: Joi.number()
    .integer()
    .required()
    .messages({
      "any.required": "The Attendance Type field is required",
    }),
  halfDay: Joi.number()
    .integer()
    .when("attendanceType", {
      is: 2, // Check if attendanceType is 2
      then: Joi.required().messages({
        "any.required": "The Half Day field is required when Attendance Type is 2",
      }),
      otherwise: Joi.optional(),
    }),
  statusFilter: Joi.string()
    .valid("Present", "Absent")
    .required().empty('')
    .messages({
    'string.base': 'The Status Filter must be a string',
      "any.required": "The Status Filter field is required",
      "any.only": "The Status Filter must be 'Present' or 'Absent'",
      'string.empty': 'The Status Filter cannot be empty',
    }), 
    updated_by: Joi.number().integer().required().messages({
        'number.base': 'updated_by must be a valid user ID',
        'any.required': ' updated_by field is required'
      })

}).with("halfDay", "attendanceType");

const attendanceFetch = Joi.object({
    status: Joi.string()
    .valid("Present", "Absent")
    .required().empty('')
    .messages({
    'string.base': 'The Status Filter must be a string',
      "any.required": "The Status Filter field is required",
      "any.only": "The Status Filter must be 'Present' or 'Absent'",
      'string.empty': 'The Status Filter cannot be empty',
    }),
    user_id: Joi.number().integer().required().messages({
        'number.base': 'User Id must be a valid user ID',
        'any.required': 'User Id field is required'
      })
    });

module.exports = { attendanceValidator ,attendanceFetch};
