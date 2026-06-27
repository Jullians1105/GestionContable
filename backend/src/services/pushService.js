const webpush = require('web-push');
const db = require('../config/database');
const logger = require('../utils/logger');
const env = require('../config/env');

if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:${env.VAPID_EMAIL}`,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY
  );
}

async function sendPushToUser(userId, payload) {
  if (!env.VAPID_PUBLIC_KEY) return;
  try {
    const result = await db.query(
      'SELECT * FROM push_subscriptions WHERE user_id = $1',
      [userId]
    );
    if (!result.rows.length) return;

    await Promise.allSettled(
      result.rows.map(async (sub) => {
        const subscription = {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        };
        try {
          await webpush.sendNotification(subscription, JSON.stringify(payload));
        } catch (err) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await db.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
            logger.info({ subId: sub.id }, 'Suscripción push expirada eliminada');
          } else {
            logger.warn({ msg: err.message, userId }, 'Push falló');
          }
        }
      })
    );
  } catch (err) {
    logger.error({ err }, 'Error enviando push notifications');
  }
}

module.exports = { sendPushToUser };
