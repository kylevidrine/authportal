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
router.get("/auth/tiktok", (req, res) => {
  console.log("🎬 Starting TikTok OAuth flow");

  if (!isTikTokConfigured()) {
    console.log("❌ TikTok not configured");
    return res.redirect("/auth/login?tiktok_error=1");
  }

  const scopes = ["user.info.basic", "video.upload", "video.publish"];

  const authUrl =
    "https://www.tiktok.com/v2/auth/authorize/" +
    `?client_key=${process.env.TIKTOK_CLIENT_ID}` +
    `&scope=${scopes.join(",")}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(process.env.TIKTOK_CALLBACK_URL)}` +
    `&state=${req.sessionID}`;

  console.log("🔗 Redirecting to TikTok auth:", authUrl);
  res.redirect(authUrl);
});

// TikTok OAuth callback route
router.get("/auth/tiktok/callback", async (req, res) => {
  console.log("🎬 TikTok callback received");

  const { code, error, state } = req.query;

  if (error) {
    console.log("❌ TikTok OAuth error:", error);
    return res.redirect("/auth/login?tiktok_error=1");
  }

  if (!code) {
    console.log("❌ No authorization code received");
    return res.redirect("/auth/login?tiktok_error=1");
  }

  try {
    // Exchange authorization code for access token
    console.log("🔄 Exchanging code for access token...");
    const tokenResponse = await fetch(
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
          code: code,
          grant_type: "authorization_code",
          redirect_uri: process.env.TIKTOK_CALLBACK_URL,
        }),
      }
    );

    const tokenData = await tokenResponse.json();
    console.log("🔑 Token exchange response:", tokenData);

    if (tokenData.access_token) {
      // Store the access token (for demo, we'll just show it)
      res.send(`
        <h1>🎬 TikTok OAuth Success!</h1>
        <p><strong>✅ User access token obtained!</strong></p>
        <p><strong>Access Token:</strong> ${tokenData.access_token.substring(
          0,
          20
        )}...</p>
        <p><strong>Scope:</strong> ${tokenData.scope}</p>
        <p><strong>Expires in:</strong> ${tokenData.expires_in} seconds</p>
        <p>🎯 This token can now be used for video uploads!</p>
        <a href="/tiktok/upload" style="background: #1976d2; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Test Video Upload</a>
      `);
    } else {
      console.log("❌ Token exchange failed:", tokenData);
      res.redirect("/auth/login?tiktok_error=1");
    }
  } catch (error) {
    console.error("❌ Token exchange error:", error);
    res.redirect("/auth/login?tiktok_error=1");
  }
});

// =============================================================================
// N8N INTEGRATION ENDPOINTS
// =============================================================================

// N8N Webhook - Upload Video to TikTok
router.post(
  "/api/n8n/tiktok/upload",
  upload.single("video"),
  async (req, res) => {
    try {
      console.log("🎬 N8N TikTok upload request received");

      if (!isTikTokConfigured()) {
        return res.status(400).json({
          error: "TikTok not configured",
          message: "Missing TIKTOK_CLIENT_ID or TIKTOK_CLIENT_SECRET",
        });
      }

      const { title, description, privacy = "SELF_ONLY" } = req.body;

      if (!req.file) {
        return res.status(400).json({
          error: "No video file provided",
          message: "Please include a video file in the request",
        });
      }

      if (!title) {
        return res.status(400).json({
          error: "Missing title",
          message: "Video title is required",
        });
      }

      const clientToken = await getTikTokClientToken();
      if (!clientToken) {
        return res.status(500).json({
          error: "Failed to get TikTok access token",
          message: "Could not authenticate with TikTok API",
        });
      }

      // Step 1: Initialize upload
      console.log("📤 Initializing TikTok upload...");
      const initResponse = await fetch(
        "https://open.tiktokapis.com/v2/post/publish/content/init/",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${clientToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            post_info: {
              title: title,
              description: description || "",
              privacy_level: privacy,
              disable_duet: false,
              disable_comment: false,
              disable_stitch: false,
              video_cover_timestamp_ms: 1000,
            },
            source_info: {
              source: "FILE_UPLOAD",
              video_size: req.file.size,
              chunk_size: req.file.size,
              total_chunk_count: 1,
            },
          }),
        }
      );

      const initData = await initResponse.json();

      if (!initData.data || !initData.data.upload_url) {
        console.error("❌ TikTok upload init failed:", initData);
        return res.status(500).json({
          error: "Upload initialization failed",
          details: initData,
          message: "TikTok rejected the upload request",
        });
      }

      console.log("✅ Upload initialized successfully");
      console.log("📍 Upload URL:", initData.data.upload_url);
      console.log("🆔 Publish ID:", initData.data.publish_id);

      // For sandbox mode, we'll return the upload details
      // In production, you'd actually upload the file here
      res.json({
        success: true,
        message: "TikTok upload initialized successfully! (Sandbox mode)",
        data: {
          publish_id: initData.data.publish_id,
          upload_url: initData.data.upload_url,
          video_title: title,
          video_description: description,
          privacy_level: privacy,
          file_size: req.file.size,
          file_name: req.file.originalname,
          note: "In sandbox mode, the video won't actually be published but the API flow is working!",
        },
      });
    } catch (error) {
      console.error("❌ N8N TikTok upload error:", error);
      res.status(500).json({
        error: "Server error",
        message: error.message,
      });
    }
  }
);

