#!/usr/bin/env node
'use strict';

/**
 * One-time script to seed the first admin users.
 * Run once: node scripts/create-superadmin.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function createUser({ username, display_name, email, password, roleName }) {
  const existing = await pool.query('SELECT id FROM admin_users WHERE username = $1', [username]);
  if (existing.rows.length) {
    console.log(`User "${username}" already exists — skipping.`);
    return;
  }

  const password_hash = await bcrypt.hash(password, 12);
  const { rows } = await pool.query(
    `INSERT INTO admin_users (username, display_name, email, password_hash, status)
     VALUES ($1, $2, $3, $4, 'active') RETURNING id`,
    [username, display_name, email, password_hash]
  );
  const userId = rows[0].id;

  const roleRow = await pool.query('SELECT id FROM admin_roles WHERE name = $1', [roleName]);
  if (!roleRow.rows.length) {
    console.error(`Role "${roleName}" not found — user created without role.`);
    return;
  }
  const roleId = roleRow.rows[0].id;

  await pool.query(
    'INSERT INTO admin_user_roles (user_id, role_id) VALUES ($1, $2)',
    [userId, roleId]
  );

  console.log(`Created user "${username}" with role "${roleName}" (id=${userId}).`);
}

async function main() {
  try {
    await createUser({
      username: 'superadmin',
      display_name: 'Super Admin',
      email: 'admin@assam.org',
      password: 'ChangeMe123!',
      roleName: 'superadmin',
    });

    await createUser({
      username: 'editor',
      display_name: 'Editor',
      email: 'editor@assam.org',
      password: 'ChangeMe123!',
      roleName: 'editor',
    });

    console.log('\nDone. Change passwords immediately after first login.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
