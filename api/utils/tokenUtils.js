const db = require('../../config/db');
const jwt = require('jsonwebtoken');

const getUserIdFromAccessToken = async (accessToken) => {
    if (!accessToken) {
        throw new Error('Access token is missing or invalid');
    }

    const decoded = jwt.decode(accessToken);
    const keycloakId = decoded?.sub;

    if (!keycloakId) {
        throw new Error('Keycloak user ID not found in token');
    }

    const [user] = await db.query(
        'SELECT id FROM users WHERE keycloak_id = ? AND deleted_at IS NULL LIMIT 1',
        [keycloakId]
    );

    if (!user || user.length === 0) {
        throw new Error('User not found in the database');
    }

    return user[0].id;
};

module.exports = { getUserIdFromAccessToken };
