const express = require("express");

module.exports = function (dependencies) {
  const {
    getAllCustomers,
    getCustomerById,
    validateToken,
    validateQBToken,
    QB_ENVIRONMENT,
  } = dependencies;

  const router = express.Router();

  // =============================================================================
  // MAIN PORTAL PAGE LOGIC (ALL LOGIC AT TOP)
  // =============================================================================
  router.get("/", async (req, res) => {
    // 1. AUTHENTICATION CHECK
    if (!req.user) {
      return res.redirect("/login");
    }

    // 2. GET USER DATA
    const userEmail = req.user.email || req.user.emails?.[0]?.value;
    const userName = req.user.name || req.user.displayName || userEmail;
    const authType = req.user.provider || "basic";
    const isGoogleUser = authType === "google";
    const isFacebookUser = authType === "facebook";

    // 3. GET CUSTOMER DATA
    let customer = null;
    let hasQBAuth = false;
    let customerId = null;

    if (isGoogleUser) {
      customer = req.user;
      customerId = customer.id;
      hasQBAuth = !!(customer.qb_access_token && customer.qb_company_id);
    } else if (isFacebookUser) {
      try {
        const existingCustomers = await getAllCustomers();
        customer = existingCustomers.find((c) => c.email === userEmail);
        customerId = customer?.id;
        hasQBAuth = !!(customer?.qb_access_token && customer?.qb_company_id);
      } catch (error) {
        console.error("Error fetching Facebook customer:", error);
      }
    } else {
      try {
        const existingCustomers = await getAllCustomers();
        customer = existingCustomers.find((c) => c.email === userEmail);
        customerId = customer?.id;
        hasQBAuth = !!(customer?.qb_access_token && customer?.qb_company_id);
      } catch (error) {
        console.error("Error fetching basic auth customer:", error);
      }
    }

    // 4. CHECK SMS OPT-IN STATUS
    const hasSmsOptIn = customer?.sms_opt_in === 1;

    console.log("Main page auth status:", {
      authType,
      isGoogleUser,
      isFacebookUser,
      hasQBAuth,
      hasSmsOptIn,
      customerId: customer?.id,
    });

    // =============================================================================
    // TEMPLATE VARIABLES (MIDDLE SECTION)
    // =============================================================================
    const templateVars = {
      userName,
      userEmail,
      authType: isGoogleUser
        ? "Google OAuth"
        : isFacebookUser
        ? "Facebook OAuth"
        : "Basic Auth",
      customerId,

      // Card status variables
      isGoogleConnected: isGoogleUser,
      isQBConnected: hasQBAuth,
      isFacebookConnected: isFacebookUser,
      isInstagramConnected: false, // Placeholder for future
      isSmsOptedIn: hasSmsOptIn,

      // Button configurations
      googleButton: isGoogleUser
        ? `<p style="color: #28a745; font-weight: bold; margin-bottom: 15px;">✅ Connected</p>
           <button onclick="disconnectGoogle()" class="btn-modern btn-disconnect">
             <span>🔌 Disconnect Google</span>
           </button>`
        : `<a href="/auth/google" class="btn-modern btn-connect">
             <div class="logo-icon logo-google"></div>
             <span>Connect with Google</span>
           </a>`,

      qbButton: hasQBAuth
        ? `<p style="color: #28a745; font-weight: bold; margin-bottom: 15px;">✅ Connected</p>
           <button onclick="disconnectQB()" class="btn-modern btn-disconnect">
             <span>🔌 Disconnect QuickBooks</span>
           </button>`
        : `<a href="/auth/quickbooks/standalone" class="btn-modern btn-connect">
             <div class="logo-icon logo-quickbooks"></div>
             <span>Connect QuickBooks</span>
           </a>`,

      facebookButton: isFacebookUser
        ? `<p style="color: #28a745; font-weight: bold; margin-bottom: 15px;">✅ Connected</p>
           <button onclick="disconnectFacebook()" class="btn-modern btn-disconnect">
             <span>🔌 Disconnect Facebook</span>
           </button>`
        : `<a href="/auth/facebook" class="btn-modern btn-connect">
             <div class="logo-icon logo-facebook"></div>
             <span>Connect with Facebook</span>
           </a>`,

      smsButton: hasSmsOptIn
        ? `<p style="color: #28a745; font-weight: bold; margin-bottom: 15px;">✅ SMS Notifications Enabled</p>
           <button onclick="toggleSmsOptIn(false)" class="btn-modern btn-disconnect">
             <span>🔕 Disable SMS</span>
           </button>`
        : `<form id="smsOptInForm" style="margin: 0;">
             <div style="background: #f0f8ff; padding: 15px; border-radius: 6px; margin-bottom: 15px; font-size: 13px; line-height: 1.4;">
               <label style="display: flex; align-items: flex-start; cursor: pointer;">
                 <input type="checkbox" id="smsConsent" required style="margin-right: 8px; margin-top: 2px;">
                 <span>I agree to receive text messages from Robo South LA AI Solutions regarding workflow updates and account notifications. Message and data rates may apply. Reply STOP to opt out anytime.</span>
               </label>
             </div>
             <button type="submit" class="btn-modern btn-connect" style="width: 100%;">
               <span>📱 Enable SMS Notifications</span>
             </button>
           </form>`,
    };

    // =============================================================================
    // HTML TEMPLATE (CLEAN TEMPLATE AT BOTTOM)
    // =============================================================================
    res.send(`
        <html>
        <head>
          <title>AI Workflow Portal</title>
          <style>
            body { 
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
              text-align: center; 
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
              max-width: 900px; 
              margin: 0 auto; 
              box-shadow: 0 20px 40px rgba(0,0,0,0.1);
            }
            .user-bar {
              background: #e3f2fd; 
              padding: 10px; 
              border-radius: 5px; 
              margin-bottom: 20px;
              text-align: left;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            .logo { 
              margin-bottom: 20px; 
              display: flex;
              justify-content: center;
              align-items: center;
            }
            .logo img {
              transition: transform 0.3s ease;
              width: 400px;
              height: auto;
              max-height: 128px;
              object-fit: contain;
            }
            .logo img:hover {
              transform: scale(1.05);
            }
            
            /* Button Styles */
            .btn-modern {
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 12px 20px;
              background: #4285f4;
              color: white;
              border: none;
              border-radius: 8px;
              text-decoration: none;
              font-weight: 500;
              font-size: 14px;
              transition: all 0.3s ease;
              cursor: pointer;
              width: 100%;
              box-sizing: border-box;
            }
            .btn-connect { background: #4285f4; }
            .btn-connect:hover { background: #3367d6; transform: translateY(-1px); }
            .btn-disconnect { background: #dc3545; }
            .btn-disconnect:hover { background: #c82333; transform: translateY(-1px); }
            
            .btn-dashboard {
              background: #28a745;
              color: white;
              padding: 15px 32px;
              font-size: 18px;
              font-weight: 600;
              border-radius: 8px;
              text-decoration: none;
              display: inline-block;
              margin: 30px 0;
              transition: all 0.3s ease;
              border: none;
              cursor: pointer;
            }
            .btn-dashboard:hover {
              background: #218838;
              transform: translateY(-2px);
              box-shadow: 0 8px 25px rgba(40,167,69,0.3);
            }

            /* Logo styles */
            .logo-icon {
              width: 20px;
              height: 20px;
              flex-shrink: 0;
              margin-right: 8px;
            }

            .logo-google {
              background: url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTIyLjU2IDEyLjI1YzAtLjc4LS4wNy0xLjUzLS4yLTIuMjVIMTJ2NC4yNmg1LjkyYy0uMjYgMS4zNy0xLjA0IDIuNTMtMi4yMSAzLjMxdjIuNzdoMy41N2MyLjA4LTEuOTIgMy4yOC00Ljc0IDMuMjgtOC4wOXoiIGZpbGw9IiM0Mjg1RjQiLz4KPHBhdGggZD0iTTEyIDIzYzIuOTcgMCA1LjQ2LS45OCA3LjI4LTIuNjZsLTMuNTctMi43N2MtLjk4LjY2LTIuMjMgMS4wNi0zLjcxIDEuMDYtMi44NiAwLTUuMjktMS45My02LjE2LTQuNTNIMi4xOHYyLjg0QzMuOTkgMjAuNTMgNy43IDIzIDEyIDIzeiIgZmlsbD0iIzM0QTg1MyIvPgo8cGF0aCBkPSJNNS44NCAxNC4wOWMtLjIyLS42Ni0uMzUtMS4zNi0uMzUtMi4wOXMuMTMtMS40My4zNS0yLjA5VjcuMDdIMi4xOEMxLjQzIDguNTUgMSAxMC4yMiAxIDEycy40MyAzLjQ1IDEuMTggNC45M2w0LjY2LTIuODR6IiBmaWxsPSIjRkJCQzA1Ii8+CjxwYXRoIGQ9Ik0xMiA1LjM4YzEuNjIgMCAzLjA2LjU2IDQuMjEgMS42NGwzLjE1LTMuMTVDMTcuNDUgMi4wOSAxNC45NyAxIDEyIDEgNy43IDEgMy45OSAzLjQ3IDIuMTggNy4wN2w0LjY2IDIuODRjLjg3LTIuNiAzLjMtNC41MyA2LjE2LTQuNTN6IiBmaWxsPSIjRUE0MzM1Ii8+Cjwvc3ZnPgo=') no-repeat center;
              background-size: contain;
            }

            .logo-facebook {
              background: url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTI0IDEyLjA3M0MyNCA1LjQwNSAxOC42MjcgMCAxMiAwUzAgNS40MDUgMCAxMi4wNzNDMCAxOC4wOTcgNC4zODggMjMuMDk0IDEwLjEyNSAyNFYxNS41NjNINy4wNzhWMTIuMDczSDEwLjEyNVY5LjQxM0MxMC4xMjUgNi4zODcgMTEuOTE3IDQuNzU2IDE0LjY1OCA0Ljc1NkMxNS45NyA0Ljc1NiAxNy4zNDQgNSAxNy4zNDQgNVY3Ljk2OUgxNS44M0MxNC4zMTEgNy45NjkgMTMuODc1IDguOTA2IDEzLjg3NSAxMC4wNzNWMTIuMDczSDE3LjIwM0wxNi42NzEgMTUuNTYzSDEzLjg3NVYyNEMxOS42MTIgMjMuMDk0IDI0IDE4LjA5NyAyNCAxMi4wNzNaIiBmaWxsPSJ3aGl0ZSIvPgo8L3N2Zz4K') no-repeat center;
              background-size: contain;
            }

            .logo-quickbooks {
              background: url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0IiByeD0iNCIgZmlsbD0iIzAwNzdDNSIvPgo8cGF0aCBkPSJNNyA2SDE3QzE4LjEwNDYgNiAxOSA2Ljg5NTQzIDE5IDhWMTZDMTkgMTcuMTA0NiAxOC4xMDQ2IDE4IDE3IDE4SDdDNS44OTU0MyAxOCA1IDE3LjEwNDYgNSAxNlY4QzUgNi44OTU0MyA1Ljg5NTQzIDYgNyA2WiIgZmlsbD0id2hpdGUiLz4KPHBhdGggZD0iTTggMTBIMTBWMTRIOFYxMFoiIGZpbGw9IiMwMDc3QzUiLz4KPHBhdGggZD0iTTEyIDhIMTRWMTZIMTJWOFoiIGZpbGw9IiMwMDc3QzUiLz4KPHBhdGggZD0iTTE2IDEyVjE0SDE2VjEyWiIgZmlsbD0iIzAwNzdDNSIvPgo8Y2lyY2xlIGN4PSIxNiIgY3k9IjEwIiByPSIxIiBmaWxsPSIjMDA3N0M1Ii8+Cjwvc3ZnPgo=') no-repeat center;
              background-size: contain;
            }
            
            /* Grid Layout - Now 2x3 to accommodate SMS card */
            .auth-options {
              display: grid;
              grid-template-columns: 1fr 1fr;
              grid-template-rows: 1fr 1fr 1fr;
              gap: 20px;
              margin: 30px 0;
              align-items: stretch;
            }
            .auth-card {
              background: #f8f9fa;
              padding: 25px;
              border-radius: 12px;
              border: 2px solid #e9ecef;
              transition: all 0.3s ease;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              min-height: 280px;
            }
            .auth-card:hover {
              border-color: #007bff;
              transform: translateY(-2px);
            }
            .auth-card.google { border-left: 4px solid #4285f4; }
            .auth-card.facebook { border-left: 4px solid #1877f2; }
            .auth-card.quickbooks { border-left: 4px solid #0077C5; }
            .auth-card.sms { border-left: 4px solid #28a745; }
            .auth-card.instagram { border-left: 4px solid #E4405F; }
            .auth-card.connected { 
              border-left-color: #28a745;
              background: #f8fff8;
            }
            .auth-card h3 { 
              margin-top: 0; 
              color: #333;
              margin-bottom: 20px;
            }
            .feature-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 12px;
              margin: 15px 0;
              flex-grow: 1;
            }
            .feature-item { 
              display: flex; 
              align-items: center; 
              padding: 6px;
              font-size: 13px;
            }
            .feature-icon { margin-right: 8px; font-size: 14px; }
            
            @media (max-width: 768px) {
              .auth-options { 
                grid-template-columns: 1fr; 
                grid-template-rows: none;
                gap: 15px;
              }
              .container { 
                padding: 30px 20px; 
                max-width: 95%;
              }
              .auth-card {
                min-height: auto;
              }
              .user-bar {
                flex-direction: column;
                text-align: center;
                gap: 10px;
              }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="user-bar">
              <div>
                <strong>👋 Welcome back, ${templateVars.userName}!</strong> 
                <span style="font-size: 12px; color: #666;">(${
                  templateVars.authType
                })</span>
              </div>
              <div>
                <a href="/logout" style="background: #dc3545; color: white; padding: 8px 16px; border-radius: 4px; text-decoration: none; font-weight: 500;" onclick="return confirm('Are you sure you want to logout?')">
                  🚪 Logout
                </a>
              </div>
            </div>
            
            <div class="logo">
              <img src="https://www.robosouthla.com/wp-content/uploads/2025/05/cropped-logo.png" alt="AI Workflow Portal">
            </div>
            <h1>AI Workflow Portal</h1>
            <p style="font-size: 18px; color: #666; margin-bottom: 30px;">
              Connect your business tools to unlock powerful AI workflows
            </p>
            
            <div class="auth-options">
              <!-- Google Workspace Card -->
              <div class="auth-card google ${
                templateVars.isGoogleConnected ? "connected" : ""
              }">
                <h3>🔗 Google Workspace</h3>
                <div class="feature-grid">
                  <div class="feature-item">
                    <span class="feature-icon">📊</span>
                    <span>Google Sheets</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">📧</span>
                    <span>Gmail</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">📅</span>
                    <span>Calendar</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">👥</span>
                    <span>Contacts</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">💾</span>
                    <span>Drive</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">🤖</span>
                    <span>AI Workflows</span>
                  </div>
                </div>
                ${templateVars.googleButton}
              </div>

              <!-- QuickBooks Card -->
              <div class="auth-card quickbooks ${
                templateVars.isQBConnected ? "connected" : ""
              }">
                <h3>💼 QuickBooks</h3>
                <div class="feature-grid">
                  <div class="feature-item">
                    <span class="feature-icon">💰</span>
                    <span>Financial Data</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">📊</span>
                    <span>Reports</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">🧾</span>
                    <span>Invoices</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">👥</span>
                    <span>Customers</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">📈</span>
                    <span>Analytics</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">🤖</span>
                    <span>AI Workflows</span>
                  </div>
                </div>
                ${templateVars.qbButton}
              </div>

              <!-- Facebook Card -->
              <div class="auth-card facebook ${
                templateVars.isFacebookConnected ? "connected" : ""
              }">
                <h3>📘 Facebook</h3>
                <div class="feature-grid">
                  <div class="feature-item">
                    <span class="feature-icon">👤</span>
                    <span>Profile</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">📝</span>
                    <span>Posts</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">📊</span>
                    <span>Page Insights</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">💬</span>
                    <span>Messages</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">📱</span>
                    <span>Social Media</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">🤖</span>
                    <span>AI Workflows</span>
                  </div>
                </div>
                ${templateVars.facebookButton}
              </div>

              <!-- Instagram Card -->
              <div class="auth-card instagram">
                <h3>📷 Instagram</h3>
                <div class="feature-grid">
                  <div class="feature-item">
                    <span class="feature-icon">📸</span>
                    <span>Photos</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">🎥</span>
                    <span>Stories</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">📊</span>
                    <span>Analytics</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">💬</span>
                    <span>DMs</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">📈</span>
                    <span>Growth</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">🤖</span>
                    <span>AI Workflows</span>
                  </div>
                </div>
                <button class="btn-modern" style="background: #6c757d;">
                  <span>🚧 Coming Soon</span>
                </button>
              </div>

              <!-- SMS Notifications Card (NEW - Below Facebook) -->
              <div class="auth-card sms ${
                templateVars.isSmsOptedIn ? "connected" : ""
              }">
                <h3>📱 SMS Notifications</h3>
                <div class="feature-grid">
                  <div class="feature-item">
                    <span class="feature-icon">📲</span>
                    <span>Workflow Updates</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">🔔</span>
                    <span>Alerts</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">✅</span>
                    <span>Status Reports</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">⚡</span>
                    <span>Real-time</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">🛡️</span>
                    <span>Secure</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">🤖</span>
                    <span>AI Powered</span>
                  </div>
                </div>
                ${templateVars.smsButton}
              </div>
            </div>

            <!-- Dashboard Button -->
            <a href="/dashboard" class="btn-dashboard">
              🚀 Go to Dashboard
            </a>

            <!-- Admin Link (if authorized) -->
            <div style="margin-top: 20px;">
              <a href="/admin" style="color: #6c757d; text-decoration: none; font-size: 14px;">
                🔧 Admin Panel
              </a>
            </div>
          </div>

          <script>
            // =============================================================================
            // JAVASCRIPT FUNCTIONS
            // =============================================================================
            
            // SMS Opt-in form handler
            document.getElementById('smsOptInForm')?.addEventListener('submit', async function(e) {
              e.preventDefault();
              
              const consent = document.getElementById('smsConsent').checked;
              if (!consent) {
                alert('Please check the consent box to enable SMS notifications.');
                return;
              }

              try {
                const response = await fetch('/api/sms/opt-in', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    customerId: '${templateVars.customerId}',
                    optIn: true
                  })
                });

                if (response.ok) {
                  location.reload(); // Refresh to show updated status
                } else {
                  const error = await response.json();
                  alert('Error: ' + (error.message || 'Failed to update SMS preferences'));
                }
              } catch (error) {
                alert('Error: ' + error.message);
              }
            });

            // Toggle SMS opt-in status
            function toggleSmsOptIn(optIn) {
              fetch('/api/sms/opt-in', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  customerId: '${templateVars.customerId}',
                  optIn: optIn
                })
              })
              .then(response => response.json())
              .then(data => {
                if (data.success) {
                  location.reload();
                } else {
                  alert('Error: ' + (data.message || 'Failed to update SMS preferences'));
                }
              })
              .catch(error => {
                alert('Error: ' + error.message);
              });
            }

            // Disconnect functions (existing functionality)
            function disconnectGoogle() {
              if (confirm('Are you sure you want to disconnect Google Workspace?')) {
                window.location.href = '/auth/google/disconnect';
              }
            }

            function disconnectQB() {
              if (confirm('Are you sure you want to disconnect QuickBooks?')) {
                window.location.href = '/auth/quickbooks/disconnect';
              }
            }

            function disconnectFacebook() {
              if (confirm('Are you sure you want to disconnect Facebook?')) {
                window.location.href = '/auth/facebook/disconnect';
              }
            }
          </script>
        </body>
        </html>
    `);
  });

  return router;
};
