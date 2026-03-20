import Link from "next/link";

export default function AdminPage() {
  return (
    <div className="mx-4 pb-20 md:mx-auto md:max-w-4xl">
      <div className="bg-[#0f3b2e] px-4 py-8">
        <nav className="flex flex-col gap-2">
          <Link
            href="/admin/players"
            className="text-emerald-100 hover:text-white hover:underline"
          >
            Players →
          </Link>
          <Link
            href="/admin/seasons"
            className="text-emerald-100 hover:text-white hover:underline"
          >
            Seasons →
          </Link>
          <Link
            href="/admin/cup-teams"
            className="text-emerald-100 hover:text-white hover:underline"
          >
            Cup Teams →
          </Link>
          <Link
            href="/admin/score-entry"
            className="text-emerald-100 hover:text-white hover:underline"
          >
            Score Entry →
          </Link>
          <Link
            href="/admin/handicaps"
            className="text-emerald-100 hover:text-white hover:underline"
          >
            Handicaps →
          </Link>
          <Link
            href="/admin/tee-sheet"
            className="text-emerald-100 hover:text-white hover:underline"
          >
            Tee Sheet →
          </Link>
          <Link
            href="/admin/finalize-week"
            className="text-emerald-100 hover:text-white hover:underline"
          >
            Finalize Week →
          </Link>
          <Link
            href="/admin/dashboard-week"
            className="text-emerald-100 hover:text-white hover:underline"
          >
            Dashboard Week & Weeks →
          </Link>
        </nav>
      </div>
    </div>
  );
}
