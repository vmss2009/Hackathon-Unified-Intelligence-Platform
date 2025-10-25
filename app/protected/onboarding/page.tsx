"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  OnboardingAttachment,
  OnboardingField,
  OnboardingFieldOption,
  OnboardingFieldResponse,
  OnboardingFieldType,
  OnboardingForm,
  OnboardingSection,
} from "@/lib/onboarding/types";

const createOption = (): OnboardingFieldOption => ({
  id: crypto.randomUUID(),
  label: "New option",
  value: "new-option",
});

const createField = (type: OnboardingFieldType = "text"): OnboardingField => ({
  id: crypto.randomUUID(),
  label: "New field",
  type,
  required: false,
  description: "",
  placeholder: "",
  options: type === "select" ? [createOption()] : undefined,
  multiple: type === "file" ? false : undefined,
});

const createSection = (): OnboardingSection => ({
  id: crypto.randomUUID(),
  title: "New section",
  description: "",
  fields: [createField()],
});

type Mode = "configure" | "apply";

type UploadState = {
  uploading: boolean;
  error: string | null;
};

type FieldState = {
  value: string | string[] | null;
  attachments: OnboardingAttachment[];
};

export default function OnboardingPage() {
  const [mode, setMode] = useState<Mode>("apply");
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<OnboardingForm | null>(null);
  const [fieldsState, setFieldsState] = useState<Record<string, FieldState>>({});
  const [uploadState, setUploadState] = useState<Record<string, UploadState>>({});
  const router = useRouter();

  useEffect(() => {
    let active = true;

    fetch("/api/protected/onboarding/config")
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Failed to fetch onboarding config");
        }
        return (await res.json()) as { ok: boolean; form: OnboardingForm };
      })
      .then((payload) => {
        if (!active) return;
        if (!payload.ok) {
          throw new Error("Config unavailable");
        }
        setConfig(payload.form);
        initializeFieldState(payload.form);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load configuration");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const initializeFieldState = (form: OnboardingForm) => {
    const state: Record<string, FieldState> = {};
    form.sections.forEach((section) => {
      section.fields.forEach((field) => {
        state[field.id] = {
          value: field.type === "file" ? null : "",
          attachments: [],
        };
      });
    });
    setFieldsState(state);
  };

  const handleAddSection = () => {
    if (!config) return;
    setConfig({
      ...config,
      sections: [...config.sections, createSection()],
    });
  };

  const handleUpdateSection = (sectionId: string, updates: Partial<OnboardingSection>) => {
    if (!config) return;
    setConfig({
      ...config,
      sections: config.sections.map((section) =>
        section.id === sectionId ? { ...section, ...updates } : section,
      ),
    });
  };

  const handleRemoveSection = (sectionId: string) => {
    if (!config) return;
    setConfig({
      ...config,
      sections: config.sections.filter((section) => section.id !== sectionId),
    });
  };

  const handleAddField = (sectionId: string, type: OnboardingFieldType) => {
    if (!config) return;
    setConfig({
      ...config,
      sections: config.sections.map((section) =>
        section.id === sectionId
          ? { ...section, fields: [...section.fields, createField(type)] }
          : section,
      ),
    });
  };

  const handleUpdateField = (
    sectionId: string,
    fieldId: string,
    updates: Partial<OnboardingField>,
  ) => {
    if (!config) return;
    setConfig({
      ...config,
      sections: config.sections.map((section) => {
        if (section.id !== sectionId) return section;
        return {
          ...section,
          fields: section.fields.map((field) =>
            field.id === fieldId
              ? {
                  ...field,
                  ...updates,
                  options:
                    updates.type === "select" || field.type === "select"
                      ? (updates.options ?? field.options ?? []).map((option) => ({
                          ...option,
                          label: option.label,
                          value: option.value,
                        }))
                      : undefined,
                }
              : field,
          ),
        };
      }),
    });
  };

  const handleRemoveField = (sectionId: string, fieldId: string) => {
    if (!config) return;
    setConfig({
      ...config,
      sections: config.sections.map((section) =>
        section.id === sectionId
          ? { ...section, fields: section.fields.filter((field) => field.id !== fieldId) }
          : section,
      ),
    });
  };

  const handleAddOption = (sectionId: string, fieldId: string) => {
    if (!config) return;
    setConfig({
      ...config,
      sections: config.sections.map((section) => {
        if (section.id !== sectionId) return section;
        return {
          ...section,
          fields: section.fields.map((field) =>
            field.id === fieldId
              ? {
                  ...field,
                  options: [...(field.options ?? []), createOption()],
                }
              : field,
          ),
        };
      }),
    });
  };

  const handleUpdateOption = (
    sectionId: string,
    fieldId: string,
    optionId: string,
    updates: Partial<OnboardingFieldOption>,
  ) => {
    if (!config) return;
    setConfig({
      ...config,
      sections: config.sections.map((section) => {
        if (section.id !== sectionId) return section;
        return {
          ...section,
          fields: section.fields.map((field) => {
            if (field.id !== fieldId) return field;
            return {
              ...field,
              options: (field.options ?? []).map((option) =>
                option.id === optionId ? { ...option, ...updates } : option,
              ),
            };
          }),
        };
      }),
    });
  };

  const handleRemoveOption = (sectionId: string, fieldId: string, optionId: string) => {
    if (!config) return;
    setConfig({
      ...config,
      sections: config.sections.map((section) => {
        if (section.id !== sectionId) return section;
        return {
          ...section,
          fields: section.fields.map((field) =>
            field.id === fieldId
              ? {
                  ...field,
                  options: (field.options ?? []).filter((option) => option.id !== optionId),
                }
              : field,
          ),
        };
      }),
    });
  };

  const saveConfig = () => {
    if (!config) return;
    setSavingConfig(true);
    fetch("/api/protected/onboarding/config", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ form: config }),
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Failed to save configuration");
        }
        return (await res.json()) as { ok: boolean; form: OnboardingForm };
      })
      .then((payload) => {
        if (!payload.ok) throw new Error("Save rejected");
        setConfig(payload.form);
        initializeFieldState(payload.form);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Unable to save configuration");
      })
      .finally(() => {
        setSavingConfig(false);
      });
  };

  const viewModeLabel = useMemo(
    () => (mode === "configure" ? "Configure Form" : "Apply Now"),
    [mode],
  );

  const handleFieldValueChange = (fieldId: string, value: string | string[] | null) => {
    setFieldsState((prev) => ({
      ...prev,
      [fieldId]: {
        ...(prev[fieldId] ?? { attachments: [], value: null }),
        value,
      },
    }));
  };

  const handleFileSelection = async (field: OnboardingField, files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploadState((prev) => ({
      ...prev,
      [field.id]: { uploading: true, error: null },
    }));

    const attachments: OnboardingAttachment[] = [];

    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/protected/onboarding/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          throw new Error(`Upload failed: ${file.name}`);
        }

        const payload = (await res.json()) as {
          ok: boolean;
          attachment?: OnboardingAttachment;
          error?: string;
        };

        if (!payload.ok || !payload.attachment) {
          throw new Error(payload.error ?? "Upload failed");
        }

        attachments.push(payload.attachment);
      }

      setFieldsState((prev) => ({
        ...prev,
        [field.id]: {
          value: null,
          attachments: field.multiple
            ? [...(prev[field.id]?.attachments ?? []), ...attachments]
            : attachments,
        },
      }));
    } catch (err) {
      setUploadState((prev) => ({
        ...prev,
        [field.id]: {
          uploading: false,
          error: err instanceof Error ? err.message : "Upload failed",
        },
      }));
      return;
    }

    setUploadState((prev) => ({
      ...prev,
      [field.id]: { uploading: false, error: null },
    }));
  };

  const handleRemoveAttachment = (fieldId: string, key: string) => {
    setFieldsState((prev) => ({
      ...prev,
      [fieldId]: {
        ...(prev[fieldId] ?? { attachments: [], value: null }),
        attachments: (prev[fieldId]?.attachments ?? []).filter((item) => item.key !== key),
      },
    }));
  };

  const submitApplication = () => {
    if (!config) return;
    setSubmitting(true);

    const responses: OnboardingFieldResponse[] = config.sections.flatMap((section) =>
      section.fields.map((field) => ({
        fieldId: field.id,
        value: fieldsState[field.id]?.value ?? null,
        attachments: fieldsState[field.id]?.attachments ?? [],
      })),
    );

    fetch("/api/protected/onboarding/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        formId: config.id,
        responses,
      }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Unable to submit application");
        return (await res.json()) as { ok: boolean };
      })
      .then((payload) => {
        if (!payload.ok) throw new Error("Submission rejected");
        router.push("/protected");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Submission failed");
      })
      .finally(() => setSubmitting(false));
  };

  const renderFieldControl = (field: OnboardingField, sectionId: string) => {
    const state = fieldsState[field.id] ?? { value: "", attachments: [] };

    switch (field.type) {
      case "textarea":
        return (
          <textarea
            value={(state.value as string) ?? ""}
            onChange={(event) => handleFieldValueChange(field.id, event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            placeholder={field.placeholder ?? ""}
            rows={4}
          />
        );
      case "date":
        return (
          <input
            type="date"
            value={(state.value as string) ?? ""}
            onChange={(event) => handleFieldValueChange(field.id, event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
          />
        );
      case "select":
        return (
          <select
            value={(state.value as string) ?? ""}
            onChange={(event) => handleFieldValueChange(field.id, event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
          >
            <option value="">Select an option</option>
            {(field.options ?? []).map((option) => (
              <option key={option.id} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );
      case "file":
        return (
          <div className="space-y-3">
            <label className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-blue-500/60 bg-slate-900/40 px-6 py-6 text-center text-sm text-blue-300 transition hover:border-blue-400 hover:bg-blue-500/5">
              <span className="font-medium">Upload supporting documents</span>
              <span className="text-xs text-blue-200/70">
                {field.multiple ? "You can add multiple files" : "Single file upload"}
              </span>
              <input
                type="file"
                className="hidden"
                multiple={field.multiple}
                onChange={(event) => handleFileSelection(field, event.target.files)}
              />
            </label>
            {uploadState[field.id]?.error && (
              <p className="text-sm text-red-400">{uploadState[field.id]?.error}</p>
            )}
            <ul className="space-y-2">
              {(state.attachments ?? []).map((attachment) => (
                <li
                  key={attachment.key}
                  className="flex items-center justify-between rounded-md bg-slate-900/60 px-4 py-2 text-sm text-slate-200"
                >
                  <span className="truncate">{attachment.name}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(field.id, attachment.key)}
                    className="text-xs text-red-300 hover:text-red-200"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      default:
        return (
          <input
            type="text"
            value={(state.value as string) ?? ""}
            onChange={(event) => handleFieldValueChange(field.id, event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            placeholder={field.placeholder ?? ""}
          />
        );
    }
  };

  const renderConfigureFieldControl = (
    field: OnboardingField,
    sectionId: string,
  ) => (
    <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-xs font-medium uppercase tracking-wide text-blue-200/70">
          Label
          <input
            type="text"
            value={field.label}
            onChange={(event) =>
              handleUpdateField(sectionId, field.id, { label: event.target.value })
            }
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-2 text-xs font-medium uppercase tracking-wide text-blue-200/70">
          Field Type
          <select
            value={field.type}
            onChange={(event) =>
              handleUpdateField(sectionId, field.id, {
                type: event.target.value as OnboardingFieldType,
                options:
                  event.target.value === "select"
                    ? field.options?.length
                      ? field.options
                      : [createOption()]
                    : undefined,
              })
            }
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
          >
            <option value="text">Short text</option>
            <option value="textarea">Long answer</option>
            <option value="date">Date</option>
            <option value="select">Dropdown</option>
            <option value="file">File upload</option>
          </select>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-xs font-medium uppercase tracking-wide text-blue-200/70">
          Placeholder / Helper
          <input
            type="text"
            value={field.placeholder ?? ""}
            onChange={(event) =>
              handleUpdateField(sectionId, field.id, { placeholder: event.target.value })
            }
            className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
          />
        </label>
        <label className="flex flex-row items-center gap-3 text-xs font-medium uppercase tracking-wide text-blue-200/70">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(event) =>
              handleUpdateField(sectionId, field.id, { required: event.target.checked })
            }
            className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-blue-500 focus:ring-blue-500"
          />
          Required
        </label>
      </div>

      {field.type === "file" && (
        <label className="flex flex-row items-center gap-3 text-xs font-medium uppercase tracking-wide text-blue-200/70">
          <input
            type="checkbox"
            checked={!!field.multiple}
            onChange={(event) =>
              handleUpdateField(sectionId, field.id, { multiple: event.target.checked })
            }
            className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-blue-500 focus:ring-blue-500"
          />
          Allow multiple files
        </label>
      )}

      {field.type === "select" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-blue-200/70">
              Options
            </span>
            <button
              type="button"
              onClick={() => handleAddOption(sectionId, field.id)}
              className="text-xs font-medium text-blue-300 hover:text-blue-200"
            >
              Add option
            </button>
          </div>
          <div className="space-y-2">
            {(field.options ?? []).map((option) => (
              <div key={option.id} className="flex items-center gap-2">
                <input
                  type="text"
                  value={option.label}
                  onChange={(event) =>
                    handleUpdateOption(sectionId, field.id, option.id, {
                      label: event.target.value,
                      value: event.target.value.toLowerCase().replace(/\s+/g, "-"),
                    })
                  }
                  className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveOption(sectionId, field.id, option.id)}
                  className="text-xs text-red-300 hover:text-red-200"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => handleRemoveField(sectionId, field.id)}
        className="text-xs text-red-300 hover:text-red-200"
      >
        Remove field
      </button>
    </div>
  );

  if (loading) {
    return (
      <section className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-blue-200/80">Loading onboarding workspace…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <p className="text-sm text-red-300">{error}</p>
        <button
          onClick={() => router.refresh()}
          className="rounded-md border border-blue-500/70 px-4 py-2 text-sm font-medium text-blue-200 transition hover:bg-blue-500/10"
        >
          Try again
        </button>
      </section>
    );
  }

  if (!config) {
    return null;
  }

  return (
    <section className="space-y-8 p-8">
      <header className="flex flex-col gap-4 rounded-xl border border-slate-800/70 bg-slate-950/60 p-6 shadow-xl shadow-blue-900/20">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-400/80">
              Startup onboarding
            </p>
            <h1 className="text-3xl font-bold text-slate-100">{config.title}</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMode(mode === "configure" ? "apply" : "configure")}
              className="rounded-full border border-blue-500/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-blue-200 transition hover:bg-blue-500/10"
            >
              {mode === "configure" ? "Switch to application" : "Switch to builder"}
            </button>
            <Link
              href="/protected"
              className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-300 transition hover:bg-slate-900/70"
            >
              Dashboard
            </Link>
          </div>
        </div>
        <p className="max-w-3xl text-sm text-slate-300/90">{config.summary}</p>
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <span className="rounded-full border border-slate-800 px-3 py-1">
            Last updated {new Date(config.updatedAt).toLocaleString()}
          </span>
          <span className="rounded-full border border-slate-800 px-3 py-1">
            Version {config.version}
          </span>
        </div>
      </header>

      {mode === "configure" ? (
        <div className="space-y-8">
          {config.sections.map((section) => (
            <div
              key={section.id}
              className="space-y-4 rounded-xl border border-slate-800/80 bg-slate-950/60 p-6"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <input
                    type="text"
                    value={section.title}
                    onChange={(event) =>
                      handleUpdateSection(section.id, { title: event.target.value })
                    }
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-lg font-semibold text-slate-100 focus:border-blue-500 focus:outline-none"
                  />
                  <textarea
                    value={section.description ?? ""}
                    onChange={(event) =>
                      handleUpdateSection(section.id, { description: event.target.value })
                    }
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none"
                    placeholder="Explain what this section covers"
                    rows={3}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveSection(section.id)}
                  className="self-start text-xs text-red-300 hover:text-red-200"
                >
                  Remove section
                </button>
              </div>

              <div className="space-y-4">
                {section.fields.map((field) => (
                  <div key={field.id}>{renderConfigureFieldControl(field, section.id)}</div>
                ))}
              </div>

              <div className="flex flex-wrap gap-3">
                {(["text", "textarea", "date", "select", "file"] as OnboardingFieldType[]).map(
                  (type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleAddField(section.id, type)}
                      className="rounded-full border border-slate-700 px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-300 transition hover:border-blue-500 hover:text-blue-200"
                    >
                      Add {type}
                    </button>
                  ),
                )}
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between">
            <button
              onClick={handleAddSection}
              className="rounded-full border border-blue-500/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-blue-200 transition hover:bg-blue-500/10"
            >
              Add new section
            </button>
            <button
              onClick={saveConfig}
              disabled={savingConfig}
              className="rounded-full border border-emerald-500/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-200 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingConfig ? "Saving…" : "Save configuration"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {config.sections.map((section) => (
            <div
              key={section.id}
              className="space-y-6 rounded-xl border border-slate-800/80 bg-slate-950/60 p-6"
            >
              <div>
                <h2 className="text-xl font-semibold text-slate-100">{section.title}</h2>
                {section.description && (
                  <p className="mt-1 text-sm text-slate-400">{section.description}</p>
                )}
              </div>

              <div className="space-y-5">
                {section.fields.map((field) => (
                  <div key={field.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-slate-200">
                        {field.label}
                        {field.required && <span className="ml-2 text-xs text-red-300">*</span>}
                      </label>
                      {field.description && (
                        <span className="text-xs text-slate-500">{field.description}</span>
                      )}
                    </div>
                    {renderFieldControl(field, section.id)}
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="flex items-center justify-end">
            <button
              onClick={submitApplication}
              disabled={submitting}
              className="rounded-full border border-blue-500/70 px-6 py-3 text-sm font-semibold uppercase tracking-wide text-blue-100 transition hover:bg-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Submitting…" : "Submit application"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
