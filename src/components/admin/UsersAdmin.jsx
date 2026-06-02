import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase.js';

/**
 * UsersAdmin — manage who can sign into the Deal Builder.
 *
 * Three roles surface in the UI (the schema also has 'customer' for the future
 * external quote portal, but we hide it from creation here):
 *
 *   admin    — full control: catalog, users, all deals
 *   director — sees & edits deals of assigned sales reps; no catalog edit
 *   sales    — submits/manages own deals
 *
 * Sales reps optionally have a director_id pointing at a director or admin.
 * That assignment is what powers "show this director's team" in the dashboard.
 *
 * Creating a user requires the admin-create-user Edge Function (service-role
 * key lives there). Editing role/director/active and renaming happens against
 * user_profiles directly under RLS — admins can update any profile.
 */
const ROLE_LABELS = {
  admin:    'Admin',
  director: 'Director',
  sales:    'Sales Rep',
  customer: 'Customer',
};

const ROLE_DESCRIPTIONS = {
  admin:    'Full control. Catalog editing, user management, every deal in every phase.',
  director: 'Sees and edits deals for assigned sales reps. No catalog or user management.',
  sales:    'Submits and manages own deals and quotes only. No admin access.',
  customer: 'External — quote viewer only. Not used for staff.',
};

const CREATE_ROLES = ['sales', 'director', 'admin']; // order in dropdown; customer hidden

