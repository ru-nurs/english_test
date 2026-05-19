function parseTestRow(row) {
  if (!row) {
    return null;
  }
  if (typeof row.payload_json === "object") {
    return row.payload_json;
  }
  try {
    return JSON.parse(row.payload_json);
  } catch (error) {
    return null;
  }
}

function serializeTest(test) {
  return JSON.stringify(test);
}

function parseJsonOrFallback(raw, fallback) {
  if (raw && typeof raw === "object") {
    return raw;
  }
  try {
    return JSON.parse(String(raw || ""));
  } catch (error) {
    return fallback;
  }
}

function mapUserRow(row, { includePassword = true } = {}) {
  if (!row) {
    return null;
  }
  const user = {
    id: row.id,
    email: row.email,
    displayName: row.display_name || "",
    role: row.role,
    isPro: Boolean(row.is_pro),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (includePassword) {
    user.passwordHash = row.password_hash;
  }
  return user;
}

function mapBillingPaymentRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    planCode: row.plan_code,
    amount: {
      value: row.amount_value,
      currency: row.amount_currency,
    },
    status: row.status,
    paid: Boolean(row.paid),
    confirmationUrl: row.confirmation_url || "",
    returnUrl: row.return_url || "",
    idempotenceKey: row.idempotence_key || "",
    metadata: parseJsonOrFallback(row.metadata_json, {}),
    raw: parseJsonOrFallback(row.raw_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at || "",
  };
}

