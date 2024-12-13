const Joi = require("joi");


const ratingSchema = Joi.object({
  average: Joi.number()
    .integer()
    .min(0)
    .max(10)
    .required()
    .messages({
      "any.required": "The 'average' field is required.",
      "number.base": "The 'average' field must be a number.",
      "number.max": "The 'average' field cannot be greater than 10.",
      "number.min": "The 'average' field cannot be less than 0.",
    }),
  rating: Joi.number()
    .integer()
    .min(0)
    .max(10)
    .required()
    .messages({
      "any.required": "The 'rating' field is required.",
      "number.base": "The 'rating' field must be a number.",
      "number.max": "The 'rating' field cannot be greater than 10.",
      "number.min": "The 'rating' field cannot be less than 0.",
    }),
  user_id: Joi.number()
    .integer()
    .required()
    .messages({
      "any.required": "The 'user_id' field is required.",
      "number.base": "The 'user_id' field must be a valid integer.",
    }),
    updated_by: Joi.number()
    .integer()
    .required()
    .messages({
      "any.required": "The 'updated_by' field is required.",
      "number.base": "The 'updated_by' field must be a valid integer.",
    }),
});

module.exports = { ratingSchema };
