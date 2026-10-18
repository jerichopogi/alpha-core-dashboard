"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

export const PAGES: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/", label: "Overview", icon: "overview" },
  { href: "/analytics", label: "Analytics", icon: "analytics" },
  { href: "/trades", label: "Trades", icon: "trades" },
  { href: "/journal", label: "Journal", icon: "journal" },
];

/** The page links, marked current by URL. Used in the sidebar and the phone tab bar. */
export function NavLinks({ className }: { className: string }) {
  const pathname = usePathname();
  return (
    <ul className={className}>
      {PAGES.map((page) => (
        <li key={page.href}>
          <Link href={page.href} className="nav-link" aria-current={pathname === page.href ? "page" : undefined}>
            <Icon name={page.icon} />
            <span>{page.label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
