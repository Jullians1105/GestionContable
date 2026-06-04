const jwt = require('jsonwebtoken');
const env = require('../config/env');

const sign = (payload) =>
  jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });

const signRefresh = (payload) =>
  jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_EXPIRES_IN });

const verify = (token) =>
  jwt.verify(token, env.JWT_SECRET);

const verifyRefresh = (token) =>
  jwt.verify(token, env.JWT_REFRESH_SECRET);

module.exports = { sign, signRefresh, verify, verifyRefresh };
