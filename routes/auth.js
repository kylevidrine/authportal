// routes/auth.js
const express = require("express");
const router = express.Router();

module.exports = (dependencies) => {
  const { getCustomerById, QB_ENVIRONMENT } = dependencies;

  // =============================================================================
  // AUTHENTICATION ROUTES
  // =============================================================================

  // Login page (GET)
  router.get("/login", (req, res) => {
    const error = req.query.error
      ? '<p style="color: red;">Invalid credentials</p>'
      : "";
    const googleError = req.query.google_error
      ? '<p style="color: red;">Google authentication failed</p>'
      : "";
    const fbError = req.query.fb_error
      ? '<p style="color: red;">Facebook authentication failed</p>'
      : "";

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>AI Workflow Portal - Login</title>
        <style>
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
            margin: 0; 
            padding: 50px 20px; 
            min-height: 100vh; 
            box-sizing: border-box;
          }
          .container { 
            background: white; 
            padding: 40px; 
            border-radius: 15px; 
            max-width: 450px; 
            margin: 0 auto; 
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
          }
          .logo { 
            text-align: center; 
            margin-bottom: 30px; 
          }
          .logo img {
            width: 300px;
            height: auto;
            max-height: 80px;
            object-fit: contain;
          }
          h2 { 
            color: #333; 
            text-align: center; 
            margin-bottom: 30px;
            font-weight: 600;
          }
          
          /* OAuth Button Styles */
          .oauth-signin-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            width: 100%;
            padding: 12px 16px;
            border: 2px solid #dadce0;
            border-radius: 8px;
            background: white;
            color: #3c4043;
            text-decoration: none;
            font-family: 'Segoe UI', sans-serif;
            font-size: 16px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.3s ease;
            margin-bottom: 12px;
          }
          
          .google-signin-btn {
            border-color: #dadce0;
          }
          
          .google-signin-btn:hover {
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            border-color: #4285f4;
          }
          
          .facebook-signin-btn {
            background: #1877f2;
            color: white;
            border-color: #1877f2;
          }
          
          .facebook-signin-btn:hover {
            background: #166fe5;
            box-shadow: 0 2px 8px rgba(24,119,242,0.3);
          }
          
          .oauth-icon {
            width: 20px;
            height: 20px;
            background-size: contain;
            background-repeat: no-repeat;
            background-position: center;
          }
          
          .google-icon {
            background-image: url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTIyLjU2IDEyLjI1YzAtLjc4LS4wNy0xLjUzLS4yLTIuMjVIMTJ2NC4yNmg1LjkyYy0uMjYgMS4zNy0xLjA0IDIuNTMtMi4yMSAzLjMxdjIuNzdoMy41N2MyLjA4LTEuOTIgMy4yOC00Ljc0IDMuMjgtOC4wOXoiIGZpbGw9IiM0Mjg1RjQiLz4KPHBhdGggZD0iTTEyIDIzYzIuOTcgMCA1LjQ2LS45OCA3LjI4LTIuNjZsLTMuNTctMi43N2MtLjk4LjY2LTIuMjMgMS4wNi0zLjcxIDEuMDYtMi44NiAwLTUuMjktMS45My02LjE2LTQuNTNIMi4xOHYyLjg0QzMuOTkgMjAuNTMgNy43IDIzIDEyIDIzeiIgZmlsbD0iIzM0QTg1MyIvPgo8cGF0aCBkPSJNNS44NCAxNC4wOWMtLjIyLS42Ni0uMzUtMS4zNi0uMzUtMi4wOXMuMTMtMS40My4zNS0yLjA5VjcuMDdIMi4xOEMxLjQzIDguNTUgMSAxMC4yMiAxIDEycy40MyAzLjQ1IDEuMTggNC45M2w0LjY2LTIuODR6IiBmaWxsPSIjRkJCQzA1Ii8+CjxwYXRoIGQ9Ik0xMiA1LjM4YzEuNjIgMCAzLjA2LjU2IDQuMjEgMS42NGwzLjE1LTMuMTVDMTcuNDUgMi4wOSAxNC45NyAxIDEyIDEgNy43IDEgMy45OSAzLjQ3IDIuMTggNy4wN2w0LjY2IDIuODRjLjg3LTIuNiAzLjMtNC41MyA2LjE2LTQuNTN6IiBmaWxsPSIjRUE0MzM1Ii8+Cjwvc3ZnPgo=');
          }
          
          .facebook-icon {
            background-image: url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTI0IDEyLjA3M0MyNCA1LjQwNSAxOC42MjcgMCAxMiAwUzAgNS40MDUgMCAxMi4wNzNDMCAxOC4wOTcgNC4zODggMjMuMDk0IDEwLjEyNSAyNFYxNS41NjNINy4wNzhWMTIuMDczSDEwLjEyNVY5LjQxM0MxMC4xMjUgNi4zODcgMTEuOTE3IDQuNzU2IDE0LjY1OCA0Ljc1NkMxNS45NyA0Ljc1NiAxNy4zNDQgNSAxNy4zNDQgNVY3Ljk2OUgxNS44M0MxNC4zMTEgNy45NjkgMTMuODc1IDguOTA2IDEzLjg3NSAxMC4wNzNWMTIuMDczSDE3LjIwM0wxNi42NzEgMTUuNTYzSDEzLjg3NVYyNEMxOS42MTIgMjMuMDk0IDI0IDE4LjA5NyAyNCAxMi4wNzNaIiBmaWxsPSJ3aGl0ZSIvPgo8L3N2Zz4K');
          }
          
          /* Divider */
          .divider {
            display: flex;
            align-items: center;
            margin: 30px 0;
          }
          .divider::before,
          .divider::after {
            content: '';
            flex: 1;
            height: 1px;
            background: #dadce0;
          }
          .divider span {
            padding: 0 16px;
            color: #5f6368;
            font-size: 14px;
          }
          
          /* Basic Auth Form */
          .basic-auth-section {
            margin-top: 20px;
          }
          .section-title {
            color: #5f6368;
            font-size: 14px;
            font-weight: 500;
            margin-bottom: 15px;
            text-align: center;
          }
          input { 
            width: 100%; 
            padding: 12px 16px; 
            margin: 8px 0; 
            border: 2px solid #dadce0; 
            border-radius: 8px; 
            box-sizing: border-box; 
            font-size: 16px;
            transition: border-color 0.3s ease;
          }
          input:focus {
            outline: none;
            border-color: #4285f4;
          }
          button { 
            background: #1976d2; 
            color: white; 
            padding: 12px 24px; 
            border: none; 
            border-radius: 8px; 
            width: 100%; 
            font-size: 16px; 
            font-weight: 500;
            cursor: pointer; 
            transition: background-color 0.3s ease;
          }
          button:hover { 
            background: #1565c0; 
          }
          .help-text {
            font-size: 12px;
            color: #5f6368;
            text-align: center;
            margin-top: 20px;
            line-height: 1.4;
          }
          .back-link {
            text-align: center;
            margin-top: 20px;
          }
          .back-link a {
            color: #1976d2;
            text-decoration: none;
            font-size: 14px;
          }
          .back-link a:hover {
            text-decoration: underline;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">
            <img src="https://www.robosouthla.com/wp-content/uploads/2025/05/cropped-logo.png" alt="AI Workflow Portal">
          </div>
          
          <h2>Welcome Back</h2>
          
          ${googleError}
          ${fbError}
          
          <!-- OAuth Login Options -->
          <a href="/auth/google" class="oauth-signin-btn google-signin-btn">
            <div class="oauth-icon google-icon"></div>
            <span>Continue with Google</span>
          </a>
          
          <a href="/auth/facebook" class="oauth-signin-btn facebook-signin-btn">
            <div class="oauth-icon facebook-icon"></div>
            <span>Continue with Facebook</span>
          </a>
          
          <!-- Divider -->
          <div class="divider">
            <span>or</span>
          </div>
          
          <!-- Basic Auth Section -->
          <div class="basic-auth-section">
            <div class="section-title">Sign in with email</div>
            
            ${error}
            
            <form method="POST" action="/login">
              <input type="email" name="username" placeholder="Email address" required>
              <input type="password" name="password" placeholder="Password" required>
              <button type="submit">Sign in</button>
            </form>
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">

            <iframe 
              src="https://n8n.robosouthla.com/form/8f505536-b28b-4df6-ac25-2a5803c4a45b" 
              width="100%" 
              height="500"
              style="border: none; border-radius: 8px;">
            </iframe>
          </div>  

        </div>
      </body>
      </html>
    `);
  });

  // Login form submission (POST)
  router.post("/login", (req, res) => {
    const { username, password } = req.body;
    console.log("🔑 Basic auth login attempt for:", username);

    const validUsers = {
      "reviewer@robosouthla.com": {
        password: "GoogleReview2024!",
        role: "reviewer",
        name: "Google Play Reviewer",
      },
      "demo@robosouthla.com": {
        password: "DemoUser2024!",
        role: "demo",
        name: "Demo User",
      },
      "admin@robosouthla.com": {
        password: "AdminAccess2024!",
        role: "admin",
        name: "System Administrator",
      },
      "dwayne@kadn.com": {
        password: "Password123",
        role: "user",
        name: "System Administrator",
      },
      "kylevidrine@me.com": {
        password: "KylePass2024!",
        role: "owner",
        name: "Kyle Vidrine",
      },
    };

    const user = validUsers[username];
    if (user && user.password === password) {
      // Set session with user info
      req.session.authenticated = true;
      req.session.userInfo = {
        email: username,
        name: user.name,
        role: user.role,
        authType: "basic",
      };

      // Force session save before redirect
      req.session.save((err) => {
        if (err) {
          console.error("❌ Session save error for basic auth:", err);
          return res.redirect("/login?error=session_failed");
        }
        console.log(
          "✅ Basic auth successful for:",
          username,
          "Role:",
          user.role
        );
        res.redirect("/dashboard");
      });
    } else {
      console.log("❌ Basic auth failed for:", username);
      res.redirect("/login?error=1");
    }
  });

  // Logout
  router.get("/logout", (req, res) => {
    const userEmail = req.user?.email || req.session?.userInfo?.email;
    console.log("🚪 Logging out user:", userEmail);

    // Clear session first
    req.session.destroy((err) => {
      if (err) {
        console.error("❌ Session destroy error:", err);
      } else {
        console.log("✅ Session destroyed successfully");
      }

      // Handle Passport logout if applicable
      if (req.logout && typeof req.logout === "function") {
        req.logout((logoutErr) => {
          if (logoutErr) {
            console.error("❌ Passport logout error:", logoutErr);
          } else {
            console.log("✅ Passport logout successful");
          }
          res.redirect("/login");
        });
      } else {
        res.redirect("/login");
      }
    });
  });

  // OAuth result page
  router.get("/auth-result", async (req, res) => {
    const urlParams = new URL(req.url, `http://${req.get("host")}`);
    const qbSuccess = urlParams.searchParams.get("qb_success");
    const qbError = urlParams.searchParams.get("qb_error");
    const googleSuccess = urlParams.searchParams.get("google_success");
    const customerId = urlParams.searchParams.get("customer_id");

    let customer = null;
    if (customerId) {
      try {
        customer = await getCustomerById(customerId);
      } catch (error) {
        console.error("Error fetching customer:", error);
      }
    }

    let statusMessage = "";
    let nextSteps = "";

    if (qbSuccess && customer) {
      statusMessage = `
        <div style="background: #d4edda; color: #155724; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #28a745;">
          <h3 style="margin-top: 0;">✅ QuickBooks Connected Successfully!</h3>
          <p>Company ID: <code>${customer.qb_company_id}</code></p>
          <p>Environment: <code>${QB_ENVIRONMENT}</code></p>
        </div>
      `;

      const hasGoogle = !!customer.google_access_token;

      nextSteps = `
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h4>🚀 Next Steps:</h4>
          <div style="background: white; padding: 15px; border-radius: 6px; margin: 10px 0;">
            <strong>Your Customer ID:</strong> 
            <span style="background: #f0f0f0; padding: 8px 12px; border-radius: 4px; font-family: monospace; font-size: 14px;">${customerId}</span>
            <button onclick="copyToClipboard('${customerId}')" style="margin-left: 10px; padding: 6px 12px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">Copy</button>
          </div>
          
          ${
            !hasGoogle
              ? `
            <div style="background: #e3f2fd; padding: 15px; border-radius: 6px; margin: 10px 0; border-left: 4px solid #2196f3;">
              <strong>💡 Enhance Your Integration:</strong>
              <p>Add Google Workspace for even more powerful workflows!</p>
              <a href="/auth/google" style="background: #4285f4; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Connect Google Workspace
              </a>
            </div>
          `
              : `
            <div style="background: #e8f5e8; padding: 15px; border-radius: 6px; margin: 10px 0; border-left: 4px solid #28a745;">
              <strong>🎉 Fully Integrated!</strong>
              <p>You now have both Google Workspace and QuickBooks connected!</p>
            </div>
          `
          }
        </div>
      `;
    } else if (googleSuccess && customer) {
      statusMessage = `
        <div style="background: #d4edda; color: #155724; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #28a745;">
          <h3 style="margin-top: 0;">✅ Google Workspace Connected Successfully!</h3>
          <p>Email: <code>${customer.email}</code></p>
        </div>
      `;

      const hasQB = !!(customer.qb_access_token && customer.qb_company_id);

      nextSteps = `
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h4>🚀 Next Steps:</h4>
          <div style="background: white; padding: 15px; border-radius: 6px; margin: 10px 0;">
            <strong>Your Customer ID:</strong> 
            <span style="background: #f0f0f0; padding: 8px 12px; border-radius: 4px; font-family: monospace; font-size: 14px;">${customerId}</span>
            <button onclick="copyToClipboard('${customerId}')" style="margin-left: 10px; padding: 6px 12px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">Copy</button>
          </div>
          
          ${
            !hasQB
              ? `
            <div style="background: #fff3cd; padding: 15px; border-radius: 6px; margin: 10px 0; border-left: 4px solid #ffc107;">
              <strong>💡 Add QuickBooks Integration:</strong>
              <p>Connect your accounting data for comprehensive business workflows!</p>
              <a href="/auth/quickbooks/standalone" style="background: #0077C5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Connect QuickBooks
              </a>
            </div>
          `
              : `
            <div style="background: #e8f5e8; padding: 15px; border-radius: 6px; margin: 10px 0; border-left: 4px solid #28a745;">
              <strong>🎉 Fully Integrated!</strong>
              <p>You now have both Google Workspace and QuickBooks connected!</p>
            </div>
          `
          }
        </div>
      `;
    } else {
      const errorMessages = {
        auth_failed: "Authorization failed. Please try again.",
        session_lost:
          "Session expired. Please start the authorization process again.",
        token_save_failed:
          "Failed to save authorization tokens. Please try again.",
      };
      statusMessage = `
        <div style="background: #f8d7da; color: #721c24; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #dc3545;">
          <h3 style="margin-top: 0;">❌ Authorization Error</h3>
          <p>${errorMessages[qbError] || "Unknown error occurred"}</p>
        </div>
      `;

      nextSteps = `
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h4>🔄 Try Again:</h4>
          <a href="/" style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 5px;">
            Start Over
          </a>
        </div>
      `;
    }

    res.send(`
      <html>
      <head>
        <title>Authorization Result</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
          .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
          .btn { background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 5px; }
          h1 { color: #333; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🤖 AI Workflow Portal</h1>
          
          ${statusMessage}
          ${nextSteps}
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6;">
            <a href="/" class="btn">← Back to Portal</a>
            <a href="/admin" class="btn" style="background: #6c757d;">Admin Panel</a>
          </div>
        </div>
        
        <script>
          function copyToClipboard(text) {
            navigator.clipboard.writeText(text).then(() => {
              alert('Customer ID copied to clipboard!');
            }).catch(err => {
              console.error('Failed to copy:', err);
              const textArea = document.createElement('textarea');
              textArea.value = text;
              document.body.appendChild(textArea);
              textArea.select();
              document.execCommand('copy');
              document.body.removeChild(textArea);
              alert('Customer ID copied to clipboard!');
            });
          }
        </script>
      </body>
      </html>
    `);
  });

  return router;
};
