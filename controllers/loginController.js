const { signInUser } = require("../api/functions/keycloakFunction");

exports.login = async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
    }

    try {
        const tokens = await signInUser(username, password);
        res.status(200).json({ message: "Login successful", tokens });
    } catch (error) {
        res.status(401).json({ error: "Failed to sign in", details: error.response?.data || error.message });
    }
  };