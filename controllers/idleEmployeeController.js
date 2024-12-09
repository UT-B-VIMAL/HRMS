const { get_idleEmployee } = require('../api/functions/idleEmployeeFunction');
const { successResponse, errorResponse } = require('../helpers/responseHelper');

// const { createTaskSchema ,updateTaskSchema } = require("../validators/taskValidator");


exports.get_idleEmployee = async (req, res) => {
    try {
        await get_idleEmployee(req,res);
    } catch (error) {
        return errorResponse(res, error.message, 'Error retrieving idle employee', 500);
    }
};
