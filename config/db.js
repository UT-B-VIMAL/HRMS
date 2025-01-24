const mysql = require('mysql2');
require('dotenv').config({ path: __dirname + '/../.env' });

const db = mysql.createPool({
    host: process.env.DB_HOST,       
    user: process.env.DB_USERNAME,   
    password: process.env.DB_PASSWORD, 
    database: process.env.DB_NAME,    
    waitForConnections: true,         
    connectionLimit: 10,              
    queueLimit: 0, 
}).promise(); 


db.query('SELECT 1')
    .then(() => console.log('Database connected!'))
    .catch((err) => {
        console.error('Error connecting to the database:', err.message);
        throw err;
    });

module.exports = db;
