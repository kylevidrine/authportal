// ========================================
// FILE: routes/main.js
// ========================================

const express = require('express');
const router = express.Router();
const { getCustomerById, getAllCustomers } = require('../utils/database');
const { requireAuth } = require('../utils/middleware');

// Add QB_ENVIRONMENT constant
const QB_ENVIRONMENT = process.env.QB_ENVIRONMENT || 'production';

// Main route
router.get('/', requireAuth, async (req, res) => {
  try {
    const authType = req.user ? 'google' : req.session?.userInfo?.authType || 'basic';
    const userName = req.user?.name || req.session?.userInfo?.name || 'User';

    // Determine auth status properly
    const isFacebookUser = authType === 'facebook';
    const isGoogleUser = authType === 'google' && req.user && req.user.google_access_token;

    // Get customer data to check QuickBooks status
    let customer = null;
    let hasQBAuth = false;

    if (req.isAuthenticated?.() && req.user) {
      // Google OAuth user
      try {
        customer = await getCustomerById(req.user.id);
        hasQBAuth = !!(customer?.qb_access_token && customer?.qb_company_id);
      } catch (error) {
        console.error('Error fetching Google customer:', error);
      }
    } else if (req.session?.authenticated && req.session?.userInfo) {
      // Basic auth or Facebook user
      const userEmail = req.session.userInfo.email;
      
      if (authType === 'facebook' && req.session.userInfo.customerId) {
        try {
          customer = await getCustomerById(req.session.userInfo.customerId);
          hasQBAuth = !!(customer?.qb_access_token && customer?.qb_company_id);
        } catch (error) {
          console.error('Error fetching Facebook customer:', error);
        }
      } else {
        // Check if basic auth user has a customer record
        try {
          const existingCustomers = await getAllCustomers();
          customer = existingCustomers.find(c => c.email === userEmail);
          hasQBAuth = !!(customer?.qb_access_token && customer?.qb_company_id);
        } catch (error) {
          console.error('Error fetching basic auth customer:', error);
        }
      }
    }

    console.log('Main page auth status:', {
      authType,
      isGoogleUser,
      isFacebookUser,
      hasQBAuth,
      customerId: customer?.id
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
                isGoogleUser ? 'Google OAuth' : 
                isFacebookUser ? 'Facebook OAuth' : 
                'Basic Auth'
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
            <div class="auth-card google ${isGoogleUser ? 'connected' : ''}">
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
              ${isGoogleUser ? `
                <p style="color: #28a745; font-weight: bold; margin-bottom: 15px;">✅ Connected</p>
                <button onclick="disconnectGoogle()" class="btn-modern btn-disconnect">
                  <span>🔌 Disconnect Google</span>
                </button>
              ` : `
                <a href="/auth/google" class="btn-modern btn-connect">
                  <div class="logo-icon logo-google"></div>
                  <span>Connect with Google</span>
                </a>
              `}
            </div>

            <!-- QuickBooks Card -->
            <div class="auth-card quickbooks ${hasQBAuth ? 'connected' : ''}">
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
              ${hasQBAuth ? `
                <p style="color: #28a745; font-weight: bold; margin-bottom: 15px;">✅ Connected</p>
                <button onclick="disconnectQuickBooks()" class="btn-modern btn-disconnect">
                  <span>🔌 Disconnect QuickBooks</span>
                </button>
              ` : `
                <a href="/auth/quickbooks/standalone" class="btn-modern btn-qb-connect">
                  <div class="logo-icon logo-quickbooks"></div>
                  <span>Connect QuickBooks</span>
                </a>
              `}
            </div>

            <!-- Facebook Card -->
            <div class="auth-card facebook ${isFacebookUser ? 'connected' : ''}">
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
              ${isFacebookUser ? `
                <p style="color: #28a745; font-weight: bold; margin-bottom: 15px;">✅ Connected</p>
                <button onclick="disconnectFacebook()" class="btn-modern btn-disconnect">
                  <span>🔌 Disconnect Facebook</span>
                </button>
              ` : `
                <a href="/auth/facebook" class="btn-modern btn-facebook-connect">
                  <div class="logo-icon logo-facebook"></div>
                  <span>Connect with Facebook</span>
                </a>
              `}
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
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="/dashboard" class="btn-dashboard">
              Go to Dashboard →
            </a>
          </div>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
            <a href="/dashboard" style="color: #666; font-size: 12px; margin: 0 10px;">Dashboard</a> | 
            <a href="/debug-auth" style="color: #666; font-size: 12px; margin: 0 10px;">Auth Debug</a> | 
            <a href="/admin" style="color: #666; font-size: 12px; margin: 0 10px;">Admin Panel</a> | 
            <a href="/health" style="color: #666; font-size: 12px; margin: 0 10px;">Health Check</a>
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
    console.error('❌ Main page error:', error);
    res.status(500).send('Error loading main page: ' + error.message);
  }
});

// Login route
router.get('/login', (req, res) => {
  const error = req.query.error ? '<p style="color: red;">Invalid credentials</p>' : '';
  const googleError = req.query.google_error ? '<p style="color: red;">Google authentication failed</p>' : '';
  const fbError = req.query.fb_error ? '<p style="color: red;">Facebook authentication failed</p>' : '';






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
          
          <div class="help-text">
            <strong>Demo Accounts:</strong><br>
            • reviewer@robosouthla.com<br>
            • demo@robosouthla.com<br>
            • admin@robosouthla.com<br>
            <em>Contact admin for passwords</em>
          </div>
        </div>
        
        <div class="back-link">
          <a href="/">← Back to Home</a>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Login POST handler
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  console.log('🔑 Basic auth login attempt for:', username);

  const validUsers = {
    'reviewer@robosouthla.com': {
      password: 'GoogleReview2024!',
      role: 'reviewer',
      name: 'Google Play Reviewer'
    },
    'demo@robosouthla.com': {
      password: 'DemoUser2024!',
      role: 'demo',
      name: 'Demo User'
    },
    'admin@robosouthla.com': {
      password: 'AdminAccess2024!',
      role: 'admin',
      name: 'System Administrator'
    },
    'dwayne@kadn.com': {
      password: 'Password123',
      role: 'user',
      name: 'System Administrator'
    },
    'kylevidrine@me.com': {
      password: 'KylePass2024!',
      role: 'owner',
      name: 'Kyle Vidrine'
    }
  };

  const user = validUsers[username];
  if (user && user.password === password) {
    // Set session with user info
    req.session.authenticated = true;
    req.session.userInfo = {
      email: username,
      name: user.name,
      role: user.role,
      authType: 'basic'
    };

    // Force session save before redirect
    req.session.save((err) => {
      if (err) {
        console.error('❌ Session save error for basic auth:', err);
        return res.redirect('/login?error=session_failed');
      }
      console.log('✅ Basic auth successful for:', username, 'Role:', user.role);
      res.redirect('/dashboard');
    });
  } else {
    console.log('❌ Basic auth failed for:', username);
    res.redirect('/login?error=1');
  }
});

// Dashboard route
router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    console.log('📊 Dashboard access check:', {
      sessionAuth: req.session?.authenticated,
      passportAuth: req.isAuthenticated?.(),
      hasUser: !!req.user,
      userInfo: req.session?.userInfo
    });

    // Determine auth type and get user info
    let userName, userEmail, customerId, customer = null;
    let authType = 'unknown';
    let isGoogleUser = false;
    let isFacebookUser = false;

    if (req.isAuthenticated?.() && req.user) {
      // Authenticated via Passport - but check if they ACTUALLY have active tokens
      userName = req.user.name;
      userEmail = req.user.email;
      customerId = req.user.id;
      
      try {
        customer = await getCustomerById(req.user.id);
        console.log('🔍 Customer from DB:', {
          id: customer?.id,
          email: customer?.email,
          hasGoogleTokens: !!(customer?.google_access_token),
          hasQBTokens: !!(customer?.qb_access_token)
        });
        
        // The KEY FIX: Check database tokens, not just session
        const hasActiveGoogleTokens = !!(customer?.google_access_token && customer?.google_refresh_token);
        
        if (hasActiveGoogleTokens) {
          authType = 'google';
          isGoogleUser = true;
          console.log('✅ Active Google user with valid tokens');
        } else if (customer?.id?.startsWith('fb_')) {
          authType = 'facebook';
          isFacebookUser = true;
          console.log('✅ Facebook user');
        } else {
          // User authenticated via Google but tokens were removed - treat as basic user
          authType = 'disconnected_google';
          isGoogleUser = false;
          console.log('⚠️ User authenticated but no Google tokens - treating as disconnected');
        }
        
      } catch (error) {
        console.error('Error fetching customer:', error);
        authType = 'passport_user';
      }
      
    } else if (req.session?.authenticated && req.session?.userInfo) {
      // Basic auth or session-based auth
      authType = req.session.userInfo.authType || 'basic';
      userName = req.session.userInfo.name;
      userEmail = req.session.userInfo.email;
      customerId = req.session.userInfo.customerId || 'demo-user';
      
      if (authType === 'facebook' && customerId) {
        isFacebookUser = true;
        try {
          customer = await getCustomerById(customerId);
        } catch (error) {
          console.error('Error fetching Facebook customer:', error);
        }
      }
    } else {
      console.log('❌ No valid authentication found in dashboard');
      return res.redirect('/login');
    }

    const hasQBAuth = !!(customer?.qb_access_token && customer?.qb_company_id);

    console.log('🔍 FINAL Dashboard auth status:', {
      userName,
      userEmail,
      customerId,
      authType,
      isGoogleUser,
      isFacebookUser,
      hasQBAuth,
      customerHasGoogleTokens: !!(customer?.google_access_token),
      customerHasQBTokens: !!(customer?.qb_access_token)
    });

    isFacebookUser = authType === 'facebook';
    isGoogleUser = authType === 'google';

    // Handle status messages
    const urlParams = new URL(req.url, \`http://\${req.get('host')}\`);
    const qbSuccess = urlParams.searchParams.get('qb_success');
    const qbError = urlParams.searchParams.get('qb_error');

    let qbStatusMessage = '';
    if (qbSuccess) {
      qbStatusMessage = '<div style="background: #d4edda; color: #155724; padding: 10px; margin: 10px 0; border-radius: 5px;">✅ QuickBooks connected successfully!</div>';
    } else if (qbError) {
      const errorMessages = {
        'auth_failed': 'QuickBooks authorization failed. Please try again.',
        'session_lost': 'Session expired. Please try connecting QuickBooks again.',
        'token_save_failed': 'Failed to save QuickBooks tokens. Please try again.'
      };
      qbStatusMessage = \`<div style="background: #f8d7da; color: #721c24; padding: 10px; margin: 10px 0; border-radius: 5px;">❌ \${errorMessages[qbError] || 'Unknown error occurred'}</div>\`;
    }

    // Generate appropriate dashboard content based on auth type
const integrationSection = isGoogleUser ? \`
  <div class="integration-card google-card connected">
    <h3>🔗 Google Workspace Integration 
      <span class="status-badge status-connected">Connected</span>
    </h3>
    <p>✅ Full access to Google Sheets, Gmail, Calendar, Contacts, and Drive</p>
    <p><strong>Scopes:</strong> Comprehensive AI workflow permissions</p>

    <div style="margin-top: 15px;">
      <button onclick="disconnectGoogle()" class="btn btn-danger">
        🔌 Disconnect Google
      </button>
    </div>
  </div>

  <div class="integration-card facebook-card">
    <h3>📱 Facebook Integration 
      <span class="status-badge status-disconnected">Not Connected</span>
    </h3>
    <p>Connect your Facebook account for additional social authentication options</p>
    <div style="margin-top: 15px;">
      <a href="/auth/facebook" class="btn btn-facebook">
        <span style="margin-right: 8px;">📘</span>
        Connect Facebook
      </a>
    </div>
  </div>

  <div class="integration-card qb-card \${hasQBAuth ? 'connected' : ''}">
    <h3>📊 QuickBooks Integration 
      <span class="status-badge \${hasQBAuth ? 'status-connected' : 'status-disconnected'}">
        \${hasQBAuth ? 'Connected' : 'Not Connected'}
      </span>
    </h3>
    
    \${hasQBAuth ? \`
      <p>✅ Connected to QuickBooks Company</p>
      <p><strong>Company ID:</strong> <code style="background: #f0f0f0; padding: 4px 8px; border-radius: 4px;">\${customer.qb_company_id}</code></p>
      <p><strong>Environment:</strong> <code style="background: #f0f0f0; padding: 4px 8px; border-radius: 4px;">\${QB_ENVIRONMENT}</code></p>
      <button onclick="disconnectQuickBooks()" class="btn btn-danger">🔌 Disconnect QuickBooks</button>
    \` : \`
      <p>Connect your QuickBooks account to enable AI workflows with your accounting data</p>
      <p><strong>Permissions:</strong> Read/Write access to QuickBooks accounting data</p>
      <a href="/auth/quickbooks" class="btn btn-qb">📊 Connect QuickBooks</a>
    \`}
  </div>
\` : isFacebookUser ? \`
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

  <div class="integration-card facebook-card connected">
    <h3>📱 Facebook Integration 
      <span class="status-badge status-connected">Connected</span>
    </h3>
    <p>✅ Connected via Facebook Social Login</p>
    <p><strong>Profile:</strong> \${userName}</p>
    <p><strong>Email:</strong> \${userEmail}</p>
    <div style="margin-top: 15px;">
      <button onclick="disconnectFacebook()" class="btn btn-danger">
        <span style="margin-right: 8px;">🔌</span>
        Disconnect Facebook
      </button>
    </div>
  </div>

  <div class="integration-card qb-card \${hasQBAuth ? 'connected' : ''}">
    <h3>📊 QuickBooks Integration 
      <span class="status-badge \${hasQBAuth ? 'status-connected' : 'status-disconnected'}">
        \${hasQBAuth ? 'Connected' : 'Not Connected'}
      </span>
    </h3>
    
    \${hasQBAuth ? \`
      <p>✅ Connected to QuickBooks Company</p>
      <p><strong>Company ID:</strong> <code style="background: #f0f0f0; padding: 4px 8px; border-radius: 4px;">\${customer.qb_company_id}</code></p>
      <p><strong>Environment:</strong> <code style="background: #f0f0f0; padding: 4px 8px; border-radius: 4px;">\${QB_ENVIRONMENT}</code></p>
      <button onclick="disconnectQuickBooks()" class="btn btn-danger">🔌 Disconnect QuickBooks</button>
    \` : \`
      <p>Connect your QuickBooks account to enable AI workflows with your accounting data</p>
      <p><strong>Permissions:</strong> Read/Write access to QuickBooks accounting data</p>
      <a href="/auth/quickbooks/standalone" class="btn btn-qb">📊 Connect QuickBooks</a>
    \`}
  </div>
\` : \`
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
\`;



