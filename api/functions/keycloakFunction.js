const axios = require('axios');
const keycloakConfig = require('../../config/keycloak');

async function getAdminToken() {
  try {
    const response = await axios.post(
      `${keycloakConfig.serverUrl}/realms/${keycloakConfig.realm}/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: "password",
        client_id: keycloakConfig.clientId,
        client_secret: keycloakConfig.clientSecret,
        username: keycloakConfig.adminUsername,
        password: keycloakConfig.adminPassword,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    return response.data.access_token;
  } catch (error) {
    if (error.response) {
      console.error("Error fetching Keycloak admin token:", error.response.data);
    } else {
      console.error("Error fetching Keycloak admin token:", error.message);
    }
    throw error;
  }
}

async function createUserInKeycloak(userData) {
  try {
    const token = await getAdminToken();
    const response = await axios.post(
      `${keycloakConfig.serverUrl}/admin/realms/${keycloakConfig.realm}/users`,
      userData,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    // Extract user ID from the location header
    const userId = response.headers.location ? response.headers.location.split('/').pop() : null;
    if (!userId) {
      throw new Error('Failed to retrieve user ID after creation');
    }

    return userId;
  } catch (error) {
    if (error.response) {
      return error.response.data;
    } else {
      throw new Error('Error creating user in Keycloak: ' + error.message);
    }
  }
}

async function editUserInKeycloak(userId, userData) {
  try {
    const token = await getAdminToken();
    const response = await axios.put(
      `${keycloakConfig.serverUrl}/admin/realms/${keycloakConfig.realm}/users/${userId}`,
      userData,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data;
  } catch (error) {
    console.error("Error editing user in Keycloak:", error.response.data);
    throw error;
  }
}

async function deleteUserInKeycloak(userId) {
  try {
    const token = await getAdminToken();
    await axios.delete(
      `${keycloakConfig.serverUrl}/admin/realms/${keycloakConfig.realm}/users/${userId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    console.log(`User ${userId} deleted successfully.`);
  } catch (error) {
    console.error("Error deleting user in Keycloak:", error.response.data);
    throw error;
  }
}

async function listUsers() {
  try {
      const token = await getAdminToken(); // Get the admin access token
      const response = await axios.get(
          `${keycloakConfig.serverUrl}/admin/realms/${keycloakConfig.realm}/users`,
          { headers: { Authorization: `Bearer ${token}` } }
      );
      return response.data;
  } catch (error) {
      console.error("Error listing roles:", error.response.data);
      throw error;
  }
}

// Assign role to the user
async function assignRoleToUser(userId, roleName) {
  try {
    const token = await getAdminToken();
    // Get the role ID by name
    const rolesResponse = await axios.get(
      `${keycloakConfig.serverUrl}/admin/realms/${keycloakConfig.realm}/roles/${roleName}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const role = rolesResponse.data;
    // Assign the role to the user
   return await axios.post(
      `${keycloakConfig.serverUrl}/admin/realms/${keycloakConfig.realm}/users/${userId}/role-mappings/realm`,
      [role],
      { headers: { Authorization: `Bearer ${token}` } }
    );
    console.log(`Role ${roleName} assigned to user ${userId}`);
  } catch (error) {
    return ({ error: "Failed to create user or assign role", details: error.response.data });
  }
}

module.exports = {
  createUserInKeycloak,
  editUserInKeycloak,
  deleteUserInKeycloak,
  listUsers,
  assignRoleToUser
};
