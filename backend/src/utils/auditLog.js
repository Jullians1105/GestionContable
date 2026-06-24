const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const logger = require('./logger');

const auditLog = async (userId, action, tableName, recordId, changes = {}) => {
  try {
    await db.query(
      'INSERT INTO audit_log (id, user_id, action, table_name, record_id, changes) VALUES ($1, $2, $3, $4, $5, $6)',
      [uuidv4(), userId, action, tableName, recordId, JSON.stringify(changes)]
    );
  } catch (err) {
    logger.error({ err }, 'Audit log failed');
  }
};

module.exports = auditLog;
