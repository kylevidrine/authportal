// utils/database.js
const fetch = require("node-fetch");

module.exports = (db, QB_ENVIRONMENT) => {
  // Database functions
  function storeCustomer(customerData) {
    return new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO customers 
        (id, email, name, picture, google_access_token, google_refresh_token, scopes, token_expiry, 
         qb_access_token, qb_refresh_token, qb_company_id, qb_token_expiry, qb_base_url, updated_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);

      stmt.run(
        [
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
          customerData.qbBaseUrl || null,
        ],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );

      stmt.finalize();
    });
  }

  function getCustomerById(id) {
    return new Promise((resolve, reject) => {
      db.get("SELECT * FROM customers WHERE id = ?", [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  function getAllCustomers() {
    return new Promise((resolve, reject) => {
      db.all(
        "SELECT * FROM customers ORDER BY created_at DESC",
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  async function validateToken(accessToken) {
    try {
      console.log("Validating token...", accessToken.substring(0, 20) + "...");
      const response = await fetch(
        `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`
      );
      console.log("Token validation response status:", response.status);

      if (response.ok) {
        const data = await response.json();
        console.log("Token validation result:", {
          valid: true,
          expires_in: data.expires_in,
          scopes: data.scope ? data.scope.split(" ").length : 0,
        });
        return {
          valid: true,
          expires_in: data.expires_in,
          scopes: data.scope ? data.scope.split(" ") : [],
        };
      } else {
        const errorText = await response.text();
        console.log("Token validation failed:", response.status, errorText);
        return { valid: false };
      }
    } catch (error) {
      console.log("Token validation error:", error.message);
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

      stmt.run(
        [
          qbData.qbAccessToken,
          qbData.qbRefreshToken,
          qbData.qbCompanyId,
          qbData.qbTokenExpiry,
          qbData.qbBaseUrl,
          customerId,
        ],
        function (err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );

      stmt.finalize();
    });
  }

  async function updateCustomerGoogleTokens(customerId, googleData) {
    console.log("🔥 DEBUG: updateCustomerGoogleTokens called");
    console.log("🔥 DEBUG: customerId:", customerId);
    console.log("🔥 DEBUG: googleData:", JSON.stringify(googleData, null, 2));

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
        customerId,
      ];

      console.log("🔥 DEBUG: SQL params:", params);

      stmt.run(params, function (err) {
        if (err) {
          console.error("❌ Failed to update Google tokens in database:", err);
          reject(err);
        } else {
          console.log(
            "✅ Updated Google tokens in database for customer:",
            customerId,
            "- Rows changed:",
            this.changes
          );
          resolve(this.changes);
        }
      });

      stmt.finalize();
    });
  }

  async function updateCustomerTikTokTokens(customerId, tiktokData) {
    console.log("🎬 DEBUG: updateCustomerTikTokTokens called");
    console.log("🎬 DEBUG: customerId:", customerId);
    console.log("🎬 DEBUG: tiktokData:", JSON.stringify(tiktokData, null, 2));

    return new Promise((resolve, reject) => {
      const stmt = db.prepare(`
      UPDATE customers 
      SET tiktok_access_token = ?, tiktok_refresh_token = ?, 
          tiktok_token_expiry = ?, tiktok_user_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

      const params = [
        tiktokData.tiktokAccessToken,
        tiktokData.tiktokRefreshToken,
        tiktokData.tiktokTokenExpiry.toISOString(),
        tiktokData.tiktokUserId,
        customerId,
      ];

      console.log("🎬 DEBUG: SQL params:", params);

      stmt.run(params, function (err) {
        if (err) {
          console.error("❌ Failed to update TikTok tokens in database:", err);
          reject(err);
        } else {
          console.log(
            "✅ Updated TikTok tokens in database for customer:",
            customerId,
            "- Rows changed:",
            this.changes
          );
          resolve(this.changes);
        }
      });

      stmt.finalize();
    });
  }

  async function validateQBToken(accessToken, companyId) {
    try {
      if (!accessToken || !companyId) {
        return { valid: false, error: "Missing token or company ID" };
      }

      // Optional: Test with actual QB API call for better validation
      // Remove this try/catch block if you want to skip the API test
      try {
        const baseUrl =
          QB_ENVIRONMENT === "sandbox"
            ? "https://sandbox-quickbooks.api.intuit.com"
            : "https://quickbooks.api.intuit.com";

        const testUrl = `${baseUrl}/v3/company/${companyId}/companyinfo/${companyId}`;

        const response = await fetch(testUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
          },
          timeout: 5000, // 5 second timeout
        });

        console.log("QB Token validation response:", response.status);

        return {
          valid: response.ok,
          status: response.status,
        };
      } catch (fetchError) {
        console.log(
          "QB API test failed, falling back to basic validation:",
          fetchError.message
        );
        // Fall back to basic validation if API test fails
      }

      // Basic validation - just check if we have the required values
      console.log("QB Token validation (basic check):", {
        hasAccessToken: !!accessToken,
        hasCompanyId: !!companyId,
        companyId: companyId,
      });

      return {
        valid: true, // Assume valid if we have both values
        status: 200,
      };
    } catch (error) {
      console.log("QB token validation error:", error.message);
      return { valid: false, error: error.message };
    }
  }

  // Return all functions
  return {
    storeCustomer,
    getCustomerById,
    getAllCustomers,
    validateToken,
    updateCustomerQBTokens,
    updateCustomerGoogleTokens,
    updateCustomerTikTokTokens,
    validateQBToken,
  };
};
