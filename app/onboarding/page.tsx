"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  OnboardingAttachment,
  OnboardingField,
  OnboardingFieldResponse,
  OnboardingFieldType,
  OnboardingForm,
} from "@/lib/onboarding/types";

const initialFieldState = (form: OnboardingForm) => {
  const state: Record<string, { value: string | string[] | null; attachments: OnboardingAttachment[] }> = {};
  form.sections.forEach((section) => {
    section.fields.forEach((field) => {
      state[field.id] = {
        value: field.type === "file" ? null : "",
        attachments: [],
      };
    });
  });
  return state;
};

export default function PublicOnboardingPage() {
  const [form, setForm] = useState<OnboardingForm | null>(null);
  const [fieldState, setFieldState] = useState<
    Record<string, { value: string | string[] | null; attachments: OnboardingAttachment[] }>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string | null>>({});
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/onboarding/config")
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Failed to load onboarding form");
        }
        return (await res.json()) as { ok: boolean; form: OnboardingForm };
      })
      .then((payload) => {
        if (!active) return;
        if (!payload.ok) {
          throw new Error("Form unavailable");
        }
        setForm(payload.form);
        setFieldState(initialFieldState(payload.form));
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Unable to load onboarding form");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const applicantId = useMemo(() => crypto.randomUUID(), []);

  const handleValueChange = (fieldId: string, value: string | string[] | null) => {
    setFieldState((prev) => ({
      ...prev,
      [fieldId]: {
        ...(prev[fieldId] ?? { value: "", attachments: [] }),
        value,
      },
    }));
  };

  const handleFileUpload = async (field: OnboardingField, files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading((prev) => ({ ...prev, [field.id]: true }));
    setUploadErrors((prev) => ({ ...prev, [field.id]: null }));

    const newAttachments: OnboardingAttachment[] = [];

    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("applicantId", applicantId);

        const res = await fetch("/api/onboarding/upload", {
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

        newAttachments.push(payload.attachment);
      }

      setFieldState((prev) => ({
        ...prev,
        [field.id]: {
          ...(prev[field.id] ?? { value: null, attachments: [] }),
          attachments: field.multiple
            ? [...(prev[field.id]?.attachments ?? []), ...newAttachments]
            : newAttachments,
          value: null,
        },
      }));
    } catch (err) {
      setUploadErrors((prev) => ({
        ...prev,
        [field.id]: err instanceof Error ? err.message : "Upload failed",
      }));
    } finally {
      setUploading((prev) => ({ ...prev, [field.id]: false }));
    }
  };

  const handleRemoveAttachment = (fieldId: string, key: string) => {
    setFieldState((prev) => ({
      ...prev,
      [fieldId]: {
        ...(prev[fieldId] ?? { value: null, attachments: [] }),
        attachments: (prev[fieldId]?.attachments ?? []).filter((item) => item.key !== key),
      },
    }));
  };

  const submitApplication = () => {
    if (!form) return;
    setSubmitting(true);
    setError(null);

    const responses: OnboardingFieldResponse[] = form.sections.flatMap((section) =>
      section.fields.map((field) => ({
        fieldId: field.id,
        value: fieldState[field.id]?.value ?? null,
        attachments: fieldState[field.id]?.attachments ?? [],
      })),
    );

    fetch("/api/onboarding/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        formId: form.id,
        responses,
        applicantId,
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Unable to submit application");
        }
        return (await res.json()) as { ok: boolean; submission?: { id: string } };
      })
      .then((payload) => {
        if (!payload.ok || !payload.submission) {
          throw new Error("Submission rejected");
        }
        setSubmittedId(payload.submission.id);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Submission failed");
      })
      .finally(() => setSubmitting(false));
  };

  const renderFieldControl = (field: OnboardingField) => {
    const state = fieldState[field.id] ?? { value: "", attachments: [] };

    switch (field.type) {
      case "textarea":
        return (
          <textarea
            value={(state.value as string) ?? ""}
            onChange={(event) => handleValueChange(field.id, event.target.value)}
            className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            placeholder={field.placeholder ?? ""}
            rows={4}
          />
        );
      case "date":
        return (
          <input
            type="date"
            value={(state.value as string) ?? ""}
            onChange={(event) => handleValueChange(field.id, event.target.value)}
            className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
          />
        );
      case "select":
        return (
          <select
            value={(state.value as string) ?? ""}
            onChange={(event) => handleValueChange(field.id, event.target.value)}
            className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 focus:border-blue-500 focus:outline-none"
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
            <label className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-blue-500/50 bg-slate-950/50 px-6 py-6 text-center text-sm text-blue-200 transition hover:border-blue-400">
              <span className="font-medium">Upload supporting documents</span>
              <span className="text-xs text-blue-200/70">
                {field.multiple ? "You can add multiple files" : "Single file upload"}
              </span>
              <input
                type="file"
                className="hidden"
                multiple={field.multiple}
                onChange={(event) => handleFileUpload(field, event.target.files)}
              />
            </label>
            {uploadErrors[field.id] && (
              <p className="text-sm text-red-400">{uploadErrors[field.id]}</p>
            )}
            {uploading[field.id] && (
              <p className="text-xs text-blue-200/80">Uploading…</p>
            )}
            <ul className="space-y-2">
              {(state.attachments ?? []).map((attachment) => (
                <li
                  key={attachment.key}
                  className="flex items-center justify-between rounded-md bg-slate-950/70 px-4 py-2 text-sm text-slate-200"
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
            onChange={(event) => handleValueChange(field.id, event.target.value)}
            className="w-full rounded-lg border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            placeholder={field.placeholder ?? ""}
          />
        );
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-blue-200/80">
        Loading onboarding form…
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-sm text-red-300">{error}</p>
        <button
          onClick={() => location.reload()}
          className="rounded-full border border-blue-500/70 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-blue-100 transition hover:bg-blue-500/10"
        >
          Retry
        </button>
      </main>
    );
  }

  if (!form) {
    return null;
  }

  if (submittedId) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center text-slate-100">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold">Thank you for applying!</h1>
          <p className="text-sm text-slate-300">
            Your submission reference is <span className="font-mono text-blue-200">{submittedId}</span>.
            We’ll review your application and get back to you soon.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-full border border-blue-500/70 px-6 py-3 text-sm font-semibold uppercase tracking-wide text-blue-100 transition hover:bg-blue-500/10"
        >
          Back to home
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-6 py-12 text-slate-100">
      <header className="space-y-3 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.4em] text-blue-400/80">
          Startup Onboarding
        </p>
        <h1 className="text-4xl font-bold text-white">{form.title}</h1>
        <p className="text-base text-slate-300/90">{form.summary}</p>
      </header>

      <section className="space-y-8">
        {form.sections.map((section) => (
          <div key={section.id} className="space-y-6 rounded-2xl border border-slate-800/70 bg-slate-950/60 p-6 shadow-lg shadow-blue-950/10">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-100">{section.title}</h2>
              {section.description && (
                <p className="text-sm text-slate-400">{section.description}</p>
              )}
            </div>

            <div className="space-y-5">
              {section.fields.map((field) => (
                <div key={field.id} className="space-y-2">
                  <label className="flex items-center justify-between text-sm font-medium text-slate-200">
                    <span>{field.label}</span>
                    {field.required && <span className="text-xs text-red-300">Required</span>}
                  </label>
                  {renderFieldControl(field)}
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs text-slate-400">
          By submitting you agree that we may contact you about the Unified Intelligence Platform.
        </span>
        <button
          onClick={submitApplication}
          disabled={submitting}
          className="rounded-full border border-emerald-500/70 px-6 py-3 text-sm font-semibold uppercase tracking-wide text-emerald-100 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Submitting…" : "Submit application"}
        </button>
      </div>
    </main>
  );
}
