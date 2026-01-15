import { getJob } from "@/app/actions/jobs";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  Upload,
  DollarSign,
  MapPin,
  Phone,
  Mail,
  Building,
  Calendar,
  Hash,
  CheckCircle,
  Clock,
  AlertCircle,
} from "lucide-react";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;

  let job;
  try {
    job = await getJob(jobId);
  } catch {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="h-12 w-12 text-red-500" />
        <h1 className="mt-4 text-xl font-semibold">Job Not Found</h1>
        <p className="mt-2 text-gray-600">This job doesn't exist or you don't have access.</p>
        <Link
          href="/jobs"
          className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          Back to Jobs
        </Link>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-800",
    analyzing: "bg-blue-100 text-blue-800",
    ready: "bg-green-100 text-green-800",
    in_progress: "bg-yellow-100 text-yellow-800",
    completed: "bg-gray-100 text-gray-800",
  };

  const statusIcons: Record<string, React.ReactNode> = {
    draft: <FileText className="h-4 w-4" />,
    analyzing: <Clock className="h-4 w-4 animate-spin" />,
    ready: <CheckCircle className="h-4 w-4" />,
    in_progress: <Clock className="h-4 w-4" />,
    completed: <CheckCircle className="h-4 w-4" />,
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/jobs"
          className="rounded-lg p-2 hover:bg-gray-100"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Job #{job.jobNumber}</h1>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${statusColors[job.status]}`}
            >
              {statusIcons[job.status]}
              {job.status.replace("_", " ")}
            </span>
          </div>
          <p className="text-gray-600">{job.customerName}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer & Property Info */}
          <div className="rounded-xl border bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold">Customer & Property</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 text-gray-400" />
                <div>
                  <p className="font-medium">{job.streetAddress}</p>
                  <p className="text-gray-600">
                    {job.city}, {job.state} {job.zipCode}
                  </p>
                </div>
              </div>
              {job.customerPhone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-5 w-5 text-gray-400" />
                  <span>{job.customerPhone}</span>
                </div>
              )}
              {job.customerEmail && (
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-gray-400" />
                  <span>{job.customerEmail}</span>
                </div>
              )}
            </div>
          </div>

          {/* Insurance Info */}
          {(job.insuranceCompany || job.claimNumber) && (
            <div className="rounded-xl border bg-white p-6">
              <h2 className="mb-4 text-lg font-semibold">Insurance Details</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {job.insuranceCompany && (
                  <div className="flex items-center gap-3">
                    <Building className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-500">Insurance Company</p>
                      <p className="font-medium">{job.insuranceCompany}</p>
                    </div>
                  </div>
                )}
                {job.claimNumber && (
                  <div className="flex items-center gap-3">
                    <Hash className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-500">Claim Number</p>
                      <p className="font-medium">{job.claimNumber}</p>
                    </div>
                  </div>
                )}
                {job.policyNumber && (
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-500">Policy Number</p>
                      <p className="font-medium">{job.policyNumber}</p>
                    </div>
                  </div>
                )}
                {job.dateOfLoss && (
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-500">Date of Loss</p>
                      <p className="font-medium">
                        {new Date(job.dateOfLoss).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Documents */}
          <div className="rounded-xl border bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Documents</h2>
              <label className="cursor-pointer rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
                <Upload className="mr-1 inline h-4 w-4" />
                Upload
                <input type="file" className="hidden" accept="application/pdf" />
              </label>
            </div>
            {job.documents.length === 0 ? (
              <p className="text-center text-gray-500 py-8">
                No documents uploaded yet
              </p>
            ) : (
              <div className="space-y-2">
                {job.documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="font-medium">{doc.name}</p>
                        <p className="text-sm text-gray-500">
                          {doc.type} • {doc.processingStatus}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        doc.processingStatus === "completed"
                          ? "bg-green-100 text-green-800"
                          : doc.processingStatus === "processing"
                          ? "bg-blue-100 text-blue-800"
                          : doc.processingStatus === "failed"
                          ? "bg-red-100 text-red-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {doc.processingStatus}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Analysis Results */}
          {job.insuranceAnalyses.length > 0 && (
            <div className="rounded-xl border bg-white p-6">
              <h2 className="mb-4 text-lg font-semibold">Analysis Results</h2>
              <p className="text-sm text-gray-600">
                Extracted data from insurance documents will appear here.
              </p>
              {/* TODO: Display pipe jacks, vents, materials breakdown */}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Financial Summary */}
          <div className="rounded-xl border bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold">Financial Summary</h2>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-gray-600">Total RCV</dt>
                <dd className="font-semibold">
                  {job.totalRCV ? formatCurrency(Number(job.totalRCV)) : "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">Total ACV</dt>
                <dd className="font-semibold">
                  {job.totalACV ? formatCurrency(Number(job.totalACV)) : "—"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">Deductible</dt>
                <dd className="font-semibold">
                  {job.deductible ? formatCurrency(Number(job.deductible)) : "—"}
                </dd>
              </div>
              <hr />
              <div className="flex justify-between">
                <dt className="text-gray-600">Est. Profit</dt>
                <dd className="font-semibold text-green-600">
                  {job.estimatedProfit
                    ? formatCurrency(Number(job.estimatedProfit))
                    : "—"}
                </dd>
              </div>
              {job.profitMargin && (
                <div className="flex justify-between">
                  <dt className="text-gray-600">Profit Margin</dt>
                  <dd className="font-semibold">
                    {Number(job.profitMargin).toFixed(1)}%
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Quick Actions */}
          <div className="rounded-xl border bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold">Actions</h2>
            <div className="space-y-2">
              <button className="flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50">
                <DollarSign className="h-4 w-4" />
                Generate Estimate
              </button>
              <button className="flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50">
                <Upload className="h-4 w-4" />
                Add Aerial Report
              </button>
            </div>
          </div>

          {/* Timestamps */}
          <div className="rounded-xl border bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold">Activity</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-600">Created</dt>
                <dd>{new Date(job.createdAt).toLocaleDateString()}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">Updated</dt>
                <dd>{new Date(job.updatedAt).toLocaleDateString()}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
