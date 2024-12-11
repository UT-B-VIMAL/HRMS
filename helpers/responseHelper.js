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

const getPagination = (page, perPage, totalRecords) => {
  page = parseInt(page, 10);
  const totalPages = Math.ceil(totalRecords / perPage);
  const nextPage = page < totalPages ? page + 1 : null;
  const prevPage = page > 1 ? page - 1 : null;

  const startRecord = (page - 1) * perPage + 1;
  const endRecord = Math.min(page * perPage, totalRecords); 

  return {
    total_records: totalRecords,
    total_pages: totalPages,
    current_page: page,
    per_page: perPage,
    range_from: `Showing ${startRecord}-${endRecord} of ${totalRecords} entries`,
    next_page: nextPage,
    prev_page: prevPage,
  };
};

module.exports = { successResponse, errorResponse, getResponse,getPagination };
