const Joi = require("joi");

const changePasswordSchema = Joi.object({
    current_password: Joi.string().required().messages({
        "string.empty": "Current password is required.",
        "any.required": "Current password is required."
    }),
    new_password: Joi.string().min(8).required().messages({
        "string.min": "New password must be at least 8 characters long.",
        "string.empty": "New password is required.",
        "any.required": "New password is required."
    }),
    confirm_password: Joi.string().valid(Joi.ref('new_password')).required().messages({
        "any.only": "Confirm password does not match the new password.",
        "any.required": "Confirm password is required."
    })
});

module.exports = { changePasswordSchema};
