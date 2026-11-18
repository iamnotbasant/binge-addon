// Vercel serverless entry point: the Express app from index.js is itself
// a valid (req, res) handler.
module.exports = require('../index');
