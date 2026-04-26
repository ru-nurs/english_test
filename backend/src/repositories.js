function parseTestRow(row) {
  if (!row) {
    return null;
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

function createRepositories(db) {
  function createUser(user) {
    db.prepare(
      `INSERT INTO users (id, email, display_name, password_hash, role, is_pro, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      user.id,
      user.email,
      user.displayName || "",
      user.passwordHash,
      user.role,
      user.isPro ? 1 : 0,
      user.createdAt,
      user.updatedAt
    );
  }

  function findUserByEmail(email) {
    const row = db
      .prepare(
        `SELECT id, email, display_name, password_hash, role, is_pro, created_at, updated_at
         FROM users WHERE email = ? LIMIT 1`
      )
      .get(email);

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name || "",
      passwordHash: row.password_hash,
      role: row.role,
      isPro: Boolean(row.is_pro),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function findUserById(id) {
    const row = db
      .prepare(
        `SELECT id, email, display_name, password_hash, role, is_pro, created_at, updated_at
         FROM users WHERE id = ? LIMIT 1`
      )
      .get(id);

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name || "",
      passwordHash: row.password_hash,
      role: row.role,
      isPro: Boolean(row.is_pro),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function countAdmins() {
    const row = db
      .prepare(`SELECT COUNT(*) AS count FROM users WHERE role = 'admin'`)
      .get();
    return Number(row?.count || 0);
  }

  function listUsers() {
    const rows = db
      .prepare(
        `SELECT id, email, display_name, role, is_pro, created_at, updated_at FROM users ORDER BY created_at DESC`
      )
      .all();

    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      displayName: row.display_name || "",
      role: row.role,
      isPro: Boolean(row.is_pro),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  function updateUserRole(userId, role, updatedAt) {
    const result = db
      .prepare(`UPDATE users SET role = ?, updated_at = ? WHERE id = ?`)
      .run(role, updatedAt, userId);
    return result.changes > 0;
  }

  function updateUserPro(userId, isPro, updatedAt) {
    const result = db
      .prepare(`UPDATE users SET is_pro = ?, updated_at = ? WHERE id = ?`)
      .run(isPro ? 1 : 0, updatedAt, userId);
    return result.changes > 0;
  }

  function updateUserDisplayName(userId, displayName, updatedAt) {
    const result = db
      .prepare(`UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?`)
      .run(displayName || "", updatedAt, userId);
    return result.changes > 0;
  }

  function createSession(session) {
    db.prepare(
      `INSERT INTO sessions (
        id, user_id, access_token_hash, refresh_token_hash, access_expires_at,
        refresh_expires_at, created_at, updated_at, revoked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`
    ).run(
      session.id,
      session.userId,
      session.accessTokenHash,
      session.refreshTokenHash,
      session.accessExpiresAt,
      session.refreshExpiresAt,
      session.createdAt,
      session.updatedAt
    );
  }

  function findSessionWithUserByAccessHash(accessTokenHash, nowIso) {
    const row = db
      .prepare(
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
         LIMIT 1`
      )
      .get(accessTokenHash, nowIso);

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
      user: {
        id: row.user_id_real,
        email: row.email,
        displayName: row.display_name || "",
        passwordHash: row.password_hash,
        role: row.role,
        isPro: Boolean(row.is_pro),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    };
  }

  function findSessionByRefreshHash(refreshTokenHash, nowIso) {
    const row = db
      .prepare(
        `SELECT id, user_id, refresh_expires_at, revoked_at
         FROM sessions
         WHERE refresh_token_hash = ?
           AND revoked_at IS NULL
           AND refresh_expires_at > ?
         LIMIT 1`
      )
      .get(refreshTokenHash, nowIso);

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

  function rotateSessionTokens({
    sessionId,
    accessTokenHash,
    refreshTokenHash,
    accessExpiresAt,
    refreshExpiresAt,
    updatedAt,
  }) {
    const result = db
      .prepare(
        `UPDATE sessions
         SET access_token_hash = ?, refresh_token_hash = ?, access_expires_at = ?, refresh_expires_at = ?, updated_at = ?
         WHERE id = ? AND revoked_at IS NULL`
      )
      .run(
        accessTokenHash,
        refreshTokenHash,
        accessExpiresAt,
        refreshExpiresAt,
        updatedAt,
        sessionId
      );

    return result.changes > 0;
  }

  function revokeSessionByAccessHash(accessTokenHash, revokedAt) {
    db.prepare(`UPDATE sessions SET revoked_at = ?, updated_at = ? WHERE access_token_hash = ?`).run(
      revokedAt,
      revokedAt,
      accessTokenHash
    );
  }

  function revokeSessionByRefreshHash(refreshTokenHash, revokedAt) {
    db.prepare(`UPDATE sessions SET revoked_at = ?, updated_at = ? WHERE refresh_token_hash = ?`).run(
      revokedAt,
      revokedAt,
      refreshTokenHash
    );
  }

  function revokeAllSessionsForUser(userId, revokedAt) {
    db.prepare(`UPDATE sessions SET revoked_at = ?, updated_at = ? WHERE user_id = ?`).run(
      revokedAt,
      revokedAt,
      userId
    );
  }

  function cleanupExpiredSessions(now) {
    db.prepare(
      `DELETE FROM sessions
       WHERE revoked_at IS NOT NULL
          OR refresh_expires_at <= ?`
    ).run(now);
  }

  function listTests() {
    const rows = db.prepare(`SELECT payload_json FROM tests ORDER BY created_at ASC`).all();
    return rows.map(parseTestRow).filter(Boolean);
  }

  function getTestById(id) {
    const row = db
      .prepare(`SELECT payload_json FROM tests WHERE id = ? LIMIT 1`)
      .get(id);
    return parseTestRow(row);
  }

  function createTest(test) {
    db.prepare(
      `INSERT INTO tests (
        id, title, description, status, access, source, payload_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      test.id,
      test.title,
      test.description,
      test.status,
      test.access,
      test.source,
      serializeTest(test),
      test.createdAt,
      test.updatedAt
    );
  }

  function updateTest(test) {
    const result = db
      .prepare(
        `UPDATE tests
         SET title = ?, description = ?, status = ?, access = ?, source = ?, payload_json = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        test.title,
        test.description,
        test.status,
        test.access,
        test.source,
        serializeTest(test),
        test.updatedAt,
        test.id
      );

    return result.changes > 0;
  }

  function setTestStatus(testId, status, updatedAt) {
    const existing = getTestById(testId);
    if (!existing) {
      return null;
    }

    const updated = {
      ...existing,
      status,
      updatedAt,
    };

    updateTest(updated);
    return updated;
  }

  function listAttemptsByUser(userId) {
    const rows = db
      .prepare(
        `SELECT id, user_id, test_id, task1, task2, task3, total_score, score_source, created_at
         FROM attempts
         WHERE user_id = ?
         ORDER BY created_at DESC`
      )
      .all(userId);

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

  function createAttempt(attempt) {
    db.prepare(
      `INSERT INTO attempts (id, user_id, test_id, task1, task2, task3, total_score, score_source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      attempt.id,
      attempt.userId,
      attempt.testId,
      attempt.taskScores.task1,
      attempt.taskScores.task2,
      attempt.taskScores.task3,
      attempt.totalScore,
      attempt.scoreSource || "unverified",
      attempt.createdAt
    );
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
    listAttemptsByUser,
    createAttempt,
  };
}

module.exports = {
  createRepositories,
};
