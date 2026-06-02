"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  Send,
  Settings,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { NetworkBadge } from "@/components/dashboard/network-badge";
import { truncateAddress, cn } from "@/lib/utils";

type NavItem = { label: string; href: string; icon: LucideIcon; primary: boolean };

// `primary` items make up the mobile bottom bar (four plus a More menu).
const NAV: NavItem[] = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard, primary: true },
  { label: "Approvals", href: "/dashboard/approvals", icon: BadgeCheck, primary: true },
  { label: "Runs", href: "/dashboard/runs", icon: Activity, primary: true },
  { label: "Policies", href: "/dashboard/policies", icon: SlidersHorizontal, primary: true },
  { label: "Chat", href: "/dashboard/chat", icon: MessageSquare, primary: false },
  { label: "Telegram", href: "/dashboard/telegram", icon: Send, primary: false },
  { label: "Settings", href: "/dashboard/settings", icon: Settings, primary: false },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/dashboard" ? pathname === href : pathname.startsWith(href);
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { walletAddress, signOut } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Wallet gating is disabled for now: the dashboard renders without a session
  // so screens can be reviewed before auth is wired end to end. Re-enable by
  // redirecting to "/" when `useAuth().hasSession` is false.

  function handleSignOut() {
    signOut();
    router.replace("/");
  }

  const more = NAV.filter((n) => !n.primary);
  const sidebarW = collapsed ? "w-[60px]" : "w-60";
  const contentPl = collapsed ? "md:pl-[60px]" : "md:pl-60";

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden flex-col border-r bg-card transition-[width] duration-200 md:flex",
          sidebarW,
        )}
      >
        {/* Wordmark / logo row */}
        <div
          className={cn(
            "flex h-16 shrink-0 items-center border-b",
            collapsed ? "justify-center px-0" : "justify-between px-5",
          )}
        >
          <Link
            href="/"
            className={cn(
              "font-extrabold uppercase tracking-[0.3em] transition-[font-size]",
              collapsed ? "text-sm" : "text-base",
            )}
            title="Go to homepage"
          >
            Ada
          </Link>

          {/* Collapse toggle — outside the Link so clicks don't navigate */}
          {!collapsed && (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label="Collapse sidebar"
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Nav links */}
        <nav className="flex-1 space-y-1 overflow-hidden p-2">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center rounded-md px-2 py-2 text-sm font-medium transition-colors",
                  collapsed ? "justify-center gap-0" : "gap-3",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Expand button at the bottom when collapsed */}
        {collapsed && (
          <div className="flex justify-center border-t p-2">
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              aria-label="Expand sidebar"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </aside>

      <div className={cn("transition-[padding] duration-200", contentPl)}>
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b bg-background/90 px-4 backdrop-blur md:px-8">
          <span className="text-base font-extrabold uppercase tracking-[0.25em] md:hidden">
            Ada
          </span>
          <div className="ml-auto flex items-center gap-3">
            <NetworkBadge chain="celo" className="hidden sm:inline-flex" />
            {walletAddress ? (
              <span className="rounded-md bg-secondary px-3 py-1.5 text-sm font-medium tabular-nums">
                {truncateAddress(walletAddress)}
              </span>
            ) : null}
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Disconnect</span>
            </Button>
          </div>
        </header>

        {/* Page content. Extra bottom padding clears the mobile tab bar. */}
        <main className="mx-auto w-full max-w-[1280px] px-4 pb-28 pt-8 md:px-8 md:pb-12">
          {children}
        </main>
      </div>

      {/* Mobile bottom tab bar: four primary + More */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-card md:hidden">
        {moreOpen ? (
          <div className="absolute bottom-full right-2 mb-2 w-44 overflow-hidden rounded-xl border bg-card shadow-lg">
            {more.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 text-sm font-medium",
                  isActive(pathname, item.href)
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-accent",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </div>
        ) : null}
        <div className="flex items-stretch">
          {NAV.filter((n) => n.primary).map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className={cn(
                  "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 py-2 text-[0.65rem] font-semibold uppercase tracking-wide",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            className={cn(
              "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 py-2 text-[0.65rem] font-semibold uppercase tracking-wide",
              moreOpen ? "text-primary" : "text-muted-foreground",
            )}
          >
            <MoreHorizontal className="h-5 w-5" />
            More
          </button>
        </div>
      </nav>
    </div>
  );
}
