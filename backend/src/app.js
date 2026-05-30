const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const helmet = require("helmet");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const config = require("./config");
const { initDatabase } = require("./db");
const { createRepositories } = require("./repositories");
const { createAuth } = require("./auth");
const { createRateLimiter } = require("./rateLimit");
const { hashPassword, verifyPassword } = require("./security");
const { sanitizeEmail, isValidEmail, nowIso, toNumberInRange, withGeneratedId, slugify } = require("./utils");
const { normalizeTestPayload, sanitizeTestForClient } = require("./tests");
const {
  evaluateWithGroq,
  transcribeWithGroq,
  generateTestWithAi,
  generateSpeechWithGroq,
} = require("./ai");
const { validateAudioUpload } = require("./mediaValidation");
const { createClient: createYooKassaClient } = require("./yookassa");

let repositories;
let auth;
let yooKassa;
let authRateLimit;
let transcribeRateLimit;
let evaluateRateLimit;
let adminMutationRateLimit;
let adminGenerateRateLimit;

const TEMP_UPLOAD_STORAGE = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, config.TEMP_UPLOADS_DIR);
  },
  filename: (req, file, callback) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".bin";
    callback(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`);
  },
});

const STT_UPLOAD = multer({
  storage: TEMP_UPLOAD_STORAGE,
  limits: { fileSize: 12 * 1024 * 1024 },
});

const ADMIN_UPLOAD = multer({
  storage: TEMP_UPLOAD_STORAGE,
  limits: { fileSize: 20 * 1024 * 1024 },
});

function trimText(value) {
  return String(value || "").trim();
}

function getAiProvider() {
  return trimText(config.AI_PROVIDER).toLowerCase() === "gemini" ? "gemini" : "groq";
}

function getAiTextConfig(kind) {
  const provider = getAiProvider();
  if (provider === "gemini") {
    const modelByKind = {
      analyze: config.GEMINI_ANALYZE_MODEL,
      transcribe: config.GEMINI_TRANSCRIBE_MODEL,
      generate: config.GEMINI_GENERATE_MODEL,
    };
    return {
      provider,
      apiKey: config.GEMINI_API_KEY,
      baseUrl: config.GEMINI_BASE_URL,
      model: modelByKind[kind] || config.GEMINI_ANALYZE_MODEL,
    };
  }

  return {
    provider,
    apiKey: config.GROQ_API_KEY,
    model: kind === "generate" ? config.GENERATE_MODEL : config.ANALYZE_MODEL,
  };
}

function getTtsConfig() {
  const provider = trimText(config.TTS_PROVIDER).toLowerCase() === "gemini" ? "gemini" : "groq";
  if (provider === "gemini") {
    return {
      provider,
      apiKey: config.GEMINI_API_KEY,
      baseUrl: config.GEMINI_BASE_URL,
      model: config.GEMINI_TTS_MODEL,
      voice: config.GEMINI_TTS_VOICE,
    };
  }

  return {
    provider,
    apiKey: config.GROQ_TTS_API_KEY || config.GROQ_API_KEY,
    model: config.TTS_MODEL,
    voice: config.TTS_VOICE,
  };
}

function normalizeDisplayName(value, { fallback = "" } = {}) {
  const cleaned = trimText(value).replace(/\s+/g, " ").slice(0, 40);
  return cleaned || fallback;
}

function buildBillingReturnUrl(baseUrl, paymentId) {
  const cleanBase = trimText(baseUrl);
  if (!cleanBase) {
    return "";
  }
  const separator = cleanBase.includes("?") ? "&" : "?";
  return `${cleanBase}${separator}paymentProvider=yookassa&paymentId=${encodeURIComponent(paymentId)}`;
}

function resolveBillingReturnBaseUrl() {
  if (trimText(config.BILLING_RETURN_URL)) {
    return trimText(config.BILLING_RETURN_URL);
  }

  const primaryOrigin = config.ALLOWED_ORIGINS[0];
  if (!primaryOrigin) {
    return "";
  }
  return `${primaryOrigin.replace(/\/+$/, "")}/profile`;
}

function normalizePaymentStatus(rawStatus) {
  const status = trimText(rawStatus).toLowerCase();
  if (status === "succeeded") {
    return "succeeded";
  }
  if (status === "canceled") {
    return "canceled";
  }
  if (status === "waiting_for_capture") {
    return "waiting_for_capture";
  }
  return "pending";
}

function mapBillingErrorStatus(errorMessage) {
  const normalized = String(errorMessage || "").toLowerCase();
  if (normalized.includes("not configured")) {
    return 503;
  }
  if (normalized.includes("error 401") || normalized.includes("error 403")) {
    return 502;
  }
  if (normalized.includes("error 429")) {
    return 429;
  }
  return 502;
}

function mapYooKassaPaymentToSnapshot(payment, fallback = {}) {
  return {
    id: trimText(payment?.id) || fallback.id || "",
    status: normalizePaymentStatus(payment?.status || fallback.status),
    paid: Boolean(payment?.paid),
    amount: {
      value: trimText(payment?.amount?.value || fallback.amount?.value || ""),
      currency: trimText(payment?.amount?.currency || fallback.amount?.currency || "RUB") || "RUB",
    },
    confirmationUrl: trimText(
      payment?.confirmation?.confirmation_url || fallback.confirmationUrl || ""
    ),
    metadata: payment?.metadata && typeof payment.metadata === "object" ? payment.metadata : fallback.metadata || {},
    raw: payment && typeof payment === "object" ? payment : fallback.raw || {},
  };
}

async function finalizeProIfNeeded({ userId, payment, updatedAt }) {
  if (!payment || payment.status !== "succeeded" || !payment.paid) {
    return false;
  }
  const user = await repositories.findUserById(userId);
  if (!user) {
    return false;
  }
  if (user.isPro) {
    return true;
  }
  await repositories.updateUserPro(userId, true, updatedAt);
  return true;
}

async function persistYooKassaPayment({
  providerPayment,
  fallbackUserId = "",
  returnUrl = "",
  planCode = config.BILLING_PRO_PLAN_CODE,
  idempotenceKey = "",
  updatedAt = nowIso(),
}) {
  const snapshot = mapYooKassaPaymentToSnapshot(providerPayment);
  const metadataUserId = trimText(snapshot.metadata?.user_id);
  const userId = metadataUserId || trimText(fallbackUserId);
  if (!snapshot.id || !userId) {
    return null;
  }

  const existing = await repositories.findBillingPaymentById(snapshot.id);
  const completedAt = snapshot.status === "succeeded" && snapshot.paid ? updatedAt : null;
  if (!existing) {
    await repositories.createBillingPayment({
      id: snapshot.id,
      userId,
      provider: "yookassa",
      planCode: trimText(snapshot.metadata?.plan_code) || trimText(planCode) || "pro-monthly",
      amount: snapshot.amount,
      status: snapshot.status,
      paid: snapshot.paid,
      confirmationUrl: snapshot.confirmationUrl,
      returnUrl: returnUrl || "",
      idempotenceKey: idempotenceKey || "",
      metadata: snapshot.metadata,
      raw: snapshot.raw,
      createdAt: updatedAt,
      updatedAt,
      completedAt,
    });
    return repositories.findBillingPaymentById(snapshot.id);
  }

  return repositories.updateBillingPaymentState({
    paymentId: snapshot.id,
    status: snapshot.status,
    paid: snapshot.paid,
    confirmationUrl: snapshot.confirmationUrl,
    raw: snapshot.raw,
    metadata: snapshot.metadata,
    updatedAt,
    completedAt,
  });
}

function makeTtsFileName({ base, extension }) {
  const safeBase = slugify(base) || "tts-audio";
  return `${Date.now()}-${safeBase}${extension || ".mp3"}`;
}

function buildTask2IntroText(test) {
  const variantTitle = trimText(test?.title) || "this speaking exam";
  const taskTitle = trimText(test?.tasks?.task2?.title) || "telephone survey";
  return `You are about to complete the ${taskTitle} for ${variantTitle}. Listen to each question and answer clearly.`;
}

function buildTask2OutroText() {
  return "This is the end of the telephone survey. Thank you for your answers.";
}

function isRateLimitError(errorMessage) {
  const normalized = String(errorMessage || "").toLowerCase();
  return (
    normalized.includes("rate limit") ||
    normalized.includes("error 429") ||
    normalized.includes("status code 429")
  );
}

function mapProviderErrorStatus(errorMessage) {
  const normalized = String(errorMessage || "").toLowerCase();
  if (
    normalized.includes("401") ||
    normalized.includes("unauthorized") ||
    normalized.includes("invalid api key")
  ) {
    return 401;
  }
  if (normalized.includes("403") || normalized.includes("forbidden")) {
    return 403;
  }
  if (isRateLimitError(normalized)) {
    return 429;
  }
  if (normalized.includes("disabled")) {
    return 503;
  }
  if (normalized.includes("model terms")) {
    return 403;
  }
  return 502;
}

function toBase64Url(value) {
  return Buffer.from(String(value || ""), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded =
    normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function timingSafeCompare(left, right) {
  const a = crypto.createHash("sha256").update(String(left || "")).digest();
  const b = crypto.createHash("sha256").update(String(right || "")).digest();
  return crypto.timingSafeEqual(a, b);
}

function normalizeCookieSameSite(value) {
  const normalized = String(value || "lax")
    .trim()
    .toLowerCase();
  if (normalized === "strict") {
    return "strict";
  }
  if (normalized === "none") {
    return "none";
  }
  return "lax";
}

function createCookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    secure: Boolean(config.COOKIE_SECURE),
    sameSite: normalizeCookieSameSite(config.COOKIE_SAME_SITE),
    path: "/",
    maxAge: maxAgeMs,
  };
}

function setSessionCookies(res, sessionTokens) {
  res.cookie(
    config.ACCESS_COOKIE_NAME,
    sessionTokens.accessToken,
    createCookieOptions(config.ACCESS_TOKEN_TTL_MS)
  );
  res.cookie(
    config.REFRESH_COOKIE_NAME,
    sessionTokens.refreshToken,
    createCookieOptions(config.REFRESH_TOKEN_TTL_MS)
  );
}

function clearSessionCookies(res) {
  const baseOptions = {
    httpOnly: true,
    secure: Boolean(config.COOKIE_SECURE),
    sameSite: normalizeCookieSameSite(config.COOKIE_SAME_SITE),
    path: "/",
  };
  res.clearCookie(config.ACCESS_COOKIE_NAME, baseOptions);
  res.clearCookie(config.REFRESH_COOKIE_NAME, baseOptions);
}

function isBootstrapSetupKeyConfigured() {
  return (
    config.ADMIN_BOOTSTRAP_ENABLED &&
    String(config.ADMIN_BOOTSTRAP_KEY || "").length >=
      config.ADMIN_BOOTSTRAP_MIN_KEY_LENGTH
  );
}

function signWithHmac(secret, payload) {
  return crypto
    .createHmac("sha256", String(secret || ""))
    .update(String(payload || ""))
    .digest("hex");
}

function signUploadMediaPath(mediaPath) {
  const cleanPath = String(mediaPath || "").split("?")[0].trim();
  if (!cleanPath.startsWith("/media/uploads/")) {
    return cleanPath;
  }

  const exp = Date.now() + config.MEDIA_URL_TTL_MS;
  const payload = `${cleanPath}:${exp}`;
  const sig = signWithHmac(config.MEDIA_SIGNING_SECRET, payload);
  return `${cleanPath}?exp=${exp}&sig=${sig}`;
}

function verifyUploadMediaSignature(mediaPath, exp, sig) {
  const cleanPath = String(mediaPath || "").trim();
  const expiresAt = Number(exp);
  if (!cleanPath.startsWith("/media/uploads/")) {
    return false;
  }
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return false;
  }

  const payload = `${cleanPath}:${expiresAt}`;
  const expectedSig = signWithHmac(config.MEDIA_SIGNING_SECRET, payload);
  return timingSafeCompare(expectedSig, sig);
}

function mapMediaUrlForClient(rawUrl) {
  const source = String(rawUrl || "").trim();
  if (!source) {
    return "";
  }
  if (source.startsWith("/media/uploads/")) {
    return signUploadMediaPath(source);
  }
  return source;
}

function collectUploadMediaPaths(test) {
  const result = new Set();
  const push = (value) => {
    const normalized = String(value || "").split("?")[0].trim();
    if (!normalized.startsWith("/media/uploads/")) {
      return;
    }
    result.add(normalized);
  };

  if (!test || typeof test !== "object") {
    return result;
  }

  push(test?.tasks?.task1?.referenceAudioUrl);
  push(test?.tasks?.task2?.introAudioUrl);
  push(test?.tasks?.task2?.outroAudioUrl);
  const questions = Array.isArray(test?.tasks?.task2?.questions) ? test.tasks.task2.questions : [];
  for (const question of questions) {
    push(question?.audioUrl);
    push(question?.referenceAudioUrl);
  }
  push(test?.tasks?.task3?.referenceAudioUrl);
  return result;
}

function uploadMediaPathToAbsolute(mediaPath) {
  const fileName = path.basename(String(mediaPath || ""));
  if (!fileName) {
    return "";
  }
  const resolved = path.join(config.UPLOADS_DIR, fileName);
  if (!resolved.startsWith(config.UPLOADS_DIR)) {
    return "";
  }
  return resolved;
}

async function safeUnlink(filePath) {
  if (!filePath) {
    return;
  }
  await fs.promises.unlink(filePath).catch(() => {});
}

function issueEvaluationProof({
  userId,
  taskType,
  score,
  contentScore,
  grammarScore,
  contextHash,
}) {
  const now = Date.now();
  const payloadObject = {
    uid: String(userId || ""),
    taskType: String(taskType || ""),
    score: Number(score || 0),
    contentScore: Number(contentScore || 0),
    grammarScore: Number(grammarScore || 0),
    contextHash: String(contextHash || ""),
    iat: now,
    exp: now + config.EVALUATION_TOKEN_TTL_MS,
    nonce: crypto.randomBytes(8).toString("hex"),
  };

  const payload = toBase64Url(JSON.stringify(payloadObject));
  const signature = signWithHmac(config.EVALUATION_TOKEN_SECRET, payload);
  return `${payload}.${signature}`;
}

function buildEvaluationContextHash({ taskType, promptContext, referenceText }) {
  const signaturePayload = [
    String(taskType || "").trim(),
    trimText(promptContext),
    trimText(referenceText),
  ].join("|");
  return crypto.createHash("sha256").update(signaturePayload).digest("hex");
}

function verifyEvaluationProof(token, userId) {
  const rawToken = String(token || "").trim();
  if (!rawToken.includes(".")) {
    return null;
  }
  const [payload, signature] = rawToken.split(".", 2);
  const expectedSignature = signWithHmac(config.EVALUATION_TOKEN_SECRET, payload);
  if (!timingSafeCompare(expectedSignature, signature)) {
    return null;
  }

  let parsed = null;
  try {
    parsed = JSON.parse(fromBase64Url(payload));
  } catch (error) {
    return null;
  }

  if (!parsed || parsed.uid !== userId) {
    return null;
  }
  if (!Number.isFinite(parsed.exp) || parsed.exp <= Date.now()) {
    return null;
  }

  return parsed;
}

function assignByPath(target, pathValue, value) {
  const keys = String(pathValue || "")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);

  if (keys.length === 0) {
    return false;
  }

  let cursor = target;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    if (cursor == null || !(key in cursor)) {
      return false;
    }
    cursor = cursor[key];
  }

  const lastKey = keys[keys.length - 1];
  if (cursor == null || !(lastKey in cursor)) {
    return false;
  }

  cursor[lastKey] = value;
  return true;
}

function collectAudioTargets(test, { overwrite = false } = {}) {
  const targets = [];

  const pushTarget = ({ pathValue, text, currentUrl, label }) => {
    const sourceText = trimText(text);
    const existingUrl = trimText(currentUrl);
    if (!sourceText) {
      return;
    }
    if (!overwrite && existingUrl) {
      return;
    }
    targets.push({
      pathValue,
      text: sourceText,
      currentUrl: existingUrl,
      label,
    });
  };

  pushTarget({
    pathValue: "tasks.task1.referenceAudioUrl",
    text: test?.tasks?.task1?.referenceText || test?.tasks?.task1?.readingText,
    currentUrl: test?.tasks?.task1?.referenceAudioUrl,
    label: "Task 1 reference",
  });

  const questions = Array.isArray(test?.tasks?.task2?.questions) ? test.tasks.task2.questions : [];
  pushTarget({
    pathValue: "tasks.task2.introAudioUrl",
    text: buildTask2IntroText(test),
    currentUrl: test?.tasks?.task2?.introAudioUrl,
    label: "Task 2 intro",
  });
  questions.forEach((question, index) => {
    const position = index + 1;
    pushTarget({
      pathValue: `tasks.task2.questions.${index}.audioUrl`,
      text: question?.text,
      currentUrl: question?.audioUrl,
      label: `Task 2 question ${position}`,
    });
    pushTarget({
      pathValue: `tasks.task2.questions.${index}.referenceAudioUrl`,
      text: question?.referenceText,
      currentUrl: question?.referenceAudioUrl,
      label: `Task 2 reference ${position}`,
    });
  });
  pushTarget({
    pathValue: "tasks.task2.outroAudioUrl",
    text: buildTask2OutroText(),
    currentUrl: test?.tasks?.task2?.outroAudioUrl,
    label: "Task 2 outro",
  });

  pushTarget({
    pathValue: "tasks.task3.referenceAudioUrl",
    text: test?.tasks?.task3?.referenceText,
    currentUrl: test?.tasks?.task3?.referenceAudioUrl,
    label: "Task 3 reference",
  });

  return targets;
}

async function generateAudioAssetsForTest({ test, overwrite = false, voice }) {
  const targets = collectAudioTargets(test, { overwrite });
  if (targets.length === 0) {
    return {
      updatedTest: JSON.parse(JSON.stringify(test)),
      generatedItems: [],
      failedItems: [],
      totalTargets: 0,
    };
  }

  const updatedTest = JSON.parse(JSON.stringify(test));
  const generatedItems = [];
  const failedItems = [];

  for (const target of targets) {
    try {
      const ttsConfig = getTtsConfig();
      const generated = await generateSpeechWithGroq({
        provider: ttsConfig.provider,
        apiKey: ttsConfig.apiKey,
        model: ttsConfig.model,
        voice: voice || ttsConfig.voice,
        baseUrl: ttsConfig.baseUrl,
        text: target.text,
      });

      const fileName = makeTtsFileName({
        base: `${updatedTest.id}-${target.label}-${voice}`,
        extension: generated.extension,
      });
      const outputPath = path.join(config.UPLOADS_DIR, fileName);
      await fs.promises.writeFile(outputPath, generated.audioBuffer);

      const nextUrl = `/media/uploads/${fileName}`;
      assignByPath(updatedTest, target.pathValue, nextUrl);
      generatedItems.push({
        target: target.pathValue,
        label: target.label,
        url: nextUrl,
      });
    } catch (error) {
      const errorMessage = error.message || "Audio generation failed";
      failedItems.push({
        target: target.pathValue,
        label: target.label,
        error: errorMessage,
      });

      // Stop immediately on rate limit to preserve remaining quota and continue later.
      if (isRateLimitError(errorMessage)) {
        break;
      }
    }
  }

  if (generatedItems.length > 0) {
    updatedTest.updatedAt = nowIso();
  }
  return { updatedTest, generatedItems, failedItems, totalTargets: targets.length };
}

async function createApp() {
  const db = await initDatabase();
  repositories = createRepositories(db);
  auth = createAuth({ repositories, config });
  yooKassa = createYooKassaClient(config);
  authRateLimit = createRateLimiter({
    keyPrefix: "auth",
    windowMs: config.LOGIN_RATE_LIMIT_WINDOW_MS,
    maxRequests: config.LOGIN_RATE_LIMIT_MAX,
    enabled: config.IS_PRODUCTION,
    db,
  });
  transcribeRateLimit = createRateLimiter({
    keyPrefix: "transcribe",
    windowMs: config.TRANSCRIBE_RATE_LIMIT_WINDOW_MS,
    maxRequests: config.TRANSCRIBE_RATE_LIMIT_MAX,
    enabled: config.IS_PRODUCTION,
    db,
  });
  evaluateRateLimit = createRateLimiter({
    keyPrefix: "evaluate",
    windowMs: config.EVALUATE_RATE_LIMIT_WINDOW_MS,
    maxRequests: config.EVALUATE_RATE_LIMIT_MAX,
    enabled: config.IS_PRODUCTION,
    db,
  });
  adminMutationRateLimit = createRateLimiter({
    keyPrefix: "admin-mutation",
    windowMs: config.ADMIN_MUTATION_RATE_LIMIT_WINDOW_MS,
    maxRequests: config.ADMIN_MUTATION_RATE_LIMIT_MAX,
    enabled: config.IS_PRODUCTION,
    db,
  });
  adminGenerateRateLimit = createRateLimiter({
    keyPrefix: "admin-generate",
    windowMs: config.ADMIN_GENERATE_RATE_LIMIT_WINDOW_MS,
    maxRequests: config.ADMIN_GENERATE_RATE_LIMIT_MAX,
    enabled: config.IS_PRODUCTION,
    db,
  });

  const app = express();
  if (config.TRUST_PROXY) {
    app.set("trust proxy", 1);
  }
  app.disable("x-powered-by");

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
      referrerPolicy: { policy: "no-referrer" },
    })
  );

  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        if (!origin) {
          return callback(null, true);
        }
        if (config.ALLOWED_ORIGINS.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error("CORS is blocked for this origin"));
      },
    })
  );

  app.use(express.json({ limit: "2mb" }));
  app.use(
    "/media/case-1",
    express.static(path.join(config.MEDIA_DIR, "case-1"), {
      maxAge: "7d",
      immutable: true,
    })
  );

  app.get("/media/uploads/:fileName", auth.optionalAuth, async (req, res) => {
    const fileName = path.basename(String(req.params.fileName || ""));
    if (!fileName || fileName !== req.params.fileName) {
      return res.status(400).json({ error: "Invalid media path" });
    }

    const mediaPath = `/media/uploads/${fileName}`;
    if (!req.user) {
      const exp = req.query.exp;
      const sig = String(req.query.sig || "");
      if (!verifyUploadMediaSignature(mediaPath, exp, sig)) {
        return res.status(403).json({ error: "Media link is invalid or expired" });
      }
    }

    const resolvedPath = path.join(config.UPLOADS_DIR, fileName);
    if (!resolvedPath.startsWith(config.UPLOADS_DIR)) {
      return res.status(400).json({ error: "Invalid media path" });
    }
    try {
      await fs.promises.access(resolvedPath, fs.constants.R_OK);
    } catch (error) {
      return res.status(404).json({ error: "Media file not found" });
    }
    return res.sendFile(resolvedPath);
  });

  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
      const durationMs = Date.now() - startedAt;
      console.log(
        `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`
      );
    });
    next();
  });

  app.get("/api/health", (req, res) => {
    return res.json({ ok: true, now: nowIso() });
  });

  await repositories.cleanupExpiredSessions(nowIso());
  const sessionCleanupTimer = setInterval(() => {
    repositories.cleanupExpiredSessions(nowIso()).catch((error) => {
      console.error("Failed to cleanup expired sessions:", error);
    });
  }, config.SESSION_CLEANUP_INTERVAL_MS);
  if (typeof sessionCleanupTimer.unref === "function") {
    sessionCleanupTimer.unref();
  }

  app.get("/api/auth/bootstrap-status", async (req, res) => {
    return res.json({
      enabled: isBootstrapSetupKeyConfigured() && (await repositories.countAdmins()) === 0,
    });
  });

  app.post("/api/auth/register", authRateLimit, async (req, res) => {
    const email = sanitizeEmail(req.body?.email);
    const password = String(req.body?.password || "").trim();
    const displayName = normalizeDisplayName(req.body?.displayName || req.body?.name, {
      fallback: email.split("@")[0] || "User",
    });

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Valid email is required" });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    if (displayName.length < 2) {
      return res.status(400).json({ error: "displayName must be at least 2 characters" });
    }

    const existingUser = await repositories.findUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: "User already exists" });
    }

    const user = {
      id: withGeneratedId("user"),
      email,
      displayName,
      passwordHash: await hashPassword(password),
      role: "user",
      isPro: false,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    await repositories.createUser(user);
    const sessionTokens = await auth.issueSession(user.id);
    setSessionCookies(res, sessionTokens);

    return res.status(201).json({
      user: auth.getPublicUser(user),
    });
  });

  app.post("/api/auth/bootstrap-admin", authRateLimit, async (req, res) => {
    const setupKey = String(req.body?.setupKey || "").trim();
    const email = sanitizeEmail(req.body?.email);
    const password = String(req.body?.password || "").trim();
    const displayName = normalizeDisplayName(req.body?.displayName || req.body?.name, {
      fallback: email.split("@")[0] || "Administrator",
    });

    if (!isBootstrapSetupKeyConfigured()) {
      return res.status(403).json({
        error:
          "Admin bootstrap is disabled or misconfigured. Set ADMIN_BOOTSTRAP_ENABLED and strong ADMIN_BOOTSTRAP_KEY.",
      });
    }

    if (!timingSafeCompare(setupKey, config.ADMIN_BOOTSTRAP_KEY)) {
      return res.status(403).json({ error: "Invalid setup key" });
    }

    if ((await repositories.countAdmins()) > 0) {
      return res.status(409).json({ error: "Admin account already exists" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Valid email is required" });
    }

    if (password.length < 10) {
      return res.status(400).json({ error: "Admin password must be at least 10 characters" });
    }
    if (displayName.length < 2) {
      return res.status(400).json({ error: "displayName must be at least 2 characters" });
    }

    const user = {
      id: withGeneratedId("user"),
      email,
      displayName,
      passwordHash: await hashPassword(password),
      role: "admin",
      isPro: true,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    await repositories.createUser(user);
    const sessionTokens = await auth.issueSession(user.id);
    setSessionCookies(res, sessionTokens);

    return res.status(201).json({
      user: auth.getPublicUser(user),
    });
  });

  app.post("/api/auth/login", authRateLimit, async (req, res) => {
    const email = sanitizeEmail(req.body?.email);
    const password = String(req.body?.password || "").trim();

    const user = await repositories.findUserByEmail(email);
    const passwordMatches = user ? await verifyPassword(password, user.passwordHash) : false;
    if (!user || !passwordMatches) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const sessionTokens = await auth.issueSession(user.id);
    setSessionCookies(res, sessionTokens);

    return res.json({
      user: auth.getPublicUser(user),
    });
  });

  app.post("/api/auth/refresh", authRateLimit, async (req, res) => {
    const refreshToken =
      String(req.body?.refreshToken || "").trim() ||
      auth.readTokenFromCookie(req, config.REFRESH_COOKIE_NAME);
    if (!refreshToken) {
      return res.status(400).json({ error: "refreshToken is required" });
    }

    const nextSession = await auth.refreshSession(refreshToken);
    if (!nextSession) {
      clearSessionCookies(res);
      return res.status(401).json({ error: "Refresh token is invalid or expired" });
    }
    setSessionCookies(res, nextSession);

    return res.json({
      user: auth.getPublicUser(nextSession.user),
    });
  });

  app.post("/api/auth/logout", auth.requireAuth, async (req, res) => {
    if (req.authToken) {
      await auth.revokeCurrentSession(req.authToken);
    }

    const refreshToken =
      String(req.body?.refreshToken || "").trim() ||
      auth.readTokenFromCookie(req, config.REFRESH_COOKIE_NAME);
    if (refreshToken) {
      await auth.revokeByRefreshToken(refreshToken);
    }

    clearSessionCookies(res);
    return res.json({ ok: true });
  });

  app.post("/api/auth/logout-all", auth.requireAuth, async (req, res) => {
    await repositories.revokeAllSessionsForUser(req.user.id, nowIso());
    clearSessionCookies(res);
    return res.json({ ok: true });
  });

  app.get("/api/auth/me", auth.requireAuth, (req, res) => {
    return res.json({ user: auth.getPublicUser(req.user) });
  });

  app.patch("/api/auth/profile", auth.requireAuth, async (req, res) => {
    const displayName = normalizeDisplayName(req.body?.displayName || req.body?.name);
    if (displayName.length < 2) {
      return res.status(400).json({ error: "displayName must be at least 2 characters" });
    }

    const updated = await repositories.updateUserDisplayName(req.user.id, displayName, nowIso());
    if (!updated) {
      return res.status(404).json({ error: "User not found" });
    }

    const refreshedUser = await repositories.findUserById(req.user.id);
    return res.json({ user: auth.getPublicUser(refreshedUser) });
  });

  app.post("/api/billing/yookassa/create-payment", auth.requireAuth, async (req, res) => {
    if (!yooKassa.isConfigured()) {
      return res.status(503).json({
        error: "YooKassa is not configured. Set YOOKASSA_SHOP_ID and YOOKASSA_SECRET_KEY.",
      });
    }

    const user = await repositories.findUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    if (user.isPro || user.role === "admin") {
      return res.status(409).json({ error: "Pro subscription is already active" });
    }

    const returnBaseUrl = resolveBillingReturnBaseUrl();
    if (!returnBaseUrl) {
      return res.status(500).json({
        error: "Billing return URL is not configured. Set BILLING_RETURN_URL or FRONTEND_ORIGIN.",
      });
    }

    try {
      const createdAt = nowIso();
      const { payment, idempotenceKey } = await yooKassa.createPayment({
        amountValue: config.BILLING_PRO_MONTHLY_PRICE_RUB,
        currency: "RUB",
        description: `${config.BILLING_PRO_PLAN_TITLE} (${user.email})`,
        returnUrl: returnBaseUrl,
        metadata: {
          user_id: user.id,
          plan_code: config.BILLING_PRO_PLAN_CODE,
        },
      });

      const persisted = await persistYooKassaPayment({
        providerPayment: payment,
        fallbackUserId: user.id,
        returnUrl: returnBaseUrl,
        idempotenceKey,
        updatedAt: createdAt,
      });
      if (!persisted) {
        return res.status(502).json({ error: "Failed to persist payment state" });
      }

      return res.status(201).json({
        ok: true,
        payment: {
          id: persisted.id,
          status: persisted.status,
          confirmationUrl: persisted.confirmationUrl,
          amount: persisted.amount,
          returnUrl: buildBillingReturnUrl(returnBaseUrl, persisted.id),
        },
      });
    } catch (error) {
      return res.status(mapBillingErrorStatus(error.message || "")).json({
        error: error.message || "Failed to create YooKassa payment",
      });
    }
  });

  app.get("/api/billing/yookassa/payment/:paymentId/status", auth.requireAuth, async (req, res) => {
    const paymentId = trimText(req.params.paymentId);
    if (!paymentId) {
      return res.status(400).json({ error: "paymentId is required" });
    }

    const existing = await repositories.findBillingPaymentById(paymentId);
    if (existing && existing.userId !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ error: "Access denied for this payment" });
    }

    let providerPayment = null;
    if (yooKassa.isConfigured()) {
      try {
        providerPayment = await yooKassa.getPayment(paymentId);
      } catch (error) {
        if (!existing) {
          return res.status(mapBillingErrorStatus(error.message || "")).json({
            error: error.message || "Failed to fetch payment status",
          });
        }
      }
    }

    const updatedAt = nowIso();
    const nextPayment = providerPayment
      ? await persistYooKassaPayment({
          providerPayment,
          fallbackUserId: existing?.userId || req.user.id,
          returnUrl: existing?.returnUrl || resolveBillingReturnBaseUrl(),
          planCode: existing?.planCode || config.BILLING_PRO_PLAN_CODE,
          idempotenceKey: existing?.idempotenceKey || "",
          updatedAt,
        })
      : existing;

    if (!nextPayment) {
      return res.status(404).json({ error: "Payment not found" });
    }
    if (nextPayment.userId !== req.user.id && req.user.role !== "admin") {
      return res.status(403).json({ error: "Access denied for this payment" });
    }

    await finalizeProIfNeeded({
      userId: nextPayment.userId,
      payment: nextPayment,
      updatedAt,
    });

    const refreshedUser = await repositories.findUserById(req.user.id);
    return res.json({
      ok: true,
      payment: {
        id: nextPayment.id,
        status: nextPayment.status,
        paid: nextPayment.paid,
        amount: nextPayment.amount,
        confirmationUrl: nextPayment.confirmationUrl,
      },
      user: refreshedUser ? auth.getPublicUser(refreshedUser) : auth.getPublicUser(req.user),
    });
  });

  app.post("/api/billing/yookassa/webhook", async (req, res) => {
    if (!yooKassa.isConfigured()) {
      return res.status(503).json({ error: "YooKassa is not configured" });
    }

    const notification = req.body || {};
    const paymentId = trimText(notification?.object?.id);
    if (!paymentId) {
      return res.status(400).json({ error: "Invalid webhook payload" });
    }

    try {
      const providerPayment = await yooKassa.getPayment(paymentId);
      const updatedAt = nowIso();
      const persisted = await persistYooKassaPayment({
        providerPayment,
        updatedAt,
      });

      if (persisted) {
        await finalizeProIfNeeded({
          userId: persisted.userId,
          payment: persisted,
          updatedAt,
        });
      }

      return res.json({ ok: true });
    } catch (error) {
      return res.status(mapBillingErrorStatus(error.message || "")).json({
        error: error.message || "Failed to process YooKassa webhook",
      });
    }
  });

  app.get("/api/tests", auth.optionalAuth, async (req, res) => {
    const tests = await repositories.listTests();
    const isAdmin = req.user?.role === "admin";
    const canUseProFeatures = Boolean(req.user?.isPro || isAdmin);

    const visibleTests = tests
      .filter((test) => test.status === "published")
      .filter((test) => test.access === "free" || canUseProFeatures)
      .map((test) =>
        sanitizeTestForClient(test, {
          canUseProFeatures,
          isAdmin,
          mediaUrlMapper: mapMediaUrlForClient,
        })
      );

    return res.json({ tests: visibleTests });
  });

  app.get("/api/tests/:id", auth.optionalAuth, async (req, res) => {
    const test = await repositories.getTestById(req.params.id);
    if (!test || test.status !== "published") {
      return res.status(404).json({ error: "Test not found" });
    }

    const isAdmin = req.user?.role === "admin";
    const canUseProFeatures = Boolean(req.user?.isPro || isAdmin);

    if (test.access === "pro" && !canUseProFeatures) {
      return res.status(403).json({ error: "Pro subscription required" });
    }

    return res.json({
      test: sanitizeTestForClient(test, {
        canUseProFeatures,
        isAdmin,
        mediaUrlMapper: mapMediaUrlForClient,
      }),
    });
  });

  app.post(
    "/api/transcribe",
    auth.requireAuth,
    transcribeRateLimit,
    STT_UPLOAD.single("audio"),
    async (req, res) => {
      try {
        await validateAudioUpload(req.file, { maxBytes: 12 * 1024 * 1024 });
        const aiConfig = getAiTextConfig("transcribe");
        const text = await transcribeWithGroq({
          provider: aiConfig.provider,
          apiKey: aiConfig.apiKey,
          model: aiConfig.model,
          baseUrl: aiConfig.baseUrl,
          file: req.file,
        });

        return res.json({ text });
      } catch (error) {
        const statusCode = String(error.message || "").includes("disabled") ? 503 : 502;
        return res.status(statusCode).json({
          error: error.message || "Transcription failed",
        });
      } finally {
        await safeUnlink(req.file?.path);
      }
    }
  );

  app.post("/api/evaluate", auth.requireAuth, auth.requirePro, evaluateRateLimit, async (req, res) => {
    const taskType = String(req.body?.taskType || "").trim() || "task";
    const userText = String(req.body?.userText || "").trim();
    const referenceText = String(req.body?.referenceText || "").trim();
    const promptContext = String(req.body?.promptContext || "").trim();

    if (!userText) {
      return res.status(400).json({ error: "userText is required" });
    }

    try {
      const aiConfig = getAiTextConfig("analyze");
      const result = await evaluateWithGroq({
        provider: aiConfig.provider,
        apiKey: aiConfig.apiKey,
        model: aiConfig.model,
        baseUrl: aiConfig.baseUrl,
        taskType,
        promptContext,
        referenceText,
        userText,
      });
      const evaluationProof = issueEvaluationProof({
        userId: req.user.id,
        taskType,
        score: result.score,
        contentScore: result.content_score,
        grammarScore: result.grammar_score,
        contextHash: buildEvaluationContextHash({
          taskType,
          promptContext,
          referenceText,
        }),
      });
      return res.json({
        ...result,
        evaluationProof,
      });
    } catch (error) {
      const statusCode = String(error.message || "").includes("disabled") ? 503 : 502;
      return res.status(statusCode).json({
        error: error.message || "AI evaluation failed",
      });
    }
  });

  app.get("/api/attempts", auth.requireAuth, async (req, res) => {
    const tests = await repositories.listTests();
    const testsById = Object.fromEntries(tests.map((test) => [test.id, test]));
    const attempts = (await repositories.listAttemptsByUser(req.user.id)).map((item) => ({
      ...item,
      testTitle: testsById[item.testId]?.title || item.testId,
    }));

    return res.json({ attempts });
  });

  app.post("/api/attempts", auth.requireAuth, async (req, res) => {
    const testId = String(req.body?.testId || "").trim();
    if (!testId) {
      return res.status(400).json({ error: "testId is required" });
    }

    const test = await repositories.getTestById(testId);
    if (!test) {
      return res.status(404).json({ error: "Test not found" });
    }

    const isAdmin = req.user.role === "admin";
    const canUseProFeatures = Boolean(req.user.isPro || isAdmin);
    if (test.status !== "published" && !isAdmin) {
      return res.status(403).json({ error: "Cannot save attempt for unpublished test" });
    }
    if (test.access === "pro" && !canUseProFeatures) {
      return res.status(403).json({ error: "Pro subscription required" });
    }

    const evaluationProof = req.body?.evaluationProof || {};
    const task1Proof = verifyEvaluationProof(evaluationProof.task1, req.user.id);
    const task3Proof = verifyEvaluationProof(evaluationProof.task3, req.user.id);
    const expectedTask1ContextHash = buildEvaluationContextHash({
      taskType: "task1",
      promptContext: test.tasks.task1.readingText || test.tasks.task1.title || "Read aloud",
      referenceText: test.tasks.task1.referenceText || test.tasks.task1.readingText || "",
    });
    const expectedTask3ContextHash = buildEvaluationContextHash({
      taskType: "task3",
      promptContext: `Topic: ${test.tasks.task3.topic || ""}. Plan: ${(test.tasks.task3.plan || []).join(
        "; "
      )}`,
      referenceText: test.tasks.task3.referenceText || "",
    });

    const task2Questions = Array.isArray(test.tasks.task2.questions)
      ? test.tasks.task2.questions
      : [];
    const expectedTask2Contexts = new Set(
      task2Questions.map((question, index) =>
        buildEvaluationContextHash({
          taskType: "task2",
          promptContext: question.text || `Question ${index + 1}`,
          referenceText: question.referenceText || "",
        })
      )
    );
    const usedTask2Contexts = new Set();
    const validTask2Proofs = [];
    if (Array.isArray(evaluationProof.task2)) {
      for (const token of evaluationProof.task2) {
        const parsed = verifyEvaluationProof(token, req.user.id);
        if (!parsed || parsed.taskType !== "task2") {
          continue;
        }
        const contextHash = String(parsed.contextHash || "");
        if (!expectedTask2Contexts.has(contextHash) || usedTask2Contexts.has(contextHash)) {
          continue;
        }
        usedTask2Contexts.add(contextHash);
        validTask2Proofs.push(parsed);
      }
    }

    const task2AverageScore =
      validTask2Proofs.length > 0
        ? validTask2Proofs.reduce((sum, item) => sum + Number(item.score || 0), 0) /
          Math.max(1, task2Questions.length)
        : 0;

    const normalizedTaskScores = {
      task1:
        task1Proof &&
        task1Proof.taskType === "task1" &&
        task1Proof.contextHash === expectedTask1ContextHash
          ? toNumberInRange(task1Proof.score, 0, 5, 0)
          : 0,
      task2: toNumberInRange(task2AverageScore, 0, 5, 0),
      task3:
        task3Proof &&
        task3Proof.taskType === "task3" &&
        task3Proof.contextHash === expectedTask3ContextHash
          ? toNumberInRange(task3Proof.score, 0, 5, 0)
          : 0,
    };
    const scoreSource =
      normalizedTaskScores.task1 > 0 ||
      normalizedTaskScores.task2 > 0 ||
      normalizedTaskScores.task3 > 0
        ? "ai-proof"
        : "unverified";

    const totalScore =
      Math.round(
        ((normalizedTaskScores.task1 + normalizedTaskScores.task2 + normalizedTaskScores.task3) / 3) *
          10
      ) / 10;

    await repositories.createAttempt({
      id: withGeneratedId("attempt"),
      userId: req.user.id,
      testId,
      taskScores: normalizedTaskScores,
      totalScore,
      scoreSource,
      createdAt: nowIso(),
    });

    return res.status(201).json({
      ok: true,
      taskScores: normalizedTaskScores,
      totalScore,
      scoreSource,
    });
  });

  app.get("/api/admin/tests", auth.requireAdmin, async (req, res) => {
    const tests = (await repositories.listTests()).map((test) =>
      sanitizeTestForClient(test, {
        canUseProFeatures: true,
        isAdmin: true,
        mediaUrlMapper: mapMediaUrlForClient,
      })
    );
    return res.json({ tests });
  });

  app.post("/api/admin/tests", auth.requireAdmin, adminMutationRateLimit, async (req, res) => {
    try {
      const normalized = normalizeTestPayload(req.body || {}, { isNew: true });
      if (await repositories.getTestById(normalized.id)) {
        normalized.id = withGeneratedId("test");
      }
      await repositories.createTest(normalized);
      return res.status(201).json({ test: normalized });
    } catch (error) {
      return res.status(400).json({ error: error.message || "Invalid test payload" });
    }
  });

  app.put("/api/admin/tests/:id", auth.requireAdmin, adminMutationRateLimit, async (req, res) => {
    try {
      const existing = await repositories.getTestById(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Test not found" });
      }

      const normalized = normalizeTestPayload(
        {
          ...req.body,
          id: existing.id,
          createdAt: existing.createdAt,
        },
        { isNew: false }
      );

      await repositories.updateTest(normalized);
      return res.json({ test: normalized });
    } catch (error) {
      return res.status(400).json({ error: error.message || "Invalid test payload" });
    }
  });

  app.post("/api/admin/tests/:id/publish", auth.requireAdmin, adminMutationRateLimit, async (req, res) => {
    const updated = await repositories.setTestStatus(req.params.id, "published", nowIso());
    if (!updated) {
      return res.status(404).json({ error: "Test not found" });
    }
    return res.json({ test: updated });
  });

  app.post("/api/admin/tests/:id/unpublish", auth.requireAdmin, adminMutationRateLimit, async (req, res) => {
    const updated = await repositories.setTestStatus(req.params.id, "draft", nowIso());
    if (!updated) {
      return res.status(404).json({ error: "Test not found" });
    }
    return res.json({ test: updated });
  });

  app.delete("/api/admin/tests/:id", auth.requireAdmin, adminMutationRateLimit, async (req, res) => {
    const existing = await repositories.getTestById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: "Test not found" });
    }
    const candidateMediaPaths = Array.from(collectUploadMediaPaths(existing));

    const deleted = await repositories.deleteTestById(existing.id);
    if (!deleted) {
      return res.status(500).json({ error: "Failed to delete test" });
    }

    const usedPaths = new Set();
    const remainingTests = await repositories.listTests();
    for (const item of remainingTests) {
      for (const mediaPath of collectUploadMediaPaths(item)) {
        usedPaths.add(mediaPath);
      }
    }

    for (const mediaPath of candidateMediaPaths) {
      if (usedPaths.has(mediaPath)) {
        continue;
      }
      const absolutePath = uploadMediaPathToAbsolute(mediaPath);
      if (!absolutePath) {
        continue;
      }
      await safeUnlink(absolutePath);
    }

    return res.json({ ok: true, id: existing.id });
  });

  app.post("/api/admin/tests/generate-ai", auth.requireAdmin, adminGenerateRateLimit, async (req, res) => {
    try {
      const tests = await repositories.listTests();
      const seedTest = tests.find((item) => item.id === "case-1") || tests[0];
      const aiConfig = getAiTextConfig("generate");
      const generatedPayload = await generateTestWithAi({
        provider: aiConfig.provider,
        apiKey: aiConfig.apiKey,
        model: aiConfig.model,
        baseUrl: aiConfig.baseUrl,
        seedTest,
      });
      const normalized = normalizeTestPayload(
        {
          ...generatedPayload,
          access: "pro",
          status: "draft",
          source: "ai",
        },
        { isNew: true }
      );

      await repositories.createTest(normalized);
      return res.status(201).json({ test: normalized });
    } catch (error) {
      const statusCode = mapProviderErrorStatus(error.message || "");
      return res.status(statusCode).json({ error: error.message || "Failed to generate test" });
    }
  });

  app.post("/api/admin/tests/generate-full", auth.requireAdmin, adminGenerateRateLimit, async (req, res) => {
    try {
      const tests = await repositories.listTests();
      const requestedSeedId = trimText(req.body?.seedTestId);
      const voice = trimText(req.body?.voice) || getTtsConfig().voice;

      const seedTest =
        (requestedSeedId && tests.find((item) => item.id === requestedSeedId)) ||
        tests.find((item) => item.id === "case-1") ||
        tests[0];

      const aiConfig = getAiTextConfig("generate");
      const generatedPayload = await generateTestWithAi({
        provider: aiConfig.provider,
        apiKey: aiConfig.apiKey,
        model: aiConfig.model,
        baseUrl: aiConfig.baseUrl,
        seedTest,
      });

      const normalized = normalizeTestPayload(
        {
          ...generatedPayload,
          access: "pro",
          status: "draft",
          source: "ai",
        },
        { isNew: true }
      );

      const { updatedTest, generatedItems, failedItems, totalTargets } = await generateAudioAssetsForTest({
        test: normalized,
        overwrite: true,
        voice,
      });

      const hasGeneratedAudio = generatedItems.length > 0;
      const hasFailures = failedItems.length > 0;
      const testToStore = hasGeneratedAudio ? updatedTest : normalized;
      await repositories.createTest(testToStore);
      return res.status(201).json({
        ok: !hasFailures,
        partial: hasFailures,
        generatedCount: generatedItems.length,
        totalTargets,
        generated: generatedItems,
        failed: failedItems,
        error: failedItems[0]?.error || "",
        message: hasFailures
          ? `Сгенерировано ${generatedItems.length} из ${totalTargets}. Остальное можно догенерировать позже.`
          : "Вариант и аудио успешно сгенерированы.",
        test: testToStore,
      });
    } catch (error) {
      const statusCode = mapProviderErrorStatus(error.message || "");
      return res.status(statusCode).json({
        error: error.message || "Failed to generate full test",
      });
    }
  });

  app.post("/api/admin/tts/generate", auth.requireAdmin, adminGenerateRateLimit, async (req, res) => {
    const text = trimText(req.body?.text);
    const ttsConfig = getTtsConfig();
    const voice = trimText(req.body?.voice) || ttsConfig.voice;
    const targetLabel = trimText(req.body?.target) || "custom";

    if (!text) {
      return res.status(400).json({ error: "text is required" });
    }
    if (text.length > 5000) {
      return res.status(400).json({ error: "text is too long (max 5000 chars)" });
    }

    try {
      const generated = await generateSpeechWithGroq({
        provider: ttsConfig.provider,
        apiKey: ttsConfig.apiKey,
        model: ttsConfig.model,
        voice,
        baseUrl: ttsConfig.baseUrl,
        text,
      });

      const fileName = makeTtsFileName({
        base: `${targetLabel}-${voice}`,
        extension: generated.extension,
      });
      const outputPath = path.join(config.UPLOADS_DIR, fileName);
      await fs.promises.writeFile(outputPath, generated.audioBuffer);

      return res.status(201).json({
        ok: true,
        url: `/media/uploads/${fileName}`,
        previewUrl: signUploadMediaPath(`/media/uploads/${fileName}`),
        fileName,
        bytes: generated.audioBuffer.length,
        mimeType: generated.mimeType,
      });
    } catch (error) {
      const statusCode = mapProviderErrorStatus(error.message || "");
      return res.status(statusCode).json({
        error: error.message || "Audio generation failed",
      });
    }
  });

  app.post(
    "/api/admin/tests/:id/generate-audio",
    auth.requireAdmin,
    adminGenerateRateLimit,
    async (req, res) => {
      const test = await repositories.getTestById(req.params.id);
      if (!test) {
        return res.status(404).json({ error: "Test not found" });
      }

      const overwrite = Boolean(req.body?.overwrite);
      const voice = trimText(req.body?.voice) || getTtsConfig().voice;
      const targets = collectAudioTargets(test, { overwrite });
      if (targets.length === 0) {
        return res.json({
          ok: true,
          generatedCount: 0,
          message: overwrite
            ? "No text fields found for generation."
            : "No missing audio fields found for generation.",
          test,
        });
      }

      try {
        const { updatedTest, generatedItems, failedItems, totalTargets } =
          await generateAudioAssetsForTest({
            test,
            overwrite,
            voice,
          });
        if (generatedItems.length > 0) {
          await repositories.updateTest(updatedTest);
        }

        if (failedItems.length > 0) {
          return res.json({
            ok: false,
            partial: true,
            generatedCount: generatedItems.length,
            totalTargets,
            generated: generatedItems,
            failed: failedItems,
            error: failedItems[0]?.error || "",
            message: `Сгенерировано ${generatedItems.length} из ${totalTargets}. Продолжите позже — уже готовые файлы сохранены.`,
            test: generatedItems.length > 0 ? updatedTest : test,
          });
        }

        return res.json({
          ok: true,
          partial: false,
          generatedCount: generatedItems.length,
          totalTargets,
          generated: generatedItems,
          test: updatedTest,
        });
      } catch (error) {
        const statusCode = mapProviderErrorStatus(error.message || "");
        return res.status(statusCode).json({
          error: error.message || "Bulk audio generation failed",
        });
      }
    }
  );

  app.post(
    "/api/admin/upload-audio",
    auth.requireAdmin,
    adminMutationRateLimit,
    ADMIN_UPLOAD.single("audio"),
    async (req, res) => {
      try {
        const validated = await validateAudioUpload(req.file, { maxBytes: 20 * 1024 * 1024 });
        const original = req.file.originalname || "audio-file";
        const base = slugify(path.basename(original, path.extname(original))) || "audio";
        const fileName = `${Date.now()}-${base}${validated.extension}`;
        const outputPath = path.join(config.UPLOADS_DIR, fileName);

        await fs.promises.rename(req.file.path, outputPath);

        return res.status(201).json({
          url: `/media/uploads/${fileName}`,
          previewUrl: signUploadMediaPath(`/media/uploads/${fileName}`),
          fileName,
          bytes: req.file.size,
        });
      } catch (error) {
        return res.status(400).json({ error: error.message || "Audio upload failed" });
      } finally {
        await safeUnlink(req.file?.path);
      }
    }
  );

  app.get("/api/admin/users", auth.requireAdmin, async (req, res) => {
    return res.json({ users: await repositories.listUsers() });
  });

  app.post("/api/admin/users/:id/role", auth.requireAdmin, adminMutationRateLimit, async (req, res) => {
    const nextRole = req.body?.role === "admin" ? "admin" : "user";
    const targetUser = await repositories.findUserById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }

    if (targetUser.id === req.user.id && nextRole !== "admin") {
      return res.status(400).json({ error: "You cannot remove your own admin role" });
    }

    await repositories.updateUserRole(targetUser.id, nextRole, nowIso());
    const refreshed = await repositories.findUserById(targetUser.id);
    return res.json({ user: auth.getPublicUser(refreshed) });
  });

  app.post("/api/admin/users/:id/pro", auth.requireAdmin, adminMutationRateLimit, async (req, res) => {
    const isPro = Boolean(req.body?.isPro);
    const targetUser = await repositories.findUserById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }

    await repositories.updateUserPro(targetUser.id, isPro, nowIso());
    const refreshed = await repositories.findUserById(targetUser.id);
    return res.json({ user: auth.getPublicUser(refreshed) });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }

    if (error?.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "Uploaded file exceeds the configured size limit." });
    }

    const statusCode = typeof error.statusCode === "number" ? error.statusCode : 500;
    return res.status(statusCode).json({
      error: statusCode === 500 ? "Internal server error" : error.message,
    });
  });

  return app;
}

module.exports = {
  createApp,
};
