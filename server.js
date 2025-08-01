// 1. FIRST: All imports
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const {
  router: facebookRouter,
  configureFacebookStrategy,
} = require("./routes/facebook");
const tiktokModule = require("./routes/tiktok");
const tiktokRouter = tiktokModule;
const { configureTikTokStrategy } = tiktokModule;
const adminRouter = require("./routes/admin");
const googleRouter = require("./routes/google");
const quickbooksRouter = require("./routes/quickbooks");
const customersRouter = require("./routes/customers");
const telegramRoutes = require("./routes/telegram");
const utilsRouter = require("./routes/utils");
const authRouter = require("./routes/auth");
const pagesRouter = require("./routes/pages");
const sqlite3 = require("sqlite3").verbose();
const smsRouter = require("./routes/sms");
const { v4: uuidv4 } = require("uuid");
const OAuthClient = require("intuit-oauth");
const crypto = require("crypto");
const fetch = require("node-fetch");
const createDatabaseFunctions = require("./utils/database");
require("dotenv").config();

// 2. SECOND: Basic setup
const app = express();
const PORT = process.env.PORT || 3000;

// 3. THIRD: Database initialization
const dbPath = process.env.DATABASE_PATH || "./data/customers.db";
const db = new sqlite3.Database(dbPath);
const telegramRouter = require("./routes/telegram")(db);
// 4. FOURTH: Constants (after dotenv loads)
const REQUIRED_SCOPES = [
  "profile",
  "email",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/contacts",
  "https://www.googleapis.com/auth/calendar",
];
const QB_SCOPES = [OAuthClient.scopes.Accounting];
const QB_ENVIRONMENT = process.env.QB_ENVIRONMENT || "production";

