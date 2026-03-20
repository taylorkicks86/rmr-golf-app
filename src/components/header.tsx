import Link from "next/link";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/standings", label: "Standings" },
  { href: "/admin/score-entry", label: "Score Entry" },
  { href: "/players", label: "Players" },
  { href: "/admin", label: "Admin" },
];

export function Header() {
  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Link
          href="/"
          className="text-xl font-bold text-emerald-700"
        >
          RMR Golf League
        </Link>
        <nav className="flex items-center gap-6">
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900"
            >
              {label}
            </Link>
          ))}
          <Link
            href="/login"
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
          >
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}
