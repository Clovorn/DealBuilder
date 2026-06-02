// Supabase Edge Function: admin-create-user
//
// Deploy from project root with the Supabase CLI:
//   supabase functions deploy admin-create-user --project-ref gmttcwimwvdupqnxbiaq
//
// This function MUST run server-side because creating an auth.users row
// requires the service role key, which can never be in the browser bundle.
//
// Auth model:
//   - Client sends its own session JWT in the Authorization header.
//   - We verify the JWT, look up the caller's role in user_profiles, and
//     reject anything other than `admin`.
//   - On success we create the auth user with auto-confirm + a temp password,
//     then insert the matching user_profiles row.
//
// Request body:
//   {
//     email: string,
//     temp_password: string,
//     display_name?: string,
//     role: 'admin' | 'director' | 'sales' | 'customer',
//     director_id?: uuid | null,
//   }
//
// Response:
//   200 { user_id: uuid, email: string }
//   400 { error: string }   -- validation problem
//   401 { error: string }   -- missing/invalid caller session
//   403 { error: string }   -- caller is not an admin
//   409 { error: string }   -- email already exists

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PROJECT_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_ROLES = new Set(["admin", "director", "sales_rep", "sales", "ops", "customer"]);

function cors(res: Response) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "authorization, content-type");
  return res;
}

function json(body: unknown, status = 200) {
  return cors(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // -- 1. Verify caller session ---------------------------------------------
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "missing authorization header" }, 401);

  const admin = createClient(PROJECT_URL, SERVICE_KEY);

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) {
    return json({ error: "invalid session" }, 401);
  }
  const callerId = userData.user.id;

  // -- 2. Verify caller is an admin ----------------------------------------
  const { data: callerProfile, error: pErr } = await admin
    .from("users")
    .select("role, is_active")
    .eq("id", callerId)
    .maybeSingle();

  if (pErr) return json({ error: pErr.message }, 500);
  if (!callerProfile || callerProfile.role !== "admin" || callerProfile.is_active === false) {
    return json({ error: "forbidden — admin role required" }, 403);
  }

  // -- 3. Validate body ----------------------------------------------------
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const email = (body.email || "").trim().toLowerCase();
  const tempPassword = (body.temp_password || "").trim();
  const displayName = (body.display_name || "").trim();
  const role = (body.role || "").trim();
  const directorId = body.director_id || null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: "valid email is required" }, 400);
  }
  if (!tempPassword || tempPassword.length < 8) {
    return json({ error: "temp_password must be at least 8 characters" }, 400);
  }
  if (!ALLOWED_ROLES.has(role)) {
    return json({ error: `role must be one of ${[...ALLOWED_ROLES].join(", ")}` }, 400);
  }
  // director_id only applies to sales reps
  if (directorId && role !== "sales" && role !== "sales_rep") {
    return json({ error: "director_id only allowed when role = 'sales_rep'" }, 400);
  }

  // -- 4. Create the auth user ---------------------------------------------
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { display_name: displayName || null },
  });

  if (createErr) {
    // Supabase returns 422 for duplicates; surface a friendlier message.
    const msg = createErr.message || "failed to create user";
    const status = /already (registered|exists)/i.test(msg) ? 409 : 400;
    return json({ error: msg }, status);
  }

  const newUserId = created.user!.id;

  // -- 5. Insert the user_profiles row -------------------------------------
  // The catalog DB likely has a trigger that auto-creates a profile on
  // auth.users insert with the default 'sales' role. We upsert here to
  // ensure the requested role/display_name/director_id stick regardless.
  const { error: profileErr } = await admin
    .from("users")
    .upsert(
      {
        id: newUserId,
        email,
        role,
        full_name: displayName || email,
        display_name: displayName || email,
        director_id: directorId,
        is_active: true,
      },
      { onConflict: "id" }
    );

  if (profileErr) {
    // Roll back the auth user so we don't leave an orphaned record.
    await admin.auth.admin.deleteUser(newUserId).catch(() => {});
    return json({ error: `profile insert failed: ${profileErr.message}` }, 500);
  }

  return json({ user_id: newUserId, email }, 200);
});
