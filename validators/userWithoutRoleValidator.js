const Joi = require('joi');

const UserWithoutRoleSchema = (isUpdate = false) => Joi.object({
    first_name: Joi.string().min(3).max(100).required().messages({
        'string.base': 'First Name must be a string',
        'string.empty': 'First Name is required',
        'string.min': 'First Name must be at least 3 characters long',
        'string.max': 'First Name must be less than 100 characters',
        'any.required': 'First Name is required',
    }),

    // Make employee_id optional for update
    employee_id: isUpdate ? Joi.number().integer().min(1).optional() : Joi.number().integer().min(1).required().messages({
        'number.base': 'Employee ID must be a number',
        'number.integer': 'Employee ID must be an integer',
        'number.min': 'Employee ID must be greater than 0',
        'any.required': 'Employee ID is required',
    }),

    email: Joi.string().email().required().messages({
        'string.base': 'Email must be a string',
        'string.email': 'Email must be a valid email address',
        'any.required': 'Email is required',
    }),

    password: isUpdate ? Joi.string().optional() : Joi.string().min(6).required().messages({
        'string.base': 'Password must be a string',
        'string.min': 'Password must be at least 6 characters long',
        'any.required': 'Password is required',
    }),

    role_id: Joi.number().integer().optional().messages({
        'number.base': 'Role ID must be a number',
        'number.integer': 'Role ID must be an integer',
        'any.required': 'Role ID is required',
    }),

    designation_name: Joi.string().min(2).max(100).required().messages({
        'string.base': 'Designation name must be a string',
        'any.required': 'Designation name is required',
    }),


}).unknown(true);

module.exports = UserWithoutRoleSchema;
