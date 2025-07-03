// ========================================
// FILE: utils/middleware.js
// ========================================

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

module.exports = { requireAuth };
