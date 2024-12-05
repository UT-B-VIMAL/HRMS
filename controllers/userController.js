// controllers/userController.js
const { insertUser, updateUser, deleteUser } = require('../api/user/userService');
const { successResponse, errorResponse } = require('../helpers/responseHelper');

exports.processEvent = async (req, res) => {
  try {
    const payload = req.body;
    const { request_type, action } = payload;

    if (request_type === 'employee') {
      switch (action) {
        case 'insert':
          return await insertUser(payload, res);
        case 'update':
          return await updateUser(payload, res);
        case 'delete':
          return await deleteUser(payload, res);
        default:
          return errorResponse(res, null, 'Invalid Action Type', 400);
      }


      
    } else {
      return errorResponse(res, null, 'Invalid Request Type', 400);
    }
  } catch (error) {
    console.error("Error during processing:", error);
    return errorResponse(res, null, 'Internal Server Error', 500);
  }
};
