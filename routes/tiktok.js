const express = require("express");
const router = express.Router();
const fetch = require("node-fetch");
const multer = require("multer");

// Configure multer for file uploads
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("video/")) {
      cb(null, true);
    } else {
      cb(new Error("Only video files allowed"), false);
    }
  },
});

// Check if TikTok environment variables are configured
function isTikTokConfigured() {
  const configured = !!(
    process.env.TIKTOK_CLIENT_ID && process.env.TIKTOK_CLIENT_SECRET
  );
  console.log("🔍 TikTok config check:", {
    clientId: !!process.env.TIKTOK_CLIENT_ID,
    clientSecret: !!process.env.TIKTOK_CLIENT_SECRET,
    configured,
  });
  return configured;
}

// Get TikTok Client Access Token (for Content Posting API)
async function getTikTokClientToken() {
  try {
    const response = await fetch(
      "https://open.tiktokapis.com/v2/oauth/token/",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cache-Control": "no-cache",
        },
        body: new URLSearchParams({
          client_key: process.env.TIKTOK_CLIENT_ID,
          client_secret: process.env.TIKTOK_CLIENT_SECRET,
          grant_type: "client_credentials",
        }),
      }
    );

    const data = await response.json();

    if (data.access_token) {
      console.log("✅ TikTok client token obtained");
      return data.access_token;
    } else {
      console.error("❌ Failed to get TikTok client token:", data);
      return null;
    }
  } catch (error) {
    console.error("❌ Error getting TikTok client token:", error);
    return null;
  }
}

// =============================================================================
// TIKTOK OAUTH ROUTES
// =============================================================================

// TikTok OAuth authorization route

// Start TikTok OAuth flow
router.get("/auth/tiktok", (req, res) => {
  if (!isTikTokConfigured()) {
    return res.status(500).json({ error: "TikTok not configured" });
  }

  const authUrl = `https://www.tiktok.com/v2/auth/authorize/?client_key=${process.env.TIKTOK_CLIENT_ID}&scope=user.info.basic,video.publish&response_type=code&redirect_uri=${encodeURIComponent(process.env.TIKTOK_REDIRECT_URI)}&state=tiktok`;
  
  console.log("🔄 Redirecting to TikTok OAuth:", authUrl);
  res.redirect(authUrl);
});

// TikTok OAuth callback
router.get("/auth/tiktok/callback", async (req, res) => {
  const { code, state } = req.query;
  
  if (!code) {
    return res.redirect("/dashboard?error=tiktok_denied");
  }
  
  // For now, just mark as connected - full implementation later
  console.log("✅ TikTok callback received with code:", code);
  res.redirect("/dashboard?tiktok=connected");
});

module.exports = (dependencies) => {
  // Make database functions available to this router
  router.locals = dependencies;
  return router;
};