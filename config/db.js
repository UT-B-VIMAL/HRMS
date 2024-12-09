onst mysql = require('mysql2');

const db = mysql.createConnection({
    host: "new-timesheet.crfjkk9fkpj5.ap-south-1.rds.amazonaws.com",
    user:"admin",
    password: "TimeSheet",
    database: "hrms_backend",
});

db.connect((err) => {
    if (err) {
        console.error('Error connecting to the database:', err.message);
        throw err;
    }
    console.log('Database connected!');
});

module.exports = db;
