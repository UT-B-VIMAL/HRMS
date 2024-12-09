const { changePassword} = require('../api/functions/changepasswordFunction');
const { successResponse, errorResponse } = require('../helpers/responseHelper');


exports.change_password= async (req, res) => {
    try {
        await changePassword(req,res);
    } catch (error) {
        return errorResponse(res, error.message, 'Error update the password', 500);
    }
};

