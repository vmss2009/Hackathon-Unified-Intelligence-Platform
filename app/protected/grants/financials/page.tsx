"use client";

import { useEffect, useMemo, useState } from "react";
import type { IncubatorFinancialOverview, GrantFinancialSummary, CurrencyFinancialTotals } from "@/lib/grants/types";

const formatCurrency = (value: number, currency: string): string => {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`Unable to format currency for ${currency}`, error);
    }
    const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
    return `${currency} ${rounded.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }
};

const formatDateTime = (value?: string): string => {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return parsed.toLocaleString();
};

const useFinancialOverview = () => {
  const [overview, setOverview] = useState<IncubatorFinancialOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);

    // Fetch incubator-wide financial snapshot on mount.
    fetch("/api/protected/grants/financials")
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Unable to load financial overview");
        }

        return (await res.json()) as {
          ok: boolean;
          overview?: IncubatorFinancialOverview;
          error?: string;
        };
      })
      .then((payload) => {
        if (!active) {
          return;
        }

        if (!payload.ok || !payload.overview) {
          setError(payload.error ?? "Unable to load financial overview");
          return;
        }

        setOverview(payload.overview);
        setError(null);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setError("Unable to load financial overview");
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return { overview, loading, error };
};

const MonetaryValue = ({ value, currency }: { value: number; currency: string }) => {
  const formatted = useMemo(() => formatCurrency(value, currency), [value, currency]);
  const negative = value < 0;
  return <span className={negative ? "font-semibold text-red-600" : "font-semibold text-gray-900"}>{formatted}</span>;
};

const CurrencyCard = ({ totals }: { totals: CurrencyFinancialTotals }) => {
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <header className="flex items-baseline justify-between">
        <h3 className="text-lg font-semibold text-gray-900">{totals.currency}</h3>
        <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Totals</span>
      </header>
      <dl className="grid gap-2 text-sm text-gray-500">
        <div className="flex items-center justify-between">
          <dt>Total sanctioned</dt>
          <dd>
            <MonetaryValue value={totals.totalSanctioned} currency={totals.currency} />
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt>Released to date</dt>
          <dd>
            <MonetaryValue value={totals.totalReleased} currency={totals.currency} />
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt>Utilised</dt>
          <dd>
            <MonetaryValue value={totals.totalUtilised} currency={totals.currency} />
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt>Available to utilise</dt>
          <dd>
            <MonetaryValue value={totals.availableToUtilise} currency={totals.currency} />
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt>Pending disbursements</dt>
          <dd>
            <MonetaryValue value={totals.totalPendingAmount} currency={totals.currency} />
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt>Remaining sanction balance</dt>
          <dd>
            <MonetaryValue value={totals.remainingSanctionBalance} currency={totals.currency} />
          </dd>
        </div>
      </dl>
    </article>
  );
};

const GrantRow = ({ summary }: { summary: GrantFinancialSummary }) => {
  return (
    <tr className="border-b border-gray-100 last:border-b-0">
      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">{summary.grantName}</td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">{summary.startupId}</td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
        <MonetaryValue value={summary.totalSanctioned} currency={summary.currency} />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
        <MonetaryValue value={summary.totalReleased} currency={summary.currency} />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
        <MonetaryValue value={summary.totalUtilised} currency={summary.currency} />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
        <MonetaryValue value={summary.availableToUtilise} currency={summary.currency} />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
        <MonetaryValue value={summary.totalPendingAmount} currency={summary.currency} />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
        <MonetaryValue value={summary.remainingSanctionBalance} currency={summary.currency} />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">{summary.pendingDisbursementCount}</td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">{formatDateTime(summary.upcomingTargetRelease)}</td>
      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">{formatDateTime(summary.lastDisbursementAt)}</td>
    </tr>
  );
};

const LoadingState = () => {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="h-40 animate-pulse rounded-2xl border border-gray-200 bg-gray-100"
        />
      ))}
    </div>
  );
};

export default function FinancialDashboardPage() {
  const { overview, loading, error } = useFinancialOverview();

  return (
    <section className="flex flex-col gap-6 p-6 lg:p-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-gray-900">Financial Dashboard</h1>
        <p className="text-sm text-gray-500">
          Monitor sanction, disbursement, and utilisation trends across the incubator’s grant portfolio.
        </p>
        {overview?.updatedAt && (
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Last updated {formatDateTime(overview.updatedAt)}
          </span>
        )}
      </header>

      {loading && <LoadingState />}

      {!loading && error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && overview && overview.totalsByCurrency.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {overview.totalsByCurrency.map((totals) => (
            <CurrencyCard key={totals.currency} totals={totals} />
          ))}
        </div>
      )}

      {!loading && !error && overview && overview.grants.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    Grant
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    Startup
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    Sanctioned
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    Released
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    Utilised
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    Available
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    Pending
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    Sanction Balance
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    Pending Count
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    Next Release
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    Last Released
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {overview.grants.map((summary) => (
                  <GrantRow key={`${summary.startupId}-${summary.grantId}`} summary={summary} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && !error && overview && overview.grants.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
          No grant financial data available yet. Add grant catalog details for startups to populate this dashboard.
        </div>
      )}
    </section>
  );
}
