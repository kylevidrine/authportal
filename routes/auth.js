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
            border-color: #dadce0;
          }
          
          .facebook-signin-btn:hover {
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            border-color: #1877f2;
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
          
          /* SMS Opt-in Section */
          .sms-section {
            margin-top: 40px;
            padding-top: 30px;
            border-top: 1px solid #dadce0;
          }
          .sms-title {
            color: #28a745;
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 15px;
            text-align: center;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
          }
          .sms-description {
            color: #5f6368;
            font-size: 14px;
            text-align: center;
            margin-bottom: 20px;
            line-height: 1.4;
          }
          .consent-box {
            background: #f0f8ff;
            border: 1px solid #b3d9ff;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 15px;
            font-size: 13px;
            line-height: 1.4;
          }
          .consent-checkbox {
            display: flex;
            align-items: flex-start;
            gap: 8px;
            cursor: pointer;
          }
          .consent-checkbox input[type="checkbox"] {
            width: auto;
            margin: 2px 0 0 0;
            flex-shrink: 0;
          }
          .sms-button {
            background: #28a745;
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            width: 100%;
            font-size: 16px;
            font-weight: 500;
            cursor: pointer;
            transition: background-color 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
          }
          .sms-button:hover {
            background: #218838;
          }
          .sms-button:disabled {
            background: #6c757d;
            cursor: not-allowed;
          }
          .success-message {
            background: #d4edda;
            border: 1px solid #c3e6cb;
            color: #155724;
            padding: 12px;
            border-radius: 8px;
            text-align: center;
            margin-top: 15px;
            display: none;
          }
          .error-message {
            background: #f8d7da;
            border: 1px solid #f5c6cb;
            color: #721c24;
            padding: 12px;
            border-radius: 8px;
            text-align: center;
            margin-top: 15px;
            display: none;
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
          </div>

          <!-- SMS Opt-in Section (NEW - At the bottom) -->
          <div class="sms-section">
            <div class="sms-title">
              📱 Get SMS Notifications
            </div>
            <div class="sms-description">
              Stay updated with workflow alerts and account notifications via text message.
            </div>
            
            <form id="smsOptInForm">
              <div class="consent-box">
                <label class="consent-checkbox">
                  <input type="checkbox" id="smsConsent" required>
                  <span>I agree to receive text messages from Robo South LA AI Solutions regarding workflow updates and account notifications. Message and data rates may apply. Reply STOP to opt out anytime.</span>
                </label>
              </div>
              
              <input type="email" id="smsEmail" placeholder="Email address" required style="margin-bottom: 8px;">
              <input type="tel" id="smsPhone" placeholder="Phone number (e.g., +1234567890)" required>
              
              <button type="submit" class="sms-button" id="smsSubmitBtn">
                📱 Sign Up for SMS Notifications
              </button>
            </form>
            
            <div id="smsSuccessMessage" class="success-message">
              ✅ Success! You've been signed up for SMS notifications.
            </div>
            <div id="smsErrorMessage" class="error-message">
              ❌ Error signing up. Please try again.
            </div>
          </div>

          <div class="back-link">
            <a href="/">← Back to Home</a>
          </div>
        </div>

        <script>
          // SMS Opt-in form handler
          document.getElementById('smsOptInForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const submitBtn = document.getElementById('smsSubmitBtn');
            const successMsg = document.getElementById('smsSuccessMessage');
            const errorMsg = document.getElementById('smsErrorMessage');
            
            // Hide previous messages
            successMsg.style.display = 'none';
            errorMsg.style.display = 'none';
            
            // Check consent
            const consent = document.getElementById('smsConsent').checked;
            if (!consent) {
              errorMsg.textContent = 'Please check the consent box to continue.';
              errorMsg.style.display = 'block';
              return;
            }

            // Get form data
            const email = document.getElementById('smsEmail').value;
            const phone = document.getElementById('smsPhone').value;

            // Disable button during submission
            submitBtn.disabled = true;
            submitBtn.innerHTML = '⏳ Signing up...';

            try {
              const response = await fetch('/api/sms/public-opt-in', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  email: email,
                  phone: phone,
                  consent: true
                })
              });

              const data = await response.json();

              if (response.ok && data.success) {
                successMsg.textContent = '✅ Success! You\\'ve been signed up for SMS notifications.';
                successMsg.style.display = 'block';
                document.getElementById('smsOptInForm').reset();
              } else {
                throw new Error(data.message || 'Failed to sign up for SMS notifications');
              }
            } catch (error) {
              errorMsg.textContent = '❌ ' + error.message;
              errorMsg.style.display = 'block';
            } finally {
              // Re-enable button
              submitBtn.disabled = false;
              submitBtn.innerHTML = '📱 Sign Up for SMS Notifications';
            }
          });
        </script>
      </body>
      </html>
    `);
  });

  // Login form submission (POST) - keeping your existing logic
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
        role: "admin",
        name: "Kyle Vidrine",
      },
      "kylemvidrine@gmail.com": {
        password: "KylePass2024!",
        role: "admin",
        name: "Kyle Vidrine",
      },
    };

    const user = validUsers[username];

    if (user && user.password === password) {
      console.log("✅ Basic auth successful for:", username);

      req.session.authenticated = true;
      req.session.userInfo = {
        email: username,
        name: user.name,
        role: user.role,
        customerId: null, // Will be set when needed
      };

      res.redirect("/");
    } else {
      console.log("❌ Basic auth failed for:", username);
      res.redirect("/login?error=1");
    }
  });

  // ... rest of your existing auth routes remain the same

  return router;
};
