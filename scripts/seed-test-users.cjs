/* eslint-disable no-console */
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEV_SEED_CONFIRM = process.env.DEV_SEED_CONFIRM;

const TEST_PASSWORD = "password123";
const TEST_USER_COUNT = 10;
const HANDICAPS = [9.0, 10.2, 11.5, 12.8, 14.1, 15.3, 16.7, 18.4, 20.6, 22.9];

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function buildTestUsers() {
  return Array.from({ length: TEST_USER_COUNT }, (_, i) => {
    const number = i + 1;
    return {
      email: `player${number}@rmrtest.com`,
      fullName: `Test Player ${number}`,
      handicapIndex: HANDICAPS[i],
    };
  });
}

async function findAuthUserByEmail(supabase, email) {
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(error.message);
    }

    const users = data?.users ?? [];
    const match = users.find((user) => (user.email ?? "").toLowerCase() === email.toLowerCase());
    if (match) {
      return match;
    }

    if (users.length < perPage) {
      return null;
    }
    page += 1;
  }
}

async function getUsedGhinValues(supabase) {
  const { data, error } = await supabase.from("players").select("ghin");
  if (error) {
    throw new Error(error.message);
  }

  return new Set(((data ?? []).map((row) => String(row.ghin))));
}

function pickUniqueGhin(usedGhins, seedIndex) {
  let value = 9000000 + seedIndex;
  while (usedGhins.has(String(value))) {
    value += 17;
  }
  const ghin = String(value);
  usedGhins.add(ghin);
  return ghin;
}

async function upsertPlayerForUser(supabase, params) {
  const { authUserId, email, fullName, ghin, handicapIndex } = params;

  const { data: byAuthUser, error: byAuthError } = await supabase
    .from("players")
    .select("id, auth_user_id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (byAuthError) {
    throw new Error(byAuthError.message);
  }

  if (byAuthUser?.id) {
    const { error: updateError } = await supabase
      .from("players")
      .update({
        full_name: fullName,
        email,
        ghin,
        handicap_index: handicapIndex,
        is_approved: true,
      })
      .eq("id", byAuthUser.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return { action: "updated_existing_by_auth_user" };
  }

  const { data: byEmail, error: byEmailError } = await supabase
    .from("players")
    .select("id, auth_user_id")
    .ilike("email", email)
    .maybeSingle();

  if (byEmailError) {
    throw new Error(byEmailError.message);
  }

  if (byEmail?.id) {
    if (byEmail.auth_user_id && byEmail.auth_user_id !== authUserId) {
      return { action: "skipped_email_linked_to_different_auth_user" };
    }

    const { error: linkError } = await supabase
      .from("players")
      .update({
        auth_user_id: authUserId,
        full_name: fullName,
        email,
        ghin,
        handicap_index: handicapIndex,
        is_approved: true,
      })
      .eq("id", byEmail.id);

    if (linkError) {
      throw new Error(linkError.message);
    }

    return { action: "linked_existing_email_row" };
  }

  const { error: insertError } = await supabase.from("players").insert({
    auth_user_id: authUserId,
    full_name: fullName,
    email,
    ghin,
    handicap_index: handicapIndex,
    is_approved: true,
  });

  if (!insertError) {
    return { action: "inserted_new_player" };
  }

  if (
    !insertError.message.toLowerCase().includes("duplicate") &&
    !insertError.message.toLowerCase().includes("unique")
  ) {
    throw new Error(insertError.message);
  }

  return { action: `skipped_due_to_conflict: ${insertError.message}` };
}

async function createOrGetAuthUser(supabase, email) {
  const existing = await findAuthUserByEmail(supabase, email);
  if (existing) {
    return { user: existing, created: false };
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data.user) {
    throw new Error(`Auth user creation returned no user for ${email}`);
  }

  return { user: data.user, created: true };
}

async function main() {
  if (!SUPABASE_URL) {
    fail("NEXT_PUBLIC_SUPABASE_URL is required.");
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    fail("SUPABASE_SERVICE_ROLE_KEY is required.");
  }
  if (DEV_SEED_CONFIRM !== "YES") {
    fail('Set DEV_SEED_CONFIRM=YES to run this dev-only seed.');
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const testUsers = buildTestUsers();
  const usedGhins = await getUsedGhinValues(supabase);
  const results = [];

  for (let i = 0; i < testUsers.length; i += 1) {
    const seed = testUsers[i];
    const ghin = pickUniqueGhin(usedGhins, i + 1);
    const authResult = await createOrGetAuthUser(supabase, seed.email);
    const playerResult = await upsertPlayerForUser(supabase, {
      authUserId: authResult.user.id,
      email: seed.email,
      fullName: seed.fullName,
      ghin,
      handicapIndex: seed.handicapIndex,
    });

    results.push({
      email: seed.email,
      auth_user_id: authResult.user.id,
      auth_action: authResult.created ? "created_auth_user" : "found_existing_auth_user",
      player_action: playerResult.action,
      ghin,
      handicap_index: seed.handicapIndex,
      approved: true,
      password: TEST_PASSWORD,
    });
  }

  console.log(JSON.stringify({ seeded_users: results }, null, 2));
}

main().catch((error) => fail(error.message));
