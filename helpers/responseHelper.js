const { StatusCodes } = require('http-status-codes');

const getResponse = (response) => {
  return {
    statusCode: response.statusCode || StatusCodes.OK,
    ...response,
  };
};

const successResponse = (res, data, message = 'Request successful', statusCode = 200) => {
  const response = {
    statusCode,
    success: true,
    message,
    data,
  };

  res.status(statusCode).json(getResponse(response)); 
};

const errorResponse = (res, error, message = 'An error occurred', statusCode = 500) => {
  const response = {
    statusCode,
    success: false,
    message,
    error,
  };
 // Send the pretty-printed JSON response
  res.status(statusCode).json(getResponse(response));
};

module.exports = { successResponse, errorResponse, getResponse };
