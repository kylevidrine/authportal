// ========================================
// FILE: config/middleware.js
// ========================================

const express = require('express');
const session = require('express-session');
const passport = require('passport');

function configureMiddleware(app) {
  // Middleware to force HTTPS detection
  app.use((req, res, next) => {
    if (req.get('host') === 'auth.robosouthla.com') {
      req.headers['x-forwarded-proto'] = 'https';
    }
    next();
  });

  // Basic middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Session configuration
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

  // Passport middleware
  app.use(passport.initialize());
  app.use(passport.session());
}

module.exports = { setupMiddleware: configureMiddleware };
