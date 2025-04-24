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

const UpdateRatingSchema = Joi.object({
  month: Joi.string()
  .pattern(/^\d{4}-(0[1-9]|1[0-2])$/)
  .required()
  .messages({
    "string.pattern.base": "Month must be in the format YYYY-MM.",
    "any.required": "The month field is required.",
  }),

  rater: Joi.string()
  .valid('TL', 'PM') // Restrict values to 'tl' and 'pm'
  .required()
  .messages({
    "any.only": "Rater must be either 'TL' or 'PM'.", // Custom error message for invalid values
    "any.required": "The rater field is required.",
  }),

quality: Joi.number()
  .max(5)
  .precision(1) // Allows up to one decimal place
  .required()
  .messages({
    "number.base": "Quality must be a valid number.",
    "number.max": "Quality must be at most 5.",
    "number.precision": "Quality must have at most one decimal place.",
    "any.required": "The quality field is required.",
  }),

timelines: Joi.number()
  .max(5)
  .precision(1) // Allows up to one decimal place
  .required()
  .messages({
    "number.base": "Timelines must be a valid number.",
    "number.max": "Timelines must be at most 5.",
    "number.precision": "Timelines must have at most one decimal place.",
    "any.required": "The timelines field is required.",
  }),

agility: Joi.number()
  .max(5)
  .precision(1) // Allows up to one decimal place
  .required()
  .messages({
    "number.base": "Agility must be a valid number.",
    "number.max": "Agility must be at most 5.",
    "number.precision": "Agility must have at most one decimal place.",
    "any.required": "The agility field is required.",
  }),

attitude: Joi.number()
  .max(5)
  .precision(1) // Allows up to one decimal place
  .required()
  .messages({
    "number.base": "Attitude must be a valid number.",
    "number.max": "Attitude must be at most 5.",
    "number.precision": "Attitude must have at most one decimal place.",
    "any.required": "The attitude field is required.",
  }),

responsibility: Joi.number()
  .max(5)
  .precision(1) // Allows up to one decimal place
  .required()
  .messages({
    "number.base": "Responsibility must be a valid number.",
    "number.max": "Responsibility must be at most 5.",
    "number.precision": "Responsibility must have at most one decimal place.",
    "any.required": "The responsibility field is required.",
  }),

  user_id: Joi
  .required()
  .messages({
    "any.required": "The user_id field is required.",
  }),

  status: Joi.valid(0, 1,"0","1").required().messages({
    "any.only": "The status must be either 0 or 1.",
    "any.required": "The status field is required.",
  }),

updated_by: Joi
  .required()
  .messages({
    "any.required": "The updated_by field is required.",
  }),
remarks: Joi.string()
  .required()
  .messages({
    "any.required": "The remarks field is required.",
  }),
});

module.exports = { UpdateRatingSchema,ratingSchema };
