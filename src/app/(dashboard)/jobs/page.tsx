import { getJobs } from "@/app/actions/jobs";
import { formatCurrency, formatDate } from "@/lib/utils";
import Link from "next/link";
import { Plus, Search, Filter, FileText, MapPin } from "lucide-react";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string }>;
}) {
  const params = await searchParams;
  const { jobs, total } = await getJobs({
    status: params.status,
    search: params.search,
  });

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
          <p className="text-gray-600">
            {total} job{total !== 1 ? "s" : ""} total
          </p>
        </div>
        <Link
          href="/jobs/new"
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus size={18} />
          New Job
        </Link>
      </div>

      {/* Filters */}
      <div className="mb-6 flex gap-4">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={18}
          />
          <form>
            <input
              type="text"
              name="search"
              placeholder="Search jobs..."
              defaultValue={params.search}
              className="w-full rounded-lg border py-2 pl-10 pr-4 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </form>
        </div>
        <select
          name="status"
          defaultValue={params.status || ""}
          className="rounded-lg border px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="analyzing">Analyzing</option>
          <option value="ready">Ready</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {/* Jobs List */}
      {jobs.length === 0 ? (
        <div className="rounded-xl border bg-white p-12 text-center">
          <FileText className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No jobs found</h3>
          <p className="mt-2 text-gray-600">
            Get started by creating your first job.
          </p>
          <Link
            href="/jobs/new"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus size={18} />
            Create Job
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}

function JobCard({
  job,
}: {
  job: {
    id: string;
    jobNumber: string;
    status: string;
    customerName: string;
    streetAddress: string;
    city: string;
    state: string;
    zipCode: string;
    insuranceCompany: string | null;
    totalRCV: { toString(): string } | null;
    createdAt: Date;
    _count: { documents: number };
  };
}) {
  const statusColors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-800",
    analyzing: "bg-blue-100 text-blue-800",
    ready: "bg-green-100 text-green-800",
    in_progress: "bg-yellow-100 text-yellow-800",
    completed: "bg-gray-100 text-gray-800",
  };

  return (
    <Link
      href={`/jobs/${job.id}`}
      className="block rounded-xl border bg-white p-6 transition hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-gray-900">{job.jobNumber}</h3>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                statusColors[job.status] || statusColors.draft
              }`}
            >
              {job.status.replace("_", " ")}
            </span>
          </div>
          <p className="mt-1 text-gray-900">{job.customerName}</p>
          <div className="mt-2 flex items-center gap-1 text-sm text-gray-600">
            <MapPin size={14} />
            <span>
              {job.streetAddress}, {job.city}, {job.state} {job.zipCode}
            </span>
          </div>
        </div>
        <div className="text-right">
          {job.totalRCV && (
            <div className="text-lg font-semibold text-gray-900">
              {formatCurrency(Number(job.totalRCV))}
            </div>
          )}
          <div className="text-sm text-gray-500">
            {job._count.documents} doc{job._count.documents !== 1 ? "s" : ""}
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between border-t pt-4 text-sm text-gray-500">
        <span>{job.insuranceCompany || "No insurance"}</span>
        <span>Created {formatDate(job.createdAt)}</span>
      </div>
    </Link>
  );
}
