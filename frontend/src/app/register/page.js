"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiRequest, setAuthSession } from "@/lib/api";

function LogoMark() {
  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary)] text-[var(--primary-foreground)]">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M3 6.5C3 5.672 3.672 5 4.5 5H10C11.38 5 12.5 6.12 12.5 7.5V19H7.5C5.01472 19 3 16.9853 3 14.5V6.5Z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M21 6.5C21 5.672 20.328 5 19.5 5H14C12.62 5 11.5 6.12 11.5 7.5V19H16.5C18.9853 19 21 16.9853 21 14.5V6.5Z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
      </svg>
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setError("Введите имя (минимум 2 символа).");
      return;
    }

    setLoading(true);

    try {
      const data = await apiRequest("/api/auth/register", {
        method: "POST",
        body: { displayName: trimmedName, email: email.trim(), password },
      });

      setAuthSession({
        user: data.user,
      });

      router.push("/profile");
      router.refresh();
    } catch (submitError) {
      setError(submitError.message || "Ошибка регистрации");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 sm:p-10">
          <div className="mb-8 flex justify-center">
            <LogoMark />
          </div>

          <h1 className="mb-2 text-center text-3xl font-medium text-[var(--foreground)]">Создать аккаунт</h1>
          <p className="mb-8 text-center text-[var(--muted-foreground)]">Начните бесплатную подготовку</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <label className="block">
              <span className="mb-2 block text-sm text-[var(--foreground)]">Имя</span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-background)] px-4 py-3 focus:ring-2 focus:ring-[var(--ring)]"
                placeholder="Иван"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-[var(--foreground)]">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-background)] px-4 py-3 focus:ring-2 focus:ring-[var(--ring)]"
                placeholder="ivan@example.com"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-[var(--foreground)]">Пароль</span>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--input-background)] px-4 py-3 focus:ring-2 focus:ring-[var(--ring)]"
                placeholder="••••••••"
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[var(--primary)] py-3.5 text-[var(--primary-foreground)] transition-opacity hover:opacity-90"
            >
              {loading ? "Создаём аккаунт..." : "Зарегистрироваться"}
            </button>

            {error && <p className="rounded-xl border border-[#fed7d7] bg-[#fff5f5] p-3 text-sm text-[#c53030]">{error}</p>}
          </form>

          <div className="mt-8 text-center">
            <span className="text-[var(--muted-foreground)]">Уже есть аккаунт? </span>
            <Link href="/login" className="text-[var(--primary)] hover:underline">
              Войти
            </Link>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-[var(--muted-foreground)]">
          Продолжая, вы соглашаетесь с условиями использования
        </p>
      </div>
    </main>
  );
}
