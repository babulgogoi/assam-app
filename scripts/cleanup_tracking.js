#!/usr/bin/env node
'use strict';

// Deletes click_events older than 365 days. Run monthly via cron:
//   0 3 1 * * cd /home/assam/web/assam.org/private/app && node scripts/cleanup_tracking.js >> /home/assam/logs/cleanup_tracking.log 2>&1

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../src/config/db');

(async () => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM click_events WHERE created_at < NOW() - INTERVAL '365 days'`
    );
    console.log(`[${new Date().toISOString()}] cleanup_tracking: deleted ${rowCount} events older than 365 days`);
  } catch (err) {
    console.error('cleanup_tracking failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
