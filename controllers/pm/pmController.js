// controllers/userController.js
const { fetchProducts } = require('../../api/pm/pmdashboardService');
const { successResponse, errorResponse } = require('../../helpers/responseHelper');

exports.pmdashboardsection = async (req, res) => {
  try {
    const payload = req.body;
    const { request_type, action } = payload;

    if (request_type === 'pmdashboard') {
      switch (action) {
        case 'fetchproduct':
          return await fetchProducts(payload, res);
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
