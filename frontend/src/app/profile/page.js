"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, clearAuthSession, setAuthSession } from "@/lib/api";

function StatCard({ title, value, caption }) {
  return (
    <article className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
      <p className="mb-1 text-3xl font-medium text-[var(--foreground)]">{value}</p>
      <p className="text-[var(--muted-foreground)]">{title}</p>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">{caption}</p>
    </article>
  );
}

function TaskCard({ title, subtitle, maxScore }) {
  return (
    <article className="group rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 transition-colors hover:border-[var(--primary)]">
      <h3 className="mb-2 font-medium text-[var(--foreground)]">{title}</h3>
      <p className="mb-3 text-[var(--muted-foreground)]">{subtitle}</p>
      <p className="text-sm text-[var(--muted-foreground)]">Макс. {maxScore} балл{maxScore > 1 ? "ов" : ""}</p>
      <div className="mt-3 text-sm text-[var(--primary)] opacity-0 transition-opacity group-hover:opacity-100">Перейти к тренировке →</div>
    </article>
  );
}

export default function ProfilePage() {
  const [user, setUser] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [paying, setPaying] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [meData, attemptsData] = await Promise.all([
        apiRequest("/api/auth/me"),
        apiRequest("/api/attempts"),
      ]);

      const nextUser = meData.user || null;
      setUser(nextUser);
      setDisplayNameDraft(nextUser?.displayName || nextUser?.email?.split("@")[0] || "");
      setAttempts(attemptsData.attempts || []);
      setAuthSession({ user: nextUser });
    } catch (loadError) {
      setError(loadError.message || "Не удалось загрузить профиль");
      clearAuthSession();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleMockPay = async () => {
    setPaying(true);
    setError("");
    setInfo("");
    try {
      const data = await apiRequest("/api/billing/mock-pay", {
        method: "POST",
      });
      setUser(data.user || null);
      setAuthSession({ user: data.user || null });
      setInfo("Тариф обновлен до PRO.");
    } catch (payError) {
      setError(payError.message || "Не удалось обновить тариф");
    } finally {
      setPaying(false);
    }
  };

  const handleSaveProfile = async () => {
    const trimmed = displayNameDraft.trim();
    if (trimmed.length < 2) {
      setError("Имя должно содержать минимум 2 символа.");
      return;
    }

    setSavingProfile(true);
    setError("");
    setInfo("");

    try {
      const data = await apiRequest("/api/auth/profile", {
        method: "PATCH",
        body: { displayName: trimmed },
      });

      setUser(data.user || null);
      setAuthSession({ user: data.user || null });
      setInfo("Профиль обновлен.");
    } catch (saveError) {
      setError(saveError.message || "Не удалось обновить профиль");
    } finally {
      setSavingProfile(false);
    }
  };

  const stats = useMemo(() => {
    const verifiedAttempts = attempts.filter((item) => item.scoreSource === "ai-proof");
    if (!verifiedAttempts.length) {
      return { avg: "0.0", attemptsCount: 0, best: "0.0" };
    }

    const sum = verifiedAttempts.reduce((acc, item) => acc + Number(item.totalScore || 0), 0);
    const best = verifiedAttempts.reduce((acc, item) => Math.max(acc, Number(item.totalScore || 0)), 0);

    return {
      avg: (Math.round((sum / verifiedAttempts.length) * 10) / 10).toFixed(1),
      attemptsCount: verifiedAttempts.length,
      best: (Math.round(best * 10) / 10).toFixed(1),
    };
  }, [attempts]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[var(--background)]">
        <div className="page-wrap pt-8">
          <div className="surface p-6">Загрузка профиля...</div>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-[var(--background)]">
        <div className="page-wrap pt-8">
          <div className="mx-auto max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 text-center">
            <h1 className="text-3xl font-medium text-[var(--foreground)]">Прогресс доступен после входа</h1>
            <p className="mt-3 text-[var(--muted-foreground)]">Войдите, чтобы видеть статистику и историю попыток.</p>
            <div className="mt-6 flex justify-center gap-3">
              <Link href="/login" className="btn btn-primary px-7">Войти</Link>
              <Link href="/register" className="btn btn-outline px-7">Регистрация</Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const username = user.displayName || user.email?.split("@")[0] || "ученик";

  return (
    <main className="min-h-screen bg-[var(--background)]">
      <div className="page-wrap py-8 sm:py-12">
        <section className="mb-8 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <h1 className="mb-2 text-3xl font-medium text-[var(--foreground)] sm:text-4xl">Добро пожаловать, {username}!</h1>
          <p className="mb-5 text-lg text-[var(--muted-foreground)]">Продолжайте тренировки для достижения лучших результатов</p>

          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <label className="block">
              <span className="mb-2 block text-sm text-[var(--muted-foreground)]">Отображаемое имя</span>
              <input
                type="text"
                value={displayNameDraft}
                onChange={(event) => setDisplayNameDraft(event.target.value)}
                className="field"
                maxLength={40}
                placeholder="Введите имя"
              />
            </label>
            <button
              type="button"
              onClick={handleSaveProfile}
              disabled={savingProfile}
              className="btn btn-outline h-[44px] px-6"
            >
              {savingProfile ? "Сохраняем..." : "Сохранить профиль"}
            </button>
          </div>
        </section>

        <section className="mb-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Средний балл" value={stats.avg} caption="из 5 возможных" />
          <StatCard title="Лучший результат" value={stats.best} caption="за все время" />
          <StatCard title="Всего попыток" value={stats.attemptsCount} caption="выполнено" />
          <StatCard title="Тариф" value={user.isPro ? "PRO" : "FREE"} caption={user.isPro ? "активен" : "ограниченный"} />
        </section>

        {!user.isPro && (
          <section className="mb-10">
            <button
              type="button"
              onClick={handleMockPay}
              disabled={paying}
              className="rounded-xl bg-[var(--primary)] px-8 py-3 text-[var(--primary-foreground)] transition-opacity hover:opacity-90"
            >
              {paying ? "Обрабатываем..." : "Перейти на PRO (демо)"}
            </button>
          </section>
        )}

        <section className="mb-10">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-medium text-[var(--foreground)]">Выберите задание</h2>
            <Link href="/practice" className="text-[var(--primary)] hover:underline">Открыть тренировку</Link>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <TaskCard title="Задание 1" subtitle="Чтение текста вслух" maxScore={1} />
            <TaskCard title="Задание 2" subtitle="Условный диалог-расспрос" maxScore={6} />
            <TaskCard title="Задание 3" subtitle="Тематический монолог" maxScore={7} />
          </div>
        </section>

        <section>
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-medium text-[var(--foreground)]">Последние попытки</h2>
            <Link href="/practice" className="text-[var(--primary)] hover:underline">Новая попытка</Link>
          </div>

          {attempts.length === 0 ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-[var(--muted-foreground)]">
              Пока нет сохраненных попыток.
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
              {attempts.map((attempt, index) => (
                <div
                  key={attempt.id}
                  className={`flex items-center justify-between px-6 py-4 ${index > 0 ? "border-t border-[var(--border)]" : ""}`}
                >
                  <div>
                    <p className="font-medium text-[var(--foreground)]">{attempt.testTitle}</p>
                    <p className="text-sm text-[var(--muted-foreground)]">
                      {new Date(attempt.createdAt).toLocaleString("ru-RU")}
                    </p>
                  </div>
                  <span className="rounded-lg bg-[color:rgb(56_161_105_/_0.1)] px-4 py-2 font-medium text-[var(--success)]">
                    {attempt.totalScore}/5{attempt.scoreSource === "ai-proof" ? "" : " *"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {attempts.some((item) => item.scoreSource !== "ai-proof") && (
          <p className="mt-3 text-sm text-[var(--muted-foreground)]">
            * попытка сохранена без AI-верификации, балл учитывается только как черновой.
          </p>
        )}

        {error && <p className="mt-5 rounded-xl border border-[#fed7d7] bg-[#fff5f5] p-3 text-sm text-[#c53030]">{error}</p>}
        {info && <p className="mt-5 rounded-xl border border-[#c6f6d5] bg-[#f0fff4] p-3 text-sm text-[#2f855a]">{info}</p>}
      </div>
    </main>
  );
}
