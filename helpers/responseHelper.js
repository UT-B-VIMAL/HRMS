const { StatusCodes } = require('http-status-codes');

const getResponse = (response) => {
  return {
    status: response.status || StatusCodes.OK,
    ...response,
  };
};



const successResponse = (res, data, message = 'Request successful', status = 200, pagination = null, totalPendingCounts = null) => {
  const response = {
    status,
    success: true,
    message,
    data,
  };
  if (pagination) {
    response.pagination = pagination;
  }
  if (totalPendingCounts !== null) {
    response.total_pending_counts = totalPendingCounts;
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

function calculateNewWorkedTime(worked, timeDifference) {
  const workedInSeconds = convertToSeconds(worked);
  const newTotalWorkedInSeconds = workedInSeconds + timeDifference;
  return convertSecondsToHHMMSS(newTotalWorkedInSeconds);
};

function convertSecondsToHHMMSS(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((num) => String(num).padStart(2, "0"))
    .join(":");
};

const convertToSeconds = (timeString) => {
  const [hours, minutes, seconds] = timeString.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
};

function calculateRemainingHours(estimated, worked) {
  const estimatedSeconds = convertToSeconds(estimated);
  const workedSeconds = convertToSeconds(worked);
  const remainingSeconds = Math.max(0, estimatedSeconds - workedSeconds);
  return convertSecondsToHHMMSS(remainingSeconds);
};

const calculatePercentage = (value, total) => {
  if (!total || total === 0) return "0%";
  return ((value / total) * 100).toFixed(2) + "%";
};

module.exports = { successResponse, errorResponse, getResponse,getPagination,calculateNewWorkedTime,convertSecondsToHHMMSS,convertToSeconds,calculateRemainingHours,calculatePercentage };
