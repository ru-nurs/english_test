const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000";

const AUTH_STORAGE_KEY = "authSessionUser";
export const AUTH_SESSION_EVENT = "auth-session-updated";

export function getBackendUrl() {
  return BACKEND_URL;
}

function readStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return {
      user: parsed.user || null,
    };
  } catch (error) {
    return null;
  }
}

function writeStorage(value) {
  if (typeof window === "undefined") {
    return;
  }

  const currentRaw = localStorage.getItem(AUTH_STORAGE_KEY);
  const nextRaw =
    value && value.user
      ? JSON.stringify({
          user: value.user,
        })
      : null;

  if (currentRaw === nextRaw) {
    return;
  }

  if (!nextRaw) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } else {
    localStorage.setItem(AUTH_STORAGE_KEY, nextRaw);
  }

  window.dispatchEvent(new Event(AUTH_SESSION_EVENT));
}

export function getAuthSession() {
  return readStorage();
}

export function getToken() {
  return "";
}

export function getRefreshToken() {
  return "";
}

export function setAuthSession(session) {
  const current = readStorage() || { user: null };
  const next = {
    user: session?.user ?? current.user ?? null,
  };
  writeStorage(next);
}

export function clearAuthSession() {
  writeStorage(null);
}

export function setToken(token) {
  if (!token) {
    clearAuthSession();
  }
}

let refreshInFlight = null;

async function refreshAccessToken() {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${BACKEND_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    })
      .then(async (response) => {
        if (!response.ok) {
          return false;
        }

        const data = await response.json().catch(() => null);
        setAuthSession({
          user: data?.user || null,
        });
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight;
}

export async function apiRequest(path, options = {}) {
  const { method = "GET", token, body, isFormData = false, skipAuthRefresh = false } = options;

  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (!isFormData && body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  let response;
  try {
    response = await fetch(`${BACKEND_URL}${path}`, {
      method,
      credentials: "include",
      headers,
      body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
    });
  } catch (error) {
    throw new Error(`Не удается подключиться к серверу (${BACKEND_URL}). Убедитесь, что backend запущен.`);
  }

  const shouldAttemptRefresh =
    response.status === 401 &&
    !skipAuthRefresh &&
    path !== "/api/auth/refresh" &&
    path !== "/api/auth/login" &&
    path !== "/api/auth/register" &&
    path !== "/api/auth/bootstrap-admin";

  if (shouldAttemptRefresh) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return apiRequest(path, {
        ...options,
        skipAuthRefresh: true,
      });
    }
    clearAuthSession();
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }

  return data;
}
