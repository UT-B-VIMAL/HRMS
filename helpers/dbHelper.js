const db = require('../config/db');

const executeQuery = (query, params) =>
  new Promise((resolve, reject) => {
    db.query(query, params, (error, results) => {
      if (error) {
        return reject(error);
      }
      resolve(results);
    });
  });

module.exports = { executeQuery };
