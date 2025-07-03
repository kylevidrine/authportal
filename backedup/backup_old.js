// 1. FIRST: All imports
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const OAuthClient = require('intuit-oauth');
const crypto = require('crypto');
const fetch = require('node-fetch');
require('dotenv').config();

// 2. SECOND: Basic setup
const app = express();
const PORT = process.env.PORT || 3000;

// 3. THIRD: Database initialization
const dbPath = process.env.DATABASE_PATH || './data/customers.db';
const db = new sqlite3.Database(dbPath);

// 4. FOURTH: Constants (after dotenv loads)
const REQUIRED_SCOPES = [
  'profile',
  'email',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/contacts.other.readonly',
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/contacts',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive'
];
const QB_SCOPES = [OAuthClient.scopes.Accounting];
const QB_ENVIRONMENT = process.env.QB_ENVIRONMENT || 'production';

// 5. FIFTH: OAuth clients (after environment variables are loaded)
const qbOAuthClient = new OAuthClient({
  clientId: QB_ENVIRONMENT === 'production'
    ? process.env.QB_CLIENT_ID_PROD
    : process.env.QB_CLIENT_ID_SANDBOX,
  clientSecret: QB_ENVIRONMENT === 'production'
    ? process.env.QB_CLIENT_SECRET_PROD
    : process.env.QB_CLIENT_SECRET_SANDBOX,
  environment: QB_ENVIRONMENT,
  redirectUri: 'https://auth.robosouthla.com/auth/quickbooks/callback'
});

// Create tables if they don't exist
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    name TEXT,
    picture TEXT,
    google_access_token TEXT,
    google_refresh_token TEXT,
    scopes TEXT,
    token_expiry DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Add QuickBooks columns to existing customers table
db.serialize(() => {
  db.run(`ALTER TABLE customers ADD COLUMN qb_access_token TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) console.log('QB access token column exists');
  });

  db.run(`ALTER TABLE customers ADD COLUMN qb_refresh_token TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) console.log('QB refresh token column exists');
  });

  db.run(`ALTER TABLE customers ADD COLUMN qb_company_id TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) console.log('QB company ID column exists');
  });

  db.run(`ALTER TABLE customers ADD COLUMN qb_token_expiry DATETIME`, (err) => {
    if (err && !err.message.includes('duplicate column')) console.log('QB token expiry column exists');
  });

  db.run(`ALTER TABLE customers ADD COLUMN qb_base_url TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) console.log('QB base URL column exists');
  });
});

// Middleware to force HTTPS detection
app.use((req, res, next) => {
  if (req.get('host') === 'auth.robosouthla.com') {
    req.headers['x-forwarded-proto'] = 'https';
  }
  next();
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,  // Set to true if using HTTPS in production
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  },
  rolling: true // Refresh the cookie on each request
}));

app.use(passport.initialize());
app.use(passport.session());

// Authentication middleware function
function requireAuth(req, res, next) {
  console.log('🔐 Auth check:', {
    sessionAuthenticated: req.session?.authenticated,
    passportAuthenticated: req.isAuthenticated?.(),
    hasUser: !!req.user,
    userEmail: req.user?.email || req.session?.userInfo?.email,
    sessionID: req.sessionID,
    path: req.path,
    method: req.method
  });

  // Check both authentication methods:
  // 1. Session-based auth (basic login users)
  // 2. Passport-based auth (Google OAuth users)
  const isSessionAuth = req.session?.authenticated === true;
  const isGoogleAuth = req.isAuthenticated?.() && req.user;

  if (isSessionAuth || isGoogleAuth) {
    const userEmail = req.user?.email || req.session?.userInfo?.email;
    console.log('✅ User authenticated:', userEmail);
    return next();
  } else {
    console.log('❌ User not authenticated, redirecting to login');
    return res.redirect('/login');
  }
}

// Passport configuration with proper scopes
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "https://auth.robosouthla.com/auth/google/callback",
  scope: REQUIRED_SCOPES,
  accessType: 'offline',
  prompt: 'consent'
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const userEmail = profile.emails[0].value;
    console.log('🔍 Google OAuth for email:', userEmail);

    // STEP 1: Check if a customer with this email already exists
    const existingCustomers = await getAllCustomers();
    const existingCustomer = existingCustomers.find(c => c.email === userEmail);

    if (existingCustomer) {
      // STEP 2: Customer exists - UPDATE their Google tokens but PRESERVE QuickBooks data
      console.log('✅ Found existing customer, merging Google auth:', existingCustomer.id);

      const mergedCustomerData = {
        id: existingCustomer.id,
        email: userEmail,
        name: profile.displayName,
        picture: profile.photos?.[0]?.value || null,
        accessToken,
        refreshToken,
        scopes: REQUIRED_SCOPES.join(' '),
        tokenExpiry: new Date(Date.now() + (3600 * 1000)),

        // PRESERVE EXISTING QUICKBOOKS DATA
        qbAccessToken: existingCustomer.qb_access_token,
        qbRefreshToken: existingCustomer.qb_refresh_token,
        qbCompanyId: existingCustomer.qb_company_id,
        qbTokenExpiry: existingCustomer.qb_token_expiry,
        qbBaseUrl: existingCustomer.qb_base_url
      };

      await storeCustomer(mergedCustomerData);
      console.log('🎉 Merged Google auth with existing customer (QB preserved):', userEmail);

      return done(null, mergedCustomerData);
    } else {
      // STEP 3: New customer - create fresh record
      const customerId = uuidv4();
      const customerData = {
        id: customerId,
        email: userEmail,
        name: profile.displayName,
        picture: profile.photos?.[0]?.value || null,
        accessToken,
        refreshToken,
        scopes: REQUIRED_SCOPES.join(' '),
        tokenExpiry: new Date(Date.now() + (3600 * 1000))
      };

      await storeCustomer(customerData);
      console.log('✅ New Google customer created:', userEmail, customerId);

      return done(null, customerData);
    }

  } catch (error) {
    console.error('❌ Google OAuth error:', error);
    return done(error, null);
  }
}));

passport.use(new FacebookStrategy({
  clientID: process.env.FB_APP_ID,
  clientSecret: process.env.FB_APP_SECRET,
  callbackURL: "https://auth.robosouthla.com/auth/facebook/callback",
  profileFields: ['id', 'emails', 'name', 'picture.type(large)']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails?.[0]?.value || `fb_${profile.id}@facebook.com`;
    const userId = `fb_${profile.id}`;

    const customerData = {
      id: userId,
      email,
      name: `${profile.name.givenName} ${profile.name.familyName}`,
      picture: profile.photos?.[0]?.value,
      accessToken,
      refreshToken,
      scopes: 'facebook'
    };

    await storeCustomer(customerData);
    return done(null, customerData);
  } catch (err) {
    console.error('❌ Facebook OAuth error:', err);
    return done(err, null);
  }
}));


passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const customer = await getCustomerById(id);
    done(null, customer);
  } catch (error) {
    done(error, null);
  }
});

// Database functions
function storeCustomer(customerData) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO customers 
      (id, email, name, picture, google_access_token, google_refresh_token, scopes, token_expiry, 
       qb_access_token, qb_refresh_token, qb_company_id, qb_token_expiry, qb_base_url, updated_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);

    stmt.run([
      customerData.id,
      customerData.email,
      customerData.name,
      customerData.picture,
      customerData.accessToken,
      customerData.refreshToken,
      customerData.scopes,
      customerData.tokenExpiry,
      customerData.qbAccessToken || null,
      customerData.qbRefreshToken || null,
      customerData.qbCompanyId || null,
      customerData.qbTokenExpiry || null,
      customerData.qbBaseUrl || null
    ], function (err) {
      if (err) reject(err);
      else resolve(this.lastID);
    });

    stmt.finalize();
  });
}

