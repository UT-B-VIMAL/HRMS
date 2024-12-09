const { StatusCodes } = require('http-status-codes');

const getResponse = (response) => {
  return {
    status: response.status || StatusCodes.OK,
    ...response,
  };
};

const successResponse = (res, data, message = 'Request successful', status = 200, pagination = null) => {
  const response = {
    status,
    success: true,
    message,
    data,
  };
  if (pagination) {
    response.pagination = pagination;
  }
  res.status(status).json(getResponse(response)); 
};

const errorResponse = (res, error, message = 'An error occurred', status = 500) => {
  const response = {
    status,
    success: false,
    message,
    error,
  };
  res.status(status).json(getResponse(response));
};

module.exports = { successResponse, errorResponse, getResponse };
