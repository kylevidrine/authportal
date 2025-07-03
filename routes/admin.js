const express = require("express");
const router = express.Router();
const fetch = require("node-fetch");
const path = require("path");

module.exports = (dependencies) => {
  const {
    getAllCustomers,
    getCustomerById,
    validateToken,
    validateQBToken,
    QB_ENVIRONMENT,
    db,
  } = dependencies;

  router.get("/", async (req, res) => {
    try {
      const customers = await getAllCustomers();
      const customerRows = await Promise.all(
        customers.map(async (customer) => {
          let googleTokenStatus = "Unknown";
          if (customer.google_access_token) {
            try {
              // Use live Google API validation (same as our cURL tests)
              const response = await fetch(
                `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${customer.google_access_token}`
              );
              if (response.ok) {
                const tokenInfo = await response.json();
                const expiresIn = parseInt(tokenInfo.expires_in);
                googleTokenStatus = `Valid (${expiresIn}s)`;
              } else {
                googleTokenStatus = "Invalid/Expired";
              }
            } catch (error) {
              console.error("Google token validation error:", error.message);
              googleTokenStatus = "Error checking";
            }
          }
          let qbTokenStatus = "Not Connected";
          if (customer.qb_access_token && customer.qb_company_id) {
            const qbValidation = await validateQBToken(
              customer.qb_access_token,
              customer.qb_company_id
            );
            qbTokenStatus = qbValidation.valid
              ? "Connected"
              : "Invalid/Expired";
          }
          return `<tr>
          <td><code style="font-size:12px;">${customer.id}</code></td>
          <td>${customer.email}</td>
          <td>${customer.name}</td>
          <td>
            <span style="padding:2px 8px;border-radius:12px;font-size:11px;background:${
              googleTokenStatus.includes("Valid")
                ? "#e8f5e8;color:#2d5a2d"
                : "#ffeaea;color:#d32f2f"
            }">${googleTokenStatus}</span>
          </td>
          <td>
            <span style="padding:2px 8px;border-radius:12px;font-size:11px;background:${
              qbTokenStatus === "Connected"
                ? "#e8f5e8;color:#2d5a2d"
                : qbTokenStatus === "Not Connected"
                ? "#f0f0f0;color:#666"
                : "#ffeaea;color:#d32f2f"
            }">${qbTokenStatus}</span>
            ${
              customer.qb_company_id
                ? `<br><small style="color:#666;">Company: ${customer.qb_company_id}</small>`
                : ""
            }
          </td>
          <td>${new Date(customer.created_at).toLocaleDateString()}</td>
          <td>
            <button onclick="copyToClipboard('${customer.id}')" 
                    style="padding:5px 10px;background:#7c3aed;color:white;border:none;border-radius:4px;cursor:pointer;margin:2px;font-size:11px;">
              Copy Customer ID
            </button><br>
            <button onclick="copyToClipboard('${
              customer.google_access_token || "N/A"
            }')" 
                    style="padding:5px 10px;background:#4285f4;color:white;border:none;border-radius:4px;cursor:pointer;margin:2px;font-size:11px;">
              Copy Google Token
            </button><br>
            ${
              customer.qb_access_token
                ? `
            <button onclick="copyToClipboard('${customer.qb_access_token}')" 
                    style="padding:5px 10px;background:#0077C5;color:white;border:none;border-radius:4px;cursor:pointer;margin:2px;font-size:11px;">
              Copy QB Token
            </button><br>`
                : `
            <span style="font-size:11px;color:#999;">No QB Token</span><br>
            `
            }
            <button onclick="deleteCustomer('${customer.id}', '${
            customer.email
          }')" 
                    style="padding:5px 10px;background:#dc3545;color:white;border:none;border-radius:4px;cursor:pointer;margin:2px;font-size:11px;">
              Delete Customer
            </button>
          </td>
        </tr>`;
        })
      );

      const connectedCustomers = customers.filter(
        (c) => c.google_access_token && c.qb_access_token
      ).length;
      const googleOnlyCustomers = customers.filter(
        (c) => c.google_access_token && !c.qb_access_token
      ).length;
      const qbOnlyCustomers = customers.filter(
        (c) => !c.google_access_token && c.qb_access_token
      ).length;

      res.sendFile(path.join(__dirname, "../views/admin.html"));
    } catch (error) {
      res.status(500).send("Error loading customers: " + error.message);
    }
  });

  // Delete customer route
  router.delete("/customer/:id", async (req, res) => {
    try {
      const customerId = req.params.id;

      // Get customer info before deleting for logging
      const customer = await getCustomerById(customerId);

      await new Promise((resolve, reject) => {
        db.run(
          "DELETE FROM customers WHERE id = ?",
          [customerId],
          function (err) {
            if (err) reject(err);
            else resolve(this.changes);
          }
        );
      });

      console.log(
        `Customer deleted: ${customer ? customer.email : customerId}`
      );

      res.json({
        success: true,
        message: `Customer deleted successfully`,
        customerEmail: customer ? customer.email : "Unknown",
      });
    } catch (error) {
      console.error("Delete customer error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
