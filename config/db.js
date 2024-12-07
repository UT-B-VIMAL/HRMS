const mysql = require('mysql2');

const db = mysql.createConnection({
    host: "localhost",
    user:"root",
    password: "",
    database: "hrms",
});

db.connect((err) => {
    if (err) {
        console.error('Error connecting to the database:', err.message);
        throw err;
    }
    console.log('Database connected!');
});

module.exports = db;
