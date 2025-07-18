import { verifyAssertionResponse } from "../../utils/verifyAssertionResponse.mjs";
import {
  storeVerificationResult,
  debugChallenges,
} from "../../utils/challengeStore.mjs";

const verifyLogin = async (req, res) => {
  try {
    const { username, credential } = req.body;

    console.log(`🔐 STARTING LOGIN VERIFICATION for user: "${username}"`);

    if (!username || !credential) {
      return res.status(400).json({
        success: false,
        message: "Username and credential are required",
      });
    }

    // Verify assertion response
    const loginResponse = await verifyAssertionResponse(username, credential);

    // ✅ Store verification result for Passport strategy to use
    await storeVerificationResult(username, {
      verified: true,
      user: loginResponse.user,
      timestamp: new Date().toISOString(),
    });

    console.log(`✅ Login verification successful for: "${username}"`);
    res.status(200).json(loginResponse);
  } catch (error) {
    console.error(
      `❌ Login verification error for "${req.body?.username}":`,
      error.message
    );

    await debugChallenges();

    res.status(401).json({
      success: false,
      message: "Authentication failed",
      error: error.message, // Remove this in production
    });
  }
};

export default verifyLogin;
