require('dotenv').config();
const mysql = require('mysql2');

const { DB_HOST, DB_USERNAME, DB_PASSWORD, DB_NAME } = process.env;

const db = mysql.createConnection({
    host: DB_HOST,
    user: DB_USERNAME,
    password: DB_PASSWORD,
    database: DB_NAME,
});

db.connect((err) => {
    if (err) {
        console.error('Error connecting to the database:', err.message);
        throw err;
    }
    console.log('Database connected!');
});

module.exports = db;
