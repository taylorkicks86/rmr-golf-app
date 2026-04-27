type AuthAdminUser = {
  id: string;
  email?: string;
};

type AuthAdminError = {
  message: string;
};

type SupabaseAdminClient = {
  auth: {
    admin: {
      listUsers: (params: { page: number; perPage: number }) => Promise<{
        data?: { users?: AuthAdminUser[] } | null;
        error?: AuthAdminError | null;
      }>;
      createUser: (params: { email: string; password: string; email_confirm: boolean }) => Promise<{
        data: { user: AuthAdminUser | null };
        error?: AuthAdminError | null;
      }>;
    };
  };
};

export function normalizeAccountEmail(value: string | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidAccountEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isValidAccountPassword(value: string | undefined): value is string {
  return typeof value === "string" && value.length >= 6;
}

export function isDuplicateAuthUserError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("already") || lower.includes("registered") || lower.includes("exists");
}

export async function findAuthUserByEmail(supabase: SupabaseAdminClient, email: string) {
  let page = 1;
  const perPage = 1000;
  const normalizedEmail = email.trim().toLowerCase();

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      return { user: null, error: error.message };
    }

    const users = data?.users ?? [];
    const match = users.find((user) => String(user.email ?? "").toLowerCase() === normalizedEmail);
    if (match) {
      return { user: match, error: null };
    }

    if (users.length < perPage) {
      return { user: null, error: null };
    }

    page += 1;
  }
}

export async function createOrFindAuthUser(params: {
  supabase: SupabaseAdminClient;
  email: string;
  password: string;
}) {
  const { supabase, email, password } = params;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (!error) {
    return { user: data.user ?? null, created: true, error: null };
  }

  if (!isDuplicateAuthUserError(error.message)) {
    return { user: null, created: false, error: error.message };
  }

  const existing = await findAuthUserByEmail(supabase, email);
  if (existing.error) {
    return { user: null, created: false, error: existing.error };
  }
  if (!existing.user) {
    return { user: null, created: false, error: "An auth account already exists, but it could not be loaded." };
  }

  return { user: existing.user, created: false, error: null };
}
