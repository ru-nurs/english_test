"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, getBackendUrl, setAuthSession } from "@/lib/api";

const QUESTION_COUNT = 6;
const DEFAULT_PLAN_LENGTH = 4;

function toPrettyJson(value) {
  return JSON.stringify(value, null, 2);
}

function toSafeInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function resolveMediaUrl(backendUrl, maybeRelativeUrl) {
  const src = String(maybeRelativeUrl || "").trim();
  if (!src) {
    return "";
  }
  if (/^https?:\/\//i.test(src)) {
    return src;
  }
  return `${backendUrl}${src}`;
}

function createBlankQuestion(index) {
  return {
    id: `q${index + 1}`,
    text: "",
    audioUrl: "",
    referenceText: "",
    referenceAudioUrl: "",
  };
}

function createBlankTest() {
  return {
    title: "Новый вариант",
    description: "",
    status: "draft",
    access: "free",
    source: "manual",
    tasks: {
      task1: {
        title: "Чтение вслух",
        prepSeconds: 90,
        maxRecordSeconds: 120,
        readingText: "",
        referenceText: "",
        referenceAudioUrl: "",
      },
      task2: {
        title: "Диалог-опрос",
        prepSeconds: 90,
        maxAnswerSeconds: 40,
        introAudioUrl: "",
        outroAudioUrl: "",
        questions: Array.from({ length: QUESTION_COUNT }, (_, index) => createBlankQuestion(index)),
      },
      task3: {
        title: "Монолог",
        topic: "",
        prepSeconds: 90,
        maxRecordSeconds: 120,
        plan: Array.from({ length: DEFAULT_PLAN_LENGTH }, () => ""),
        referenceText: "",
        referenceAudioUrl: "",
      },
    },
  };
}

function ensureEditableTest(input) {
  const blank = createBlankTest();
  const questionsFromInput = Array.isArray(input?.tasks?.task2?.questions)
    ? input.tasks.task2.questions
    : [];

  const normalizedQuestions = Array.from({ length: QUESTION_COUNT }, (_, index) => {
    const source = questionsFromInput[index] || {};
    return {
      id: String(source.id || `q${index + 1}`).trim(),
      text: String(source.text || ""),
      audioUrl: String(source.audioUrl || ""),
      referenceText: String(source.referenceText || ""),
      referenceAudioUrl: String(source.referenceAudioUrl || ""),
    };
  });

  const sourcePlan = Array.isArray(input?.tasks?.task3?.plan) ? input.tasks.task3.plan : [];
  const normalizedPlan = sourcePlan.map((item) => String(item || ""));
  while (normalizedPlan.length < DEFAULT_PLAN_LENGTH) {
    normalizedPlan.push("");
  }

  return {
    id: input?.id ? String(input.id) : undefined,
    title: String(input?.title || blank.title),
    description: String(input?.description || ""),
    status: input?.status === "published" ? "published" : "draft",
    access: input?.access === "pro" ? "pro" : "free",
    source: input?.source === "ai" ? "ai" : "manual",
    createdAt: input?.createdAt || undefined,
    updatedAt: input?.updatedAt || undefined,
    tasks: {
      task1: {
        title: String(input?.tasks?.task1?.title || blank.tasks.task1.title),
        prepSeconds: toSafeInteger(input?.tasks?.task1?.prepSeconds, 90),
        maxRecordSeconds: toSafeInteger(input?.tasks?.task1?.maxRecordSeconds, 120),
        readingText: String(input?.tasks?.task1?.readingText || ""),
        referenceText: String(input?.tasks?.task1?.referenceText || ""),
        referenceAudioUrl: String(input?.tasks?.task1?.referenceAudioUrl || ""),
      },
      task2: {
        title: String(input?.tasks?.task2?.title || blank.tasks.task2.title),
        prepSeconds: toSafeInteger(input?.tasks?.task2?.prepSeconds, 90),
        maxAnswerSeconds: toSafeInteger(input?.tasks?.task2?.maxAnswerSeconds, 40),
        introAudioUrl: String(input?.tasks?.task2?.introAudioUrl || ""),
        outroAudioUrl: String(input?.tasks?.task2?.outroAudioUrl || ""),
        questions: normalizedQuestions,
      },
      task3: {
        title: String(input?.tasks?.task3?.title || blank.tasks.task3.title),
        topic: String(input?.tasks?.task3?.topic || ""),
        prepSeconds: toSafeInteger(input?.tasks?.task3?.prepSeconds, 90),
        maxRecordSeconds: toSafeInteger(input?.tasks?.task3?.maxRecordSeconds, 120),
        plan: normalizedPlan,
        referenceText: String(input?.tasks?.task3?.referenceText || ""),
        referenceAudioUrl: String(input?.tasks?.task3?.referenceAudioUrl || ""),
      },
    },
  };
}