// 5. FIFTH: OAuth clients (after environment variables are loaded)
const qbOAuthClient = new OAuthClient({
  clientId:
    QB_ENVIRONMENT === "production"
      ? process.env.QB_CLIENT_ID_PROD
      : process.env.QB_CLIENT_ID_SANDBOX,
  clientSecret:
    QB_ENVIRONMENT === "production"
      ? process.env.QB_CLIENT_SECRET_PROD
      : process.env.QB_CLIENT_SECRET_SANDBOX,
  environment: QB_ENVIRONMENT,
  redirectUri: process.env.QB_CALLBACK_URL,
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

// Add multiple spreadsheets support
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS customer_spreadsheets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id TEXT NOT NULL,
    file_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    purpose TEXT,
    selected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers (id),
    UNIQUE(customer_id, file_id)
  )`);

  console.log("✅ Customer spreadsheets table ready");
});

// Add QuickBooks columns to existing customers table
db.serialize(() => {
  db.run(`ALTER TABLE customers ADD COLUMN qb_access_token TEXT`, (err) => {
    if (err && !err.message.includes("duplicate column"))
      console.log("QB access token column exists");
  });

  db.run(`ALTER TABLE customers ADD COLUMN qb_refresh_token TEXT`, (err) => {
    if (err && !err.message.includes("duplicate column"))
      console.log("QB refresh token column exists");
  });

  db.run(`ALTER TABLE customers ADD COLUMN qb_company_id TEXT`, (err) => {
    if (err && !err.message.includes("duplicate column"))
      console.log("QB company ID column exists");
  });

  db.run(`ALTER TABLE customers ADD COLUMN qb_token_expiry DATETIME`, (err) => {
    if (err && !err.message.includes("duplicate column"))
      console.log("QB token expiry column exists");
  });

  db.run(`ALTER TABLE customers ADD COLUMN qb_base_url TEXT`, (err) => {
    if (err && !err.message.includes("duplicate column"))
      console.log("QB base URL column exists");
  });
});

// Add TikTok columns to existing customers table
db.serialize(() => {
  db.run(`ALTER TABLE customers ADD COLUMN tiktok_access_token TEXT`, (err) => {
    if (err && !err.message.includes("duplicate column"))
      console.log("TikTok access token column exists");
  });

  db.run(
    `ALTER TABLE customers ADD COLUMN tiktok_refresh_token TEXT`,
    (err) => {
      if (err && !err.message.includes("duplicate column"))
        console.log("TikTok refresh token column exists");
    }
  );

  db.run(
    `ALTER TABLE customers ADD COLUMN tiktok_token_expiry DATETIME`,
    (err) => {
      if (err && !err.message.includes("duplicate column"))
        console.log("TikTok token expiry column exists");
    }
  );

  db.run(`ALTER TABLE customers ADD COLUMN tiktok_user_id TEXT`, (err) => {
    if (err && !err.message.includes("duplicate column"))
      console.log("TikTok user ID column exists");
  });

  console.log("✅ Database schema updated for TikTok integration");
});

// Add this to your server.js database setup section after your existing ALTER TABLE commands:

// Add Google Picker / Spreadsheet columns to existing customers table
db.serialize(() => {
  // Add spreadsheet selection columns
  db.run(
    `ALTER TABLE customers ADD COLUMN selected_spreadsheet_id TEXT`,
    (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.log("Selected spreadsheet ID column exists");
      }
    }
  );

  db.run(
    `ALTER TABLE customers ADD COLUMN selected_spreadsheet_name TEXT`,
    (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.log("Selected spreadsheet name column exists");
      }
    }
  );

  db.run(
    `ALTER TABLE customers ADD COLUMN spreadsheet_selected_at DATETIME`,
    (err) => {
      if (err && !err.message.includes("duplicate column")) {
        console.log("Spreadsheet selected at column exists");
      }
    }
  );

  console.log("✅ Database schema updated for Google Picker integration");
});

// =============================================================================
// MIDDLEWARE SETUP
// =============================================================================
// Middleware to force HTTPS detection
app.use((req, res, next) => {
  if (req.get("host") === "auth.robosouthla.com") {
    req.headers["x-forwarded-proto"] = "https";
  }
  next();
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Set to true if using HTTPS in production
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
    rolling: true, // Refresh the cookie on each request
  })
);

app.use(passport.initialize());
app.use(passport.session());

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

// Authentication middleware function
function requireAuth(req, res, next) {
  console.log("🔐 Auth check:", {
    sessionAuthenticated: req.session?.authenticated,
    passportAuthenticated: req.isAuthenticated?.(),
    hasUser: !!req.user,
    userEmail: req.user?.email || req.session?.userInfo?.email,
    sessionID: req.sessionID,
    path: req.path,
    method: req.method,
  });

  // Check both authentication methods:
  // 1. Session-based auth (basic login users)
  // 2. Passport-based auth (Google OAuth users)
  const isSessionAuth = req.session?.authenticated === true;
  const isGoogleAuth = req.isAuthenticated?.() && req.user;

  if (isSessionAuth || isGoogleAuth) {
    const userEmail = req.user?.email || req.session?.userInfo?.email;
    console.log("✅ User authenticated:", userEmail);
    return next();
  } else {
    console.log("❌ User not authenticated, redirecting to login");
    return res.redirect("/login");
  }
}

// Admin authentication middleware - only allow specific admin users
function requireAdminAuth(req, res, next) {
  console.log("🔐 Admin auth check:", {
    sessionAuthenticated: req.session?.authenticated,
    passportAuthenticated: req.isAuthenticated?.(),
    hasUser: !!req.user,
    userEmail: req.user?.email || req.session?.userInfo?.email,
    sessionID: req.sessionID,
    path: req.path,
    method: req.method,
  });

  // Check authentication first
  const isSessionAuth = req.session?.authenticated === true;
  const isGoogleAuth = req.isAuthenticated?.() && req.user;

  if (!(isSessionAuth || isGoogleAuth)) {
    console.log("❌ User not authenticated, redirecting to login");
    return res.redirect("/login");
  }

  // Get user email
  const userEmail = req.user?.email || req.session?.userInfo?.email;

  // Define your two admin users
  const ADMIN_EMAILS = (
    process.env.ADMIN_EMAILS || "kylevidrine@me.com,kylemvidrine@gmail.com"
  ).split(",");

  // Check if user is an admin
  if (ADMIN_EMAILS.includes(userEmail)) {
    console.log("✅ Admin user authenticated:", userEmail);
    return next();
  } else {
    console.log("❌ User not authorized as admin:", userEmail);
    return res.status(403).send(`
      <html>
      <head><title>Access Denied</title></head>
      <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
        <h1>🚫 Access Denied</h1>
        <p>Admin privileges required.</p>
        <a href="/dashboard" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">← Back to Dashboard</a>
      </body>
      </html>
    `);
  }
}

// =============================================================================
// PASSPORT CONFIGURATION - START
// =============================================================================

// Passport configuration with proper scopes
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
      scope: REQUIRED_SCOPES,
      accessType: "offline",
      prompt: "consent",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const userEmail = profile.emails[0].value;
        console.log("🔍 Google OAuth for email:", userEmail);

        // STEP 1: Check if a customer with this email already exists
        const existingCustomers = await getAllCustomers();
        const existingCustomer = existingCustomers.find(
          (c) => c.email === userEmail
        );

        if (existingCustomer) {
          // STEP 2: Customer exists - UPDATE their Google tokens but PRESERVE QuickBooks data
          console.log(
            "✅ Found existing customer, merging Google auth:",
            existingCustomer.id
          );

          const mergedCustomerData = {
            id: existingCustomer.id,
            email: userEmail,
            name: profile.displayName,
            picture: profile.photos?.[0]?.value || null,
            accessToken,
            refreshToken,
            scopes: REQUIRED_SCOPES.join(" "),
            tokenExpiry: new Date(Date.now() + 3600 * 1000),

            // PRESERVE EXISTING QUICKBOOKS DATA
            qbAccessToken: existingCustomer.qb_access_token,
            qbRefreshToken: existingCustomer.qb_refresh_token,
            qbCompanyId: existingCustomer.qb_company_id,
            qbTokenExpiry: existingCustomer.qb_token_expiry,
            qbBaseUrl: existingCustomer.qb_base_url,
          };

          await storeCustomer(mergedCustomerData);
          console.log(
            "🎉 Merged Google auth with existing customer (QB preserved):",
            userEmail
          );

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
            scopes: REQUIRED_SCOPES.join(" "),
            tokenExpiry: new Date(Date.now() + 3600 * 1000),
          };

          await storeCustomer(customerData);
          console.log("✅ New Google customer created:", userEmail, customerId);

          return done(null, customerData);
        }
      } catch (error) {
        console.error("❌ Google OAuth error:", error);
        return done(error, null);
      }
    }
  )
);

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

// Import database functions from utils
const {
  storeCustomer,
  getCustomerById,
  getAllCustomers,
  validateToken,
  updateCustomerQBTokens,
  updateCustomerGoogleTokens,
  updateCustomerTikTokTokens,
  validateQBToken,
} = createDatabaseFunctions(db, QB_ENVIRONMENT);

// =============================================================================
// ROUTER CONFIGURATION & DEPENDENCY INJECTION
// =============================================================================

// Make database and helper functions available to routes (legacy support)
app.locals.db = db;
app.locals.getCustomerById = getCustomerById;
app.locals.storeCustomer = storeCustomer;
app.locals.getAllCustomers = getAllCustomers;

// Configure Facebook strategy with helper functions
configureFacebookStrategy(getCustomerById, storeCustomer);

// Configure TikTok strategy with helper functions
configureTikTokStrategy(getCustomerById, storeCustomer);

// =============================================================================
// SHARED DEPENDENCIES FOR ROUTE INJECTION
// =============================================================================
const sharedDependencies = {
  // Database functions
  getAllCustomers,
  getCustomerById,
  storeCustomer,
  updateCustomerGoogleTokens,
  updateCustomerTikTokTokens,
  updateCustomerQBTokens,

  // Validation functions
  validateToken,
  validateQBToken,

  // Configuration
  REQUIRED_SCOPES,
  QB_ENVIRONMENT,

  // External services
  qbOAuthClient,
  passport,
  db,

  // Middleware
  requireAuth,
};

// =============================================================================
// ROUTE REGISTRATION
// =============================================================================

// Core application routes
app.use("/", pagesRouter(sharedDependencies));

// Authentication routes
app.use("/", facebookRouter);
app.use("/", tiktokRouter(sharedDependencies));
app.use("/", googleRouter(sharedDependencies));
app.use(
  "/",
  authRouter({
    getCustomerById,
    QB_ENVIRONMENT,
  })
);

// Integration routes
app.use("/", quickbooksRouter(sharedDependencies));

// API routes
app.use(
  "/",
  customersRouter({
    getAllCustomers,
    getCustomerById,
    validateToken,
    validateQBToken,
    QB_ENVIRONMENT,
  })
);

// SMS routes
app.use("/", smsRouter({ db }));

// Admin & utility routes
app.use(
  "/admin",
  requireAdminAuth,
  adminRouter({
    getAllCustomers,
    getCustomerById,
    validateToken,
    validateQBToken,
    QB_ENVIRONMENT,
    db,
  })
);

app.use(
  "/",
  utilsRouter({
    REQUIRED_SCOPES,
    QB_ENVIRONMENT,
  })
);

app.use("/telegram", telegramRouter);

// Add robots.txt route to block search engines
app.get("/robots.txt", (req, res) => {
  res.type("text/plain");
  res.send(`User-agent: *
Disallow: /`);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Portal running on port ${PORT}`);
  console.log(
    "Callback URL: https://auth.robosouthla.com/auth/google/callback"
  );
  console.log("Required scopes:", REQUIRED_SCOPES.join(", "));
});
