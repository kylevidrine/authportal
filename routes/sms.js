// routes/sms.js
const express = require("express");
const { v4: uuidv4 } = require("uuid");

module.exports = function (dependencies) {
  const { db } = dependencies;
  const router = express.Router();

  // =============================================================================
  // SMS OPT-IN ROUTES
  // =============================================================================

  // Public SMS opt-in endpoint (no authentication required)
  router.post("/api/sms/public-opt-in", (req, res) => {
    const { email, phone, consent } = req.body;

    // Validation
    if (!email || !phone || !consent) {
      return res.status(400).json({
        success: false,
        message: "Email, phone, and consent are required",
      });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    // Basic phone validation (accepts various formats)
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, "");
    if (!phoneRegex.test(cleanPhone)) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number format",
      });
    }

    console.log("📱 SMS opt-in request:", { email, phone: cleanPhone });

    // Check if email already exists
    db.get(
      "SELECT * FROM sms_signups WHERE email = ?",
      [email],
      (err, existingSignup) => {
        if (err) {
          console.error("Database error checking existing signup:", err);
          return res.status(500).json({
            success: false,
            message: "Database error",
          });
        }

        if (existingSignup) {
          // Update existing record
          const updateStmt = db.prepare(`
          UPDATE sms_signups 
          SET phone = ?, consent = ?, created_at = CURRENT_TIMESTAMP, opt_in_source = ?
          WHERE email = ?
        `);

          updateStmt.run(
            [cleanPhone, consent ? 1 : 0, "login_page", email],
            function (updateErr) {
              if (updateErr) {
                console.error("Database error updating signup:", updateErr);
                return res.status(500).json({
                  success: false,
                  message: "Failed to update signup",
                });
              }

              console.log("✅ SMS signup updated for:", email);
              res.json({
                success: true,
                message: "SMS preferences updated successfully",
                signup: {
                  email,
                  phone: cleanPhone,
                  consent: consent ? 1 : 0,
                  source: "login_page",
                },
              });
            }
          );

          updateStmt.finalize();
        } else {
          // Create new record
          const id = uuidv4();
          const insertStmt = db.prepare(`
          INSERT INTO sms_signups (id, email, phone, consent, opt_in_source)
          VALUES (?, ?, ?, ?, ?)
        `);

          insertStmt.run(
            [id, email, cleanPhone, consent ? 1 : 0, "login_page"],
            function (insertErr) {
              if (insertErr) {
                console.error("Database error creating signup:", insertErr);
                return res.status(500).json({
                  success: false,
                  message: "Failed to save signup",
                });
              }

              console.log("✅ New SMS signup created for:", email);
              res.status(201).json({
                success: true,
                message: "Successfully signed up for SMS notifications",
                signup: {
                  id,
                  email,
                  phone: cleanPhone,
                  consent: consent ? 1 : 0,
                  source: "login_page",
                },
              });
            }
          );

          insertStmt.finalize();
        }
      }
    );
  });

  // Get all SMS signups (admin only)
  router.get("/api/sms/signups", (req, res) => {
    // Simple auth check - only allow if user is authenticated
    if (!req.user && !req.session?.authenticated) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    db.all(
      "SELECT * FROM sms_signups ORDER BY created_at DESC",
      (err, rows) => {
        if (err) {
          console.error("Database error fetching signups:", err);
          return res.status(500).json({
            success: false,
            message: "Database error",
          });
        }

        res.json({
          success: true,
          signups: rows,
        });
      }
    );
  });

  return router;
};
