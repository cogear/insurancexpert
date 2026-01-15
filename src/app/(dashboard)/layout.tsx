import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Home,
  FileText,
  Settings,
  LogOut,
  Menu,
  Building2,
  BarChart3,
} from "lucide-react";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200">
        <div className="flex h-16 items-center gap-2 border-b px-6">
          <Building2 className="h-8 w-8 text-blue-600" />
          <span className="text-xl font-bold">InsuranceXpert</span>
        </div>

        <nav className="flex flex-col gap-1 p-4">
          <NavLink href="/dashboard" icon={<Home size={20} />}>
            Dashboard
          </NavLink>
          <NavLink href="/jobs" icon={<FileText size={20} />}>
            Jobs
          </NavLink>
          <NavLink href="/reports" icon={<BarChart3 size={20} />}>
            Reports
          </NavLink>
          <NavLink href="/settings" icon={<Settings size={20} />}>
            Settings
          </NavLink>
        </nav>

        <div className="absolute bottom-0 left-0 right-0 border-t p-4">
          <div className="mb-2 text-sm text-gray-600">
            <div className="font-medium text-gray-900">{session.user.name}</div>
            <div className="text-xs">{session.user.organizationName}</div>
          </div>
          <form
            action={async () => {
              "use server";
              const { signOut } = await import("@/auth");
              await signOut();
            }}
          >
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
            >
              <LogOut size={18} />
              Sign Out
            </button>
          </form>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 pl-64">
        <div className="min-h-screen p-8">{children}</div>
      </main>
    </div>
  );
}

function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg px-3 py-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
    >
      {icon}
      <span>{children}</span>
    </Link>
  );
}
