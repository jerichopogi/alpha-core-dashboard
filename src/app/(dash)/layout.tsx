import { AutoRefresh } from "@/components/AutoRefresh";
import { Icon } from "@/components/icons";
import { NavLinks } from "@/components/Navigation";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { logout } from "../login/actions";

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">AC</span>
      <span>
        Alpha Core
        <small>XAUUSD · MT5</small>
      </span>
    </div>
  );
}

/** Sidebar on desktop; a top bar and bottom tabs on phones. */
export default function DashLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="shell">
      <AutoRefresh />
      <aside className="sidebar" aria-label="Main">
        <Brand />
        <nav aria-label="Pages">
          <NavLinks className="nav" />
        </nav>
        <div className="sidebar-foot">
          <ThemeSwitch />
          <form action={logout}>
            <button type="submit" className="link-button"><Icon name="logout" />Sign out</button>
          </form>
        </div>
      </aside>

      <header className="mobile-bar">
        <Brand />
        <ThemeSwitch />
      </header>

      <div className="content">{children}</div>

      <nav aria-label="Pages" className="tabbar-nav">
        <NavLinks className="tabbar" />
      </nav>
    </div>
  );
}
