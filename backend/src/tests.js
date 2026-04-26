const { toNumberInRange, nowIso, withGeneratedId } = require("./utils");

function normalizeMediaPath(value) {
  const source = String(value || "").trim();
  if (!source) {
    return "";
  }

  let normalized = source;
  if (/^https?:\/\//i.test(source)) {
    try {
      const parsed = new URL(source);
      normalized = parsed.pathname || "";
    } catch (error) {
      normalized = source;
    }
  }

  normalized = normalized.split("?")[0].split("#")[0].trim();
  if (!normalized.startsWith("/media/")) {
    return "";
  }

  return normalized;
}

function normalizeTaskQuestions(questions) {
  if (!Array.isArray(questions)) {
    return [];
  }

  return questions.slice(0, 6).map((item, index) => ({
    id: item.id || `q${index + 1}`,
    text: String(item.text || "").trim(),
    audioUrl: normalizeMediaPath(item.audioUrl),
    referenceText: String(item.referenceText || "").trim(),
    referenceAudioUrl: normalizeMediaPath(item.referenceAudioUrl),
  }));
}

function normalizeTestPayload(input, { isNew = false } = {}) {
  const testId = input.id ? String(input.id).trim() : withGeneratedId("test");
  const now = nowIso();
  const questions = normalizeTaskQuestions(input?.tasks?.task2?.questions);

  if (questions.length !== 6) {
    throw new Error("Task 2 must contain exactly 6 questions.");
  }

  return {
    id: testId,
    title: String(input.title || "Untitled test").trim(),
    description: String(input.description || "").trim(),
    status: input.status === "published" ? "published" : "draft",
    access: input.access === "pro" ? "pro" : "free",
    source: input.source === "ai" ? "ai" : "manual",
    createdAt: isNew ? now : input.createdAt || now,
    updatedAt: now,
    tasks: {
      task1: {
        title: String(input?.tasks?.task1?.title || "Read Aloud").trim(),
        prepSeconds: toNumberInRange(input?.tasks?.task1?.prepSeconds, 0, 600, 90),
        maxRecordSeconds: toNumberInRange(input?.tasks?.task1?.maxRecordSeconds, 10, 300, 120),
        readingText: String(input?.tasks?.task1?.readingText || "").trim(),
        referenceText: String(input?.tasks?.task1?.referenceText || "").trim(),
        referenceAudioUrl: normalizeMediaPath(input?.tasks?.task1?.referenceAudioUrl),
      },
      task2: {
        title: String(input?.tasks?.task2?.title || "Telephone Survey").trim(),
        prepSeconds: toNumberInRange(input?.tasks?.task2?.prepSeconds, 0, 600, 90),
        maxAnswerSeconds: toNumberInRange(input?.tasks?.task2?.maxAnswerSeconds, 10, 120, 40),
        introAudioUrl: normalizeMediaPath(input?.tasks?.task2?.introAudioUrl),
        outroAudioUrl: normalizeMediaPath(input?.tasks?.task2?.outroAudioUrl),
        questions,
      },
      task3: {
        title: String(input?.tasks?.task3?.title || "Monologue").trim(),
        topic: String(input?.tasks?.task3?.topic || "").trim(),
        prepSeconds: toNumberInRange(input?.tasks?.task3?.prepSeconds, 0, 600, 90),
        maxRecordSeconds: toNumberInRange(input?.tasks?.task3?.maxRecordSeconds, 10, 300, 120),
        plan: Array.isArray(input?.tasks?.task3?.plan)
          ? input.tasks.task3.plan.slice(0, 8).map((item) => String(item).trim()).filter(Boolean)
          : [],
        referenceText: String(input?.tasks?.task3?.referenceText || "").trim(),
        referenceAudioUrl: normalizeMediaPath(input?.tasks?.task3?.referenceAudioUrl),
      },
    },
  };
}

function sanitizeTestForClient(
  test,
  { canUseProFeatures = false, isAdmin = false, mediaUrlMapper = null } = {}
) {
  const mapMediaUrl =
    typeof mediaUrlMapper === "function"
      ? mediaUrlMapper
      : (value) => String(value || "");
  const clone = JSON.parse(JSON.stringify(test));

  if (isAdmin || canUseProFeatures) {
    clone.tasks.task1.referenceAudioUrl = mapMediaUrl(clone.tasks.task1.referenceAudioUrl);
    clone.tasks.task2.introAudioUrl = mapMediaUrl(clone.tasks.task2.introAudioUrl);
    clone.tasks.task2.outroAudioUrl = mapMediaUrl(clone.tasks.task2.outroAudioUrl);
    clone.tasks.task2.questions = clone.tasks.task2.questions.map((question) => ({
      ...question,
      audioUrl: mapMediaUrl(question.audioUrl),
      referenceAudioUrl: mapMediaUrl(question.referenceAudioUrl),
    }));
    clone.tasks.task3.referenceAudioUrl = mapMediaUrl(clone.tasks.task3.referenceAudioUrl);
    return clone;
  }

  clone.tasks.task1.referenceText = "";
  clone.tasks.task1.referenceAudioUrl = mapMediaUrl("");
  clone.tasks.task2.introAudioUrl = mapMediaUrl(clone.tasks.task2.introAudioUrl);
  clone.tasks.task2.outroAudioUrl = mapMediaUrl(clone.tasks.task2.outroAudioUrl);
  clone.tasks.task2.questions = clone.tasks.task2.questions.map((question) => ({
    id: question.id,
    text: question.text,
    audioUrl: mapMediaUrl(question.audioUrl),
    referenceText: "",
    referenceAudioUrl: mapMediaUrl(""),
  }));
  clone.tasks.task3.referenceText = "";
  clone.tasks.task3.referenceAudioUrl = mapMediaUrl("");

  return clone;
}

module.exports = {
  normalizeTestPayload,
  sanitizeTestForClient,
};
