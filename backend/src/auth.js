const { makeToken, hashToken } = require("./security");
const { nowIso, plusMs, withGeneratedId } = require("./utils");

function createAuth({ repositories, config }) {
  function getPublicUser(user) {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName || "",
      role: user.role,
      isPro: Boolean(user.isPro),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  function parseBearerToken(req) {
    const auth = req.headers.authorization || "";
    if (!auth.startsWith("Bearer ")) {
      return "";
    }
    return auth.slice(7).trim();
  }

  function parseCookies(req) {
    const header = String(req.headers.cookie || "");
    if (!header) {
      return {};
    }

    return header.split(";").reduce((acc, pair) => {
      const [rawKey, ...rawValueParts] = pair.split("=");
      const key = String(rawKey || "").trim();
      if (!key) {
        return acc;
      }
      const rawValue = rawValueParts.join("=").trim();
      try {
        acc[key] = decodeURIComponent(rawValue);
      } catch (error) {
        acc[key] = rawValue;
      }
      return acc;
    }, {});
  }

  function parseCookieToken(req, cookieName) {
    const cookies = parseCookies(req);
    return String(cookies[cookieName] || "").trim();
  }

  async function resolveUserFromAccessToken(req) {
    if (req.userResolved) {
      return;
    }

    req.userResolved = true;
    req.user = null;
    req.authToken = "";

    const token =
      parseBearerToken(req) || parseCookieToken(req, config.ACCESS_COOKIE_NAME);
    if (!token) {
      return;
    }

    const tokenHash = hashToken(token);
    const resolved = await repositories.findSessionWithUserByAccessHash(tokenHash, nowIso());
    if (!resolved) {
      return;
    }

    req.user = resolved.user;
    req.authToken = token;
    req.authTokenHash = tokenHash;
    req.sessionId = resolved.session.id;
  }

  async function optionalAuth(req, res, next) {
    await resolveUserFromAccessToken(req);
    return next();
  }

  async function requireAuth(req, res, next) {
    await resolveUserFromAccessToken(req);
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    return next();
  }

  async function requireAdmin(req, res, next) {
    await resolveUserFromAccessToken(req);
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    return next();
  }

  async function requirePro(req, res, next) {
    await resolveUserFromAccessToken(req);
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (!req.user.isPro && req.user.role !== "admin") {
      return res.status(403).json({ error: "Pro subscription required" });
    }
    return next();
  }

  async function issueSession(userId) {
    const accessToken = makeToken();
    const refreshToken = makeToken();
    const createdAt = nowIso();

    await repositories.createSession({
      id: withGeneratedId("session"),
      userId,
      accessTokenHash: hashToken(accessToken),
      refreshTokenHash: hashToken(refreshToken),
      accessExpiresAt: plusMs(config.ACCESS_TOKEN_TTL_MS),
      refreshExpiresAt: plusMs(config.REFRESH_TOKEN_TTL_MS),
      createdAt,
      updatedAt: createdAt,
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  async function refreshSession(refreshToken) {
    const refreshTokenHash = hashToken(refreshToken);
    const session = await repositories.findSessionByRefreshHash(refreshTokenHash, nowIso());
    if (!session) {
      return null;
    }

    const user = await repositories.findUserById(session.userId);
    if (!user) {
      return null;
    }

    const nextAccessToken = makeToken();
    const nextRefreshToken = makeToken();
    const updatedAt = nowIso();

    const rotated = await repositories.rotateSessionTokens({
      sessionId: session.id,
      accessTokenHash: hashToken(nextAccessToken),
      refreshTokenHash: hashToken(nextRefreshToken),
      accessExpiresAt: plusMs(config.ACCESS_TOKEN_TTL_MS),
      refreshExpiresAt: plusMs(config.REFRESH_TOKEN_TTL_MS),
      updatedAt,
    });

    if (!rotated) {
      return null;
    }

    return {
      accessToken: nextAccessToken,
      refreshToken: nextRefreshToken,
      user,
    };
  }

  async function revokeCurrentSession(accessToken) {
    const tokenHash = hashToken(accessToken);
    await repositories.revokeSessionByAccessHash(tokenHash, nowIso());
  }

  async function revokeByRefreshToken(refreshToken) {
    await repositories.revokeSessionByRefreshHash(hashToken(refreshToken), nowIso());
  }

  function readTokenFromCookie(req, cookieName) {
    return parseCookieToken(req, cookieName);
  }

  return {
    getPublicUser,
    optionalAuth,
    requireAuth,
    requireAdmin,
    requirePro,
    issueSession,
    refreshSession,
    revokeCurrentSession,
    revokeByRefreshToken,
    readTokenFromCookie,
  };
}

module.exports = {
  createAuth,
};
