import { getJobStats } from "@/app/actions/jobs";
import { formatCurrency } from "@/lib/utils";
import { FileText, DollarSign, TrendingUp, Clock } from "lucide-react";
import Link from "next/link";

export default async function DashboardPage() {
  const stats = await getJobStats();

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">Welcome back! Here's your overview.</p>
        </div>
        <Link
          href="/jobs/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New Job
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="mb-8 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Jobs"
          value={stats.total.toString()}
          icon={<FileText className="h-6 w-6" />}
          color="blue"
        />
        <StatCard
          title="Monthly RCV"
          value={formatCurrency(stats.monthlyRCV)}
          icon={<DollarSign className="h-6 w-6" />}
          color="green"
        />
        <StatCard
          title="Est. Profit"
          value={formatCurrency(stats.monthlyProfit)}
          icon={<TrendingUp className="h-6 w-6" />}
          color="purple"
        />
        <StatCard
          title="In Progress"
          value={stats.byStatus.inProgress.toString()}
          icon={<Clock className="h-6 w-6" />}
          color="orange"
        />
      </div>

      {/* Status Breakdown */}
      <div className="mb-8 rounded-xl border bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold">Jobs by Status</h2>
        <div className="grid gap-4 md:grid-cols-5">
          <StatusBadge label="Draft" count={stats.byStatus.draft} color="gray" />
          <StatusBadge
            label="Analyzing"
            count={stats.byStatus.analyzing}
            color="blue"
          />
          <StatusBadge label="Ready" count={stats.byStatus.ready} color="green" />
          <StatusBadge
            label="In Progress"
            count={stats.byStatus.inProgress}
            color="yellow"
          />
          <StatusBadge
            label="Completed"
            count={stats.byStatus.completed}
            color="gray"
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold">Quick Actions</h2>
          <div className="space-y-2">
            <QuickActionLink href="/jobs/new">Create New Job</QuickActionLink>
            <QuickActionLink href="/jobs?status=analyzing">
              View Jobs Being Analyzed
            </QuickActionLink>
            <QuickActionLink href="/reports">View Reports</QuickActionLink>
            <QuickActionLink href="/settings/suppliers">
              Manage Suppliers
            </QuickActionLink>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold">This Month</h2>
          <dl className="space-y-4">
            <div className="flex justify-between">
              <dt className="text-gray-600">Jobs Created</dt>
              <dd className="font-semibold">{stats.monthlyJobCount}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600">Total RCV</dt>
              <dd className="font-semibold">{formatCurrency(stats.monthlyRCV)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600">Estimated Profit</dt>
              <dd className="font-semibold text-green-600">
                {formatCurrency(stats.monthlyProfit)}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  color: "blue" | "green" | "purple" | "orange";
}) {
  const colorClasses = {
    blue: "bg-blue-100 text-blue-600",
    green: "bg-green-100 text-green-600",
    purple: "bg-purple-100 text-purple-600",
    orange: "bg-orange-100 text-orange-600",
  };

  return (
    <div className="rounded-xl border bg-white p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{title}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
        </div>
        <div className={`rounded-lg p-3 ${colorClasses[color]}`}>{icon}</div>
      </div>
    </div>
  );
}

function StatusBadge({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: "gray" | "blue" | "green" | "yellow";
}) {
  const colorClasses = {
    gray: "bg-gray-100 text-gray-800",
    blue: "bg-blue-100 text-blue-800",
    green: "bg-green-100 text-green-800",
    yellow: "bg-yellow-100 text-yellow-800",
  };

  return (
    <div className="text-center">
      <div className={`rounded-lg px-3 py-2 ${colorClasses[color]}`}>
        <div className="text-2xl font-bold">{count}</div>
        <div className="text-xs">{label}</div>
      </div>
    </div>
  );
}

function QuickActionLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg border px-4 py-3 text-sm hover:bg-gray-50"
    >
      {children}
    </Link>
  );
}
