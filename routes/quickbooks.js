// routes/quickbooks.js
const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");

module.exports = (dependencies) => {
  const {
    getAllCustomers,
    getCustomerById,
    storeCustomer,
    updateCustomerQBTokens,
    validateQBToken,
    qbOAuthClient,
    QB_ENVIRONMENT,
    db,
  } = dependencies;

  // =============================================================================
  // QUICKBOOKS AUTHENTICATION ROUTES
  // =============================================================================

  // Start QuickBooks OAuth
  router.get("/auth/quickbooks", (req, res) => {
    // Check for existing authentication
    if (req.isAuthenticated?.() && req.user) {
      // Google OAuth user
      req.session.customerId = req.user.id;
      console.log(
        "🔗 Google OAuth user connecting QuickBooks:",
        req.user.email
      );
    } else if (req.session?.authenticated && req.session?.userInfo) {
      // Basic auth user - don't set customerId yet, let callback handle it
      console.log(
        "🔗 Basic auth user connecting QuickBooks:",
        req.session.userInfo.email
      );
    } else {
      return res.redirect("/?error=login_required");
    }

    const authUri = qbOAuthClient.authorizeUri({
      scope: ["com.intuit.quickbooks.accounting"],
      state: crypto.randomBytes(16).toString("hex"),
    });

    res.redirect(authUri);
  });

  // Standalone QuickBooks OAuth (doesn't require existing auth)
  router.get("/auth/quickbooks/standalone", (req, res) => {
    // Check if user is already authenticated
    if (req.isAuthenticated?.() && req.user) {
      // Redirect to regular QB auth for Google users
      return res.redirect("/auth/quickbooks");
    } else if (req.session?.authenticated && req.session?.userInfo) {
      // Redirect to regular QB auth for basic auth users
      return res.redirect("/auth/quickbooks");
    } else {
      // True standalone auth - create temp ID
      const tempId = uuidv4();
      req.session.tempQBAuthId = tempId;
      console.log(
        "🔗 Starting standalone QuickBooks auth with temp ID:",
        tempId
      );
    }

    const authUri = qbOAuthClient.authorizeUri({
      scope: ["com.intuit.quickbooks.accounting"],
      state: crypto.randomBytes(16).toString("hex"),
    });

    res.redirect(authUri);
  });

  // QuickBooks OAuth callback
  router.get("/auth/quickbooks/callback", async (req, res) => {
    try {
      if (req.query.error) {
        console.error("QuickBooks OAuth error:", req.query.error);
        return res.redirect("/auth-result?qb_error=auth_failed");
      }

      const authResponse = await qbOAuthClient.createToken(req.url);
      const token = authResponse.getToken();

      console.log("QuickBooks auth successful:", {
        companyId: req.query.realmId,
        hasTokens: !!token.access_token,
      });

      const tokenExpiry = new Date(Date.now() + token.expires_in * 1000);
      const baseUrl =
        QB_ENVIRONMENT === "sandbox"
          ? "https://sandbox-quickbooks.api.intuit.com"
          : "https://quickbooks.api.intuit.com";

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
        console.log(
          "🔗 Adding QuickBooks to existing Google OAuth customer:",
          customerId,
          req.user.email
        );
      } else if (req.session?.authenticated && req.session?.userInfo?.email) {
        // Case 2: Basic auth user adding QuickBooks
        const basicAuthEmail = req.session.userInfo.email;
        console.log(
          "🔗 Basic auth user connecting QuickBooks:",
          basicAuthEmail
        );

        // Check if this basic auth user already has a customer record
        const existingCustomers = await getAllCustomers();
        const existingCustomer = existingCustomers.find(
          (c) => c.email === basicAuthEmail
        );

        if (existingCustomer) {
          // Use existing customer record
          customerId = existingCustomer.id;
          console.log(
            "✅ Found existing customer record for basic auth user:",
            customerId
          );
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
            qbBaseUrl: baseUrl,
          });

          console.log(
            "✅ Created new customer record for basic auth user:",
            customerId,
            basicAuthEmail
          );
        }
      } else if (req.session?.customerId) {
        // Case 3: Session-stored customer ID (fallback)
        customerId = req.session.customerId;
        console.log("🔗 Using session-stored customer ID:", customerId);
      } else if (req.session?.tempQBAuthId) {
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
          qbBaseUrl: baseUrl,
        });

        console.log("✅ Created new QB-only customer:", customerId);
        delete req.session.tempQBAuthId;
      } else {
        // No valid session - redirect to start over
        console.log("❌ No valid session found for QuickBooks callback");
        return res.redirect("/auth-result?qb_error=session_lost");
      }

      // Update or add QuickBooks tokens for the customer
      if (!isNewCustomer) {
        await updateCustomerQBTokens(customerId, {
          qbAccessToken: token.access_token,
          qbRefreshToken: token.refresh_token,
          qbCompanyId: req.query.realmId,
          qbTokenExpiry: tokenExpiry,
          qbBaseUrl: baseUrl,
        });
      }

      console.log(
        "🎉 QuickBooks successfully connected for customer:",
        customerId
      );

      // Redirect to dashboard instead of auth-result for authenticated users
      if (req.session?.authenticated || req.isAuthenticated?.()) {
        res.redirect("/dashboard?qb_success=1");
      } else {
        res.redirect(`/auth-result?qb_success=1&customer_id=${customerId}`);
      }
    } catch (error) {
      console.error("❌ QuickBooks callback error:", error);
      res.redirect("/auth-result?qb_error=token_save_failed");
    }
  });

  // Disconnect QuickBooks (POST)
  router.post("/auth/quickbooks/disconnect", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      await updateCustomerQBTokens(req.user.id, {
        qbAccessToken: null,
        qbRefreshToken: null,
        qbCompanyId: null,
        qbTokenExpiry: null,
        qbBaseUrl: null,
      });

      res.json({ success: true, message: "QuickBooks disconnected" });
    } catch (error) {
      res.status(500).json({ error: "Failed to disconnect QuickBooks" });
    }
  });

  // Disconnect QuickBooks (GET - for QuickBooks-initiated disconnects)
  router.get("/auth/quickbooks/disconnect", async (req, res) => {
    try {
      const realmId = req.query.realmId;

      if (realmId) {
        const customers = await getAllCustomers();
        const customer = customers.find((c) => c.qb_company_id === realmId);

        if (customer) {
          await updateCustomerQBTokens(customer.id, {
            qbAccessToken: null,
            qbRefreshToken: null,
            qbCompanyId: null,
            qbTokenExpiry: null,
            qbBaseUrl: null,
          });

          console.log(
            `QuickBooks disconnected for customer: ${customer.id} (Company: ${realmId})`
          );
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
      console.error("QuickBooks disconnect error:", error);
      res.redirect("/dashboard?qb_error=disconnect_failed");
    }
  });

  // =============================================================================
  // QUICKBOOKS API ROUTES
  // =============================================================================

  // Get QuickBooks status
  router.get("/api/customer/:id/quickbooks", async (req, res) => {
    try {
      const customer = await getCustomerById(req.params.id);

      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }

      if (!customer.qb_access_token) {
        return res.json({
          connected: false,
          message: "QuickBooks not connected",
          authUrl: `${process.env.BASE_URL}/auth/quickbooks/standalone`,
        });
      }

      const validation = await validateQBToken(
        customer.qb_access_token,
        customer.qb_company_id
      );

      res.json({
        connected: validation.valid,
        companyId: customer.qb_company_id,
        baseUrl: customer.qb_base_url,
        environment: QB_ENVIRONMENT,
        tokenValid: validation.valid,
        tokenExpiry: customer.qb_token_expiry,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get QuickBooks status (alternative endpoint)
  router.get("/api/customer/:id/quickbooks/status", async (req, res) => {
    try {
      const customer = await getCustomerById(req.params.id);

      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }

      if (!customer.qb_access_token) {
        return res.json({
          integration: "quickbooks",
          connected: false,
          message: "QuickBooks not connected",
          authUrl: `${process.env.BASE_URL}/auth/quickbooks/standalone`,
        });
      }

      const validation = await validateQBToken(
        customer.qb_access_token,
        customer.qb_company_id
      );

      res.json({
        integration: "quickbooks",
        connected: validation.valid,
        companyId: customer.qb_company_id,
        baseUrl: customer.qb_base_url,
        environment: QB_ENVIRONMENT,
        tokenValid: validation.valid,
        tokenExpiry: customer.qb_token_expiry,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Refresh QuickBooks tokens
  router.post("/api/customer/:id/quickbooks/refresh", async (req, res) => {
    try {
      const customer = await getCustomerById(req.params.id);

      if (!customer?.qb_refresh_token) {
        return res.status(404).json({
          success: false,
          error: "no_refresh_token",
          message: "No refresh token found for customer",
        });
      }

      console.log("🔄 Refreshing QB tokens for:", customer.email);
      console.log("🔍 Environment:", QB_ENVIRONMENT);

      const tokenResponse = await qbOAuthClient.refreshUsingToken(
        customer.qb_refresh_token
      );
      const newToken = tokenResponse.getToken();

      if (newToken?.access_token) {
        const newExpiry = new Date(Date.now() + newToken.expires_in * 1000);

        await updateCustomerQBTokens(customer.id, {
          qbAccessToken: newToken.access_token,
          qbRefreshToken: newToken.refresh_token || customer.qb_refresh_token,
          qbTokenExpiry: newExpiry,
          qbCompanyId: customer.qb_company_id,
          qbBaseUrl: customer.qb_base_url,
        });

        console.log("✅ Tokens refreshed successfully for:", customer.email);

        res.json({
          success: true,
          accessToken: newToken.access_token,
          tokenExpiry: newExpiry.toISOString(),
          expiresIn: newToken.expires_in,
          message: "Tokens refreshed successfully",
        });
      } else {
        console.log("❌ No access_token found in extracted token");
        throw new Error("Invalid refresh response from QuickBooks");
      }
    } catch (error) {
      console.error("❌ Token refresh failed:", error.message);
      res.status(400).json({
        success: false,
        error: "refresh_failed",
        message:
          "QuickBooks token refresh failed. Customer may need to re-authenticate.",
      });
    }
  });

  // Get QuickBooks tokens
  router.get("/api/customer/:id/quickbooks/tokens", async (req, res) => {
    try {
      const customer = await getCustomerById(req.params.id);

      if (!customer) {
        return res.status(404).json({
          error: "customer_not_found",
          message: "Customer not found",
        });
      }

      if (!customer.qb_access_token || !customer.qb_company_id) {
        return res.status(403).json({
          error: "quickbooks_not_connected",
          message: "QuickBooks not connected. Please authorize first.",
          authUrl: `${process.env.BASE_URL}/auth/quickbooks/standalone`,
        });
      }

      const qbValidation = await validateQBToken(
        customer.qb_access_token,
        customer.qb_company_id
      );

      if (!qbValidation.valid) {
        return res.status(403).json({
          error: "invalid_quickbooks_token",
          message:
            "QuickBooks token is invalid or expired. Please re-authorize.",
          authUrl: `${process.env.BASE_URL}/auth/quickbooks/standalone`,
        });
      }

      res.json({
        integration: "quickbooks",
        customer_id: customer.id,
        accessToken: customer.qb_access_token,
        refreshToken: customer.qb_refresh_token,
        companyId: customer.qb_company_id,
        baseUrl: customer.qb_base_url,
        environment: QB_ENVIRONMENT,
        tokenExpiry: customer.qb_token_expiry,
        connected: true,
      });
    } catch (error) {
      console.error("QuickBooks API error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
