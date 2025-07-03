const express = require("express");

module.exports = function (db) {
  const router = express.Router();

  // Create telegram_mappings table if it doesn't exist
  const createTelegramMappingsTable = () => {
    db.run(
      `
      CREATE TABLE IF NOT EXISTS telegram_mappings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bot_token TEXT UNIQUE NOT NULL,
        customer_id TEXT NOT NULL,
        workflow_type TEXT DEFAULT 'ultimate_assistant',
        bot_name TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `,
      (err) => {
        if (err) {
          console.error("Error creating telegram_mappings table:", err);
        } else {
          console.log("telegram_mappings table ready");
        }
      }
    );
  };

  createTelegramMappingsTable();

  // POST /telegram/register
  router.post("/register", (req, res) => {
    const {
      bot_token,
      customer_id,
      workflow_type = "ultimate_assistant",
      bot_name,
    } = req.body;

    if (!bot_token || !customer_id) {
      return res
        .status(400)
        .json({
          success: false,
          error: "bot_token and customer_id are required",
        });
    }

    if (!bot_token.match(/^\d+:[A-Za-z0-9_-]{35}$/)) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid bot token format" });
    }

    // Check if bot token exists
    db.get(
      "SELECT * FROM telegram_mappings WHERE bot_token = ?",
      [bot_token],
      (err, existingBot) => {
        if (err) {
          console.error(err);
          return res
            .status(500)
            .json({ success: false, error: "Database error" });
        }

        if (existingBot) {
          return res.status(409).json({
            success: false,
            error: "Bot token already registered",
            existing_mapping: {
              customer_id: existingBot.customer_id,
              workflow_type: existingBot.workflow_type,
              bot_name: existingBot.bot_name,
            },
          });
        }

        // Verify customer exists
        db.get(
          "SELECT id FROM customers WHERE id = ?",
          [customer_id],
          (err, customer) => {
            if (err) {
              console.error(err);
              return res
                .status(500)
                .json({ success: false, error: "Database error" });
            }
            if (!customer) {
              return res
                .status(404)
                .json({ success: false, error: "Customer not found" });
            }

            // Insert new bot mapping
            const stmt = db.prepare(`
          INSERT INTO telegram_mappings (bot_token, customer_id, workflow_type, bot_name)
          VALUES (?, ?, ?, ?)
        `);

            stmt.run(
              [bot_token, customer_id, workflow_type, bot_name],
              function (err) {
                if (err) {
                  console.error(err);
                  return res
                    .status(500)
                    .json({ success: false, error: "Database insert error" });
                }
                res.status(201).json({
                  success: true,
                  message: "Bot registered successfully",
                  mapping: {
                    id: this.lastID,
                    bot_token,
                    customer_id,
                    workflow_type,
                    bot_name,
                  },
                });
              }
            );

            stmt.finalize();
          }
        );
      }
    );
  });

  // GET /telegram/lookup/:botToken
  router.get("/lookup/:botToken", (req, res) => {
    const botToken = req.params.botToken;
    const sql = `
      SELECT tm.*, c.email as customer_email, c.name as customer_name
      FROM telegram_mappings tm
      JOIN customers c ON tm.customer_id = c.id
      WHERE tm.bot_token = ? AND tm.is_active = 1
    `;
    db.get(sql, [botToken], (err, row) => {
      if (err) {
        console.error(err);
        return res
          .status(500)
          .json({ success: false, error: "Database error" });
      }
      if (!row) {
        return res
          .status(404)
          .json({ success: false, error: "Bot token not found or inactive" });
      }
      res.json({
        success: true,
        customer_id: row.customer_id,
        workflow_type: row.workflow_type,
        bot_name: row.bot_name,
        customer_info: {
          email: row.customer_email,
          name: row.customer_name,
        },
        registered_at: row.created_at,
      });
    });
  });

  // GET /telegram/customer/:customerId
  router.get("/customer/:customerId", (req, res) => {
    const customerId = req.params.customerId;
    const sql = `
      SELECT * FROM telegram_mappings 
      WHERE customer_id = ? AND is_active = 1
      ORDER BY created_at DESC
    `;
    db.all(sql, [customerId], (err, rows) => {
      if (err) {
        console.error(err);
        return res
          .status(500)
          .json({ success: false, error: "Database error" });
      }
      res.json({
        success: true,
        customer_id: customerId,
        bots: rows.map((bot) => ({
          bot_token: bot.bot_token,
          workflow_type: bot.workflow_type,
          bot_name: bot.bot_name,
          created_at: bot.created_at,
        })),
      });
    });
  });

  // PUT /telegram/update/:botToken
  router.put("/update/:botToken", (req, res) => {
    const botToken = req.params.botToken;
    const { workflow_type, bot_name, is_active } = req.body;

    let updates = [];
    let params = [];

    if (workflow_type !== undefined) {
      updates.push("workflow_type = ?");
      params.push(workflow_type);
    }
    if (bot_name !== undefined) {
      updates.push("bot_name = ?");
      params.push(bot_name);
    }
    if (is_active !== undefined) {
      updates.push("is_active = ?");
      params.push(is_active ? 1 : 0);
    }
    if (updates.length === 0) {
      return res
        .status(400)
        .json({ success: false, error: "No fields to update" });
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");

    const sql = `
      UPDATE telegram_mappings
      SET ${updates.join(", ")}
      WHERE bot_token = ?
    `;
    params.push(botToken);

    db.run(sql, params, function (err) {
      if (err) {
        console.error(err);
        return res
          .status(500)
          .json({ success: false, error: "Database error" });
      }
      if (this.changes === 0) {
        return res
          .status(404)
          .json({ success: false, error: "Bot token not found" });
      }
      res.json({ success: true, message: "Bot updated successfully" });
    });
  });

  // DELETE /telegram/unregister/:botToken
  router.delete("/unregister/:botToken", (req, res) => {
    const botToken = req.params.botToken;
    db.run(
      "DELETE FROM telegram_mappings WHERE bot_token = ?",
      [botToken],
      function (err) {
        if (err) {
          console.error(err);
          return res
            .status(500)
            .json({ success: false, error: "Database error" });
        }
        if (this.changes === 0) {
          return res
            .status(404)
            .json({ success: false, error: "Bot token not found" });
        }
        res.json({ success: true, message: "Bot unregistered successfully" });
      }
    );
  });

  // GET /telegram/health
  router.get("/health", (req, res) => {
    db.get("SELECT 1", [], (err) => {
      if (err) {
        console.error("Health check failed:", err);
        return res
          .status(503)
          .json({
            success: false,
            status: "unhealthy",
            error: "Database connection failed",
          });
      }
      db.get(
        "SELECT COUNT(*) as total, SUM(is_active) as active FROM telegram_mappings",
        [],
        (err, row) => {
          if (err) {
            console.error(err);
            return res
              .status(500)
              .json({ success: false, error: "Database error" });
          }
          res.json({
            success: true,
            status: "healthy",
            database: "connected",
            stats: {
              total_bots: row.total,
              active_bots: row.active || 0,
            },
            timestamp: new Date().toISOString(),
          });
        }
      );
    });
  });

  return router;
};
