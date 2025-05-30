const jwt = require("jsonwebtoken");
const axios = require("axios");

const keycloakConfig = require('../config/keycloak');

const RoleController = {
    /**
     * Middleware to Verify Token and Check Roles
     * @param {string} requiredRole - The required role to access the API
     * @returns {function} - Middleware function for role-based access control
     */
    // Middleware to Verify Token and Group Permissions
    checkRole(requiredRoles) {
        return (req, res, next) => {
            const token = req.headers.authorization?.split(' ')[1];
            if (!token) {
                return res.status(401).send({ message: "Unauthorized: No token provided" });
            }

            try {
                // Decode the JWT token
                const decoded = jwt.decode(token);

                // Check roles in `realm_access` or `resource_access`
                const roles = decoded.realm_access?.roles || [];
                const hasRole = requiredRoles.some(role => roles.includes(role));

                if (hasRole) {
                    return next();
                } else {
                    return res.status(403).send({ message: "Forbidden: Access denied" });
                }
            } catch (err) {
                console.error("Error decoding token:", err);
                return res.status(500).send({ message: "Internal Server Error" });
            }
        };
    }

};

module.exports = RoleController;