function getCustomerById(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM customers WHERE id = ?', [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function getAllCustomers() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM customers ORDER BY created_at DESC', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function validateToken(accessToken) {
  try {
    console.log('Validating token...', accessToken.substring(0, 20) + '...');
    const response = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`);
    console.log('Token validation response status:', response.status);

    if (response.ok) {
      const data = await response.json();
      console.log('Token validation result:', {
        valid: true,
        expires_in: data.expires_in,
        scopes: data.scope ? data.scope.split(' ').length : 0
      });
      return {
        valid: true,
        expires_in: data.expires_in,
        scopes: data.scope ? data.scope.split(' ') : []
      };
    } else {
      const errorText = await response.text();
      console.log('Token validation failed:', response.status, errorText);
      return { valid: false };
    }
  } catch (error) {
    console.log('Token validation error:', error.message);
    return { valid: false, error: error.message };
  }
}

async function updateCustomerQBTokens(customerId, qbData) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      UPDATE customers 
      SET qb_access_token = ?, qb_refresh_token = ?, qb_company_id = ?, 
          qb_token_expiry = ?, qb_base_url = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run([
      qbData.qbAccessToken,
      qbData.qbRefreshToken,
      qbData.qbCompanyId,
      qbData.qbTokenExpiry,
      qbData.qbBaseUrl,
      customerId
    ], function (err) {
      if (err) reject(err);
      else resolve(this.changes);
    });

    stmt.finalize();
  });
}

async function updateCustomerGoogleTokens(customerId, googleData) {
  console.log('🔥 DEBUG: updateCustomerGoogleTokens called');
  console.log('🔥 DEBUG: customerId:', customerId);
  console.log('🔥 DEBUG: googleData:', JSON.stringify(googleData, null, 2));
  
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      UPDATE customers 
      SET google_access_token = ?, google_refresh_token = ?, 
          token_expiry = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const params = [
      googleData.googleAccessToken,
      googleData.googleRefreshToken,
      googleData.googleTokenExpiry.toISOString(),
      customerId
    ];
    
    console.log('🔥 DEBUG: SQL params:', params);

    stmt.run(params, function (err) {
      if (err) {
        console.error('❌ Failed to update Google tokens in database:', err);
        reject(err);
      } else {
        console.log('✅ Updated Google tokens in database for customer:', customerId, '- Rows changed:', this.changes);
        resolve(this.changes);
      }
    });

    stmt.finalize();
  });
}

async function validateQBToken(accessToken, companyId) {
  try {
    if (!accessToken || !companyId) {
      return { valid: false, error: 'Missing token or company ID' };
    }

    // Optional: Test with actual QB API call for better validation
    // Remove this try/catch block if you want to skip the API test
    try {
      const baseUrl = QB_ENVIRONMENT === 'sandbox'
        ? 'https://sandbox-quickbooks.api.intuit.com'
        : 'https://quickbooks.api.intuit.com';

      const testUrl = `${baseUrl}/v3/company/${companyId}/companyinfo/${companyId}`;

      const response = await fetch(testUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        },
        timeout: 5000 // 5 second timeout
      });

      console.log('QB Token validation response:', response.status);

      return {
        valid: response.ok,
        status: response.status
      };
    } catch (fetchError) {
      console.log('QB API test failed, falling back to basic validation:', fetchError.message);
      // Fall back to basic validation if API test fails
    }

    // Basic validation - just check if we have the required values
    console.log('QB Token validation (basic check):', {
      hasAccessToken: !!accessToken,
      hasCompanyId: !!companyId,
      companyId: companyId
    });

    return {
      valid: true, // Assume valid if we have both values
      status: 200
    };

  } catch (error) {
    console.log('QB token validation error:', error.message);
    return { valid: false, error: error.message };
  }
}
//Beginning of Routes

// Login routes for Google reviewers
// FIND your current login route (app.get('/login')) and REPLACE with this unified version:


app.get('/login', (req, res) => {
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

// UPDATE your existing POST route to handle both auth types:
// (Keep your existing multi-user basic auth logic)

// ADD this route to handle Google OAuth errors:
app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login?google_error=1' }),
  (req, res) => {
    console.log('✅ Google OAuth callback successful for:', req.user?.email);
    console.log('Customer ID:', req.user?.id);

    // CRITICAL: Set session authentication for consistency
    req.session.authenticated = true;
    req.session.userInfo = {
      email: req.user.email,
      name: req.user.name,
      role: 'google_user',
      customerId: req.user.id,
      authType: 'google'
    };

    // Force session save before redirect
    req.session.save((err) => {
      if (err) {
        console.error('❌ Session save error:', err);
        return res.redirect('/login?error=session_failed');
      }
      console.log('✅ Session saved successfully for Google user');
      res.redirect('/dashboard');
    });
  }
);
// 1. Google OAuth - Gets full integration access with real tokens
// 2. Basic Auth - Gets demo access with predetermined accounts
// 
// Both authentication methods work independently and users get
// appropriate dashboards based on their login method.

app.post('/login', (req, res) => {
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


// Main route***************************************************************************************************


app.get('/', requireAuth, async (req, res) => {
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
// Main route***************************************************************************************************

// ?**************************************************************************************************
app.get('/auth/google',
  passport.authenticate('google', {
    scope: REQUIRED_SCOPES,
    accessType: 'offline',
    prompt: 'consent'
  })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/auth-result?google_error=auth_failed' }),
  (req, res) => {
    res.redirect('/auth-result?google_success=1&customer_id=' + req.user.id);
  }
);


// Dashboard route***************************************************************************************************
app.get('/dashboard', requireAuth, async (req, res) => {
  try {
    console.log('📊 Dashboard access check:', {
      sessionAuth: req.session?.authenticated,
      passportAuth: req.isAuthenticated?.(),
      hasUser: !!req.user,
      userInfo: req.session?.userInfo
    });

    // Determine auth type and get user info
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
    const urlParams = new URL(req.url, `http://${req.get('host')}`);
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
      qbStatusMessage = `<div style="background: #f8d7da; color: #721c24; padding: 10px; margin: 10px 0; border-radius: 5px;">❌ ${errorMessages[qbError] || 'Unknown error occurred'}</div>`;
    }

    // Generate appropriate dashboard content based on auth type
// FIND AND REPLACE the integrationSection variable in your dashboard route with this:

const integrationSection = isGoogleUser ? `
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

  <div class="integration-card qb-card ${hasQBAuth ? 'connected' : ''}">
    <h3>📊 QuickBooks Integration 
      <span class="status-badge ${hasQBAuth ? 'status-connected' : 'status-disconnected'}">
        ${hasQBAuth ? 'Connected' : 'Not Connected'}
      </span>
    </h3>
    
    ${hasQBAuth ? `
      <p>✅ Connected to QuickBooks Company</p>
      <p><strong>Company ID:</strong> <code style="background: #f0f0f0; padding: 4px 8px; border-radius: 4px;">${customer.qb_company_id}</code></p>
      <p><strong>Environment:</strong> <code style="background: #f0f0f0; padding: 4px 8px; border-radius: 4px;">${QB_ENVIRONMENT}</code></p>
      <button onclick="disconnectQuickBooks()" class="btn btn-danger">🔌 Disconnect QuickBooks</button>
    ` : `
      <p>Connect your QuickBooks account to enable AI workflows with your accounting data</p>
      <p><strong>Permissions:</strong> Read/Write access to QuickBooks accounting data</p>
      <a href="/auth/quickbooks" class="btn btn-qb">📊 Connect QuickBooks</a>
    `}
  </div>
` : isFacebookUser ? `
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
    <p><strong>Profile:</strong> ${userName}</p>
    <p><strong>Email:</strong> ${userEmail}</p>
    <div style="margin-top: 15px;">
      <button onclick="disconnectFacebook()" class="btn btn-danger">
        <span style="margin-right: 8px;">🔌</span>
        Disconnect Facebook
      </button>
    </div>
  </div>

  <div class="integration-card qb-card ${hasQBAuth ? 'connected' : ''}">
    <h3>📊 QuickBooks Integration 
      <span class="status-badge ${hasQBAuth ? 'status-connected' : 'status-disconnected'}">
        ${hasQBAuth ? 'Connected' : 'Not Connected'}
      </span>
    </h3>
    
    ${hasQBAuth ? `
      <p>✅ Connected to QuickBooks Company</p>
      <p><strong>Company ID:</strong> <code style="background: #f0f0f0; padding: 4px 8px; border-radius: 4px;">${customer.qb_company_id}</code></p>
      <p><strong>Environment:</strong> <code style="background: #f0f0f0; padding: 4px 8px; border-radius: 4px;">${QB_ENVIRONMENT}</code></p>
      <button onclick="disconnectQuickBooks()" class="btn btn-danger">🔌 Disconnect QuickBooks</button>
    ` : `
      <p>Connect your QuickBooks account to enable AI workflows with your accounting data</p>
      <p><strong>Permissions:</strong> Read/Write access to QuickBooks accounting data</p>
      <a href="/auth/quickbooks/standalone" class="btn btn-qb">📊 Connect QuickBooks</a>
    `}
  </div>
` : `
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
          .google-disconnect-btn {
            background: #fff;
            border: 1px solid #dadce0;
            border-radius: 4px;
            color: #3c4043;
            cursor: pointer;
            font-family: arial,sans-serif;
            font-size: 14px;
            height: 40px;
            letter-spacing: 0.25px;
            outline: none;
            overflow: hidden;
            padding: 0 12px;
            position: relative;
            text-align: center;
            transition: background-color .218s, border-color .218s, box-shadow .218s;
            vertical-align: middle;
            white-space: nowrap;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
          }
          .google-disconnect-btn:hover {
            box-shadow: 0 1px 3px rgba(0,0,0,.1);
            background-color: #f8f9fa;
          }
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
              <button onclick="copyToClipboard('${customerId}')" class="btn btn-secondary" style="margin-left: 10px; padding: 6px 12px; font-size: 12px;">Copy</button>
            </p>
            <p><strong>Authentication:</strong> ${
              isGoogleUser ? '🔗 Google OAuth' : 
              isFacebookUser ? '📱 Facebook OAuth' : 
              '🔑 Basic Auth'
            }</p>
          </div>
          
          ${qbStatusMessage}
          
          ${integrationSection}
          
          <div class="integration-card">
            <h3>🔧 N8N Workflow Integration</h3>
            <p>Use your Customer ID in n8n workflows to access ${
              isGoogleUser ? 'Google APIs and QuickBooks data' : 
              isFacebookUser ? 'Facebook profile data and QuickBooks APIs' : 
              'demo features'
            }:</p>
            <div style="background: white; padding: 15px; border-radius: 6px; margin: 10px 0;">
              <strong>Customer ID:</strong> <span class="customer-id">${customerId}</span>
              <button onclick="copyToClipboard('${customerId}')" class="btn btn-primary" style="margin-left: 10px;">Copy for N8N</button>
            </div>
            
            ${(isGoogleUser || isFacebookUser) ? `
            <h4>API Endpoints:</h4>
            <ul style="font-family: monospace; font-size: 13px; background: #f8f9fa; padding: 15px; border-radius: 6px;">
              ${isGoogleUser ? `<li><strong>Google:</strong> GET /api/customer/${customerId}/google/tokens</li>` : ''}
              ${isFacebookUser ? `<li><strong>Facebook:</strong> GET /api/customer/${customerId}/facebook/status</li>` : ''}
              <li><strong>QuickBooks Status:</strong> GET /api/customer/${customerId}/quickbooks/status</li>
              <li><strong>QuickBooks Tokens:</strong> GET /api/customer/${customerId}/quickbooks/tokens</li>
              <li><strong>All Integrations:</strong> GET /api/customer/${customerId}/integrations</li>
            </ul>
            ` : `
            <p><em>Full API access available with Google or Facebook authentication.</em></p>
            `}
          </div>
          
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

          // ADD THIS FACEBOOK FUNCTION RIGHT HERE:
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
    console.error('❌ Dashboard error:', error);
    res.status(500).send('Error loading dashboard: ' + error.message);
  }
});
// Dashboard route***************************************************************************************************





// NEW: Auth result page for standalone flows
app.get('/auth-result', async (req, res) => {
  const urlParams = new URL(req.url, `http://${req.get('host')}`);
  const qbSuccess = urlParams.searchParams.get('qb_success');
  const qbError = urlParams.searchParams.get('qb_error');
  const googleSuccess = urlParams.searchParams.get('google_success');
  const customerId = urlParams.searchParams.get('customer_id');

  let customer = null;
  if (customerId) {
    try {
      customer = await getCustomerById(customerId);
    } catch (error) {
      console.error('Error fetching customer:', error);
    }
  }

  let statusMessage = '';
  let nextSteps = '';

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
        
        ${!hasGoogle ? `
          <div style="background: #e3f2fd; padding: 15px; border-radius: 6px; margin: 10px 0; border-left: 4px solid #2196f3;">
            <strong>💡 Enhance Your Integration:</strong>
            <p>Add Google Workspace for even more powerful workflows!</p>
            <a href="/auth/google" style="background: #4285f4; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Connect Google Workspace
            </a>
          </div>
        ` : `
          <div style="background: #e8f5e8; padding: 15px; border-radius: 6px; margin: 10px 0; border-left: 4px solid #28a745;">
            <strong>🎉 Fully Integrated!</strong>
            <p>You now have both Google Workspace and QuickBooks connected!</p>
          </div>
        `}
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
        
        ${!hasQB ? `
          <div style="background: #fff3cd; padding: 15px; border-radius: 6px; margin: 10px 0; border-left: 4px solid #ffc107;">
            <strong>💡 Add QuickBooks Integration:</strong>
            <p>Connect your accounting data for comprehensive business workflows!</p>
            <a href="/auth/quickbooks/standalone" style="background: #0077C5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Connect QuickBooks
            </a>
          </div>
        ` : `
          <div style="background: #e8f5e8; padding: 15px; border-radius: 6px; margin: 10px 0; border-left: 4px solid #28a745;">
            <strong>🎉 Fully Integrated!</strong>
            <p>You now have both Google Workspace and QuickBooks connected!</p>
          </div>
        `}
      </div>
    `;
  } else {
    const errorMessages = {
      'auth_failed': 'Authorization failed. Please try again.',
      'session_lost': 'Session expired. Please start the authorization process again.',
      'token_save_failed': 'Failed to save authorization tokens. Please try again.'
    };
    statusMessage = `
      <div style="background: #f8d7da; color: #721c24; padding: 20px; margin: 20px 0; border-radius: 8px; border-left: 4px solid #dc3545;">
        <h3 style="margin-top: 0;">❌ Authorization Error</h3>
        <p>${errorMessages[qbError] || 'Unknown error occurred'}</p>
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

app.get('/logout', (req, res) => {
  const userEmail = req.user?.email || req.session?.userInfo?.email;
  console.log('🚪 Logging out user:', userEmail);

  // Clear session first
  req.session.destroy((err) => {
    if (err) {
      console.error('❌ Session destroy error:', err);
    } else {
      console.log('✅ Session destroyed successfully');
    }

    // Handle Passport logout if applicable
    if (req.logout && typeof req.logout === 'function') {
      req.logout((logoutErr) => {
        if (logoutErr) {
          console.error('❌ Passport logout error:', logoutErr);
        } else {
          console.log('✅ Passport logout successful');
        }
        res.redirect('/login');
      });
    } else {
      res.redirect('/login');
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date(), scopes: REQUIRED_SCOPES });
});

app.get('/debug', (req, res) => {
  const protocol = req.header('x-forwarded-proto') || req.protocol;
  const host = req.header('x-forwarded-host') || req.get('host');

  res.json({
    message: "Callback URL Debug",
    detectedProtocol: protocol,
    detectedHost: host,
    detectedCallback: `${protocol}://${host}/auth/google/callback`,
    hardcodedCallback: "https://auth.robosouthla.com/auth/google/callback",
    clientId: process.env.GOOGLE_CLIENT_ID,
    requiredScopes: REQUIRED_SCOPES,

    // ADD THIS QuickBooks debug info:
    quickbooks: {
      environment: QB_ENVIRONMENT,
      envFromFile: process.env.QB_ENVIRONMENT,
      clientIdProd: process.env.QB_CLIENT_ID_PROD?.substring(0, 10) + '...',
      clientIdSandbox: process.env.QB_CLIENT_ID_SANDBOX?.substring(0, 10) + '...',
      usingDefault: !process.env.QB_ENVIRONMENT
    },

    headers: {
      'x-forwarded-proto': req.header('x-forwarded-proto'),
      'x-forwarded-host': req.header('x-forwarded-host'),
      'host': req.get('host')
    }
  });
});

// ADD this new route - you can place it near your existing /debug route
app.get('/debug-auth', (req, res) => {
  res.json({
    timestamp: new Date().toISOString(),
    sessionAuthenticated: req.session?.authenticated,
    passportAuthenticated: req.isAuthenticated?.(),
    hasUser: !!req.user,
    sessionUserInfo: req.session?.userInfo,
    passportUser: req.user ? {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name
    } : null,
    sessionID: req.sessionID,
    cookies: req.headers.cookie,
    userAgent: req.headers['user-agent']
  });
});

app.get('/api/customer/:id', async (req, res) => {
  try {
    console.log('API call for customer:', req.params.id);
    const customer = await getCustomerById(req.params.id);

    if (!customer) {
      console.log('Customer not found:', req.params.id);
      return res.status(404).json({
        error: 'customer_not_found',
        message: 'Customer not found. Please authenticate first.',
        authUrl: `https://auth.robosouthla.com/auth/google`
      });
    }

    // ONLY CHECK GOOGLE - Don't check session or QuickBooks
    if (!customer.google_access_token) {
      console.log('No Google token found for:', customer.email);
      return res.status(403).json({
        error: 'no_google_token',
        message: 'No Google access token found. Please re-authenticate with Google.',
        authUrl: `https://auth.robosouthla.com/auth/google`
      });
    }

    console.log('Customer found, validating Google token for:', customer.email);
    const tokenValidation = await validateToken(customer.google_access_token);

    if (!tokenValidation.valid) {
      console.log('Google token validation failed for:', customer.email);
      return res.status(403).json({
        error: 'invalid_google_token',
        message: 'Google access token is invalid or expired. Please re-authenticate with Google.',
        authUrl: `https://auth.robosouthla.com/auth/google`
      });
    }

    // Return Google data - QuickBooks doesn't matter here
    res.json({
      id: customer.id,
      email: customer.email,
      name: customer.name,
      accessToken: customer.google_access_token,
      refreshToken: customer.google_refresh_token,
      scopes: tokenValidation.scopes,
      expiresIn: tokenValidation.expires_in,
      createdAt: customer.created_at,
      hasGoogleAuth: true
    });

  } catch (error) {
    console.error('Google API error:', error);
    res.status(500).json({
      error: 'internal_error',
      message: 'Internal server error'
    });
  }
});





app.get('/api/customers', async (req, res) => {
  try {
    const customers = await getAllCustomers();
    const customerList = customers.map(customer => ({
      id: customer.id,
      email: customer.email,
      name: customer.name,
      hasGoogleAuth: !!customer.google_access_token,
      createdAt: customer.created_at,
      tokenExpiry: customer.token_expiry
    }));
    res.json(customerList);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});





app.get('/api/customers/latest', async (req, res) => {
  try {
    const customers = await getAllCustomers();
    if (customers.length > 0) {
      const latest = customers[0];
      res.json({
        id: latest.id,
        email: latest.email,
        name: latest.name,
        hasGoogleAuth: !!latest.google_access_token,
        createdAt: latest.created_at
      });
    } else {
      res.status(404).json({ error: 'No customers found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});





app.get('/api/customers/count', async (req, res) => {
  try {
    const customers = await getAllCustomers();
    res.json({ count: customers.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});







app.get('/api/customers/search', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ error: 'Email parameter required' });
    }

    const customers = await getAllCustomers();
    const found = customers.filter(c =>
      c.email.toLowerCase().includes(email.toLowerCase())
    );

    res.json(found.map(customer => ({
      id: customer.id,
      email: customer.email,
      name: customer.name,
      hasGoogleAuth: !!customer.google_access_token,
      hasQuickBooksAuth: !!(customer.qb_access_token && customer.qb_company_id),
      createdAt: customer.created_at,
      tokenExpiry: customer.token_expiry,
      // Optional: Add QB-specific info
      quickbooksInfo: {
        connected: !!(customer.qb_access_token && customer.qb_company_id),
        companyId: customer.qb_company_id || null,
        environment: customer.qb_access_token ? QB_ENVIRONMENT : null
      }
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});








// Add this to your auth server (server.js)
app.post('/api/customer/:id/refresh-tokens', async (req, res) => {
  try {
    const customer = await getCustomerById(req.params.id);

    if (!customer || !customer.google_refresh_token) {
      return res.status(404).json({
        success: false,
        error: 'Customer or refresh token not found'
      });
    }

    console.log('🔄 Refreshing tokens for:', customer.email);

    // Use Google's token refresh API
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: customer.google_refresh_token,
        grant_type: 'refresh_token'
      })
    });

    const tokens = await response.json();

    if (tokens.access_token) {
      // Update database with new tokens
      const newExpiry = new Date(Date.now() + (tokens.expires_in * 1000));

      const stmt = db.prepare(`
        UPDATE customers 
        SET google_access_token = ?, token_expiry = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      stmt.run([tokens.access_token, newExpiry.toISOString(), customer.id]);
      stmt.finalize();

      console.log('✅ Tokens refreshed for:', customer.email);

      res.json({
        success: true,
        newExpiry: newExpiry.toISOString(),
        expiresIn: tokens.expires_in
      });
    } else {
      console.log('❌ Token refresh failed for:', customer.email);
      res.status(400).json({
        success: false,
        error: 'Token refresh failed',
        details: tokens
      });
    }
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});











app.get('/auth/quickbooks', (req, res) => {
  // Check for existing authentication
  if (req.isAuthenticated?.() && req.user) {
    // Google OAuth user
    req.session.customerId = req.user.id;
    console.log('🔗 Google OAuth user connecting QuickBooks:', req.user.email);
  } else if (req.session?.authenticated && req.session?.userInfo) {
    // Basic auth user - don't set customerId yet, let callback handle it
    console.log('🔗 Basic auth user connecting QuickBooks:', req.session.userInfo.email);
  } else {
    return res.redirect('/?error=login_required');
  }

  const authUri = qbOAuthClient.authorizeUri({
    scope: QB_SCOPES,
    state: crypto.randomBytes(16).toString('hex')
  });

  res.redirect(authUri);
});











// NEW: Standalone QuickBooks auth route (doesn't require Google auth)
app.get('/auth/quickbooks/standalone', (req, res) => {
  // Check if user is already authenticated
  if (req.isAuthenticated?.() && req.user) {
    // Redirect to regular QB auth for Google users
    return res.redirect('/auth/quickbooks');
  } else if (req.session?.authenticated && req.session?.userInfo) {
    // Redirect to regular QB auth for basic auth users
    return res.redirect('/auth/quickbooks');
  } else {
    // True standalone auth - create temp ID
    const tempId = uuidv4();
    req.session.tempQBAuthId = tempId;
    console.log('🔗 Starting standalone QuickBooks auth with temp ID:', tempId);
  }

  const authUri = qbOAuthClient.authorizeUri({
    scope: QB_SCOPES,
    state: crypto.randomBytes(16).toString('hex')
  });

  res.redirect(authUri);
});










app.get('/auth/quickbooks/callback', async (req, res) => {
  try {
    if (req.query.error) {
      console.error('QuickBooks OAuth error:', req.query.error);
      return res.redirect('/auth-result?qb_error=auth_failed');
    }

    const authResponse = await qbOAuthClient.createToken(req.url);
    const token = authResponse.getToken();

    console.log('QuickBooks auth successful:', {
      companyId: req.query.realmId,
      hasTokens: !!token.access_token
    });

    const tokenExpiry = new Date(Date.now() + (token.expires_in * 1000));
    const baseUrl = QB_ENVIRONMENT === 'sandbox'
      ? 'https://sandbox-quickbooks.api.intuit.com'
      : 'https://quickbooks.api.intuit.com';

    let customerId;
    let isNewCustomer = false;

    // PRIORITY ORDER FOR DETERMINING CUSTOMER:
    // 1. Already authenticated Google OAuth user
    // 2. Already authenticated basic auth user 
    // 3. Session-stored customer ID
    // 4. Create new customer (standalone QB auth)

    if (req.isAuthenticated?.() && req.user && req.user.id) {
      // Case 1: Existing Google OAuth user adding QuickBooks
      customerId = req.user.id;
      console.log('🔗 Adding QuickBooks to existing Google OAuth customer:', customerId, req.user.email);
    }
    else if (req.session?.authenticated && req.session?.userInfo?.email) {
      // Case 2: Basic auth user adding QuickBooks
      const basicAuthEmail = req.session.userInfo.email;
      console.log('🔗 Basic auth user connecting QuickBooks:', basicAuthEmail);

      // Check if this basic auth user already has a customer record
      const existingCustomers = await getAllCustomers();
      const existingCustomer = existingCustomers.find(c => c.email === basicAuthEmail);

      if (existingCustomer) {
        // Use existing customer record
        customerId = existingCustomer.id;
        console.log('✅ Found existing customer record for basic auth user:', customerId);
      } else {
        // Create new customer record for basic auth user
        customerId = uuidv4();
        isNewCustomer = true;

        await storeCustomer({
          id: customerId,
          email: basicAuthEmail,
          name: req.session.userInfo.name,
          picture: null,
          accessToken: null, // No Google tokens for basic auth
          refreshToken: null,
          scopes: null,
          tokenExpiry: null,
          qbAccessToken: token.access_token,
          qbRefreshToken: token.refresh_token,
          qbCompanyId: req.query.realmId,
          qbTokenExpiry: tokenExpiry,
          qbBaseUrl: baseUrl
        });

        console.log('✅ Created new customer record for basic auth user:', customerId, basicAuthEmail);
      }
    }
    else if (req.session?.customerId) {
      // Case 3: Session-stored customer ID (fallback)
      customerId = req.session.customerId;
      console.log('🔗 Using session-stored customer ID:', customerId);
    }
    else if (req.session?.tempQBAuthId) {
      // Case 4: Standalone QuickBooks auth (no existing authentication)
      customerId = uuidv4();
      isNewCustomer = true;

      await storeCustomer({
        id: customerId,
        email: `qb-user-${req.query.realmId}@temp.local`, // Temporary email
        name: `QuickBooks User ${req.query.realmId}`,
        picture: null,
        accessToken: null,
        refreshToken: null,
        scopes: null,
        tokenExpiry: null,
        qbAccessToken: token.access_token,
        qbRefreshToken: token.refresh_token,
        qbCompanyId: req.query.realmId,
        qbTokenExpiry: tokenExpiry,
        qbBaseUrl: baseUrl
      });

      console.log('✅ Created new QB-only customer:', customerId);
      delete req.session.tempQBAuthId;
    }
    else {
      // No valid session - redirect to start over
      console.log('❌ No valid session found for QuickBooks callback');
      return res.redirect('/auth-result?qb_error=session_lost');
    }

    // Update or add QuickBooks tokens for the customer
    if (!isNewCustomer) {
      await updateCustomerQBTokens(customerId, {
        qbAccessToken: token.access_token,
        qbRefreshToken: token.refresh_token,
        qbCompanyId: req.query.realmId,
        qbTokenExpiry: tokenExpiry,
        qbBaseUrl: baseUrl
      });
    }

    console.log('🎉 QuickBooks successfully connected for customer:', customerId);

    // Redirect to dashboard instead of auth-result for authenticated users
    if (req.session?.authenticated || req.isAuthenticated?.()) {
      res.redirect('/dashboard?qb_success=1');
    } else {
      res.redirect(`/auth-result?qb_success=1&customer_id=${customerId}`);
    }

  } catch (error) {
    console.error('❌ QuickBooks callback error:', error);
    res.redirect('/auth-result?qb_error=token_save_failed');
  }
});













app.post('/auth/quickbooks/disconnect', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    await updateCustomerQBTokens(req.user.id, {
      qbAccessToken: null,
      qbRefreshToken: null,
      qbCompanyId: null,
      qbTokenExpiry: null,
      qbBaseUrl: null
    });

    res.json({ success: true, message: 'QuickBooks disconnected' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to disconnect QuickBooks' });
  }
});










app.get('/auth/quickbooks/disconnect', async (req, res) => {
  try {
    const realmId = req.query.realmId;

    if (realmId) {
      const customers = await getAllCustomers();
      const customer = customers.find(c => c.qb_company_id === realmId);

      if (customer) {
        await updateCustomerQBTokens(customer.id, {
          qbAccessToken: null,
          qbRefreshToken: null,
          qbCompanyId: null,
          qbTokenExpiry: null,
          qbBaseUrl: null
        });

        console.log(`QuickBooks disconnected for customer: ${customer.id} (Company: ${realmId})`);
      }
    }

    res.send(`
      <html>
      <head>
        <title>QuickBooks Disconnected</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
          .container { background: white; padding: 40px; border-radius: 10px; max-width: 500px; margin: 0 auto; }
          .btn { background: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>📊 QuickBooks Disconnected</h1>
          <p>Your QuickBooks integration has been successfully disconnected.</p>
          <p>You can reconnect at any time through your dashboard.</p>
          <a href="/dashboard" class="btn">Go to Dashboard</a>
        </div>
      </body>
      </html>
    `);

  } catch (error) {
    console.error('QuickBooks disconnect error:', error);
    res.redirect('/dashboard?qb_error=disconnect_failed');
  }
});









// **********************



app.get('/terms', (req, res) => {
  res.send(`
    <html>
    <head>
      <title>Terms of Service - RoboSouth LA</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
        h1, h2 { color: #333; }
        .container { background: white; padding: 30px; border-radius: 10px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Terms of Service</h1>
        <p><strong>Effective Date:</strong> 6/8/2025</p>
        <p><strong>Last Updated:</strong> 6/8/2025</p>
        
        <p>These Terms of Service ("Terms") govern your access to and use of the services, platform, website, and any associated software provided by RoboSouth LA ("Company," "we," "us," or "our") via https://www.robosouthla.com ("Site").</p>
        
        <p>By using our services, you ("Customer," "User," or "You") agree to be bound by these Terms.</p>
        
        <h2>QuickBooks Integration</h2>
        <p>When connecting QuickBooks Online, you authorize us to access your company's accounting data including invoices, customers, vendors, and financial reports for business automation purposes only.</p>
        
        <p><strong>Contact:</strong> info@robosouthla.com</p>
        <p><a href="/dashboard">← Back to Dashboard</a></p>
      </div>
    </body>
    </html>
  `);
});








app.get('/privacy', (req, res) => {
  res.send(`
    <html>
    <head>
      <title>Privacy Policy - RoboSouth LA</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
        h1, h2 { color: #333; }
        .container { background: white; padding: 30px; border-radius: 10px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Privacy Policy</h1>
        <p><strong>Effective Date:</strong> 6/8/2025</p>
        <p><strong>Last Updated:</strong> 6/8/2025</p>
        
        <h2>Who We Are</h2>
        <p>RoboSouth LA operates a workflow automation platform accessible at https://www.robosouthla.com, offering automation services and integrations, including support for third-party platforms such as Google Workspace and QuickBooks Online.</p>
        
        <h2>QuickBooks Data</h2>
        <p>When you connect QuickBooks Online, we may access company information, customer data, invoices, and financial reports solely to enable your authorized business automation workflows. This data is encrypted and never shared with third parties.</p>
        
        <p><strong>Contact:</strong> privacy@robosouthla.com</p>
        <p><a href="/dashboard">← Back to Dashboard</a></p>
      </div>
    </body>
    </html>
  `);
});










// Delete customer route
app.delete('/admin/customer/:id', async (req, res) => {
  try {
    const customerId = req.params.id;

    // Get customer info before deleting for logging
    const customer = await getCustomerById(customerId);

    await new Promise((resolve, reject) => {
      db.run('DELETE FROM customers WHERE id = ?', [customerId], function (err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });

    console.log(`Customer deleted: ${customer ? customer.email : customerId}`);

    res.json({
      success: true,
      message: `Customer deleted successfully`,
      customerEmail: customer ? customer.email : 'Unknown'
    });
  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({ error: error.message });
  }
});








// Google disconnect route start
app.post('/auth/google/disconnect', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const customerId = req.user.id;
    console.log('Disconnecting Google for user:', req.user.email);

    // Remove Google tokens from database
    const stmt = db.prepare(`
      UPDATE customers 
      SET google_access_token = NULL, 
          google_refresh_token = NULL, 
          scopes = NULL, 
          token_expiry = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run([customerId], function (err) {
      if (err) {
        console.error('Error disconnecting Google:', err);
        return res.status(500).json({ error: 'Failed to disconnect' });
      }

      console.log('Google disconnected successfully for:', req.user.email);
      
      // Clear the user's Google data from the session/passport
      req.user.google_access_token = null;
      req.user.google_refresh_token = null;
      req.user.scopes = null;
      req.user.token_expiry = null;
      
      // Return JSON response for JavaScript to handle
      res.json({ success: true, message: 'Google disconnected successfully' });
    });

    stmt.finalize();

  } catch (error) {
    console.error('Disconnect error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});
// Google disconnect route end




app.get('/admin', async (req, res) => {
  try {
    const customers = await getAllCustomers();
    const customerRows = await Promise.all(customers.map(async customer => {
      let googleTokenStatus = 'Unknown';
      if (customer.google_access_token) {
        try {
          // Use live Google API validation (same as our cURL tests)
          const response = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${customer.google_access_token}`);
          if (response.ok) {
            const tokenInfo = await response.json();
            const expiresIn = parseInt(tokenInfo.expires_in);
            googleTokenStatus = `Valid (${expiresIn}s)`;
          } else {
            googleTokenStatus = 'Invalid/Expired';
          }
        } catch (error) {
          console.error('Google token validation error:', error.message);
          googleTokenStatus = 'Error checking';
        }
      }
      let qbTokenStatus = 'Not Connected';
      if (customer.qb_access_token && customer.qb_company_id) {
        const qbValidation = await validateQBToken(customer.qb_access_token, customer.qb_company_id);
        qbTokenStatus = qbValidation.valid ? 'Connected' : 'Invalid/Expired';
      }
      return `<tr>
        <td><code style="font-size:12px;">${customer.id}</code></td>
        <td>${customer.email}</td>
        <td>${customer.name}</td>
        <td>
          <span style="padding:2px 8px;border-radius:12px;font-size:11px;background:${googleTokenStatus.includes('Valid') ? '#e8f5e8;color:#2d5a2d' : '#ffeaea;color:#d32f2f'}">${googleTokenStatus}</span>
        </td>
        <td>
          <span style="padding:2px 8px;border-radius:12px;font-size:11px;background:${qbTokenStatus === 'Connected' ? '#e8f5e8;color:#2d5a2d' : qbTokenStatus === 'Not Connected' ? '#f0f0f0;color:#666' : '#ffeaea;color:#d32f2f'}">${qbTokenStatus}</span>
          ${customer.qb_company_id ? `<br><small style="color:#666;">Company: ${customer.qb_company_id}</small>` : ''}
        </td>
        <td>${new Date(customer.created_at).toLocaleDateString()}</td>
        <td>
          <button onclick="copyToClipboard('${customer.id}')" 
                  style="padding:5px 10px;background:#7c3aed;color:white;border:none;border-radius:4px;cursor:pointer;margin:2px;font-size:11px;">
            Copy Customer ID
          </button><br>
          <button onclick="copyToClipboard('${customer.google_access_token || 'N/A'}')" 
                  style="padding:5px 10px;background:#4285f4;color:white;border:none;border-radius:4px;cursor:pointer;margin:2px;font-size:11px;">
            Copy Google Token
          </button><br>
          ${customer.qb_access_token ? `
          <button onclick="copyToClipboard('${customer.qb_access_token}')" 
                  style="padding:5px 10px;background:#0077C5;color:white;border:none;border-radius:4px;cursor:pointer;margin:2px;font-size:11px;">
            Copy QB Token
          </button><br>` : `
          <span style="font-size:11px;color:#999;">No QB Token</span><br>
          `}
          <button onclick="deleteCustomer('${customer.id}', '${customer.email}')" 
                  style="padding:5px 10px;background:#dc3545;color:white;border:none;border-radius:4px;cursor:pointer;margin:2px;font-size:11px;">
            Delete Customer
          </button>
        </td>
      </tr>`;
    }));



    const connectedCustomers = customers.filter(c => c.google_access_token && c.qb_access_token).length;
    const googleOnlyCustomers = customers.filter(c => c.google_access_token && !c.qb_access_token).length;
    const qbOnlyCustomers = customers.filter(c => !c.google_access_token && c.qb_access_token).length;

    res.send(`
      <html>
      <head>
        <title>Admin - Customer Management</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
          .container { max-width: 1400px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
          table { width: 100%; border-collapse: collapse; background: white; margin: 20px 0; }
          th, td { padding: 8px; text-align: left; border: 1px solid #ddd; font-size: 13px; }
          th { background-color: #f9fafb; font-weight: 600; }
          .btn { background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; }
          .info-box { background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
          .stat-card { background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center; border-left: 4px solid #007bff; }
          .stat-number { font-size: 24px; font-weight: bold; color: #333; }
          .stat-label { font-size: 12px; color: #666; text-transform: uppercase; margin-top: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>👥 Customer Management Dashboard</h1>
          
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-number">${customers.length}</div>
              <div class="stat-label">Total Customers</div>
            </div>
            <div class="stat-card" style="border-left-color: #28a745;">
              <div class="stat-number">${connectedCustomers}</div>
              <div class="stat-label">Fully Connected</div>
            </div>
            <div class="stat-card" style="border-left-color: #4285f4;">
              <div class="stat-number">${googleOnlyCustomers}</div>
              <div class="stat-label">Google Only</div>
            </div>
            <div class="stat-card" style="border-left-color: #0077C5;">
              <div class="stat-number">${qbOnlyCustomers}</div>
              <div class="stat-label">QuickBooks Only</div>
            </div>
          </div>
          
          <div class="info-box">
            <h3>🔗 Integration Status Overview</h3>
            <p><strong>Fully Connected:</strong> Customers with both Google and QuickBooks authorization</p>
            <p><strong>Available Integrations:</strong></p>
            <ul style="text-align: left;">
              <li><strong>Google Workspace:</strong> Sheets, Gmail, Calendar, Contacts, Drive</li>
              <li><strong>QuickBooks:</strong> Accounting data access (Environment: ${QB_ENVIRONMENT})</li>
            </ul>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>Customer ID</th>
                <th>Email</th>
                <th>Name</th>
                <th>Google Status</th>
                <th>QuickBooks Status</th>
                <th>Registered</th>
                <th>API Integration</th>
              </tr>
            </thead>
            <tbody>
              ${customerRows.join('')}
            </tbody>
          </table>
          
          <div class="info-box">
            <h3>🔧 N8N Integration Guide</h3>
            <ol>
              <li><strong>Copy Customer ID</strong> from the table above</li>
              <li><strong>Google API:</strong> Use <code>GET /api/customer/{id}</code> for Google tokens</li>
              <li><strong>QuickBooks API:</strong> Use <code>GET /api/customer/{id}/quickbooks/tokens</code> for QB tokens</li>
              <li><strong>Status Check:</strong> Use <code>GET /api/customer/{id}/quickbooks</code> to verify QB connection</li>
            </ol>
            
            <h4>Environment Variables Needed:</h4>
            <ul style="font-family: monospace; font-size: 13px; background: #f8f9fa; padding: 15px; border-radius: 6px;">
              <li>QB_CLIENT_ID_PROD=your_production_app_id</li>
              <li>QB_CLIENT_SECRET_PROD=your_production_app_secret</li>
              <li>QB_CLIENT_ID_SANDBOX=your_sandbox_app_id</li>
              <li>QB_CLIENT_SECRET_SANDBOX=your_sandbox_app_secret</li>
              <li>QB_ENVIRONMENT=production (or sandbox for testing)</li>
            </ul>
          </div>
          
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 20px;">
            <a href="/" class="btn">← Back to Portal</a>
            <a href="/logout" class="btn" style="background: #dc3545; color: white;" onclick="return confirm('Are you sure you want to logout?')">
              🚪 Logout
            </a>
          </div>
        </div>
        
        <script>
          function copyToClipboard(text) {
            if (text === 'N/A') {
              alert('No token available');
              return;
            }
            navigator.clipboard.writeText(text).then(() => {
              alert('Copied to clipboard!');
            }).catch(err => {
              const textArea = document.createElement('textarea');
              textArea.value = text;
              document.body.appendChild(textArea);
              textArea.select();
              document.execCommand('copy');
              document.body.removeChild(textArea);
              alert('Copied to clipboard!');
            });
          }

          async function deleteCustomer(customerId, customerEmail) {
            if (!confirm(\`Are you sure you want to delete customer: \${customerEmail}?\\n\\nCustomer ID: \${customerId}\\n\\nThis action cannot be undone.\`)) {
              return;
            }
            
            try {
              const response = await fetch(\`/admin/customer/\${customerId}\`, {
                method: 'DELETE',
                headers: {
                  'Content-Type': 'application/json'
                }
              });
              
              const result = await response.json();
              
              if (response.ok) {
                alert(\`Customer \${result.customerEmail} deleted successfully!\`);
                location.reload();
              } else {
                alert('Failed to delete customer: ' + result.error);
              }
            } catch (error) {
              alert('Error deleting customer: ' + error.message);
            }
          }
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send('Error loading customers: ' + error.message);
  }
});


















// =============================================================================
// GOOGLE TOKEN ROUTE
// =============================================================================

app.get('/api/customer/:id/google/tokens', async (req, res) => {
  try {
    console.log('Google API call for customer:', req.params.id);
    const customer = await getCustomerById(req.params.id);

    if (!customer) {
      console.log('Customer not found:', req.params.id);
      return res.status(404).json({
        error: 'customer_not_found',
        message: 'Customer not found. Please authenticate first.',
        authUrl: `https://auth.robosouthla.com/auth/google`
      });
    }

    if (!customer.google_access_token) {
      console.log('No Google token found for:', customer.email);
      return res.status(403).json({
        error: 'no_google_token',
        message: 'No Google access token found. Please re-authenticate with Google.',
        authUrl: `https://auth.robosouthla.com/auth/google`
      });
    }

    console.log('Customer found, validating Google token for:', customer.email);
    const tokenValidation = await validateToken(customer.google_access_token);

    if (!tokenValidation.valid) {
      console.log('Google token validation failed for:', customer.email);
      return res.status(403).json({
        error: 'invalid_google_token',
        message: 'Google access token is invalid or expired. Please re-authenticate with Google.',
        authUrl: `https://auth.robosouthla.com/auth/google`
      });
    }

    res.json({
      integration: 'google',
      customer_id: customer.id,
      email: customer.email,
      name: customer.name,
      accessToken: customer.google_access_token,
      refreshToken: customer.google_refresh_token,
      scopes: tokenValidation.scopes,
      expiresIn: tokenValidation.expires_in,
      createdAt: customer.created_at,
      connected: true
    });

  } catch (error) {
    console.error('Google API error:', error);
    res.status(500).json({
      error: 'internal_error',
      message: 'Internal server error'
    });
  }
});
// =============================================================================
// GOOGLE TOKEN ROUTE
// =============================================================================






// =============================================================================
// GOOGLE STATUS ROUTE
// =============================================================================


// Get Google connection status only
app.get('/api/customer/:id/google/status', async (req, res) => {
  try {
    const customer = await getCustomerById(req.params.id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    if (!customer.google_access_token) {
      return res.json({
        integration: 'google',
        connected: false,
        message: 'Google not connected',
        authUrl: `https://auth.robosouthla.com/auth/google`
      });
    }

    const validation = await validateToken(customer.google_access_token);

    res.json({
      integration: 'google',
      connected: validation.valid,
      expiresIn: validation.expires_in,
      scopes: validation.scopes,
      tokenExpiry: customer.token_expiry
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// =============================================================================
// GOOGLE STATUS ROUTE
// =============================================================================








// =============================================================================
// GOOGLE REFRESH ROUTE
// =============================================================================


app.post('/api/customer/:id/google/refresh', async (req, res) => {
  try {
    const customer = await getCustomerById(req.params.id);

    if (!customer?.google_refresh_token) {
      return res.status(404).json({
        success: false,
        error: 'no_refresh_token',
        message: 'No Google refresh token found for customer'
      });
    }

    console.log('🔄 Refreshing Google tokens for:', customer.email);

    // Google OAuth2 token refresh
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: customer.google_refresh_token,
        grant_type: 'refresh_token'
      })
    });

    const tokenData = await tokenResponse.json();
    
    console.log('📊 Google Token Response:', JSON.stringify(tokenData, null, 2));
    console.log('📊 Has access_token?', !!tokenData?.access_token);
    
    if (tokenData?.access_token) {
      const expiresIn = tokenData.expires_in || 3600; // Google tokens typically expire in 1 hour
      const newExpiry = new Date(Date.now() + (expiresIn * 1000));
      
      // Update database with new tokens
      await updateCustomerGoogleTokens(customer.id, {
        googleAccessToken: tokenData.access_token,
        googleRefreshToken: tokenData.refresh_token || customer.google_refresh_token, // Google may not always return new refresh token
        googleTokenExpiry: newExpiry,
        googleScopes: customer.google_scopes // Keep existing scopes
      });

      console.log('✅ Google tokens refreshed successfully for:', customer.email);

      res.json({
        success: true,
        accessToken: tokenData.access_token,
        tokenExpiry: newExpiry.toISOString(),
        expiresIn: expiresIn,
        scopes: customer.google_scopes,
        message: 'Google tokens refreshed successfully'
      });
    } else {
      console.log('❌ No access_token found in Google response');
      console.log('❌ Google Error:', tokenData.error_description || tokenData.error);
      throw new Error(tokenData.error_description || 'Invalid refresh response from Google');
    }
  } catch (error) {
    console.error('❌ Google token refresh failed:', error.message);
    res.status(400).json({
      success: false,
      error: 'refresh_failed',
      message: 'Google token refresh failed. Customer may need to re-authenticate.',
      details: error.message
    });
  }
});

async function updateCustomerGoogleTokens(customerId, googleData) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(`
      UPDATE customers 
      SET google_access_token = ?, google_refresh_token = ?, 
          token_expiry = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    stmt.run([
      googleData.googleAccessToken,
      googleData.googleRefreshToken,
      googleData.googleTokenExpiry.toISOString(), // Convert to ISO string like your existing code
      customerId
    ], function (err) {
      if (err) {
        console.error('❌ Failed to update Google tokens in database:', err);
        reject(err);
      } else {
        console.log('✅ Updated Google tokens in database for customer:', customerId, '- Rows changed:', this.changes);
        resolve(this.changes);
      }
    });

    stmt.finalize();
  });
}

// =============================================================================
// GOOGLE REFRESH ROUTE
// =============================================================================

// =============================================================================
// GOOGLE LIVE STATUS ROUTE
// =============================================================================

app.get('/api/customer/:id/google/status/live', async (req, res) => {
  const customer = await getCustomerById(req.params.id);
  
  const response = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${customer.google_access_token}`);
  
  if (response.ok) {
    const data = await response.json();
    res.json({
      status: `Valid (${data.expires_in}s)`,
      expires_in: data.expires_in,
      email: data.email,
      scopes: data.scope.split(' ').length + ' scopes'
    });
  } else {
    res.json({ status: 'Invalid', valid: false });
  }
});

// =============================================================================
// GOOGLE LIVE STATUS ROUTE
// =============================================================================












// =============================================================================
// QUICKBOOKS ROUTEs
// =============================================================================


// Get QuickBooks start
app.get('/api/customer/:id/quickbooks', async (req, res) => {
  try {
    const customer = await getCustomerById(req.params.id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    if (!customer.qb_access_token) {
      return res.json({
        connected: false,
        message: 'QuickBooks not connected',
        authUrl: `https://auth.robosouthla.com/auth/quickbooks/standalone`
      });
    }

    // Only validate QuickBooks, ignore Google completely
    const validation = await validateQBToken(customer.qb_access_token, customer.qb_company_id);

    res.json({
      connected: validation.valid,
      companyId: customer.qb_company_id,
      baseUrl: customer.qb_base_url,
      environment: QB_ENVIRONMENT,
      tokenValid: validation.valid,
      tokenExpiry: customer.qb_token_expiry
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// Get QuickBooks end





// Get QuickBooks status start
app.get('/api/customer/:id/quickbooks/status', async (req, res) => {
  try {
    const customer = await getCustomerById(req.params.id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    if (!customer.qb_access_token) {
      return res.json({
        integration: 'quickbooks',
        connected: false,
        message: 'QuickBooks not connected',
        authUrl: `https://auth.robosouthla.com/auth/quickbooks/standalone`
      });
    }

    const validation = await validateQBToken(customer.qb_access_token, customer.qb_company_id);

    res.json({
      integration: 'quickbooks',
      connected: validation.valid,
      companyId: customer.qb_company_id,
      baseUrl: customer.qb_base_url,
      environment: QB_ENVIRONMENT,
      tokenValid: validation.valid,
      tokenExpiry: customer.qb_token_expiry
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get QuickBooks status end



// Get QuickBooks refresh start
app.post('/api/customer/:id/quickbooks/refresh', async (req, res) => {
  try {
    const customer = await getCustomerById(req.params.id);

    if (!customer?.qb_refresh_token) {
      return res.status(404).json({
        success: false,
        error: 'no_refresh_token',
        message: 'No refresh token found for customer'
      });
    }

    console.log('🔄 Refreshing QB tokens for:', customer.email);
    console.log('🔍 Environment:', QB_ENVIRONMENT);

    // Use your existing QB OAuth client
    const tokenResponse = await qbOAuthClient.refreshUsingToken(customer.qb_refresh_token);
    
    // Extract the actual token data
    const newToken = tokenResponse.getToken(); // This is the key change!
    
    console.log('📊 Extracted Token:', JSON.stringify(newToken, null, 2));
    console.log('📊 Has access_token?', !!newToken?.access_token);
    
    if (newToken?.access_token) {
      const newExpiry = new Date(Date.now() + (newToken.expires_in * 1000));
      
      // Update database with new tokens
      await updateCustomerQBTokens(customer.id, {
        qbAccessToken: newToken.access_token,
        qbRefreshToken: newToken.refresh_token || customer.qb_refresh_token,
        qbTokenExpiry: newExpiry,
        qbCompanyId: customer.qb_company_id,
        qbBaseUrl: customer.qb_base_url
      });

      console.log('✅ Tokens refreshed successfully for:', customer.email);

      res.json({
        success: true,
        accessToken: newToken.access_token,
        tokenExpiry: newExpiry.toISOString(),
        expiresIn: newToken.expires_in,
        message: 'Tokens refreshed successfully'
      });
    } else {
      console.log('❌ No access_token found in extracted token');
      throw new Error('Invalid refresh response from QuickBooks');
    }
  } catch (error) {
    console.error('❌ Token refresh failed:', error.message);
    res.status(400).json({
      success: false,
      error: 'refresh_failed',
      message: 'QuickBooks token refresh failed. Customer may need to re-authenticate.'
    });
  }
});
// Get QuickBooks refresh end


// Get QuickBooks tokens start
app.get('/api/customer/:id/quickbooks/tokens', async (req, res) => {
  try {
    const customer = await getCustomerById(req.params.id);

    if (!customer) {
      return res.status(404).json({
        error: 'customer_not_found',
        message: 'Customer not found'
      });
    }

    if (!customer.qb_access_token || !customer.qb_company_id) {
      return res.status(403).json({
        error: 'quickbooks_not_connected',
        message: 'QuickBooks not connected. Please authorize first.',
        authUrl: `https://auth.robosouthla.com/auth/quickbooks/standalone`
      });
    }

    const qbValidation = await validateQBToken(customer.qb_access_token, customer.qb_company_id);

    if (!qbValidation.valid) {
      return res.status(403).json({
        error: 'invalid_quickbooks_token',
        message: 'QuickBooks token is invalid or expired. Please re-authorize.',
        authUrl: `https://auth.robosouthla.com/auth/quickbooks/standalone`
      });
    }

    res.json({
      integration: 'quickbooks',
      customer_id: customer.id,
      accessToken: customer.qb_access_token,
      refreshToken: customer.qb_refresh_token,
      companyId: customer.qb_company_id,
      baseUrl: customer.qb_base_url,
      environment: QB_ENVIRONMENT,
      tokenExpiry: customer.qb_token_expiry,
      connected: true
    });

  } catch (error) {
    console.error('QuickBooks API error:', error);
    res.status(500).json({ error: error.message });
  }
});
// Get QuickBooks tokens end



// =============================================================================
// QUICKBOOKS ROUTEs
// =============================================================================






















// =============================================================================
// GENERAL STATUS ROUTES
// =============================================================================

// Get all integrations status for a customer start 
app.get('/api/customer/:id/integrations', async (req, res) => {
  try {
    const customer = await getCustomerById(req.params.id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Check Google status
    let googleStatus = { connected: false, integration: 'google' };
    if (customer.google_access_token) {
      const googleValidation = await validateToken(customer.google_access_token);
      googleStatus = {
        integration: 'google',
        connected: googleValidation.valid,
        expiresIn: googleValidation.expires_in,
        scopes: googleValidation.scopes,
        authUrl: `https://auth.robosouthla.com/auth/google`
      };
    }

    // Check QuickBooks status
    let quickbooksStatus = { connected: false, integration: 'quickbooks' };
    if (customer.qb_access_token && customer.qb_company_id) {
      const qbValidation = await validateQBToken(customer.qb_access_token, customer.qb_company_id);
      quickbooksStatus = {
        integration: 'quickbooks',
        connected: qbValidation.valid,
        companyId: customer.qb_company_id,
        environment: QB_ENVIRONMENT,
        authUrl: `https://auth.robosouthla.com/auth/quickbooks/standalone`
      };
    }

    res.json({
      customer_id: customer.id,
      email: customer.email,
      name: customer.name,
      integrations: {
        google: googleStatus,
        quickbooks: quickbooksStatus
      },
      createdAt: customer.created_at
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all integrations status for a customer end






// Get specific integration status
app.get('/api/customer/:id/integration/:service/status', async (req, res) => {
  const { id, service } = req.params;

  // Redirect to specific integration status endpoint
  switch (service.toLowerCase()) {
    case 'google':
      return res.redirect(`/api/customer/${id}/google/status`);
    case 'quickbooks':
    case 'qb':
      return res.redirect(`/api/customer/${id}/quickbooks/status`);
    default:
      return res.status(400).json({
        error: 'invalid_integration',
        message: `Integration '${service}' not supported`,
        supported: ['google', 'quickbooks']
      });
  }
});


// =============================================================================
// END OF GENERAL STATUS ROUTES
// =============================================================================























// =============================================================================
// FACEBOOK INTEGRATION ROUTES
// =============================================================================



// Facebook init route start
app.get('/auth/facebook', passport.authenticate('facebook', { scope: ['email'] }));
// Facebook init route start





// Facebook callback route start
app.get('/auth/facebook/callback',
  passport.authenticate('facebook', { failureRedirect: '/login?fb_error=1' }),
  (req, res) => {
    req.session.authenticated = true;
    req.session.userInfo = {
      email: req.user.email,
      name: req.user.name,
      role: 'facebook_user',
      customerId: req.user.id,
      authType: 'facebook'
    };
    req.session.save(() => res.redirect('/dashboard'));
  }
);
// Facebook callback route end






// Facebook disconnect route start
app.post('/auth/facebook/disconnect', async (req, res) => {
  try {
    if (!req.session?.authenticated || !req.session?.userInfo || req.session.userInfo.authType !== 'facebook') {
      return res.status(401).json({ error: 'Not authenticated with Facebook' });
    }

    const customerId = req.session.userInfo.customerId;
    console.log('Disconnecting Facebook for user:', req.session.userInfo.email);

    // Remove the customer record completely for Facebook users
    // since they don't have Google integration to preserve
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM customers WHERE id = ?', [customerId], function (err) {
        if (err) reject(err);
        else resolve(this.changes);
      });
    });

    console.log('Facebook customer record deleted:', req.session.userInfo.email);

    // Destroy session
    req.session.destroy((err) => {
      if (err) {
        console.error('Error destroying session:', err);
        return res.status(500).json({ error: 'Failed to disconnect' });
      }
      
      console.log('Facebook disconnected successfully');
      res.json({ success: true, message: 'Facebook disconnected successfully' });
    });

  } catch (error) {
    console.error('Facebook disconnect error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});
// Facebook disconnect route end





// Facebook API status route start
app.get('/api/customer/:id/facebook/status', async (req, res) => {
  try {
    const customer = await getCustomerById(req.params.id);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Check if this is a Facebook user by looking at the ID pattern or email
    const isFacebookUser = customer.id.startsWith('fb_') || customer.email.includes('@facebook.com');

    res.json({
      integration: 'facebook',
      connected: isFacebookUser,
      customerType: isFacebookUser ? 'facebook' : 'other',
      email: customer.email,
      name: customer.name,
      authUrl: 'https://auth.robosouthla.com/auth/facebook'
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// Facebook API status route end

// =============================================================================
// FACEBOOK INTEGRATION ROUTES
// =============================================================================




// =============================================================================
// End of routes
// =============================================================================










app.listen(PORT, '0.0.0.0', () => {
  console.log(`Portal running on port ${PORT}`);
  console.log('Callback URL: https://auth.robosouthla.com/auth/google/callback');
  console.log('Required scopes:', REQUIRED_SCOPES.join(', '));
});