function createRepositories(db) {
  async function createUser(user) {
    await db.run(
      `INSERT INTO users (id, email, display_name, password_hash, role, is_pro, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        user.email,
        user.displayName || "",
        user.passwordHash,
        user.role,
        Boolean(user.isPro),
        user.createdAt,
        user.updatedAt,
      ]
    );
  }

  async function findUserByEmail(email) {
    const row = await db.get(
      `SELECT id, email, display_name, password_hash, role, is_pro, created_at, updated_at
       FROM users WHERE email = ? LIMIT 1`,
      [email]
    );
    return mapUserRow(row);
  }

  async function findUserById(id) {
    const row = await db.get(
      `SELECT id, email, display_name, password_hash, role, is_pro, created_at, updated_at
       FROM users WHERE id = ? LIMIT 1`,
      [id]
    );
    return mapUserRow(row);
  }

  async function countAdmins() {
    const row = await db.get(`SELECT COUNT(*) AS count FROM users WHERE role = 'admin'`);
    return Number(row?.count || 0);
  }

  async function listUsers() {
    const rows = await db.all(
      `SELECT id, email, display_name, role, is_pro, created_at, updated_at FROM users ORDER BY created_at DESC`
    );
    return rows.map((row) => mapUserRow(row, { includePassword: false }));
  }

  async function updateUserRole(userId, role, updatedAt) {
    const result = await db.run(`UPDATE users SET role = ?, updated_at = ? WHERE id = ?`, [
      role,
      updatedAt,
      userId,
    ]);
    return result.changes > 0;
  }

  async function updateUserPro(userId, isPro, updatedAt) {
    const result = await db.run(`UPDATE users SET is_pro = ?, updated_at = ? WHERE id = ?`, [
      Boolean(isPro),
      updatedAt,
      userId,
    ]);
    return result.changes > 0;
  }

  async function updateUserDisplayName(userId, displayName, updatedAt) {
    const result = await db.run(`UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?`, [
      displayName || "",
      updatedAt,
      userId,
    ]);
    return result.changes > 0;
  }

  async function createSession(session) {
    await db.run(
      `INSERT INTO sessions (
        id, user_id, access_token_hash, refresh_token_hash, access_expires_at,
        refresh_expires_at, created_at, updated_at, revoked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      [
        session.id,
        session.userId,
        session.accessTokenHash,
        session.refreshTokenHash,
        session.accessExpiresAt,
        session.refreshExpiresAt,
        session.createdAt,
        session.updatedAt,
      ]
    );
  }

  async function findSessionWithUserByAccessHash(accessTokenHash, nowIso) {
    const row = await db.get(
      `SELECT
         s.id AS session_id,
         s.user_id,
         s.access_expires_at,
         s.refresh_expires_at,
         s.revoked_at,
         u.id AS user_id_real,
         u.email,
         u.display_name,
         u.password_hash,
         u.role,
         u.is_pro,
         u.created_at,
         u.updated_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.access_token_hash = ?
         AND s.revoked_at IS NULL
         AND s.access_expires_at > ?
       LIMIT 1`,
      [accessTokenHash, nowIso]
    );

    if (!row) {
      return null;
    }

    return {
      session: {
        id: row.session_id,
        userId: row.user_id,
        accessExpiresAt: row.access_expires_at,
        refreshExpiresAt: row.refresh_expires_at,
      },
      user: mapUserRow({
        id: row.user_id_real,
        email: row.email,
        display_name: row.display_name,
        password_hash: row.password_hash,
        role: row.role,
        is_pro: row.is_pro,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }),
    };
  }

  async function findSessionByRefreshHash(refreshTokenHash, nowIso) {
    const row = await db.get(
      `SELECT id, user_id, refresh_expires_at, revoked_at
       FROM sessions
       WHERE refresh_token_hash = ?
         AND revoked_at IS NULL
         AND refresh_expires_at > ?
       LIMIT 1`,
      [refreshTokenHash, nowIso]
    );

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      userId: row.user_id,
      refreshExpiresAt: row.refresh_expires_at,
      revokedAt: row.revoked_at,
    };
  }

  async function rotateSessionTokens({
    sessionId,
    accessTokenHash,
    refreshTokenHash,
    accessExpiresAt,
    refreshExpiresAt,
    updatedAt,
  }) {
    const result = await db.run(
      `UPDATE sessions
       SET access_token_hash = ?, refresh_token_hash = ?, access_expires_at = ?, refresh_expires_at = ?, updated_at = ?
       WHERE id = ? AND revoked_at IS NULL`,
      [accessTokenHash, refreshTokenHash, accessExpiresAt, refreshExpiresAt, updatedAt, sessionId]
    );
    return result.changes > 0;
  }

  async function revokeSessionByAccessHash(accessTokenHash, revokedAt) {
    await db.run(`UPDATE sessions SET revoked_at = ?, updated_at = ? WHERE access_token_hash = ?`, [
      revokedAt,
      revokedAt,
      accessTokenHash,
    ]);
  }

  async function revokeSessionByRefreshHash(refreshTokenHash, revokedAt) {
    await db.run(`UPDATE sessions SET revoked_at = ?, updated_at = ? WHERE refresh_token_hash = ?`, [
      revokedAt,
      revokedAt,
      refreshTokenHash,
    ]);
  }

  async function revokeAllSessionsForUser(userId, revokedAt) {
    await db.run(`UPDATE sessions SET revoked_at = ?, updated_at = ? WHERE user_id = ?`, [
      revokedAt,
      revokedAt,
      userId,
    ]);
  }

  async function cleanupExpiredSessions(now) {
    await db.run(
      `DELETE FROM sessions
       WHERE revoked_at IS NOT NULL
          OR refresh_expires_at <= ?`,
      [now]
    );
  }

  async function listTests() {
    const rows = await db.all(`SELECT payload_json FROM tests ORDER BY created_at ASC`);
    return rows.map(parseTestRow).filter(Boolean);
  }

  async function getTestById(id) {
    const row = await db.get(`SELECT payload_json FROM tests WHERE id = ? LIMIT 1`, [id]);
    return parseTestRow(row);
  }

  async function createTest(test) {
    await db.run(
      `INSERT INTO tests (
        id, title, description, status, access, source, payload_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?)`,
      [
        test.id,
        test.title,
        test.description,
        test.status,
        test.access,
        test.source,
        serializeTest(test),
        test.createdAt,
        test.updatedAt,
      ]
    );
  }

  async function updateTest(test) {
    const result = await db.run(
      `UPDATE tests
       SET title = ?, description = ?, status = ?, access = ?, source = ?, payload_json = ?::jsonb, updated_at = ?
       WHERE id = ?`,
      [
        test.title,
        test.description,
        test.status,
        test.access,
        test.source,
        serializeTest(test),
        test.updatedAt,
        test.id,
      ]
    );
    return result.changes > 0;
  }

  async function setTestStatus(testId, status, updatedAt) {
    const existing = await getTestById(testId);
    if (!existing) {
      return null;
    }
    const updated = { ...existing, status, updatedAt };
    await updateTest(updated);
    return updated;
  }

  async function deleteTestById(testId) {
    const result = await db.run(`DELETE FROM tests WHERE id = ?`, [testId]);
    return result.changes > 0;
  }

  async function listAttemptsByUser(userId) {
    const rows = await db.all(
      `SELECT id, user_id, test_id, task1, task2, task3, total_score, score_source, created_at
       FROM attempts
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [userId]
    );

    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      testId: row.test_id,
      taskScores: {
        task1: row.task1,
        task2: row.task2,
        task3: row.task3,
      },
      totalScore: row.total_score,
      scoreSource: row.score_source || "unverified",
      createdAt: row.created_at,
    }));
  }

  async function createAttempt(attempt) {
    await db.run(
      `INSERT INTO attempts (id, user_id, test_id, task1, task2, task3, total_score, score_source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        attempt.id,
        attempt.userId,
        attempt.testId,
        attempt.taskScores.task1,
        attempt.taskScores.task2,
        attempt.taskScores.task3,
        attempt.totalScore,
        attempt.scoreSource || "unverified",
        attempt.createdAt,
      ]
    );
  }

  async function createBillingPayment(payment) {
    await db.run(
      `INSERT INTO billing_payments (
        id, user_id, provider, plan_code, amount_value, amount_currency, status, paid,
        confirmation_url, return_url, idempotence_key, metadata_json, raw_json,
        created_at, updated_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?, ?)`,
      [
        payment.id,
        payment.userId,
        payment.provider,
        payment.planCode,
        payment.amount?.value || "",
        payment.amount?.currency || "RUB",
        payment.status,
        Boolean(payment.paid),
        payment.confirmationUrl || "",
        payment.returnUrl || "",
        payment.idempotenceKey || "",
        JSON.stringify(payment.metadata || {}),
        JSON.stringify(payment.raw || {}),
        payment.createdAt,
        payment.updatedAt,
        payment.completedAt || null,
      ]
    );
  }

  async function findBillingPaymentById(paymentId) {
    const row = await db.get(
      `SELECT
        id, user_id, provider, plan_code, amount_value, amount_currency, status, paid,
        confirmation_url, return_url, idempotence_key, metadata_json, raw_json,
        created_at, updated_at, completed_at
       FROM billing_payments
       WHERE id = ?
       LIMIT 1`,
      [paymentId]
    );
    return mapBillingPaymentRow(row);
  }

  async function updateBillingPaymentState({
    paymentId,
    status,
    paid,
    confirmationUrl,
    raw,
    metadata,
    updatedAt,
    completedAt,
  }) {
    const current = await findBillingPaymentById(paymentId);
    if (!current) {
      return null;
    }

    const nextStatus = String(status || current.status);
    const nextPaid = typeof paid === "boolean" ? paid : current.paid;
    const nextConfirmationUrl =
      confirmationUrl !== undefined ? String(confirmationUrl || "") : current.confirmationUrl || "";
    const nextRaw = raw !== undefined ? raw : current.raw;
    const nextMetadata = metadata !== undefined ? metadata : current.metadata;
    const nextUpdatedAt = updatedAt || current.updatedAt;
    const nextCompletedAt = completedAt !== undefined ? completedAt : current.completedAt || null;

    const result = await db.run(
      `UPDATE billing_payments
       SET status = ?, paid = ?, confirmation_url = ?, raw_json = ?::jsonb, metadata_json = ?::jsonb, updated_at = ?, completed_at = ?
       WHERE id = ?`,
      [
        nextStatus,
        nextPaid,
        nextConfirmationUrl,
        JSON.stringify(nextRaw || {}),
        JSON.stringify(nextMetadata || {}),
        nextUpdatedAt,
        nextCompletedAt || null,
        paymentId,
      ]
    );

    if (result.changes <= 0) {
      return null;
    }
    return findBillingPaymentById(paymentId);
  }

  return {
    createUser,
    findUserByEmail,
    findUserById,
    countAdmins,
    listUsers,
    updateUserRole,
    updateUserPro,
    updateUserDisplayName,
    createSession,
    findSessionWithUserByAccessHash,
    findSessionByRefreshHash,
    rotateSessionTokens,
    revokeSessionByAccessHash,
    revokeSessionByRefreshHash,
    revokeAllSessionsForUser,
    cleanupExpiredSessions,
    listTests,
    getTestById,
    createTest,
    updateTest,
    setTestStatus,
    deleteTestById,
    listAttemptsByUser,
    createAttempt,
    createBillingPayment,
    findBillingPaymentById,
    updateBillingPaymentState,
  };
}

module.exports = {
  createRepositories,
};
