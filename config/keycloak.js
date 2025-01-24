require('dotenv').config(); 

module.exports = {
    serverUrl: process.env.SERVER_URL,
    realm: process.env.REALM,
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    adminUsername: process.env.ADMIN_USERNAME,
    adminPassword: process.env.ADMIN_PASSWORD
};

  