const jwt = require('jsonwebtoken');
const axios = require('axios');
require('dotenv').config();

const RoleController = {
    /**
     * Middleware to Verify Token and Check Roles
     * @returns {function} - Middleware function for role-based access control
     */
    checkRole() {
        return async (req, res, next) => {
            try {
                var currentRequest = req.originalUrl.slice(1);
                const match = currentRequest.match(/\/([^\/?]+)/);
                const method = req.method;

                if (match) {
                    currentRequest = match[1]; // Outputs: "user"
                } else {
                    return res.status(400).json({ 
                        success: false, 
                        error: "Invalid request: No valid match found in the URL." 
                      });
                }
                const tokenFromHeader = req.headers.authorization?.split(' ')[1];
                console.log(currentRequest + "-"+method);

                if (!tokenFromHeader) {
                    return res.status(401).send({ message: "Unauthorized: No token provided" });
                }

                const decodedToken = jwt.decode(tokenFromHeader);

                if (!decodedToken || !decodedToken.sub) {
                    return res.status(400).send({ message: "Invalid token, user ID not found" });
                }

                const userId = decodedToken.sub; // Usually, the user ID is in the 'sub' field
                // console.log(`${process.env.SERVER_URL}admin/realms/${process.env.REALM}/users/${userId}/groups`);


                const groupsResponse = await axios.get(
                    `${process.env.SERVER_URL}admin/realms/${process.env.REALM}/users/${userId}/groups`,
                    {
                        headers: {
                            Authorization: `Bearer ${tokenFromHeader}`,
                        },
                    }
                );

                // console.log("Groups Response:", groupsResponse.data);

                if (!groupsResponse.data || groupsResponse.data.length === 0) {
                    return res.status(404).send({ message: "No groups found for this user" });
                }

                const groupid = groupsResponse.data[0].id;

                const groupsRolesResponse = await axios.get(
                    `${process.env.SERVER_URL}/admin/realms/${process.env.REALM}/groups/${groupid}/role-mappings`,
                    {
                        headers: {
                            Authorization: `Bearer ${tokenFromHeader}`,
                        },
                    }
                );

                // console.log("Group Roles Response:", groupsRolesResponse.data);

                const clientMappings = groupsRolesResponse.data.clientMappings || {};
                const realmManagementMapping = clientMappings["hrmsClient"];
                const exactRoles = realmManagementMapping
                    ? realmManagementMapping.mappings.map((mapping) => mapping.name)
                    : [];
                     
                 //console.log("Exact Roles:", exactRoles);
                 //console.log("currentRequest----:", currentRequest+'{{'+method+'}}');

                const isPresent = exactRoles.includes(currentRequest+'{{'+method+'}}');
                if (!isPresent) {
                    return res.status(403).send({ message: "Forbidden: Insufficient permissions" });
                }

                return next();
            } catch (error) {
                console.error("Error fetching groups:", error.response?.data || error.message);
                return res.status(500).send({ message: error.response?.data || error.message });
            }
        };
    },
};

module.exports = RoleController;