const Joi = require("joi");

const validationschema = {
  createExpenseSchema: Joi.object({
    amount: Joi.number().precision(2).min(0).max(99999999).required().messages({
      "number.base": "amount must be a number",
      "number.integer": "amount must be an integer",
      "number.min": "amount cannot be less than 0",
      "number.max": "amount must be a maximum of 8 digits",
      "any.required": "amount is required",
    }),

    category: Joi.number().integer().valid(1, 2, 3).required().messages({
      "number.base": "Category ID must be a number",
      "number.integer": "Category ID must be an integer",
      "any.only": "Category ID must be one of [1, 2, 3]",
      "any.required": "Category ID is required",
    }),
    date: Joi.date().max("now").required().messages({
      "date.base": "Date must be a valid date",
      "date.max": "Future dates are not allowed",
      "any.required": "Date is required",
    }),

    description: Joi.string().optional().messages({
      "string.base": "Description should be a string",
      "any.required": "Description is required",
    }),
    user_id: Joi.number().integer().optional().messages({
      "number.base": "User ID should be an integer",
    }),
    // file: Joi.string().uri().optional().messages({
    //   'string.uri': 'File URL should be a valid URI',
    //   "any.required": "File is required",
    // }),
    file: Joi.string()
      .uri()
      .pattern(/\.(png|jpe?g|pdf)$/i)
      .optional()
      .messages({
        "string.uri": "File URL should be a valid URI",
        "string.pattern.base": "Only PNG, JPEG, and PDF files are allowed",
      }),
  }).unknown(true),

  // Schema for updating a ticket
  updateExpenseSchema: Joi.object({
    amount: Joi.number().integer().required().messages({
      "number.base": "amount must be a number",
      "number.integer": "amount must be an integer",
      "any.required": "amount is required",
    }),
    category: Joi.number().integer().valid(1, 2, 3).required().messages({
      "number.base": "Category ID must be a number",
      "number.integer": "Category ID must be an integer",
      "any.only": "Category ID must be one of [1, 2, 3]",
      "any.required": "Category ID is required",
    }),
    date: Joi.date().required().messages({
      "date.base": "Date must be a valid date",
      "any.required": "Date is required",
    }),
    description: Joi.string().optional().messages({
      "string.base": "Description should be a string",
      "any.required": "Description is required",
    }),
    user_id: Joi.number().integer().optional().messages({
      "number.base": "User ID should be an integer",
    }),
    file: Joi.string().uri().optional().messages({
      "string.uri": "File URL should be a valid URI",
      "any.required": "File is required",
    }),
  }).unknown(true),
};

module.exports = validationschema;
