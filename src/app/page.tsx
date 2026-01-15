import Link from "next/link";
import { FileText, BarChart3, DollarSign, Shield } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Shield className="h-8 w-8 text-blue-600" />
            <span className="text-xl font-bold text-gray-900">
              InsuranceXpert
            </span>
          </div>
          <nav className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <main className="mx-auto max-w-7xl px-4 py-20">
        <div className="text-center">
          <h1 className="text-5xl font-bold tracking-tight text-gray-900">
            AI-Powered Insurance Document
            <span className="block text-blue-600">Analysis for Roofers</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600">
            Transform insurance scopes and aerial reports into accurate
            estimates and profitability insights. Built for roofing contractors
            who demand precision.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href="/register"
              className="rounded-lg bg-blue-600 px-8 py-3 text-base font-semibold text-white shadow-lg hover:bg-blue-700"
            >
              Start Free Trial
            </Link>
            <Link
              href="/pricing"
              className="rounded-lg border border-gray-300 bg-white px-8 py-3 text-base font-semibold text-gray-700 hover:bg-gray-50"
            >
              View Pricing
            </Link>
          </div>
        </div>

        {/* Features Grid */}
        <div className="mt-24 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            icon={<FileText className="h-8 w-8" />}
            title="Smart Document Processing"
            description="Upload insurance scopes from any carrier. Our AI extracts line items, quantities, and pricing automatically."
          />
          <FeatureCard
            icon={<BarChart3 className="h-8 w-8" />}
            title="Aerial Report Integration"
            description="Import reports from EagleView, RoofScope, Hover and more. Measurements sync seamlessly."
          />
          <FeatureCard
            icon={<DollarSign className="h-8 w-8" />}
            title="Profitability Analysis"
            description="Compare insurance RCV against real material costs. Know your margins before you bid."
          />
        </div>

        {/* Accuracy Section */}
        <div className="mt-24 rounded-2xl bg-blue-600 p-12 text-center text-white">
          <h2 className="text-3xl font-bold">
            Precision Where It Matters Most
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-blue-100">
            Our specialized extractors accurately identify pipe jacks, vents,
            and flashing components that other systems miss. Every 3-in-1,
            split boot, and turtle vent is accounted for.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-8 md:grid-cols-4">
            <StatCard label="Pipe Jack Types" value="10+" />
            <StatCard label="Vent Categories" value="8+" />
            <StatCard label="Aerial Providers" value="4+" />
            <StatCard label="Insurance Carriers" value="50+" />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-white py-12">
        <div className="mx-auto max-w-7xl px-4 text-center text-sm text-gray-500">
          <p>&copy; 2025 InsuranceXpert. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <div className="inline-flex rounded-lg bg-blue-100 p-3 text-blue-600">
        {icon}
      </div>
      <h3 className="mt-4 text-lg font-semibold text-gray-900">{title}</h3>
      <p className="mt-2 text-gray-600">{description}</p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-3xl font-bold">{value}</div>
      <div className="mt-1 text-sm text-blue-200">{label}</div>
    </div>
  );
}