function assignByPath(target, pathValue, value) {
  const keys = String(pathValue || "")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);

  if (!keys.length) {
    return false;
  }

  let cursor = target;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    const maybeNumber = Number(key);
    if (Array.isArray(cursor) && Number.isInteger(maybeNumber)) {
      cursor = cursor[maybeNumber];
      continue;
    }

    if (cursor && typeof cursor === "object" && key in cursor) {
      cursor = cursor[key];
      continue;
    }
    return false;
  }

  const lastKey = keys[keys.length - 1];
  const lastIndex = Number(lastKey);
  if (Array.isArray(cursor) && Number.isInteger(lastIndex)) {
    cursor[lastIndex] = value;
    return true;
  }

  if (cursor && typeof cursor === "object" && lastKey in cursor) {
    cursor[lastKey] = value;
    return true;
  }

  return false;
}

function getAudioTargets(test) {
  const targets = [
    {
      pathValue: "tasks.task1.referenceAudioUrl",
      label: "Task 1: Эталонное аудио",
    },
    {
      pathValue: "tasks.task2.introAudioUrl",
      label: "Task 2: Intro",
    },
  ];

  const questions = Array.isArray(test?.tasks?.task2?.questions) ? test.tasks.task2.questions : [];
  questions.forEach((question, index) => {
    const shortText = String(question.text || "")
      .trim()
      .slice(0, 38);
    targets.push({
      pathValue: `tasks.task2.questions.${index}.audioUrl`,
      label: `Task 2 Q${index + 1}: Вопрос${shortText ? ` (${shortText}${shortText.length === 38 ? "..." : ""})` : ""}`,
    });
    targets.push({
      pathValue: `tasks.task2.questions.${index}.referenceAudioUrl`,
      label: `Task 2 Q${index + 1}: Эталон`,
    });
  });

  targets.push(
    {
      pathValue: "tasks.task2.outroAudioUrl",
      label: "Task 2: Outro",
    },
    {
      pathValue: "tasks.task3.referenceAudioUrl",
      label: "Task 3: Эталонное аудио",
    }
  );

  return targets;
}

function AudioPreview({ backendUrl, src }) {
  const resolved = resolveMediaUrl(backendUrl, src);
  if (!resolved) {
    return null;
  }
  return <audio controls src={resolved} className="mt-2 w-full" />;
}