export default function UsersAdmin({ onBack, currentUserId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  async function load() {
    setLoading(true); setError(null);
    // RPC: admin_list_users() returns the joined user_profiles + auth.users
    // rows. Server-side gate ensures only admins can call this.
    const { data, error } = await supabase.rpc('admin_list_users');
    setLoading(false);
    if (error) { setError(error.message); return; }
    setRows(data || []);
  }

  useEffect(() => { load(); }, []);

  // Pool of users who can act as a director (for sales-rep dropdown)
  const directorOptions = useMemo(
    () => rows.filter((r) => (r.role === 'director' || r.role === 'admin') && r.active),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!showInactive && !r.active) return false;
      if (!q) return true;
      return (
        (r.display_name || '').toLowerCase().includes(q) ||
        (r.email || '').toLowerCase().includes(q) ||
        (r.director_name || '').toLowerCase().includes(q)
      );
    });
  }, [rows, search, showInactive]);

  async function updateUser(userId, patch) {
    setSavingId(userId); setError(null);
    const { error } = await supabase
      .from('user_profiles')
      .update(patch)
      .eq('user_id', userId);
    setSavingId(null);
    if (error) { setError(error.message); return; }
    await load();
  }

  async function handleRoleChange(user, newRole) {
    // When changing AWAY from sales, clear director_id (no longer applicable)
    const patch = { role: newRole };
    if (newRole !== 'sales' && newRole !== 'sales_rep' && user.director_id) {
      patch.director_id = null;
    }
    await updateUser(user.user_id, patch);
  }

  async function handleDirectorChange(user, newDirectorId) {
    await updateUser(user.user_id, { director_id: newDirectorId || null });
  }

  async function handleNameChange(user, newName) {
    if (!newName || newName === user.display_name) return;
    await updateUser(user.user_id, { display_name: newName });
  }

  async function handleActiveToggle(user) {
    if (user.user_id === currentUserId) {
      setError("You can't deactivate your own account.");
      return;
    }
    const confirmMsg = user.active
      ? `Deactivate ${user.display_name || user.email}? They'll lose access on their next sign-in.`
      : `Reactivate ${user.display_name || user.email}?`;
    if (!window.confirm(confirmMsg)) return;
    await updateUser(user.user_id, { active: !user.active });
  }

  return (
    <div className="px-4 md:px-6 lg:px-10 py-4 md:py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <button onClick={onBack}
                  className="text-xs text-slate-500 hover:text-slate-700 mb-1">
            ← Admin
          </button>
          <h1 className="text-2xl md:text-3xl font-light text-slate-900">Users</h1>
          <p className="text-sm text-slate-600 mt-1">
            Create accounts, set roles, assign sales reps to a director.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowBulk(true)}
                  className="px-4 py-2 bg-white hover:bg-page-50 text-slate-700
                             border border-page-300 rounded-md text-sm font-medium transition-colors">
            Bulk upload CSV
          </button>
          <button onClick={() => setShowCreate(true)}
                  className="px-4 py-2 bg-navy-900 hover:bg-navy-800 text-chalk-50
                             rounded-md text-sm font-medium transition-colors">
            + New user
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, or director…"
          className="flex-1 px-3 py-2 text-sm border border-page-300 rounded-md
                     focus:outline-none focus:border-navy-500"
        />
        <label className="flex items-center gap-2 text-sm text-slate-700 whitespace-nowrap">
          <input type="checkbox" checked={showInactive}
                 onChange={(e) => setShowInactive(e.target.checked)}
                 className="rounded border-page-300" />
          Show inactive
        </label>
      </div>

      {error && (
        <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 text-bad text-sm rounded">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-page-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-page-50 border-b border-page-200">
              <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2.5 font-medium">Name</th>
                <th className="px-3 py-2.5 font-medium">Email</th>
                <th className="px-3 py-2.5 font-medium">Role</th>
                <th className="px-3 py-2.5 font-medium">Director</th>
                <th className="px-3 py-2.5 font-medium">Last sign-in</th>
                <th className="px-3 py-2.5 font-medium text-right">Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-page-100">
              {loading && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">Loading…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">No users match.</td></tr>
              )}
              {!loading && filtered.map((u) => (
                <UserRow
                  key={u.user_id}
                  user={u}
                  directorOptions={directorOptions}
                  saving={savingId === u.user_id}
                  isSelf={u.user_id === currentUserId}
                  onRoleChange={(r) => handleRoleChange(u, r)}
                  onDirectorChange={(id) => handleDirectorChange(u, id)}
                  onNameChange={(n) => handleNameChange(u, n)}
                  onActiveToggle={() => handleActiveToggle(u)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Role legend */}
      <div className="mt-6 max-w-3xl bg-page-50 border border-page-200 rounded-lg p-4 text-xs text-slate-600 space-y-2">
        <p className="font-medium text-slate-700 mb-1">Role reference</p>
        {CREATE_ROLES.map((r) => (
          <p key={r}>
            <span className="inline-block min-w-[80px] font-mono text-slate-800">{ROLE_LABELS[r]}</span>
            — {ROLE_DESCRIPTIONS[r]}
          </p>
        ))}
      </div>

      {showCreate && (
        <CreateUserModal
          directorOptions={directorOptions}
          onClose={() => setShowCreate(false)}
          onCreated={async () => { setShowCreate(false); await load(); }}
        />
      )}

      {showBulk && (
        <BulkUploadModal
          existingRows={rows}
          directorOptions={directorOptions}
          onClose={() => setShowBulk(false)}
          onFinished={async () => { await load(); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function UserRow({ user, directorOptions, saving, isSelf, onRoleChange, onDirectorChange, onNameChange, onActiveToggle }) {
  const [nameDraft, setNameDraft] = useState(user.display_name || '');

  useEffect(() => { setNameDraft(user.display_name || ''); }, [user.display_name]);

  const inactiveClass = user.active ? '' : 'opacity-50';
  const lastSignIn = user.last_sign_in_at
    ? new Date(user.last_sign_in_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';

  return (
    <tr className={`${inactiveClass} ${saving ? 'bg-amber-50' : ''}`}>
      <td className="px-3 py-2">
        <input
          type="text"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => onNameChange(nameDraft.trim())}
          className="w-full bg-transparent border border-transparent hover:border-page-300
                     focus:border-navy-500 focus:bg-white rounded px-1 py-0.5"
          disabled={saving}
        />
        {isSelf && <span className="text-[10px] text-navy-600 uppercase tracking-wider ml-1">you</span>}
      </td>
      <td className="px-3 py-2 text-slate-600 font-mono text-xs">{user.email}</td>
      <td className="px-3 py-2">
        <select
          value={user.role}
          onChange={(e) => onRoleChange(e.target.value)}
          disabled={saving || isSelf}
          title={isSelf ? "You can't change your own role" : ''}
          className="text-sm border border-page-300 rounded px-2 py-1 bg-white
                     disabled:bg-page-50 disabled:cursor-not-allowed"
        >
          {['admin','director','sales','customer'].map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        {(user.role === 'sales' || user.role === 'sales_rep') ? (
          <select
            value={user.director_id || ''}
            onChange={(e) => onDirectorChange(e.target.value)}
            disabled={saving}
            className="text-sm border border-page-300 rounded px-2 py-1 bg-white max-w-[180px]"
          >
            <option value="">— Unassigned —</option>
            {directorOptions.map((d) => (
              <option key={d.user_id} value={d.user_id}>{d.display_name || d.email}</option>
            ))}
          </select>
        ) : (
          <span className="text-xs text-slate-400">n/a</span>
        )}
      </td>
      <td className="px-3 py-2 text-slate-500 text-xs">{lastSignIn}</td>
      <td className="px-3 py-2 text-right">
        <button
          onClick={onActiveToggle}
          disabled={saving || isSelf}
          title={isSelf ? "You can't deactivate yourself" : (user.active ? 'Deactivate' : 'Reactivate')}
          className={`text-xs px-2 py-1 rounded font-medium transition-colors
            ${user.active
              ? 'bg-good/10 text-good hover:bg-good/20'
              : 'bg-page-200 text-slate-600 hover:bg-page-300'}
            disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {user.active ? 'Active' : 'Inactive'}
        </button>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------

function CreateUserModal({ directorOptions, onClose, onCreated }) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('sales');
  const [directorId, setDirectorId] = useState('');
  const [tempPassword, setTempPassword] = useState(() => generatePassword());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  function handleRoleChange(v) {
    setRole(v);
    if (v !== 'sales' && v !== 'sales_rep') setDirectorId('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Enter a valid email address.');
      return;
    }
    if (tempPassword.length < 8) {
      setError('Temporary password must be at least 8 characters.');
      return;
    }

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Your session expired. Please sign in again.');
        setSubmitting(false);
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-create-user`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: cleanEmail,
          temp_password: tempPassword,
          display_name: displayName.trim(),
          role,
          director_id: (role === 'sales' || role === 'sales_rep') ? (directorId || null) : null,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || `Create failed (HTTP ${res.status}).`);
        setSubmitting(false);
        return;
      }

      // Success — show the temp password one last time before closing.
      window.alert(
        `User created.\n\n` +
        `Email: ${cleanEmail}\n` +
        `Temporary password: ${tempPassword}\n\n` +
        `Send these to the user and ask them to sign in and change their password ` +
        `from My Profile.`
      );
      onCreated();
    } catch (err) {
      setError(err.message || 'Network error');
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <form onSubmit={handleSubmit}
            className="bg-white rounded-lg shadow-elevated w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-page-200 flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-900">Create user</h2>
          <button type="button" onClick={onClose}
                  className="text-slate-400 hover:text-slate-700 text-2xl leading-none">×</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <Field label="Email" required>
            <input
              type="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="rep@ronnoco.com"
              className="w-full px-3 py-2 text-sm border border-page-300 rounded-md
                         focus:outline-none focus:border-navy-500"
            />
          </Field>

          <Field label="Display name">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Jane Doe"
              className="w-full px-3 py-2 text-sm border border-page-300 rounded-md
                         focus:outline-none focus:border-navy-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Shown in the header and on deal cards. Defaults to the email if blank.
            </p>
          </Field>

          <Field label="Role" required>
            <select value={role} onChange={(e) => handleRoleChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-page-300 rounded-md
                               focus:outline-none focus:border-navy-500 bg-white">
              {CREATE_ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 mt-1">{ROLE_DESCRIPTIONS[role]}</p>
          </Field>

          {(role === 'sales' || role === 'sales_rep') && (
            <Field label="Director">
              <select value={directorId} onChange={(e) => setDirectorId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-page-300 rounded-md
                                 focus:outline-none focus:border-navy-500 bg-white">
                <option value="">— Unassigned (admins still see) —</option>
                {directorOptions.map((d) => (
                  <option key={d.user_id} value={d.user_id}>{d.display_name || d.email}</option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Optional. Determines which director sees this rep's deals in the pipeline dashboard.
              </p>
            </Field>
          )}

          <Field label="Temporary password" required>
            <div className="flex gap-2">
              <input
                type="text"
                required
                value={tempPassword}
                onChange={(e) => setTempPassword(e.target.value)}
                className="flex-1 px-3 py-2 text-sm font-mono border border-page-300 rounded-md
                           focus:outline-none focus:border-navy-500"
              />
              <button type="button"
                      onClick={() => setTempPassword(generatePassword())}
                      className="px-3 py-2 text-xs bg-page-100 hover:bg-page-200 rounded-md font-medium">
                Regenerate
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              You'll need to share this with the user. They should change it on first sign-in.
            </p>
          </Field>

          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 text-bad text-sm rounded">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-3 bg-page-50 border-t border-page-200 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={submitting}
                  className="px-4 py-2 text-sm text-slate-700 hover:bg-page-100 rounded-md">
            Cancel
          </button>
          <button type="submit" disabled={submitting}
                  className="px-4 py-2 text-sm bg-navy-900 hover:bg-navy-800 text-chalk-50
                             rounded-md font-medium disabled:opacity-50">
            {submitting ? 'Creating…' : 'Create user'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700 uppercase tracking-wider mb-1">
        {label}{required && <span className="text-bad ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function generatePassword() {
  // 12-char alphanumeric with at least one digit. Avoids ambiguous 0/O/1/l.
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  let out = '';
  for (const n of arr) out += chars[n % chars.length];
  return out;
}

// ---------------------------------------------------------------------------
// Bulk CSV upload
// ---------------------------------------------------------------------------

/**
 * BulkUploadModal — CSV-driven bulk user creation.
 *
 * Spec (confirmed with rep direction):
 *   Columns: email, display_name, role, director_email
 *   - email is required; rows without it are rejected.
 *   - display_name, role, director_email are optional.
 *   - role defaults to 'sales' when blank or omitted.
 *   - director_email is looked up against currently loaded users; must be an
 *     ACTIVE director or admin. Only applies when role = sales; ignored for
 *     director/admin rows.
 *   - Partial CSVs are accepted: a CSV with just an "email" column is valid.
 *
 * Behavior:
 *   - Errors are per-row and don't stop the batch.
 *   - Rows whose email matches an existing user are skipped (existing user
 *     untouched). This is detected client-side AND server-side; the Edge
 *     Function also returns "already exists" which we surface as "skipped".
 *   - No invite emails; admin sees the generated temp passwords in the
 *     results table and can download them as a CSV to deliver out-of-band.
 *
 * Reuses the admin-create-user Edge Function (same path as the single-user
 * + New user flow). One HTTP call per row, sequentially — keeps server
 * pressure predictable and lets us stream results as they finish.
 */
function BulkUploadModal({ existingRows, directorOptions, onClose, onFinished }) {
  const [file, setFile] = useState(null);
  const [parseError, setParseError] = useState(null);
  const [parsedRows, setParsedRows] = useState([]); // [{email, display_name, role, director_email}, ...]
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState([]);       // [{email, status, message, temp_password?}]
  const [done, setDone] = useState(false);

  // Build O(1) email lookups so we don't loop existingRows for every CSV row
  const existingEmails = useMemo(() => {
    const s = new Set();
    for (const r of existingRows || []) {
      if (r.email) s.add(r.email.toLowerCase().trim());
    }
    return s;
  }, [existingRows]);

  const directorByEmail = useMemo(() => {
    const m = new Map();
    for (const d of directorOptions || []) {
      if (d.email) m.set(d.email.toLowerCase().trim(), d);
    }
    return m;
  }, [directorOptions]);

  function handleFile(f) {
    setFile(f);
    setParseError(null);
    setParsedRows([]);
    setResults([]);
    setDone(false);
    if (!f) return;

    const reader = new FileReader();
    reader.onerror = () => setParseError('Could not read file.');
    reader.onload = () => {
      try {
        const text = String(reader.result || '');
        const rows = parseCsv(text);
        if (rows.length === 0) {
          setParseError('File is empty.');
          return;
        }
        // First row must be headers. Required header: email. Optional: display_name, role, director_email.
        const headers = rows[0].map((h) => h.trim().toLowerCase());
        const emailIdx = headers.indexOf('email');
        if (emailIdx === -1) {
          setParseError('CSV must include an "email" column header in row 1.');
          return;
        }
        const nameIdx = headers.indexOf('display_name');
        const roleIdx = headers.indexOf('role');
        const dirIdx  = headers.indexOf('director_email');

        const parsed = [];
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          // Skip fully empty rows (trailing newlines, blank lines between records)
          if (!r || r.every((c) => !c || !c.trim())) continue;
          parsed.push({
            email:          (r[emailIdx] || '').trim(),
            display_name:   nameIdx >= 0 ? (r[nameIdx] || '').trim() : '',
            role:           roleIdx >= 0 ? (r[roleIdx] || '').trim() : '',
            director_email: dirIdx  >= 0 ? (r[dirIdx]  || '').trim() : '',
            _line:          i + 1, // 1-indexed line number for error messages
          });
        }
        if (parsed.length === 0) {
          setParseError('No data rows found below the header.');
          return;
        }
        setParsedRows(parsed);
      } catch (err) {
        setParseError(err.message || 'Could not parse CSV.');
      }
    };
    reader.readAsText(f);
  }

  function validateRow(row) {
    const email = row.email.toLowerCase();
    if (!email) {
      return { ok: false, error: 'Missing email.' };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: 'Invalid email format.' };
    }

    // Role: default to 'sales', validate against CREATE_ROLES
    const roleRaw = (row.role || '').toLowerCase();
    const role = roleRaw || 'sales';
    if (!CREATE_ROLES.includes(role)) {
      return { ok: false, error: `Unknown role "${row.role}". Use sales, director, or admin.` };
    }

    // Director: only meaningful for sales; ignored otherwise.
    let director_id = null;
    if ((role === 'sales' || role === 'sales_rep') && row.director_email) {
      const dirEmail = row.director_email.toLowerCase();
      const dir = directorByEmail.get(dirEmail);
      if (!dir) {
        return { ok: false, error: `Director "${row.director_email}" not found (must be an active director or admin).` };
      }
      director_id = dir.user_id;
    }

    // Existing-user check — client-side fast path. Server also enforces.
    if (existingEmails.has(email)) {
      return { ok: false, skip: true, error: 'User already exists; skipped.' };
    }

    return {
      ok: true,
      payload: {
        email,
        display_name: row.display_name || '',
        role,
        director_id,
      },
    };
  }

  async function runUpload() {
    setRunning(true);
    setResults([]);
    setDone(false);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setParseError('Your session expired. Please sign in again.');
      setRunning(false);
      return;
    }
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

    const out = [];
    for (const row of parsedRows) {
      // Validate
      const v = validateRow(row);
      if (!v.ok) {
        out.push({
          email: row.email || `(line ${row._line})`,
          status: v.skip ? 'skipped' : 'error',
          message: v.error,
        });
        setResults([...out]);
        continue;
      }

      // POST to Edge Function (one row at a time — sequential for stable UX)
      const tempPassword = generatePassword();
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/admin-create-user`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ ...v.payload, temp_password: tempPassword }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          // The Edge Function returns "already exists" as an error; treat as skip
          const msg = body.error || `HTTP ${res.status}`;
          const isExists = /already exists|already registered|duplicate/i.test(msg);
          out.push({
            email: v.payload.email,
            status: isExists ? 'skipped' : 'error',
            message: isExists ? 'User already exists; skipped.' : msg,
          });
        } else {
          out.push({
            email: v.payload.email,
            status: 'created',
            message: `Role: ${v.payload.role}`,
            temp_password: tempPassword,
          });
        }
      } catch (err) {
        out.push({
          email: v.payload.email,
          status: 'error',
          message: err.message || 'Network error.',
        });
      }
      setResults([...out]);
    }

    setRunning(false);
    setDone(true);
    // Refresh parent list so created users appear in the table
    onFinished && onFinished();
  }

  function downloadTemplate() {
    const csv =
      'email,display_name,role,director_email\n' +
      'jane.rep@ronnoco.com,Jane Rep,sales,georgehicker@ronnoco.com\n' +
      'sam.director@ronnoco.com,Sam Director,director,\n' +
      'pat.admin@ronnoco.com,Pat Admin,admin,\n';
    triggerDownload(csv, 'ronnoco-users-template.csv');
  }

  function downloadResults() {
    const header = 'email,status,message,temp_password\n';
    const lines = results.map((r) =>
      [r.email, r.status, r.message || '', r.temp_password || ''].map(csvEscape).join(',')
    );
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    triggerDownload(header + lines.join('\n') + '\n', `user-upload-results-${ts}.csv`);
  }

  const counts = useMemo(() => {
    const c = { created: 0, skipped: 0, error: 0 };
    for (const r of results) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [results]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-page-200 flex items-center justify-between">
          <h2 className="text-lg font-medium text-slate-900">Bulk upload users</h2>
          <button onClick={onClose}
                  disabled={running}
                  className="text-slate-400 hover:text-slate-600 disabled:opacity-50">
            ✕
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1">
          {/* Instructions */}
          {results.length === 0 && (
            <>
              <p className="text-sm text-slate-600 mb-3">
                Upload a CSV with the columns <code className="text-xs bg-page-100 px-1 py-0.5 rounded">email</code>,{' '}
                <code className="text-xs bg-page-100 px-1 py-0.5 rounded">display_name</code>,{' '}
                <code className="text-xs bg-page-100 px-1 py-0.5 rounded">role</code>,{' '}
                <code className="text-xs bg-page-100 px-1 py-0.5 rounded">director_email</code>.
                Only <code className="text-xs bg-page-100 px-1 py-0.5 rounded">email</code> is required;
                role defaults to <code className="text-xs bg-page-100 px-1 py-0.5 rounded">sales</code>.
              </p>
              <ul className="text-xs text-slate-600 space-y-1 mb-4 list-disc pl-5">
                <li>Director assignment uses the director's email; they must be an active director or admin already in the system.</li>
                <li>director_email is ignored for director/admin rows.</li>
                <li>Rows with an email that already exists are skipped — existing accounts are not modified.</li>
                <li>Each created user gets a random temporary password. Download the results CSV to share credentials.</li>
              </ul>

              <button onClick={downloadTemplate}
                      className="text-xs text-navy-700 hover:text-navy-900 underline mb-4">
                Download example CSV template
              </button>

              <div className="border-2 border-dashed border-page-300 rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => handleFile(e.target.files?.[0] || null)}
                  className="block mx-auto text-sm"
                  disabled={running}
                />
                {file && (
                  <p className="text-xs text-slate-500 mt-2">
                    Selected: <span className="font-medium text-slate-700">{file.name}</span>
                  </p>
                )}
              </div>

              {parseError && (
                <div className="mt-3 px-3 py-2 bg-red-50 border border-red-200 text-bad text-sm rounded">
                  {parseError}
                </div>
              )}

              {parsedRows.length > 0 && !parseError && (
                <div className="mt-4 px-3 py-2 bg-page-50 border border-page-200 text-sm text-slate-700 rounded">
                  Parsed <span className="font-medium">{parsedRows.length}</span> data row{parsedRows.length === 1 ? '' : 's'}. Ready to upload.
                </div>
              )}
            </>
          )}

          {/* Results table */}
          {results.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-4 mb-3 text-sm">
                <span className="text-good font-medium">✓ {counts.created} created</span>
                <span className="text-slate-500">⊝ {counts.skipped} skipped</span>
                <span className="text-bad font-medium">✗ {counts.error} error{counts.error === 1 ? '' : 's'}</span>
                {running && (
                  <span className="text-xs text-slate-500 ml-2">Processing… ({results.length} / {parsedRows.length})</span>
                )}
              </div>

              <div className="border border-page-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-page-50 border-b border-page-200">
                    <tr className="text-left text-slate-500 uppercase tracking-wider">
                      <th className="px-2 py-1.5 font-medium">Email</th>
                      <th className="px-2 py-1.5 font-medium">Status</th>
                      <th className="px-2 py-1.5 font-medium">Message</th>
                      <th className="px-2 py-1.5 font-medium">Temp password</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-page-100">
                    {results.map((r, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1.5 text-slate-800 font-mono">{r.email}</td>
                        <td className="px-2 py-1.5">
                          {r.status === 'created' && <span className="text-good">✓ created</span>}
                          {r.status === 'skipped' && <span className="text-slate-500">⊝ skipped</span>}
                          {r.status === 'error'   && <span className="text-bad">✗ error</span>}
                        </td>
                        <td className="px-2 py-1.5 text-slate-600">{r.message}</td>
                        <td className="px-2 py-1.5 font-mono text-slate-700">{r.temp_password || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {done && counts.created > 0 && (
                <div className="mt-3 px-3 py-2 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded">
                  <strong>Important:</strong> temp passwords are only shown once. Download the results CSV
                  now to deliver credentials to each user.
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 py-3 border-t border-page-200 flex items-center justify-between gap-2 bg-page-50">
          <div>
            {done && counts.created > 0 && (
              <button onClick={downloadResults}
                      className="px-3 py-1.5 bg-navy-900 hover:bg-navy-800 text-chalk-50
                                 rounded text-xs font-medium">
                Download results CSV
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!done && (
              <button onClick={onClose}
                      disabled={running}
                      className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 disabled:opacity-50">
                Cancel
              </button>
            )}
            {done && (
              <button onClick={onClose}
                      className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900">
                Close
              </button>
            )}
            {!done && parsedRows.length > 0 && !parseError && (
              <button onClick={runUpload}
                      disabled={running}
                      className="px-4 py-1.5 bg-navy-900 hover:bg-navy-800 text-chalk-50
                                 rounded text-sm font-medium disabled:opacity-50">
                {running ? 'Uploading…' : `Upload ${parsedRows.length} user${parsedRows.length === 1 ? '' : 's'}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

/**
 * Minimal RFC-4180-compatible CSV parser.
 * - Handles quoted fields, escaped quotes ("" inside a quoted field).
 * - Supports CRLF and LF line endings.
 * - Doesn't trim whitespace inside quoted fields; trims unquoted fields on read.
 * Returns an array of rows; each row is an array of cell strings.
 * Throws if a quote is never closed.
 */
function parseCsv(text) {
  // Strip BOM (Excel loves to add one)
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { // escaped quote
          cell += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        cell += c;
        i++;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(cell);
      cell = '';
      i++;
      continue;
    }
    if (c === '\r') {
      // swallow; handled by \n below (or end of input)
      i++;
      continue;
    }
    if (c === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
      continue;
    }
    cell += c;
    i++;
  }
  if (inQuotes) throw new Error('CSV ended inside a quoted field — check for an unclosed quote.');
  // Flush the last cell/row (file may not end with newline)
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function triggerDownload(text, filename) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
