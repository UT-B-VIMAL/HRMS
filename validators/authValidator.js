const Joi = require("joi");

const changePasswordSchema = Joi.object({
  current_password: Joi.string().required().messages({
    "string.empty": "Current password is required.",
    "any.required": "Current password is required.",
  }),
  new_password: Joi.string().min(6).required().messages({
    "string.min": "New password must be at least 6 characters long.",
    "string.empty": "New password is required.",
    "any.required": "New password is required.",
  }),
  confirm_password: Joi.string()
    .valid(Joi.ref("new_password"))
    .required()
    .messages({
      "any.only": "Confirm password does not match the new password.",
      "any.required": "Confirm password is required.",
    }),
}).custom((value, helpers) => {
  if (value.current_password === value.new_password) {
    return helpers.message({
      custom: "New password cannot be the same as the current password.",
    });
  }
  return value;
}, "Password Match Validation");

module.exports = { changePasswordSchema};
