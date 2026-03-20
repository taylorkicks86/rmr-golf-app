import Link from "next/link";

type ProfileErrorPageProps = {
  searchParams: Promise<{ message?: string }>;
};

export default async function ProfileErrorPage({ searchParams }: ProfileErrorPageProps) {
  const params = await searchParams;
  const message = params.message ?? "Unable to link your account to a player profile.";

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold text-zinc-900">Profile Link Error</h1>
      <p className="mt-3 text-red-600">{message}</p>
      <p className="mt-3 text-zinc-600">
        Contact an admin to correct your player profile mapping.
      </p>
      <Link
        href="/login"
        className="mt-5 inline-block rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
      >
        Back to login
      </Link>
    </div>
  );
}