export default function AdminPage() {
  const backendUrl = getBackendUrl();

  const [user, setUser] = useState(null);
  const [tests, setTests] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [draftTest, setDraftTest] = useState(createBlankTest());

  const [audioFile, setAudioFile] = useState(null);
  const [audioTargetPath, setAudioTargetPath] = useState("tasks.task1.referenceAudioUrl");
  const [voice, setVoice] = useState("austin");
  const [ttsText, setTtsText] = useState("");
  const [lastAudioUrl, setLastAudioUrl] = useState("");

  const [rawEditorOpen, setRawEditorOpen] = useState(false);
  const [rawEditorValue, setRawEditorValue] = useState(toPrettyJson(createBlankTest()));

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bootstrapEnabled, setBootstrapEnabled] = useState(false);

  const [bootstrapEmail, setBootstrapEmail] = useState("");
  const [bootstrapPassword, setBootstrapPassword] = useState("");
  const [bootstrapDisplayName, setBootstrapDisplayName] = useState("");
  const [bootstrapKey, setBootstrapKey] = useState("");

  const audioTargets = useMemo(() => getAudioTargets(draftTest), [draftTest]);

  useEffect(() => {
    if (!audioTargets.length) {
      return;
    }
    const hasCurrent = audioTargets.some((item) => item.pathValue === audioTargetPath);
    if (!hasCurrent) {
      setAudioTargetPath(audioTargets[0].pathValue);
    }
  }, [audioTargetPath, audioTargets]);

  const syncDraftFromServerItem = useCallback((source) => {
    const editable = ensureEditableTest(source);
    setDraftTest(editable);
    setRawEditorValue(toPrettyJson(editable));
  }, []);

  const refreshTests = useCallback(
    async (preferredId) => {
      const data = await apiRequest("/api/admin/tests");
      const nextTests = data.tests || [];
      setTests(nextTests);

      if (!nextTests.length) {
        setSelectedId("");
        syncDraftFromServerItem(createBlankTest());
        return;
      }

      const effectiveId = preferredId || selectedId;
      const preferred =
        (effectiveId && nextTests.find((item) => item.id === effectiveId)) || nextTests[0];

      setSelectedId(preferred.id);
      syncDraftFromServerItem(preferred);
    },
    [selectedId, syncDraftFromServerItem]
  );

  const refreshUsers = useCallback(async () => {
    const data = await apiRequest("/api/admin/users");
    setUsers(data.users || []);
  }, []);

  const loadPage = useCallback(async () => {
  try {
    let nextUser = null;
    try {
      const me = await apiRequest("/api/auth/me");
      nextUser = me.user || null;
      setUser(nextUser);
    } catch (authError) {
      setUser(null);
    }

    const bootstrapData = await apiRequest("/api/auth/bootstrap-status", {
      skipAuthRefresh: true,
    });
    setBootstrapEnabled(Boolean(bootstrapData?.enabled));

    if (nextUser?.role === "admin") {
      await Promise.all([refreshTests(), refreshUsers()]);
    }
  } catch (loadError) {
    setError(loadError.message || "Не удалось загрузить админ-панель");
  } finally {
    setLoading(false);
  }
}, [refreshTests, refreshUsers]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const setDraftField = useCallback((pathValue, value) => {
    setDraftTest((previous) => {
      const next = deepClone(previous);
      assignByPath(next, pathValue, value);
      return next;
    });
  }, []);

  const handleBootstrapAdmin = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const data = await apiRequest("/api/auth/bootstrap-admin", {
        method: "POST",
        body: {
          setupKey: bootstrapKey,
          email: bootstrapEmail,
          password: bootstrapPassword,
          displayName: bootstrapDisplayName,
        },
      });
      setAuthSession({
        user: data.user,
      });
      window.location.reload();
    } catch (bootstrapError) {
      setError(bootstrapError.message || "Не удалось создать администратора");
    } finally {
      setSaving(false);
    }
  };

  const handleSelectTest = (id) => {
    setSelectedId(id);
    const source = tests.find((item) => item.id === id);
    if (source) {
      syncDraftFromServerItem(source);
    }
  };

  const handleCreateDraft = () => {
    setSelectedId("");
    const blank = createBlankTest();
    syncDraftFromServerItem(blank);
    setInfo("Создан пустой черновик. Заполните поля и нажмите «Сохранить вариант».");
    setError("");
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setInfo("");

    try {
      const payload = ensureEditableTest(draftTest);
      if (selectedId) {
        const data = await apiRequest(`/api/admin/tests/${selectedId}`, {
          method: "PUT",
          body: {
            ...payload,
            id: selectedId,
          },
        });
        syncDraftFromServerItem(data.test || payload);
        await refreshTests(selectedId);
        setInfo("Изменения сохранены.");
      } else {
        const data = await apiRequest("/api/admin/tests", {
          method: "POST",
          body: payload,
        });
        const createdId = data.test?.id || "";
        if (createdId) {
          setSelectedId(createdId);
          await refreshTests(createdId);
          setInfo("Новый вариант создан.");
        } else {
          setInfo("Черновик сохранён.");
        }
      }
    } catch (saveError) {
      setError(saveError.message || "Не удалось сохранить изменения");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async (action) => {
    if (!selectedId) {
      return;
    }
    setSaving(true);
    setError("");
    setInfo("");
    try {
      await apiRequest(`/api/admin/tests/${selectedId}/${action}`, { method: "POST" });
      await refreshTests(selectedId);
      setInfo(action === "publish" ? "Вариант опубликован." : "Вариант снят с публикации.");
    } catch (publishError) {
      setError(publishError.message || "Не удалось обновить статус варианта");
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateAiDraft = async () => {
    setSaving(true);
    setError("");
    setInfo("");
    try {
      const data = await apiRequest("/api/admin/tests/generate-ai", { method: "POST" });
      const nextId = data.test?.id || "";
      if (nextId) {
        setSelectedId(nextId);
        await refreshTests(nextId);
      }
      setInfo("AI-черновик сгенерирован (без полного аудио).");
    } catch (generateError) {
      setError(generateError.message || "Не удалось сгенерировать AI-черновик");
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateFullVariant = async () => {
    setSaving(true);
    setError("");
    setInfo("");
    try {
      const body = {
        voice,
      };
      if (selectedId) {
        body.seedTestId = selectedId;
      }

      const data = await apiRequest("/api/admin/tests/generate-full", {
        method: "POST",
        body,
      });
      const nextId = data.test?.id || "";
      if (nextId) {
        setSelectedId(nextId);
        await refreshTests(nextId);
      }
      if (data.partial) {
        setInfo(
          `Частично готово: сгенерировано ${data.generatedCount || 0} из ${data.totalTargets || 0}.`
        );
        setError(
          data.error ||
            data.message ||
            "Генерация остановилась на лимите провайдера. Уже готовые файлы сохранены."
        );
      } else {
        setInfo(
          `Готово: сгенерирован новый вариант вместе с аудио. Файлов аудио: ${data.generatedCount || 0}.`
        );
      }
    } catch (generateError) {
      setError(generateError.message || "Не удалось сгенерировать вариант целиком");
    } finally {
      setSaving(false);
    }
  };

  const handleUploadAudio = async () => {
    if (!audioFile || !audioTargetPath) {
      return;
    }
    setSaving(true);
    setError("");
    setInfo("");
    setLastAudioUrl("");

    try {
      const formData = new FormData();
      formData.append("audio", audioFile);
      const data = await apiRequest("/api/admin/upload-audio", {
        method: "POST",
        body: formData,
        isFormData: true,
      });
      setDraftField(audioTargetPath, data.url);
      setLastAudioUrl(resolveMediaUrl(backendUrl, data.previewUrl || data.url));
      setInfo("Аудиофайл загружен и подставлен в выбранное поле.");
    } catch (uploadError) {
      setError(uploadError.message || "Не удалось загрузить аудио");
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateTtsToField = async () => {
    if (!ttsText.trim() || !audioTargetPath) {
      return;
    }
    setSaving(true);
    setError("");
    setInfo("");
    setLastAudioUrl("");

    try {
      const data = await apiRequest("/api/admin/tts/generate", {
        method: "POST",
        body: { text: ttsText, voice, target: audioTargetPath },
      });
      setDraftField(audioTargetPath, data.url);
      setLastAudioUrl(resolveMediaUrl(backendUrl, data.previewUrl || data.url));
      setInfo("TTS-аудио сгенерировано и подставлено в выбранное поле.");
    } catch (ttsError) {
      setError(ttsError.message || "Не удалось сгенерировать TTS-аудио");
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateTestAudio = async (overwrite) => {
    if (!selectedId) {
      setError("Сначала сохраните новый вариант, затем можно генерировать аудио.");
      return;
    }
    setSaving(true);
    setError("");
    setInfo("");

    try {
      const data = await apiRequest(`/api/admin/tests/${selectedId}/generate-audio`, {
        method: "POST",
        body: { overwrite, voice },
      });
      if (data.test) {
        syncDraftFromServerItem(data.test);
      }
      await refreshTests(selectedId);
      if (data.partial) {
        setInfo(`Сгенерировано файлов: ${data.generatedCount || 0} из ${data.totalTargets || 0}`);
        setError(
          data.error ||
            data.message ||
            "Генерация остановлена из-за лимита провайдера. Готовые файлы уже сохранены."
        );
      } else {
        setInfo(`Сгенерировано файлов: ${data.generatedCount || 0}`);
      }
    } catch (genError) {
      setError(genError.message || "Не удалось сгенерировать аудио для варианта");
    } finally {
      setSaving(false);
    }
  };

  const handleApplyRawJson = () => {
    setError("");
    setInfo("");
    try {
      const parsed = JSON.parse(rawEditorValue);
      const editable = ensureEditableTest(parsed);
      setDraftTest(editable);
      setInfo("JSON применён к визуальной форме.");
    } catch (parseError) {
      setError(parseError.message || "Некорректный JSON");
    }
  };

  const handleSyncRawFromForm = () => {
    setRawEditorValue(toPrettyJson(draftTest));
    setInfo("JSON синхронизирован из текущей формы.");
    setError("");
  };

  const handleRole = async (id, role) => {
    setSaving(true);
    setError("");
    try {
      await apiRequest(`/api/admin/users/${id}/role`, { method: "POST", body: { role } });
      await refreshUsers();
    } catch (roleError) {
      setError(roleError.message || "Не удалось изменить роль пользователя");
    } finally {
      setSaving(false);
    }
  };

  const handlePro = async (id, isPro) => {
    setSaving(true);
    setError("");
    try {
      await apiRequest(`/api/admin/users/${id}/pro`, { method: "POST", body: { isPro } });
      await refreshUsers();
    } catch (proError) {
      setError(proError.message || "Не удалось обновить тариф пользователя");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[var(--background)]">
        <div className="page-wrap pt-10">
          <div className="surface p-6">Загрузка админки...</div>
        </div>
      </main>
    );
  }

  if (!user && bootstrapEnabled) {
    return (
      <main className="min-h-screen bg-[var(--background)]">
        <div className="page-wrap flex min-h-[calc(100vh-4rem)] items-center justify-center py-10">
          <div className="surface w-full max-w-xl p-7">
            <h1 className="text-3xl font-medium text-[var(--foreground)]">Инициализация администратора</h1>
            <p className="mt-2 text-[var(--muted-foreground)]">
              Создание первого администратора через setup key (ключ настройки).
            </p>

            <form onSubmit={handleBootstrapAdmin} className="mt-6 space-y-4">
              <input
                type="text"
                placeholder="Setup key"
                value={bootstrapKey}
                onChange={(event) => setBootstrapKey(event.target.value)}
                className="field"
              />
              <input
                type="email"
                placeholder="Email администратора"
                value={bootstrapEmail}
                onChange={(event) => setBootstrapEmail(event.target.value)}
                className="field"
              />
              <input
                type="text"
                placeholder="Имя администратора"
                value={bootstrapDisplayName}
                onChange={(event) => setBootstrapDisplayName(event.target.value)}
                className="field"
              />
              <input
                type="password"
                placeholder="Пароль администратора"
                value={bootstrapPassword}
                onChange={(event) => setBootstrapPassword(event.target.value)}
                className="field"
              />
              <button type="submit" disabled={saving} className="btn btn-primary w-full">
                {saving ? "Создаём..." : "Создать администратора"}
              </button>
            </form>
            {error && <p className="status-error mt-4 rounded-xl p-3 text-sm">{error}</p>}
          </div>
        </div>
      </main>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <main className="min-h-screen bg-[var(--background)]">
        <div className="page-wrap pt-10">
          <div className="surface p-6">Требуются права администратора.</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--background)]">
      <div className="page-wrap space-y-4 pb-12 pt-8">
        <section className="surface p-6">
          <h1 className="text-3xl font-medium text-[var(--foreground)] md:text-4xl">Админ-панель</h1>
          <p className="mt-2 text-[var(--muted-foreground)]">
            Полное управление вариантами: генерация в один клик, редактирование по полям и массовая работа с аудио.
          </p>
        </section>

        <section className="grid gap-4 lg:grid-cols-[310px_1fr]">
          <aside className="surface p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-medium text-[var(--foreground)]">Варианты</h2>
              <span className="text-xs text-[var(--muted-foreground)]">{tests.length} шт.</span>
            </div>
            <div className="mt-4 max-h-[420px] space-y-2 overflow-auto pr-1">
              {tests.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectTest(item.id)}
                  className={`w-full rounded-xl border px-3 py-2 text-left ${
                    selectedId === item.id
                      ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                      : "border-[var(--border)] bg-[var(--secondary)] text-[var(--foreground)]"
                  }`}
                >
                  <div className="text-sm font-semibold">{item.title}</div>
                  <div className="text-xs opacity-85">
                    {item.status} | {item.access} | {item.source}
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-2">
              <button type="button" onClick={handleCreateDraft} disabled={saving} className="btn btn-outline w-full">
                Новый пустой
              </button>
              <button
                type="button"
                onClick={handleGenerateAiDraft}
                disabled={saving}
                className="btn btn-outline w-full"
              >
                AI-черновик (текст)
              </button>
              <button
                type="button"
                onClick={handleGenerateFullVariant}
                disabled={saving}
                className="btn btn-primary w-full"
              >
                {saving ? "Генерация..." : "Сгенерировать вариант целиком"}
              </button>
              <p className="text-xs text-[var(--muted-foreground)]">
                Генерация целиком создаёт новый draft-вариант сразу с аудио.
              </p>
            </div>
          </aside>

          <section className="space-y-4">
            <section className="surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-2xl font-medium text-[var(--foreground)]">Общее</h3>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    ID: {selectedId || "новый черновик"}{draftTest.updatedAt ? ` | Обновлён: ${draftTest.updatedAt}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={handleSave} disabled={saving} className="btn btn-primary">
                    Сохранить вариант
                  </button>
                  {selectedId && (
                    <>
                      <button
                        type="button"
                        onClick={() => handlePublish("publish")}
                        disabled={saving}
                        className="btn btn-outline"
                      >
                        Опубликовать
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePublish("unpublish")}
                        disabled={saving}
                        className="btn btn-outline"
                      >
                        Снять с публикации
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="text-sm text-[var(--foreground)]">
                  Название
                  <input
                    value={draftTest.title}
                    onChange={(event) => setDraftField("title", event.target.value)}
                    className="field mt-1"
                    placeholder="Название варианта"
                  />
                </label>
                <label className="text-sm text-[var(--foreground)]">
                  Источник
                  <input value={draftTest.source} readOnly className="field mt-1 opacity-80" />
                </label>
              </div>

              <label className="mt-3 block text-sm text-[var(--foreground)]">
                Описание
                <textarea
                  value={draftTest.description}
                  onChange={(event) => setDraftField("description", event.target.value)}
                  className="field mt-1 h-24 resize-y"
                  placeholder="Короткое описание варианта"
                />
              </label>

              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <label className="text-sm text-[var(--foreground)]">
                  Доступ
                  <select
                    value={draftTest.access}
                    onChange={(event) => setDraftField("access", event.target.value)}
                    className="field mt-1"
                  >
                    <option value="free">free</option>
                    <option value="pro">pro</option>
                  </select>
                </label>

                <label className="text-sm text-[var(--foreground)]">
                  Статус
                  <select
                    value={draftTest.status}
                    onChange={(event) => setDraftField("status", event.target.value)}
                    className="field mt-1"
                  >
                    <option value="draft">draft</option>
                    <option value="published">published</option>
                  </select>
                </label>

                <label className="text-sm text-[var(--foreground)]">
                  Voice (TTS)
                  <input
                    value={voice}
                    onChange={(event) => setVoice(event.target.value)}
                    className="field mt-1"
                    placeholder="austin"
                  />
                </label>
              </div>
            </section>

            <section className="surface p-5">
              <h3 className="text-2xl font-medium text-[var(--foreground)]">Task 1: Чтение вслух</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <label className="text-sm text-[var(--foreground)]">
                  Заголовок
                  <input
                    value={draftTest.tasks.task1.title}
                    onChange={(event) => setDraftField("tasks.task1.title", event.target.value)}
                    className="field mt-1"
                  />
                </label>
                <label className="text-sm text-[var(--foreground)]">
                  Время подготовки (сек)
                  <input
                    type="number"
                    min={0}
                    value={draftTest.tasks.task1.prepSeconds}
                    onChange={(event) => setDraftField("tasks.task1.prepSeconds", Number(event.target.value || 0))}
                    className="field mt-1"
                  />
                </label>
                <label className="text-sm text-[var(--foreground)]">
                  Время записи (сек)
                  <input
                    type="number"
                    min={10}
                    value={draftTest.tasks.task1.maxRecordSeconds}
                    onChange={(event) =>
                      setDraftField("tasks.task1.maxRecordSeconds", Number(event.target.value || 10))
                    }
                    className="field mt-1"
                  />
                </label>
              </div>

              <label className="mt-3 block text-sm text-[var(--foreground)]">
                Текст для чтения
                <textarea
                  value={draftTest.tasks.task1.readingText}
                  onChange={(event) => setDraftField("tasks.task1.readingText", event.target.value)}
                  className="field mt-1 h-28 resize-y"
                />
              </label>

              <label className="mt-3 block text-sm text-[var(--foreground)]">
                Эталонный текст
                <textarea
                  value={draftTest.tasks.task1.referenceText}
                  onChange={(event) => setDraftField("tasks.task1.referenceText", event.target.value)}
                  className="field mt-1 h-24 resize-y"
                />
              </label>

              <label className="mt-3 block text-sm text-[var(--foreground)]">
                URL эталонного аудио
                <input
                  value={draftTest.tasks.task1.referenceAudioUrl}
                  onChange={(event) => setDraftField("tasks.task1.referenceAudioUrl", event.target.value)}
                  className="field mt-1"
                  placeholder="/media/uploads/..."
                />
              </label>
              <AudioPreview backendUrl={backendUrl} src={draftTest.tasks.task1.referenceAudioUrl} />
            </section>

            <section className="surface p-5">
              <h3 className="text-2xl font-medium text-[var(--foreground)]">Task 2: Диалог-опрос</h3>

              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <label className="text-sm text-[var(--foreground)]">
                  Заголовок
                  <input
                    value={draftTest.tasks.task2.title}
                    onChange={(event) => setDraftField("tasks.task2.title", event.target.value)}
                    className="field mt-1"
                  />
                </label>
                <label className="text-sm text-[var(--foreground)]">
                  Время подготовки (сек)
                  <input
                    type="number"
                    min={0}
                    value={draftTest.tasks.task2.prepSeconds}
                    onChange={(event) => setDraftField("tasks.task2.prepSeconds", Number(event.target.value || 0))}
                    className="field mt-1"
                  />
                </label>
                <label className="text-sm text-[var(--foreground)]">
                  Время ответа (сек)
                  <input
                    type="number"
                    min={10}
                    value={draftTest.tasks.task2.maxAnswerSeconds}
                    onChange={(event) =>
                      setDraftField("tasks.task2.maxAnswerSeconds", Number(event.target.value || 10))
                    }
                    className="field mt-1"
                  />
                </label>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="text-sm text-[var(--foreground)]">
                  Intro audio URL
                  <input
                    value={draftTest.tasks.task2.introAudioUrl}
                    onChange={(event) => setDraftField("tasks.task2.introAudioUrl", event.target.value)}
                    className="field mt-1"
                    placeholder="/media/uploads/..."
                  />
                  <AudioPreview backendUrl={backendUrl} src={draftTest.tasks.task2.introAudioUrl} />
                </label>
                <label className="text-sm text-[var(--foreground)]">
                  Outro audio URL
                  <input
                    value={draftTest.tasks.task2.outroAudioUrl}
                    onChange={(event) => setDraftField("tasks.task2.outroAudioUrl", event.target.value)}
                    className="field mt-1"
                    placeholder="/media/uploads/..."
                  />
                  <AudioPreview backendUrl={backendUrl} src={draftTest.tasks.task2.outroAudioUrl} />
                </label>
              </div>

              <div className="mt-4 space-y-3">
                {draftTest.tasks.task2.questions.map((question, index) => (
                  <article key={`question-${index + 1}`} className="surface-soft p-4">
                    <h4 className="text-lg font-semibold text-[var(--foreground)]">Вопрос {index + 1}</h4>
                    <div className="mt-2 grid gap-3 md:grid-cols-2">
                      <label className="text-sm text-[var(--foreground)]">
                        ID
                        <input
                          value={question.id}
                          onChange={(event) =>
                            setDraftField(`tasks.task2.questions.${index}.id`, event.target.value)
                          }
                          className="field mt-1"
                        />
                      </label>
                      <label className="text-sm text-[var(--foreground)]">
                        URL вопроса
                        <input
                          value={question.audioUrl}
                          onChange={(event) =>
                            setDraftField(`tasks.task2.questions.${index}.audioUrl`, event.target.value)
                          }
                          className="field mt-1"
                          placeholder="/media/uploads/..."
                        />
                      </label>
                    </div>
                    <AudioPreview backendUrl={backendUrl} src={question.audioUrl} />

                    <label className="mt-3 block text-sm text-[var(--foreground)]">
                      Текст вопроса
                      <textarea
                        value={question.text}
                        onChange={(event) =>
                          setDraftField(`tasks.task2.questions.${index}.text`, event.target.value)
                        }
                        className="field mt-1 h-20 resize-y"
                      />
                    </label>

                    <label className="mt-3 block text-sm text-[var(--foreground)]">
                      Эталонный ответ (текст)
                      <textarea
                        value={question.referenceText}
                        onChange={(event) =>
                          setDraftField(`tasks.task2.questions.${index}.referenceText`, event.target.value)
                        }
                        className="field mt-1 h-20 resize-y"
                      />
                    </label>

                    <label className="mt-3 block text-sm text-[var(--foreground)]">
                      URL эталонного аудио
                      <input
                        value={question.referenceAudioUrl}
                        onChange={(event) =>
                          setDraftField(`tasks.task2.questions.${index}.referenceAudioUrl`, event.target.value)
                        }
                        className="field mt-1"
                        placeholder="/media/uploads/..."
                      />
                    </label>
                    <AudioPreview backendUrl={backendUrl} src={question.referenceAudioUrl} />
                  </article>
                ))}
              </div>
            </section>

            <section className="surface p-5">
              <h3 className="text-2xl font-medium text-[var(--foreground)]">Task 3: Монолог</h3>

              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <label className="text-sm text-[var(--foreground)]">
                  Заголовок
                  <input
                    value={draftTest.tasks.task3.title}
                    onChange={(event) => setDraftField("tasks.task3.title", event.target.value)}
                    className="field mt-1"
                  />
                </label>
                <label className="text-sm text-[var(--foreground)]">
                  Тема
                  <input
                    value={draftTest.tasks.task3.topic}
                    onChange={(event) => setDraftField("tasks.task3.topic", event.target.value)}
                    className="field mt-1"
                  />
                </label>
                <label className="text-sm text-[var(--foreground)]">
                  Время подготовки (сек)
                  <input
                    type="number"
                    min={0}
                    value={draftTest.tasks.task3.prepSeconds}
                    onChange={(event) => setDraftField("tasks.task3.prepSeconds", Number(event.target.value || 0))}
                    className="field mt-1"
                  />
                </label>
                <label className="text-sm text-[var(--foreground)]">
                  Время записи (сек)
                  <input
                    type="number"
                    min={10}
                    value={draftTest.tasks.task3.maxRecordSeconds}
                    onChange={(event) =>
                      setDraftField("tasks.task3.maxRecordSeconds", Number(event.target.value || 10))
                    }
                    className="field mt-1"
                  />
                </label>
              </div>

              <div className="mt-3 space-y-2">
                <p className="text-sm font-semibold text-[var(--foreground)]">Пункты плана</p>
                {draftTest.tasks.task3.plan.map((item, index) => (
                  <div key={`plan-${index + 1}`} className="flex items-center gap-2">
                    <span className="w-7 text-sm text-[var(--muted-foreground)]">{index + 1}.</span>
                    <input
                      value={item}
                      onChange={(event) =>
                        setDraftField(`tasks.task3.plan.${index}`, event.target.value)
                      }
                      className="field"
                      placeholder={`Пункт ${index + 1}`}
                    />
                  </div>
                ))}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setDraftTest((previous) => {
                        const next = deepClone(previous);
                        next.tasks.task3.plan.push("");
                        return next;
                      })
                    }
                    className="btn btn-outline text-sm"
                  >
                    Добавить пункт
                  </button>
                  {draftTest.tasks.task3.plan.length > DEFAULT_PLAN_LENGTH && (
                    <button
                      type="button"
                      onClick={() =>
                        setDraftTest((previous) => {
                          const next = deepClone(previous);
                          next.tasks.task3.plan = next.tasks.task3.plan.slice(0, -1);
                          return next;
                        })
                      }
                      className="btn btn-outline text-sm"
                    >
                      Удалить последний
                    </button>
                  )}
                </div>
              </div>

              <label className="mt-3 block text-sm text-[var(--foreground)]">
                Эталонный текст монолога
                <textarea
                  value={draftTest.tasks.task3.referenceText}
                  onChange={(event) => setDraftField("tasks.task3.referenceText", event.target.value)}
                  className="field mt-1 h-28 resize-y"
                />
              </label>

              <label className="mt-3 block text-sm text-[var(--foreground)]">
                URL эталонного аудио
                <input
                  value={draftTest.tasks.task3.referenceAudioUrl}
                  onChange={(event) => setDraftField("tasks.task3.referenceAudioUrl", event.target.value)}
                  className="field mt-1"
                  placeholder="/media/uploads/..."
                />
              </label>
              <AudioPreview backendUrl={backendUrl} src={draftTest.tasks.task3.referenceAudioUrl} />
            </section>

            <section className="surface p-5">
              <h3 className="text-2xl font-medium text-[var(--foreground)]">Аудио инструменты</h3>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Можно загрузить файл или сразу сгенерировать TTS в выбранное поле.
              </p>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="text-sm text-[var(--foreground)] md:col-span-2">
                  Поле назначения
                  <select
                    value={audioTargetPath}
                    onChange={(event) => setAudioTargetPath(event.target.value)}
                    className="field mt-1"
                  >
                    {audioTargets.map((target) => (
                      <option key={target.pathValue} value={target.pathValue}>
                        {target.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="surface-soft p-4">
                  <p className="text-sm font-semibold text-[var(--foreground)]">Загрузка файла</p>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={(event) => setAudioFile(event.target.files?.[0] || null)}
                    className="mt-3 block w-full text-sm text-[var(--foreground)]"
                  />
                  <button
                    type="button"
                    onClick={handleUploadAudio}
                    disabled={saving || !audioFile || !audioTargetPath}
                    className="btn btn-primary mt-3"
                  >
                    Загрузить в выбранное поле
                  </button>
                </div>

                <div className="surface-soft p-4">
                  <p className="text-sm font-semibold text-[var(--foreground)]">Генерация TTS</p>
                  <input
                    value={voice}
                    onChange={(event) => setVoice(event.target.value)}
                    className="field mt-3"
                    placeholder="Голос (austin)"
                  />
                  <textarea
                    value={ttsText}
                    onChange={(event) => setTtsText(event.target.value)}
                    className="field mt-3 h-24 resize-none"
                    placeholder="Текст для озвучки"
                  />
                  <button
                    type="button"
                    onClick={handleGenerateTtsToField}
                    disabled={saving || !ttsText.trim() || !audioTargetPath}
                    className="btn btn-primary mt-3"
                  >
                    Сгенерировать в выбранное поле
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleGenerateTestAudio(false)}
                  disabled={saving || !selectedId}
                  className="btn btn-outline"
                >
                  Сгенерировать недостающее аудио
                </button>
                <button
                  type="button"
                  onClick={() => handleGenerateTestAudio(true)}
                  disabled={saving || !selectedId}
                  className="btn btn-outline"
                >
                  Перегенерировать всё аудио варианта
                </button>
              </div>

              {lastAudioUrl && (
                <div className="status-success mt-3 rounded-xl p-3 text-sm">
                  Последний файл: {lastAudioUrl}
                  <audio controls src={lastAudioUrl} className="mt-2 w-full" />
                </div>
              )}
            </section>

            <section className="surface p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-2xl font-medium text-[var(--foreground)]">Raw JSON (advanced)</h3>
                <button
                  type="button"
                  onClick={() => setRawEditorOpen((previous) => !previous)}
                  className="btn btn-outline text-sm"
                >
                  {rawEditorOpen ? "Скрыть JSON" : "Показать JSON"}
                </button>
              </div>

              {rawEditorOpen && (
                <div className="mt-3">
                  <textarea
                    value={rawEditorValue}
                    onChange={(event) => setRawEditorValue(event.target.value)}
                    className="h-[340px] w-full rounded-2xl border border-[var(--border)] bg-[var(--secondary)] p-3 font-mono text-sm text-[var(--foreground)]"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={handleApplyRawJson} className="btn btn-outline">
                      Применить JSON в форму
                    </button>
                    <button type="button" onClick={handleSyncRawFromForm} className="btn btn-outline">
                      Обновить JSON из формы
                    </button>
                  </div>
                </div>
              )}
            </section>
          </section>
        </section>

        <section className="surface p-5">
          <h3 className="text-2xl font-medium text-[var(--foreground)]">Пользователи</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm text-[var(--foreground)]">
              <thead className="text-[var(--muted-foreground)]">
                <tr>
                  <th className="px-2 py-2">Email</th>
                  <th className="px-2 py-2">Имя</th>
                  <th className="px-2 py-2">Роль</th>
                  <th className="px-2 py-2">Тариф</th>
                  <th className="px-2 py-2">Действия</th>
                </tr>
              </thead>
              <tbody>
                {users.map((item) => (
                  <tr key={item.id} className="border-t border-[var(--border)]">
                    <td className="px-2 py-2">{item.email}</td>
                    <td className="px-2 py-2">{item.displayName || "вЂ”"}</td>
                    <td className="px-2 py-2">{item.role}</td>
                    <td className="px-2 py-2">{item.isPro ? "PRO" : "FREE"}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleRole(item.id, item.role === "admin" ? "user" : "admin")}
                          disabled={saving}
                          className="btn btn-outline text-xs"
                        >
                          {item.role === "admin" ? "Сделать пользователем" : "Сделать админом"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePro(item.id, !item.isPro)}
                          disabled={saving}
                          className="btn btn-outline text-xs"
                        >
                          {item.isPro ? "Отключить PRO" : "Выдать PRO"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {error && <p className="status-error rounded-xl p-3 text-sm">{error}</p>}
        {info && <p className="status-success rounded-xl p-3 text-sm">{info}</p>}
      </div>
    </main>
  );
}





