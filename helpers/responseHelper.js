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
  res.status(status).json(response);
};

const errorResponse = (res, error, message = 'An error occurred', status = 500) => {
  const response = {
    status,
    success: false,
    message,
    error,
  };
  if (!res.headersSent) {
    res.status(status).json(response);
  }
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

  // Prevent negative total worked time
  if (newTotalWorkedInSeconds < 0) {
    return convertSecondsToHHMMSS(0);
  }

  return convertSecondsToHHMMSS(newTotalWorkedInSeconds);
}

function convertSecondsToHHMMSS(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((num) => String(num).padStart(2, "0"))
    .join(":");
};

const convertToSeconds = (timeStr) => {
 if (!timeStr || typeof timeStr !== 'string') {
    return 0; // or throw an error if you prefer
  }

  const parts = timeStr.split(':');
  const [h = 0, m = 0, s = 0] = parts.map(Number);
  return h * 3600 + m * 60 + s;
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
function secondsToTimeString(totalSeconds) {
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}
function getTimeLeft(estimated, worked) {
  console.log("Estimated:", estimated);
  console.log("Worked:", worked);
  const estSeconds = convertToSeconds(estimated);
  const workedSeconds = convertToSeconds(worked);
  const leftSeconds = Math.max(estSeconds - workedSeconds, 0); // avoid negative
  return secondsToTimeString(leftSeconds);
}


function parseTimeTakenToSeconds(timeTaken) {
  const regex = /(?:(\d+)d)?\s*(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?/;
  const matches = timeTaken.match(regex);

  const days = parseInt(matches[1]) || 0;
  const hours = parseInt(matches[2]) || 0;
  const minutes = parseInt(matches[3]) || 0;
  const seconds = parseInt(matches[4]) || 0;

  return (days * 8 * 3600) + (hours * 3600) + (minutes * 60) + seconds;
}

module.exports = { successResponse, errorResponse, getResponse,getPagination,calculateNewWorkedTime,convertSecondsToHHMMSS,convertToSeconds,calculateRemainingHours,calculatePercentage,parseTimeTakenToSeconds,getTimeLeft };
