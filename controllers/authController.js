const { changePassword} = require('../api/functions/changepasswordFunction');
const { successResponse, errorResponse } = require('../helpers/responseHelper');
const { changePasswordSchema } = require("../validators/authValidator");

const authController = {

  
   change_password: async (req, res) => {
      try {
        const { id } = req.params;
        const payload = req.body;
        const { error } = changePasswordSchema.validate(payload, { abortEarly: false });
  
        if (error) {
          const errorMessages = error.details.reduce((acc, err) => {
            acc[err.path[0]] = err.message;
            return acc;
          }, {});
  
          return errorResponse(res, errorMessages, "Validation Error", 403);
        }
  
        await changePassword(id, payload, res);
  
      } catch (error) {
        return errorResponse(res, error.message, 'Error updating task', 500);
      }
    },
  
  
  };
  
  module.exports = authController;

  
  