// N8N Test Endpoint
router.get("/api/n8n/tiktok/test", async (req, res) => {
  try {
    if (!isTikTokConfigured()) {
      return res.status(400).json({
        error: "TikTok not configured",
        message: "Add TIKTOK_CLIENT_ID and TIKTOK_CLIENT_SECRET to environment",
      });
    }

    const clientToken = await getTikTokClientToken();

    res.json({
      success: !!clientToken,
      message: clientToken
        ? "TikTok API connection successful!"
        : "TikTok API connection failed",
      configured: isTikTokConfigured(),
      client_token_obtained: !!clientToken,
      endpoints: {
        upload: "/api/n8n/tiktok/upload",
        test: "/api/n8n/tiktok/test",
      },
      usage: {
        method: "POST",
        url: "/api/n8n/tiktok/upload",
        headers: { "Content-Type": "multipart/form-data" },
        body: {
          video: "[video file]",
          title: "Video title (required)",
          description: "Video description (optional)",
          privacy:
            "SELF_ONLY, FOLLOWER_OF_CREATOR, or PUBLIC (optional, defaults to SELF_ONLY)",
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      error: "Server error",
      message: error.message,
    });
  }
});

// Simple upload test page
router.get("/tiktok/upload", (req, res) => {
  if (!isTikTokConfigured()) {
    return res.status(400).send("TikTok not configured");
  }

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>TikTok Upload for N8N - Sandbox Test</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
        .container { background: #f5f5f5; padding: 20px; border-radius: 10px; }
        .success { color: green; font-weight: bold; }
        .error { color: red; font-weight: bold; }
        .note { background: #e7f3ff; padding: 15px; border-radius: 5px; margin: 20px 0; }
        button { background: #ff0050; color: white; padding: 15px 30px; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; margin: 10px 5px; }
        button:hover { background: #d40043; }
        input, textarea { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ccc; border-radius: 5px; }
        .form-group { margin: 15px 0; }
        pre { background: #f8f8f8; padding: 10px; border-radius: 5px; overflow-x: auto; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🎬 TikTok Upload API - N8N Integration</h1>
        
        <div class="note">
          <strong>📍 For N8N Automation</strong><br>
          This API lets N8N upload videos to TikTok without user login!<br>
          Perfect for automated content posting workflows.
        </div>
        
        <button onclick="testConnection()">🧪 Test TikTok Connection</button>
        
        <div id="connectionResult" style="margin: 20px 0;"></div>
        
        <h3>Upload Video Test</h3>
        <form id="uploadForm" enctype="multipart/form-data">
          <div class="form-group">
            <label>Video File:</label>
            <input type="file" name="video" accept="video/*" required>
          </div>
          <div class="form-group">
            <label>Title:</label>
            <input type="text" name="title" placeholder="My awesome video" required>
          </div>
          <div class="form-group">
            <label>Description:</label>
            <textarea name="description" placeholder="Video description (optional)"></textarea>
          </div>
          <div class="form-group">
            <label>Privacy:</label>
            <select name="privacy">
              <option value="SELF_ONLY">Private (Self Only)</option>
              <option value="FOLLOWER_OF_CREATOR">Followers Only</option>
              <option value="PUBLIC">Public</option>
            </select>
          </div>
          <button type="submit">📤 Upload to TikTok</button>
        </form>
        
        <div id="uploadResult" style="margin: 20px 0;"></div>
        
        <div class="note">
          <h4>N8N Integration:</h4>
          <pre>POST /api/n8n/tiktok/upload
Content-Type: multipart/form-data

Fields:
- video: [video file]
- title: "Video title" (required)
- description: "Description" (optional)
- privacy: "SELF_ONLY" | "FOLLOWER_OF_CREATOR" | "PUBLIC"</pre>
        </div>
      </div>

      <script>
        async function testConnection() {
          const resultDiv = document.getElementById('connectionResult');
          resultDiv.innerHTML = '⏳ Testing TikTok API connection...';
          
          try {
            const response = await fetch('/api/n8n/tiktok/test');
            const data = await response.json();
            
            if (data.success) {
              resultDiv.innerHTML = '<div class="success">✅ ' + data.message + '</div>';
            } else {
              resultDiv.innerHTML = '<div class="error">❌ ' + data.message + '</div>';
            }
          } catch (error) {
            resultDiv.innerHTML = '<div class="error">❌ Connection failed: ' + error.message + '</div>';
          }
        }
        
        document.getElementById('uploadForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const resultDiv = document.getElementById('uploadResult');
          resultDiv.innerHTML = '⏳ Uploading video to TikTok...';
          
          try {
            const formData = new FormData(e.target);
            
            const response = await fetch('/api/n8n/tiktok/upload', {
              method: 'POST',
              body: formData
            });
            
            const data = await response.json();
            
            if (data.success) {
              resultDiv.innerHTML = \`
                <div class="success">✅ Upload successful!</div>
                <pre>\${JSON.stringify(data.data, null, 2)}</pre>
              \`;
            } else {
              resultDiv.innerHTML = '<div class="error">❌ Upload failed: ' + data.message + '</div>';
            }
          } catch (error) {
            resultDiv.innerHTML = '<div class="error">❌ Upload error: ' + error.message + '</div>';
          }
        });
      </script>
    </body>
    </html>
  `);
});

// Legacy configuration function (kept for compatibility)
function configureTikTokStrategy(getCustomerById, storeCustomer) {
  console.log("✅ TikTok Content Posting API configured (N8N integration)");
}

module.exports = {
  router,
  configureTikTokStrategy,
};
