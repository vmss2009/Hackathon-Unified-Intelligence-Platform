"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type ManagedUser = {
  id: string;
  email: string;
  name: string | null;
  phone?: string | null;
  role?: string | null;
  isActive: boolean;
  createdAt: string;
  permissions: string[];
  startupIds: string[];
};

type FetchState = "idle" | "loading" | "error";

type SubmitState = "idle" | "submitting" | "success" | "error";

type StartupOption = {
  id: string;
  label: string;
  stage?: string | null;
  status?: string | null;
  submittedAt?: string | null;
};

const defaultFormState = {
  email: "",
  name: "",
  phone: "",
  role: "incubatee" as "incubatee" | "admin",
  startupIds: [] as string[],
  status: "active" as "active" | "inactive",
};

type FormState = typeof defaultFormState;

export default function AdminUsersPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(() => ({ ...defaultFormState }));
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [toggleLoadingId, setToggleLoadingId] = useState<string | null>(null);
  const [startupOptions, setStartupOptions] = useState<StartupOption[]>([]);
  const [startupFetchState, setStartupFetchState] = useState<FetchState>("idle");
  const [startupFetchError, setStartupFetchError] = useState<string | null>(null);

  const isEditing = editingUserId !== null;

  const loadUsers = useCallback(async () => {
    setFetchState("loading");
    setFetchError(null);
    try {
      const res = await fetch("/api/protected/admin/users", { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 403) {
          setFetchError("You do not have permission to view users.");
        } else {
          setFetchError("Failed to load users.");
        }
        setFetchState("error");
        return;
      }

      const payload = (await res.json()) as { ok: boolean; users?: ManagedUser[] };
      if (!payload.ok || !payload.users) {
        setFetchError("Unexpected response while loading users.");
        setFetchState("error");
        return;
      }

      setUsers(payload.users);
      setFetchState("idle");
    } catch (error) {
      console.error("Failed to fetch admin users", error);
      setFetchError("Network error while loading users.");
      setFetchState("error");
    }
  }, []);

  const loadStartups = useCallback(async () => {
    setStartupFetchState("loading");
    setStartupFetchError(null);
    try {
      const res = await fetch("/api/protected/admin/startups", { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 403) {
          setStartupFetchError("You do not have permission to view startups.");
        } else {
          setStartupFetchError("Failed to load startups.");
        }
        setStartupFetchState("error");
        return;
      }

      const payload = (await res.json()) as { ok: boolean; startups?: StartupOption[] };
      if (!payload.ok || !payload.startups) {
        setStartupFetchError("Unexpected response while loading startups.");
        setStartupFetchState("error");
        return;
      }

      const sorted = [...payload.startups].sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
      );
      setStartupOptions(sorted);
      setStartupFetchState("idle");
    } catch (error) {
      console.error("Failed to fetch admin startups", error);
      setStartupFetchError("Network error while loading startups.");
      setStartupFetchState("error");
    }
  }, []);

  useEffect(() => {
    void loadUsers();
    void loadStartups();
  }, [loadUsers, loadStartups]);

  const handleInputChange = useCallback((event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setFormState((prev) => {
      switch (name) {
        case "role":
          return {
            ...prev,
            role: value === "admin" ? "admin" : "incubatee",
            startupIds: value === "incubatee" ? prev.startupIds : [],
          };
        case "status":
          return {
            ...prev,
            status: value === "inactive" ? "inactive" : "active",
          };
        case "email":
          return { ...prev, email: value };
        case "name":
          return { ...prev, name: value };
        case "phone":
          return { ...prev, phone: value };
        default:
          return prev;
      }
    });
  }, []);

  const handleStartupSelection = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const selected = Array.from(event.target.selectedOptions).map((option) => option.value);
    setFormState((prev) => ({ ...prev, startupIds: selected }));
  }, []);

  const resetForm = useCallback(() => {
    setFormState(() => ({ ...defaultFormState, startupIds: [] }));
    setEditingUserId(null);
  }, []);

  const handleResetClick = useCallback(() => {
    resetForm();
    setSubmitError(null);
    setSubmitState("idle");
  }, [resetForm]);

  const handleSubmit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitState === "submitting") {
      return;
    }

    setSubmitState("submitting");
    setSubmitError(null);

    try {
      const res = await fetch("/api/protected/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: formState.email,
          name: formState.name,
          phone: formState.phone,
          role: formState.role,
          startupIds: formState.role === "incubatee" ? formState.startupIds : [],
          isActive: formState.status === "active",
        }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        setSubmitError(payload?.error ?? "Failed to save user.");
        setSubmitState("error");
        return;
      }

      setSubmitState("success");
      resetForm();
      await loadUsers();
      setTimeout(() => {
        setSubmitState("idle");
      }, 1500);
    } catch (error) {
      console.error("Failed to submit admin user form", error);
      setSubmitError("Network error while submitting form.");
      setSubmitState("error");
    }
  }, [formState.email, formState.name, formState.phone, formState.role, formState.startupIds, formState.status, loadUsers, resetForm, submitState]);

  const isSubmitDisabled = useMemo(() => {
    if (!formState.email.trim()) {
      return true;
    }
    if (formState.role === "incubatee" && formState.startupIds.length === 0) {
      return true;
    }
    return submitState === "submitting";
  }, [formState.email, formState.role, formState.startupIds.length, submitState]);

  const handleEditUser = useCallback((user: ManagedUser) => {
    setEditingUserId(user.id);
    setSubmitError(null);
    setSubmitState("idle");
    const resolvedRole =
      user.role === "admin"
        ? "admin"
        : user.role === "incubatee"
          ? "incubatee"
          : user.permissions.includes("onboarding:manage") || user.permissions.includes("admin:manage")
            ? "admin"
            : "incubatee";
    setFormState({
      email: user.email,
      name: user.name ?? "",
      phone: user.phone ?? "",
      role: resolvedRole,
      startupIds: resolvedRole === "incubatee" ? [...user.startupIds] : [],
      status: user.isActive ? "active" : "inactive",
    });
  }, []);

  const handleToggleActive = useCallback(async (user: ManagedUser) => {
    setToggleLoadingId(user.id);
    setFetchError(null);
    try {
      const res = await fetch(`/api/protected/admin/users/${user.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isActive: !user.isActive }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        setFetchError(payload?.error ?? `Failed to ${user.isActive ? "deactivate" : "activate"} user.`);
        return;
      }

      const payload = (await res.json()) as { ok: boolean; user?: ManagedUser };
      const updatedUser = payload.user;
      if (!payload.ok || !updatedUser) {
        setFetchError("Unexpected response while updating user status.");
        return;
      }

      if (editingUserId === user.id) {
        setFormState((prev) => ({ ...prev, status: updatedUser.isActive ? "active" : "inactive" }));
      }

      await loadUsers();
    } catch (error) {
      console.error("Failed to toggle user status", error);
      setFetchError("Network error while updating user status.");
    } finally {
      setToggleLoadingId(null);
    }
  }, [editingUserId, loadUsers]);

  const effectiveStartupOptions = useMemo(() => {
    const map = new Map<string, StartupOption>();
    startupOptions.forEach((option) => {
      map.set(option.id, option);
    });
    formState.startupIds.forEach((id) => {
      if (!map.has(id)) {
        map.set(id, { id, label: id });
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
    );
  }, [startupOptions, formState.startupIds]);

  const startupLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    effectiveStartupOptions.forEach((option) => {
      map.set(option.id, option.label);
    });
    return map;
  }, [effectiveStartupOptions]);

  const activeUsersCount = useMemo(() => users.filter((user) => user.isActive).length, [users]);

  return (
    <section className="space-y-8 p-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-slate-100">User Management</h1>
        <p className="text-sm text-slate-400">
          View all platform users, update existing accounts, or provision new admins and incubatees.
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-slate-800/70 bg-slate-950/60 p-6">
          <header className="space-y-1">
            <h2 className="text-xl font-semibold text-slate-100">{isEditing ? "Edit user" : "Add user"}</h2>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              {isEditing ? "Update profile details, permissions, or status." : "Provide contact details and role."}
            </p>
          </header>

          <div className="space-y-4">
            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Email
              <input
                required
                name="email"
                value={formState.email}
                onChange={handleInputChange}
                type="email"
                placeholder="user@example.com"
                disabled={isEditing}
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-slate-900/50"
              />
            </label>

            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Full name
              <input
                name="name"
                value={formState.name}
                onChange={handleInputChange}
                placeholder="Enter full name"
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </label>

            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Phone
              <input
                name="phone"
                value={formState.phone}
                onChange={handleInputChange}
                placeholder="Optional contact number"
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />
            </label>

            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Role
              <select
                name="role"
                value={formState.role}
                onChange={handleInputChange}
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
              >
                <option value="incubatee">Incubatee</option>
                <option value="admin">Admin</option>
              </select>
            </label>

            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Status
              <select
                name="status"
                value={formState.status}
                onChange={handleInputChange}
                className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>

            {formState.role === "incubatee" && (
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Startup access
                <select
                  name="startupIds"
                  multiple
                  value={formState.startupIds}
                  onChange={handleStartupSelection}
                  disabled={startupFetchState === "loading"}
                  className="h-36 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none disabled:cursor-wait"
                >
                  {effectiveStartupOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                      {option.stage ? ` - ${option.stage}` : ""}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] font-normal uppercase tracking-wide text-slate-500">
                  {startupFetchState === "loading"
                    ? "Loading startups..."
                    : effectiveStartupOptions.length
                      ? "Select one or more startups to link with this incubatee."
                      : "No startups found yet. Capture submissions before assigning access."}
                </span>
                {startupFetchError && (
                  <span className="text-[10px] font-normal uppercase tracking-wide text-red-400">
                    {startupFetchError}
                  </span>
                )}
              </label>
            )}
          </div>

          <div className="space-y-2">
            {submitError && <p className="text-xs text-red-400">{submitError}</p>}
            {submitState === "success" && (
              <p className="text-xs text-emerald-400">User saved successfully.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={isSubmitDisabled}
                className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-900"
              >
                {submitState === "submitting" ? "Saving..." : isEditing ? "Update user" : "Save user"}
              </button>
              <button
                type="button"
                onClick={handleResetClick}
                className="rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white"
              >
                {isEditing ? "Cancel editing" : "Reset"}
              </button>
            </div>
          </div>
        </form>

        <section className="space-y-4 rounded-2xl border border-slate-800/70 bg-slate-950/60 p-6">
          <header className="space-y-1">
            <h2 className="text-xl font-semibold text-slate-100">All users</h2>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              {fetchState === "loading"
                ? "Loading users..."
                : `${users.length} accounts • ${activeUsersCount} active`}
            </p>
          </header>

          {fetchError && <p className="text-sm text-red-400">{fetchError}</p>}

          {!fetchError && (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-800">
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Permissions</th>
                    <th className="px-3 py-2">Startup IDs</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-sm text-slate-200">
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-500">
                        No users found.
                      </td>
                    </tr>
                  )}
                  {users.map((user) => {
                    const isRowEditing = editingUserId === user.id;
                    return (
                      <tr
                        key={user.id}
                        className={[
                          !user.isActive ? "opacity-60" : "",
                          isRowEditing ? "bg-blue-950/30" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <td className="px-3 py-3">
                          <div className="flex flex-col">
                            <span className="font-medium text-slate-100">{user.name ?? "—"}</span>
                            <span className="text-xs uppercase tracking-wide text-slate-500">{user.id}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-slate-300">{user.email}</td>
                        <td className="px-3 py-3 capitalize text-slate-200">{user.role ?? "unknown"}</td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${user.isActive ? "bg-emerald-500/10 text-emerald-300" : "bg-slate-800 text-slate-400"}`}
                          >
                            {user.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1">
                            {user.permissions.length === 0 && <span className="text-xs text-slate-500">No permissions</span>}
                            {user.permissions.map((perm) => (
                              <span
                                key={perm}
                                className="rounded-full bg-slate-800 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-300"
                              >
                                {perm}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-slate-300">
                          {user.startupIds.length
                            ? user.startupIds
                                .map((id) => startupLabelMap.get(id) ?? id)
                                .join(", ")
                            : "—"}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleEditUser(user)}
                              className="rounded-md border border-slate-700 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-200 transition hover:border-slate-500 hover:text-white"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleActive(user)}
                              disabled={toggleLoadingId === user.id}
                              className={`rounded-md px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white transition disabled:cursor-not-allowed ${
                                user.isActive
                                  ? "bg-red-600 hover:bg-red-500"
                                  : "bg-emerald-600 hover:bg-emerald-500"
                              } ${toggleLoadingId === user.id ? "opacity-60" : ""}`}
                            >
                              {toggleLoadingId === user.id
                                ? "Updating..."
                                : user.isActive
                                  ? "Deactivate"
                                  : "Activate"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </section>
  );
}
