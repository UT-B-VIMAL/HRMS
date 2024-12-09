// middleware/errorHandler.js
const { getResponse } = require('../helpers/responseHelper');

const globalErrorHandler = (err, req, res, next) => {
  console.error(err.stack); // Log the error stack for debugging

  // Build the response object with a 500 status code and error details
  const response = {
    statusCode: 500,
    body: {
      success: false,
      message: 'Internal Server Error',
      error: err.message, // Include the error message
    },
    headers: { "Content-Type": "application/json" }, 
  };

  return res.status(500).json(getResponse(response));
};

module.exports = globalErrorHandler;
