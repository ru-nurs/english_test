"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  AUTH_SESSION_EVENT,
  apiRequest,
  clearAuthSession,
  setAuthSession,
} from "@/lib/api";

function LogoMark() {
  return (
    <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)]">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
    </span>
  );
}

function MenuButton({ open, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--muted-foreground)] md:hidden"
      aria-label={open ? "Закрыть меню" : "Открыть меню"}
      aria-expanded={open}
    >
      {open ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="m6 6 12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M4 12h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}

function navItemClass(isActive) {
  return `rounded-lg px-3 py-2 text-sm transition-colors ${
    isActive
      ? "bg-[var(--secondary)] text-[var(--foreground)]"
      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
  }`;
}

function toInitials(user) {
  const source = String(user?.displayName || user?.email || "U").trim();
  if (!source) {
    return "U";
  }

  if (source.includes("@")) {
    return source.slice(0, 1).toUpperCase();
  }

  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 1).toUpperCase();
  }

  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAuthPage = pathname === "/login" || pathname === "/register";

  const links = useMemo(() => {
    if (user) {
      return [
        { href: "/", label: "Главная" },
        { href: "/practice", label: "Тренировка" },
        { href: "/profile", label: "Прогресс" },
        { href: "/plans", label: "Тарифы" },
      ];
    }

    return [
      { href: "/", label: "Главная" },
      { href: "/plans", label: "Тарифы" },
    ];
  }, [user]);

  const loadUser = useCallback(async () => {
    try {
      const data = await apiRequest("/api/auth/me");
      setUser(data.user || null);
      setAuthSession({ user: data.user || null });
    } catch (error) {
      clearAuthSession();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser, pathname]);

  useEffect(() => {
    const handleStorage = () => {
      loadUser();
    };
    const handleAuthSessionUpdate = () => {
      loadUser();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(AUTH_SESSION_EVENT, handleAuthSessionUpdate);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(AUTH_SESSION_EVENT, handleAuthSessionUpdate);
    };
  }, [loadUser]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    try {
      await apiRequest("/api/auth/logout", {
        method: "POST",
      });
    } catch (error) {
      // ignore
    }

    clearAuthSession();
    setUser(null);
    router.push("/");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--card)]/95 backdrop-blur">
      <div className="page-wrap">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3">
            <LogoMark />
            <span className="font-medium text-[var(--foreground)]">SpeakEasy</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {!loading && !isAuthPage &&
              links.map((item) => (
                <Link key={item.href} href={item.href} className={navItemClass(pathname === item.href)}>
                  {item.label}
                </Link>
              ))}

            {!loading && user?.role === "admin" && (
              <Link href="/admin" className={navItemClass(pathname === "/admin")}>
                Админ
              </Link>
            )}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            {!loading && !user && !isAuthPage && (
              <>
                <Link href="/login" className="btn btn-outline px-4 py-2 text-sm">
                  Войти
                </Link>
                <Link href="/register" className="btn btn-primary px-4 py-2 text-sm">
                  Регистрация
                </Link>
              </>
            )}

            {!loading && user && (
              <>
                <Link href="/profile" className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--secondary)] px-3 py-1.5">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--primary)] text-xs font-semibold text-[var(--primary-foreground)]">
                    {toInitials(user)}
                  </span>
                  <span className="max-w-[160px] truncate text-sm text-[var(--foreground)]">
                    {user.displayName || user.email}
                  </span>
                </Link>
                <button type="button" onClick={handleLogout} className="btn btn-outline px-4 py-2 text-sm">
                  Выйти
                </button>
              </>
            )}
          </div>

          <MenuButton open={mobileOpen} onClick={() => setMobileOpen((prev) => !prev)} />
        </div>

        {mobileOpen && (
          <div className="border-t border-[var(--border)] py-3 md:hidden">
            {!loading && !isAuthPage && (
              <div className="space-y-1">
                {links.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`block rounded-lg px-3 py-2 ${
                      pathname === item.href
                        ? "bg-[var(--secondary)] text-[var(--foreground)]"
                        : "text-[var(--muted-foreground)]"
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}

                {user?.role === "admin" && (
                  <Link
                    href="/admin"
                    className={`block rounded-lg px-3 py-2 ${
                      pathname === "/admin"
                        ? "bg-[var(--secondary)] text-[var(--foreground)]"
                        : "text-[var(--muted-foreground)]"
                    }`}
                  >
                    Админ
                  </Link>
                )}

                {!user ? (
                  <div className="mt-2 flex gap-2">
                    <Link href="/login" className="btn btn-outline flex-1">
                      Войти
                    </Link>
                    <Link href="/register" className="btn btn-primary flex-1">
                      Регистрация
                    </Link>
                  </div>
                ) : (
                  <button type="button" onClick={handleLogout} className="btn btn-outline mt-2 w-full">
                    Выйти
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
