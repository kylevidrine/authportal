// routes/pages.js
const express = require("express");
const router = express.Router();

module.exports = (dependencies) => {
  const {
    getAllCustomers,
    getCustomerById,
    validateToken,
    validateQBToken,
    QB_ENVIRONMENT,
    requireAuth,
  } = dependencies;

  // =============================================================================
  // MAIN WEB PAGES
  // =============================================================================

  // Main portal page
  router.get("/", requireAuth, async (req, res) => {
    try {
      const authType = req.user
        ? "google"
        : req.session?.userInfo?.authType || "basic";
      const userName = req.user?.name || req.session?.userInfo?.name || "User";

      // Determine auth status properly
      const isFacebookUser = authType === "facebook";
      const isGoogleUser =
        authType === "google" && req.user && req.user.google_access_token;

      // Get customer data to check QuickBooks status
      let customer = null;
      let hasQBAuth = false;
      let hasTikTokAuth = false;

      if (req.isAuthenticated?.() && req.user) {
        // Google OAuth user
        try {
          customer = await getCustomerById(req.user.id);
          hasQBAuth = !!(customer?.qb_access_token && customer?.qb_company_id);
          hasTikTokAuth = !!customer?.tiktok_access_token;
        } catch (error) {
          console.error("Error fetching Google customer:", error);
        }
      } else if (req.session?.authenticated && req.session?.userInfo) {
        // Basic auth or Facebook user
        const userEmail = req.session.userInfo.email;

        if (authType === "facebook" && req.session.userInfo.customerId) {
          try {
            customer = await getCustomerById(req.session.userInfo.customerId);
            hasQBAuth = !!(
              customer?.qb_access_token && customer?.qb_company_id
            );
            hasTikTokAuth = !!customer?.tiktok_access_token;
          } catch (error) {
            console.error("Error fetching Facebook customer:", error);
          }
        } else {
          // Check if basic auth user has a customer record
          try {
            const existingCustomers = await getAllCustomers();
            customer = existingCustomers.find((c) => c.email === userEmail);
            hasQBAuth = !!(
              customer?.qb_access_token && customer?.qb_company_id
            );
            hasTikTokAuth = !!customer?.tiktok_access_token;
          } catch (error) {
            console.error("Error fetching basic auth customer:", error);
          }
        }
      }

      console.log("Main page auth status:", {
        authType,
        isGoogleUser,
        isFacebookUser,
        hasQBAuth,
        customerId: customer?.id,
      });

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
              gap: 12px;
              padding: 16px 24px;
              border: none;
              border-radius: 12px;
              font-size: 16px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.3s ease;
              text-decoration: none;
              min-width: 200px;
              justify-content: flex-start;
              width: 100%;
              box-sizing: border-box;
            }

            .btn-connect {
              background: white;
              color: #757575;
              border: 2px solid #dadce0;
            }
            .btn-connect:hover {
              box-shadow: 0 8px 25px rgba(0,0,0,0.15);
              transform: translateY(-2px);
            }

            .btn-disconnect {
              background: #dc3545;
              color: white;
              border: 2px solid #dc3545;
            }
            .btn-disconnect:hover {
              background: #c82333;
              transform: translateY(-2px);
              box-shadow: 0 8px 25px rgba(220,53,69,0.3);
            }

            .btn-facebook-connect {
              background: #1877f2;
              color: white;
              border: 2px solid #1877f2;
            }
            .btn-facebook-connect:hover {
              background: #166fe5;
              transform: translateY(-2px);
              box-shadow: 0 8px 25px rgba(24,119,242,0.3);
            }

            .btn-qb-connect {
              background: #0077c5;
              color: white;
              border: 2px solid #0077c5;
            }
            .btn-qb-connect:hover {
              background: #005a94;
              transform: translateY(-2px);
              box-shadow: 0 8px 25px rgba(0,119,197,0.3);
            }

            .btn-dashboard {
              background: #28a745;
              color: white;
              padding: 18px 36px;
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
            
            /* Grid Layout */
            .auth-options {
              display: grid;
              grid-template-columns: 1fr 1fr;
              grid-template-rows: 1fr 1fr;
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
                <strong>👋 Welcome back, ${userName}!</strong> 
                <span style="font-size: 12px; color: #666;">(${
                  isGoogleUser
                    ? "Google OAuth"
                    : isFacebookUser
                    ? "Facebook OAuth"
                    : "Basic Auth"
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
              <div class="auth-card google ${isGoogleUser ? "connected" : ""}">
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
                ${
                  isGoogleUser
                    ? `
                  <p style="color: #28a745; font-weight: bold; margin-bottom: 15px;">✅ Connected</p>
                  <button onclick="disconnectGoogle()" class="btn-modern btn-disconnect">
                    <span>🔌 Disconnect Google</span>
                  </button>
                `
                    : `
                  <a href="/auth/google" class="btn-modern btn-connect">
                    <div class="logo-icon logo-google"></div>
                    <span>Connect with Google</span>
                  </a>
                `
                }
              </div>

              <!-- QuickBooks Card -->
              <div class="auth-card quickbooks ${hasQBAuth ? "connected" : ""}">
                <h3>📊 QuickBooks Online</h3>
                <div class="feature-grid">
                  <div class="feature-item">
                    <span class="feature-icon">🧾</span>
                    <span>Invoices</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">👥</span>
                    <span>Customers</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">📦</span>
                    <span>Items</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">💰</span>
                    <span>Reports</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">📈</span>
                    <span>Sales Data</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">🤖</span>
                    <span>AI Automation</span>
                  </div>
                </div>
                ${
                  hasQBAuth
                    ? `
                  <p style="color: #28a745; font-weight: bold; margin-bottom: 15px;">✅ Connected</p>
                  <button onclick="disconnectQuickBooks()" class="btn-modern btn-disconnect">
                    <span>🔌 Disconnect QuickBooks</span>
                  </button>
                `
                    : `
                  <a href="/auth/quickbooks/standalone" class="btn-modern btn-qb-connect">
                    <div class="logo-icon logo-quickbooks"></div>
                    <span>Connect QuickBooks</span>
                  </a>
                `
                }
              </div>

              <!-- Facebook Card -->
              <div class="auth-card facebook ${
                isFacebookUser ? "connected" : ""
              }">
                <h3>📱 Facebook Social</h3>
                <div class="feature-grid">
                  <div class="feature-item">
                    <span class="feature-icon">👤</span>
                    <span>Profile Access</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">📧</span>
                    <span>Email</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">📸</span>
                    <span>Profile Photo</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">🔗</span>
                    <span>Social Login</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">🌐</span>
                    <span>Social Identity</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">📱</span>
                    <span>Mobile Auth</span>
                  </div>
                </div>
                ${
                  isFacebookUser
                    ? `
                  <p style="color: #28a745; font-weight: bold; margin-bottom: 15px;">✅ Connected</p>
                  <button onclick="disconnectFacebook()" class="btn-modern btn-disconnect">
                    <span>🔌 Disconnect Facebook</span>
                  </button>
                `
                    : `
                  <span class="btn-modern" style="background: #6c757d; color: white; opacity: 0.5; cursor: not-allowed;">
                    <div class="logo-icon logo-facebook"></div>
                    <span>Coming Soon</span>
                  </a>
                `
                }
              </div>

              <!-- Instagram Placeholder -->
              <div class="auth-card instagram" style="opacity: 0.7; position: relative;">
                <div style="position: absolute; top: 10px; right: 10px; background: #6c757d; color: white; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: 600;">Coming Soon</div>
                <h3>📷 Instagram Business</h3>
                <div class="feature-grid">
                  <div class="feature-item">
                    <span class="feature-icon">📸</span>
                    <span>Media Access</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">📊</span>
                    <span>Analytics</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">💬</span>
                    <span>Comments</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">📈</span>
                    <span>Insights</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">🤖</span>
                    <span>Auto Posting</span>
                  </div>
                  <div class="feature-item">
                    <span class="feature-icon">🎯</span>
                    <span>Engagement</span>
                  </div>
                </div>
                <div class="btn-modern" style="background: #6c757d; color: white; opacity: 0.5; cursor: not-allowed;">
                  <span>Coming Soon</span>
                </div>
              </div>
            </div>
            
<!-- TikTok Integration Card -->
              <div class="integration-card tiktok-card ${hasTikTokAuth ? "connected" : ""}" style="border-left: 4px solid #000000; background: ${
                hasTikTokAuth
                  ? "linear-gradient(135deg, #f0fdf4 0%, #e6fffa 100%)"
                  : "linear-gradient(135deg, #fafbfc 0%, #f4f7fa 100%)"
              }; border: 1px solid #c1d6e8;">
                <h3 style="color: #1c2e4a; display: flex; align-items: center; gap: 8px;">
                  <span style="color: #000000; font-weight: 600;">🎬</span>
                  TikTok Integration 
                  <span class="status-badge" style="background: ${
                    hasTikTokAuth
                      ? "#e8f5e9; color: #137333; border: 1px solid #34a853"
                      : "#fef2f2; color: #dc2626; border: 1px solid #ef4444"
                  };">
                    ${hasTikTokAuth ? "Connected" : "Not Connected"}
                  </span>
                </h3>
                
                ${
                  hasTikTokAuth
                    ? `
                  <p style="color: #047857; font-weight: 500;">✅ Connected to TikTok</p>
                  <p style="color: #374151;"><strong style="color: #1c2e4a;">User ID:</strong> <code style="background: #f3f4f6; padding: 4px 8px; border-radius: 4px; color: #6b7280; border: 1px solid #d1d5db;">${
                    customer?.tiktok_user_id || "N/A"
                  }</code></p>
                  <p style="color: #374151;"><strong style="color: #1c2e4a;">Services:</strong> Video Upload, Content Posting</p>
                  <button onclick="disconnectTikTok()" class="btn" style="background: #dc2626; color: white; border: 1px solid #dc2626; box-shadow: 0 1px 2px rgba(220,38,38,0.15);">🔌 Disconnect TikTok</button>
                `
                    : `
                  <p style="color: #374151;">Connect your TikTok account to enable automated video posting</p>
                  <p style="color: #374151;"><strong style="color: #1c2e4a;">Features:</strong> Video upload, automated posting, content workflows</p>
                  <a href="/auth/tiktok" class="btn" style="background: #000000; color: white; border: 1px solid #000000; box-shadow: 0 1px 2px rgba(0,0,0,0.15);">🎬 Connect TikTok</a>
                `
                }
              </div>            



            
            <div style="text-align: center; margin: 30px 0;">
              <a href="/dashboard" class="btn-dashboard">
                Go to Dashboard →
              </a>
            </div>
          </div>
          
          <script>
                        async function disconnectGoogle() {
              if (!confirm('Are you sure you want to disconnect from Google? This will remove access to your Google services.')) {
                return;
              }
              
              try {
                const response = await fetch('/auth/google/disconnect', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  }
                });
      
                if (response.ok) {
                  alert('Google disconnected successfully!');
                  location.reload();
                } else {
                  const error = await response.json();
                  alert('Failed to disconnect Google: ' + error.error);
                }
              } catch (error) {
                alert('Error disconnecting Google: ' + error.message);
              }
            }

            async function disconnectTikTok() {
              if (!confirm('Are you sure you want to disconnect TikTok? This will remove access to your TikTok account.')) {
                return;
              }
              
              try {
                const response = await fetch('/auth/tiktok/disconnect', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  }
                });
                
                if (response.ok) {
                  alert('TikTok disconnected successfully!');
                  location.reload();
                } else {
                  const error = await response.json();
                  alert('Failed to disconnect TikTok: ' + error.error);
                }
              } catch (error) {
                alert('Error disconnecting TikTok: ' + error.message);
              }
            }

            async function disconnectQuickBooks() {
              if (!confirm('Are you sure you want to disconnect QuickBooks? This will remove access to your accounting data.')) {
                return;
              }
              
              try {
                const response = await fetch('/auth/quickbooks/disconnect', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  }
                });
                
                if (response.ok) {
                  alert('QuickBooks disconnected successfully!');
                  location.reload();
                } else {
                  const error = await response.json();
                  alert('Failed to disconnect QuickBooks: ' + error.error);
                }
              } catch (error) {
                alert('Error disconnecting QuickBooks: ' + error.message);
              }
            }

            async function disconnectFacebook() {
              if (!confirm('Are you sure you want to disconnect Facebook? You will be logged out.')) {
                return;
              }
              
              try {
                const response = await fetch('/auth/facebook/disconnect', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  }
                });
                
                if (response.ok) {
                  alert('Facebook disconnected successfully!');
                  window.location.href = '/login';
                } else {
                  const error = await response.json();
                  alert('Failed to disconnect Facebook: ' + error.error);
                }
              } catch (error) {
                alert('Error disconnecting Facebook: ' + error.message);
              }
            }
          </script>
        </body>
        </html>
      `);
    } catch (error) {
      console.error("❌ Main page error:", error);
      res.status(500).send("Error loading main page: " + error.message);
    }
  });

  // Dashboard page
  router.get("/dashboard", requireAuth, async (req, res) => {
    try {
      console.log("📊 Dashboard access check:", {
        sessionAuth: req.session?.authenticated,
        passportAuth: req.isAuthenticated?.(),
        hasUser: !!req.user,
        userInfo: req.session?.userInfo,
      });

      // Determine auth type and get user info
      let userName,
        userEmail,
        customerId,
        customer = null;
      let authType = "unknown";
      let isGoogleUser = false;
      let isFacebookUser = false;

      if (req.isAuthenticated?.() && req.user) {
        // Authenticated via Passport - but check if they ACTUALLY have active tokens
        userName = req.user.name;
        userEmail = req.user.email;
        customerId = req.user.id;

        try {
          customer = await getCustomerById(req.user.id);
          console.log("🔍 Customer from DB:", {
            id: customer?.id,
            email: customer?.email,
            hasGoogleTokens: !!customer?.google_access_token,
            hasQBTokens: !!customer?.qb_access_token,
          });

          // The KEY FIX: Check database tokens, not just session
          const hasActiveGoogleTokens = !!(
            customer?.google_access_token && customer?.google_refresh_token
          );

          if (hasActiveGoogleTokens) {
            authType = "google";
            isGoogleUser = true;
            console.log("✅ Active Google user with valid tokens");
          } else if (customer?.id?.startsWith("fb_")) {
            authType = "facebook";
            isFacebookUser = true;
            console.log("✅ Facebook user");
          } else {
            // User authenticated via Google but tokens were removed - treat as basic user
            authType = "disconnected_google";
            isGoogleUser = false;
            console.log(
              "⚠️ User authenticated but no Google tokens - treating as disconnected"
            );
          }
        } catch (error) {
          console.error("Error fetching customer:", error);
          authType = "passport_user";
        }
      } else if (req.session?.authenticated && req.session?.userInfo) {
        // Basic auth or session-based auth
        authType = req.session.userInfo.authType || "basic";
        userName = req.session.userInfo.name;
        userEmail = req.session.userInfo.email;
        customerId = req.session.userInfo.customerId || "demo-user";

        if (authType === "facebook" && customerId) {
          isFacebookUser = true;
          try {
            customer = await getCustomerById(customerId);
          } catch (error) {
            console.error("Error fetching Facebook customer:", error);
          }
        }
      } else {
        console.log("❌ No valid authentication found in dashboard");
        return res.redirect("/login");
      }

      const hasQBAuth = !!(
        customer?.qb_access_token && customer?.qb_company_id
      );
      const hasTikTokAuth = !!customer?.tiktok_access_token;

      console.log("🔍 FINAL Dashboard auth status:", {
        userName,
        userEmail,
        customerId,
        authType,
        isGoogleUser,
        isFacebookUser,
        hasQBAuth,
        customerHasGoogleTokens: !!customer?.google_access_token,
        customerHasQBTokens: !!customer?.qb_access_token,
      });

      isFacebookUser = authType === "facebook";
      isGoogleUser = authType === "google";

      // Handle status messages
      const urlParams = new URL(req.url, `http://${req.get("host")}`);
      const qbSuccess = urlParams.searchParams.get("qb_success");
      const qbError = urlParams.searchParams.get("qb_error");
      const tiktokSuccess = urlParams.searchParams.get("tiktok_success");
      const tiktokError = urlParams.searchParams.get("tiktok_error");

      let qbStatusMessage = "";
      if (qbSuccess) {
        qbStatusMessage =
          '<div style="background: #d4edda; color: #155724; padding: 10px; margin: 10px 0; border-radius: 5px;">✅ QuickBooks connected successfully!</div>';
      } else if (qbError) {
        const errorMessages = {
          auth_failed: "QuickBooks authorization failed. Please try again.",
          session_lost:
            "Session expired. Please try connecting QuickBooks again.",
          token_save_failed:
            "Failed to save QuickBooks tokens. Please try again.",
        };
        qbStatusMessage = `<div style="background: #f8d7da; color: #721c24; padding: 10px; margin: 10px 0; border-radius: 5px;">❌ ${
          errorMessages[qbError] || "Unknown error occurred"
        }</div>`;
      }

      let tiktokStatusMessage = "";
      if (tiktokSuccess) {
        tiktokStatusMessage =
          '<div style="background: #fff0f3; color: #d91a72; padding: 10px; margin: 10px 0; border-radius: 5px; border: 1px solid #ff0050;">✅ TikTok connected successfully!</div>';
      } else if (tiktokError) {
        tiktokStatusMessage =
          '<div style="background: #f8d7da; color: #721c24; padding: 10px; margin: 10px 0; border-radius: 5px;">❌ TikTok connection failed. Please try again.</div>';
      }
      // Generate appropriate dashboard content based on auth type
      const integrationSection = isGoogleUser
        ? `
        <div class="integration-card google-card connected" style="border-left: 4px solid #4285f4; background: linear-gradient(135deg, #f8fbff 0%, #e8f0fe 100%); border: 1px solid #dadce0;">
          <h3 style="color: #202124; display: flex; align-items: center; gap: 8px;">
            <span style="background: linear-gradient(45deg, #4285f4, #34a853, #fbbc05, #ea4335); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; font-weight: 600;">🔗</span>
            Google Workspace Integration 
            <span class="status-badge" style="background: #e8f5e9; color: #137333; border: 1px solid #34a853;">Connected</span>
          </h3>
          <p style="color: #137333; font-weight: 500;">✅ Connected to Google Workspace</p>
          <p style="color: #5f6368;"><strong style="color: #202124;">Email:</strong> ${userEmail}</p>
          <p style="color: #5f6368;"><strong style="color: #202124;">Services Available:</strong> Gmail, Calendar, Drive (file access only), Contacts</p>
          <div style="margin-top: 15px;">
            <a href="/setup/spreadsheet" class="btn" style="background: #1a73e8; color: white; border: 1px solid #1a73e8; box-shadow: 0 1px 2px rgba(26,115,232,0.15); margin-right: 10px;">
              <span style="margin-right: 8px;">📊</span>
              Manage Spreadsheets
            </a>
            <button onclick="disconnectGoogle()" class="btn" style="background: #ea4335; color: white; border: 1px solid #ea4335; box-shadow: 0 1px 2px rgba(234,67,53,0.15);">
              <span style="margin-right: 8px;">🔌</span>
              Disconnect Google
            </button>
          </div>
        </div>

        <div class="integration-card qb-card ${
          hasQBAuth ? "connected" : ""
        }" style="border-left: 4px solid #0077c5; background: ${
            hasQBAuth
              ? "linear-gradient(135deg, #f0fdf4 0%, #e6fffa 100%)"
              : "linear-gradient(135deg, #fafbfc 0%, #f4f7fa 100%)"
          }; border: 1px solid #c1d6e8;">
          <h3 style="color: #1c2e4a; display: flex; align-items: center; gap: 8px;">
            <span style="color: #0077c5; font-weight: 600;">📊</span>
            QuickBooks Integration 
            <span class="status-badge" style="background: ${
              hasQBAuth
                ? "#e6fffa; color: #047857; border: 1px solid #059669"
                : "#fef2f2; color: #dc2626; border: 1px solid #ef4444"
            };">
              ${hasQBAuth ? "Connected" : "Not Connected"}
            </span>
          </h3>
          
          ${
            hasQBAuth
              ? `
            <p style="color: #047857; font-weight: 500;">✅ Connected to QuickBooks Company</p>
            <p style="color: #374151;"><strong style="color: #1c2e4a;">Company ID:</strong> <code style="background: #f3f4f6; padding: 4px 8px; border-radius: 4px; color: #6b7280; border: 1px solid #d1d5db;">${customer.qb_company_id}</code></p>
            <p style="color: #374151;"><strong style="color: #1c2e4a;">Environment:</strong> <code style="background: #f3f4f6; padding: 4px 8px; border-radius: 4px; color: #6b7280; border: 1px solid #d1d5db;">${QB_ENVIRONMENT}</code></p>
            <button onclick="disconnectQuickBooks()" class="btn" style="background: #dc2626; color: white; border: 1px solid #dc2626; box-shadow: 0 1px 2px rgba(220,38,38,0.15);">🔌 Disconnect QuickBooks</button>
          `
              : `
            <p style="color: #374151;">Connect your QuickBooks account to enable AI workflows with your accounting data</p>
            <p style="color: #374151;"><strong style="color: #1c2e4a;">Permissions:</strong> Read/Write access to QuickBooks accounting data</p>
            <a href="/auth/quickbooks" class="btn" style="background: #0077c5; color: white; border: 1px solid #0077c5; box-shadow: 0 1px 2px rgba(0,119,197,0.15);">📊 Connect QuickBooks</a>
          `
          }
        </div>

        <div class="integration-card facebook-card" style="border-left: 4px solid #1877f2; background: linear-gradient(135deg, #f7f9fc 0%, #eef4ff 100%); border: 1px solid #c2d6f0;">
          <h3 style="color: #1c2b33; display: flex; align-items: center; gap: 8px;">
            <span style="color: #1877f2; font-weight: 600;">📱</span>
            Facebook Integration 
            <span class="status-badge" style="background: #fef2f2; color: #dc2626; border: 1px solid #ef4444;">Not Connected</span>
          </h3>
          <p style="color: #374151;">Connect your Facebook account for additional social authentication options</p>
          <div style="margin-top: 15px;">
            <a href="/auth/facebook" class="btn" style="background: #1877f2; color: white; border: 1px solid #1877f2; box-shadow: 0 1px 2px rgba(24,119,242,0.15);">
              <span style="margin-right: 8px;">📘</span>
              Connect Facebook
            </a>
          </div>
        </div>

        <div class="integration-card tiktok-card ${hasTikTokAuth ? "connected" : ""}" style="border-left: 4px solid #ff0050; background: ${
          hasTikTokAuth 
            ? "linear-gradient(135deg, #fff0f3 0%, #ffe6f0 100%)" 
            : "linear-gradient(135deg, #fafbfc 0%, #f4f7fa 100%)"
        }; border: 1px solid #f0c5d1;">
          <h3 style="color: #1c2e4a; display: flex; align-items: center; gap: 8px;">
            <span style="color: #ff0050; font-weight: 600;">🎬</span>
            TikTok Integration 
            <span class="status-badge" style="background: ${
              hasTikTokAuth 
                ? "#fff0f3; color: #d91a72; border: 1px solid #ff0050" 
                : "#fef2f2; color: #dc2626; border: 1px solid #ef4444"
            };">
              ${hasTikTokAuth ? "Connected" : "Not Connected"}
            </span>
          </h3>
          

      `
        : isFacebookUser
        ? `
        <div class="integration-card google-card">
          <h3>🔗 Google Workspace Integration 
            <span class="status-badge status-disconnected">Not Connected</span>
          </h3>
          <p>Connect Google Workspace for advanced AI workflow capabilities</p>
          <div style="margin-top: 15px;">
            <a href="/auth/google" class="btn btn-primary">
              <span style="margin-right: 8px;">🔗</span>
              Connect Google Workspace
            </a>
          </div>
        </div>

        <div class="integration-card qb-card ${hasQBAuth ? "connected" : ""}">
          <h3>📊 QuickBooks Integration 
            <span class="status-badge ${
              hasQBAuth ? "status-connected" : "status-disconnected"
            }">
              ${hasQBAuth ? "Connected" : "Not Connected"}
            </span>
          </h3>
          
          ${
            hasQBAuth
              ? `
            <p>✅ Connected to QuickBooks Company</p>
            <p><strong>Company ID:</strong> <code style="background: #f0f0f0; padding: 4px 8px; border-radius: 4px;">${customer.qb_company_id}</code></p>
            <p><strong>Environment:</strong> <code style="background: #f0f0f0; padding: 4px 8px; border-radius: 4px;">${QB_ENVIRONMENT}</code></p>
            <button onclick="disconnectQuickBooks()" class="btn btn-danger">🔌 Disconnect QuickBooks</button>
          `
              : `
            <p>Connect your QuickBooks account to enable AI workflows with your accounting data</p>
            <p><strong>Permissions:</strong> Read/Write access to QuickBooks accounting data</p>
            <a href="/auth/quickbooks/standalone" class="btn btn-qb">📊 Connect QuickBooks</a>
          `
          }
        </div>

        <div class="integration-card facebook-card connected">
          <h3>📱 Facebook Integration 
            <span class="status-badge status-connected">Connected</span>
          </h3>
          <p>✅ Connected via Facebook Social Login</p>
          <p><strong>Profile:</strong> ${userName}</p>
          <p><strong>Email:</strong> ${userEmail}</p>
          <div style="margin-top: 15px;">
            <button onclick="disconnectFacebook()" class="btn btn-danger">
              <span style="margin-right: 8px;">🔌</span>
              Disconnect Facebook
            </button>
          </div>
        </div>

        <div class="integration-card tiktok-card ${hasTikTokAuth ? "connected" : ""}">
          <h3>🎬 TikTok Integration 
            <span class="status-badge ${
              hasTikTokAuth ? "status-connected" : "status-disconnected"
            }">
              ${hasTikTokAuth ? "Connected" : "Not Connected"}
            </span>
          </h3>
          



      `
        : `
        <div class="integration-card">
          <h3>🎭 Demo Mode</h3>
          <p><strong>Account Type:</strong> Basic Authentication</p>
          <p>You're using a demo account. For full integration capabilities, please sign in with Google or Facebook.</p>
          <div style="margin-top: 15px; display: flex; gap: 10px; flex-wrap: wrap;">
            <a href="/auth/google" class="btn btn-primary" style="flex: 1; min-width: 140px;">
              <span style="margin-right: 8px;">🔗</span>
              Upgrade to Google
            </a>
            <a href="/auth/facebook" class="btn" style="background: #1877f2; color: white; flex: 1; min-width: 140px;">
              <span style="margin-right: 8px;">📘</span>
              Connect Facebook
            </a>
          </div>
        </div>
        
        <div class="integration-card qb-card">
          <h3>📊 QuickBooks Integration 
            <span class="status-badge status-disconnected">Not Connected</span>
          </h3>
          <p>Connect your QuickBooks account to enable AI workflows with your accounting data</p>
          <p><strong>Note:</strong> Available for all authentication methods</p>
          <div style="margin-top: 15px;">
            <a href="/auth/quickbooks/standalone" class="btn btn-qb">
              <span style="margin-right: 8px;">📊</span>
              Connect QuickBooks
            </a>
          </div>
        </div>

        <div class="integration-card tiktok-card">
          <h3>🎬 TikTok Integration 
            <span class="status-badge status-disconnected">Not Connected</span>
          </h3>
          <p>Connect your TikTok account to enable automated video uploads and content management</p>
          <p><strong>Note:</strong> Requires Google or Facebook login first</p>
          <div style="margin-top: 15px;">
            <a href="/auth/google" class="btn btn-primary">
              <span style="margin-right: 8px;">🔗</span>
              Login with Google First
            </a>
          </div>
        </div>
      `;

      res.send(`
        <html>
        <head>
          <title>Dashboard</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
            .container { max-width: 1000px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
            .integration-card { 
              background: #f8f9fa; 
              border-left: 4px solid #007bff; 
              padding: 20px; 
              margin: 20px 0; 
              border-radius: 8px; 
            }
            .qb-card { border-left-color: #0077C5; }
            .google-card { border-left-color: #4285f4; }
            .facebook-card { border-left-color: #1877f2; }
            .tiktok-card { border-left-color: #ff0050; }
            .connected { border-left-color: #28a745; background: #e8f5e8; }
            .btn { 
              padding: 12px 24px; 
              margin: 5px; 
              border: none; 
              border-radius: 6px; 
              cursor: pointer; 
              text-decoration: none; 
              display: inline-block; 
              font-weight: 500;
            }
            .btn-primary { background: #007bff; color: white; }
            .btn-success { background: #28a745; color: white; }
            .btn-danger { background: #dc3545; color: white; }
            .btn-secondary { background: #6c757d; color: white; }
            .btn-qb { background: #0077C5; color: white; }
            .btn-facebook { background: #1877f2; color: white; }
            .btn:hover { opacity: 0.9; }
            .customer-id { 
              background: #f0f0f0; 
              padding: 8px 12px; 
              border-radius: 4px; 
              font-family: monospace; 
              font-size: 14px;
            }
            .status-badge {
              padding: 4px 12px;
              border-radius: 20px;
              font-size: 12px;
              font-weight: bold;
              text-transform: uppercase;
            }
            .status-connected { background: #d4edda; color: #155724; }
            .status-disconnected { background: #f8d7da; color: #721c24; }
            h3 { margin-top: 0; }
            .auth-info {
              background: #e3f2fd;
              padding: 15px;
              border-radius: 8px;
              margin: 20px 0;
              border-left: 4px solid #2196f3;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Welcome, ${userName}! 👋</h1>
            
            <div class="auth-info">
              <p><strong>Email:</strong> ${userEmail}</p>
              <p><strong>Customer ID:</strong> <span class="customer-id">${customerId}</span>
                <button onclick="copyToClipboard('${customerId}')" class="btn btn-primary" style="margin-left: 10px;">Copy for N8N</button>
              </p>
              <p><strong>Authentication:</strong> ${
                isGoogleUser
                  ? "🔗 Google OAuth"
                  : isFacebookUser
                  ? "📱 Facebook OAuth"
                  : "🔑 Basic Auth"
              }</p>
            </div>
            
            ${qbStatusMessage}
            ${tiktokStatusMessage}
            
            ${integrationSection}
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
              <div>
                <a href="/" class="btn btn-secondary">← Portal Home</a>
                <a href="/admin" class="btn btn-secondary">Admin Panel</a>
              </div>
              <div>
                <a href="/logout" class="btn" style="background: #dc3545; color: white; font-size: 16px; padding: 14px 28px; font-weight: 600;" onclick="return confirm('Are you sure you want to logout?')">
                  🚪 Sign Out
                </a>
              </div>
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
            
            async function disconnectQuickBooks() {
              if (!confirm('Are you sure you want to disconnect QuickBooks? This will remove access to your accounting data.')) {
                return;
              }
              
              try {
                const response = await fetch('/auth/quickbooks/disconnect', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  }
                });
                
                if (response.ok) {
                  alert('QuickBooks disconnected successfully!');
                  location.reload();
                } else {
                  const error = await response.json();
                  alert('Failed to disconnect QuickBooks: ' + error.error);
                }
              } catch (error) {
                alert('Error disconnecting QuickBooks: ' + error.message);
              }
            }

            async function disconnectFacebook() {
              if (!confirm('Are you sure you want to disconnect Facebook? You will be logged out.')) {
                return;
              }
              
              try {
                const response = await fetch('/auth/facebook/disconnect', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  }
                });
                
                if (response.ok) {
                  alert('Facebook disconnected successfully!');
                  window.location.href = '/login';
                } else {
                  const error = await response.json();
                  alert('Failed to disconnect Facebook: ' + error.error);
                }
              } catch (error) {
                alert('Error disconnecting Facebook: ' + error.message);
              }
            }

            async function disconnectGoogle() {
              if (!confirm('Are you sure you want to disconnect from Google? This will remove access to your Google services.')) {
                return;
              }
              
              try {
                const response = await fetch('/auth/google/disconnect', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json'
                  }
                });
      
                if (response.ok) {
                  alert('Google disconnected successfully!');
                  location.reload();
                } else {
                  const error = await response.json();
                  alert('Failed to disconnect Google: ' + error.error);
                }
              } catch (error) {
                alert('Error disconnecting Google: ' + error.message);
              }
            }
          </script>
        </body>
        </html>
      `);
    } catch (error) {
      console.error("❌ Dashboard error:", error);
      res.status(500).send("Error loading dashboard: " + error.message);
    }
  });

  return router;
};
