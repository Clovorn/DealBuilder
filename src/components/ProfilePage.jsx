import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import {
  fetchEmailNotificationsEnabled,
  setEmailNotificationsEnabled,
} from '../lib/notifications.js';

/**
 * ProfilePage — lets a user edit their own profile.
 *
 * Two cards:
 *   1. Display info — name (editable), email (read-only), role (read-only).
 *      Email and role can't be self-edited; email is managed by Supabase Auth
 *      and role changes require an admin.
 *   2. Change password — requires the new password to be confirmed.
 *
 * Save state for each card is independent so a user can change just one
 * without touching the other.
 */
export default function ProfilePage({ profile, session, navigate, onProfileUpdated }) {
  return (
    <div className="px-4 md:px-6 lg:px-10 py-4 md:py-6 max-w-2xl">
      <div className="mb-5">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-1 font-medium">
          Account
        </p>
        <h1 className="text-2xl md:text-3xl font-light text-slate-900">My profile</h1>
        <p className="text-sm text-slate-600 mt-1">
          Manage your display name and password. Email and role are managed by an admin.
        </p>
      </div>

      <DisplayInfoCard
        profile={profile}
        session={session}
        onUpdated={onProfileUpdated}
      />

      <NotificationsCard
        profile={profile}
        session={session}
      />

      <InstallAppCard />

      <PasswordCard />
    </div>
  );
}

/* ────────── Display info card ────────── */

function DisplayInfoCard({ profile, session, onUpdated }) {
  const [name, setName] = useState(profile?.display_name || '');
  const [title, setTitle] = useState(profile?.title || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [savedAt, setSavedAt] = useState(null);

  // The profile prop can arrive (or change) after this card first mounts —
  // useState initializers only run once, so without this the fields would
  // stay blank even after the profile loads. Re-sync local edit state to the
  // profile whenever it changes, unless the user has unsaved edits in flight.
  useEffect(() => {
    setName(profile?.display_name || '');
    setTitle(profile?.title || '');
    setPhone(profile?.phone || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.user_id, profile?.display_name, profile?.title, profile?.phone]);

  const role = profile?.role || null;
  const roleLabel = role ? ({ admin: 'Admin', director: 'Director', sales: 'Sales', customer: 'Customer' }[role] || role) : 'Loading…';
  const isDirty =
    name.trim() !== (profile?.display_name || '') ||
    title.trim() !== (profile?.title || '') ||
    phone.trim() !== (profile?.phone || '');

  async function save() {
    if (!isDirty) return;
    setSaving(true); setError(null);
    let { data, error } = await supabase
      .from('users')
      .update({ display_name: name.trim() || null, title: title.trim() || null, phone: phone.trim() || null })
      .eq('id', session.user.id)
      .select()
      .single();

    // If the v33 title/phone columns aren't present on this Supabase project,
    // the update errors. Retry with just display_name so the rep can still
    // save their name rather than being blocked entirely.
    if (error) {
      const retry = await supabase
        .from('users')
        .update({ display_name: name.trim() || null })
        .eq('id', session.user.id)
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }

    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSavedAt(Date.now());
    setTimeout(() => setSavedAt(null), 2500);
    onUpdated?.(data);
  }

  return (
    <section className="bg-white border border-page-200 rounded-lg overflow-hidden mb-4">
      <header className="px-4 md:px-5 py-3 border-b border-page-100">
        <h2 className="text-sm font-medium text-slate-900">Display info</h2>
      </header>
      <div className="p-4 md:p-5 space-y-4">
        <label className="block">
          <span className="block text-[11px] uppercase tracking-wider text-slate-600 mb-1 font-semibold">
            Display name
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your full name"
            className="w-full px-3 py-2 bg-page-50 border border-page-200 rounded text-sm
                       focus:border-navy-500 focus:ring-2 focus:ring-navy-500/10 focus:bg-white
                       focus:outline-none transition-colors"
          />
          <span className="block text-[11px] text-slate-500 mt-1">
            Shown in the user menu and on deals you submit.
          </span>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-[11px] uppercase tracking-wider text-slate-600 mb-1 font-semibold">
              Title
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Sales Representative"
              className="w-full px-3 py-2 bg-page-50 border border-page-200 rounded text-sm
                         focus:border-navy-500 focus:ring-2 focus:ring-navy-500/10 focus:bg-white
                         focus:outline-none transition-colors"
            />
            <span className="block text-[11px] text-slate-500 mt-1">
              Optional. Used on customer-facing documents.
            </span>
          </label>

          <label className="block">
            <span className="block text-[11px] uppercase tracking-wider text-slate-600 mb-1 font-semibold">
              Phone
            </span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 555-5555"
              className="w-full px-3 py-2 bg-page-50 border border-page-200 rounded text-sm
                         focus:border-navy-500 focus:ring-2 focus:ring-navy-500/10 focus:bg-white
                         focus:outline-none transition-colors"
            />
            <span className="block text-[11px] text-slate-500 mt-1">
              Optional. Used on customer-facing documents.
            </span>
          </label>

          <div>
            <span className="block text-[11px] uppercase tracking-wider text-slate-600 mb-1 font-semibold">
              Email
            </span>
            <div className="w-full px-3 py-2 bg-page-100 border border-page-200 rounded text-sm text-slate-600">
              {session.user.email}
            </div>
            <span className="block text-[11px] text-slate-500 mt-1">
              Contact an admin to change.
            </span>
          </div>
          <div>
            <span className="block text-[11px] uppercase tracking-wider text-slate-600 mb-1 font-semibold">
              Role
            </span>
            <div className="w-full px-3 py-2 bg-page-100 border border-page-200 rounded text-sm text-slate-600">
              {roleLabel}
            </div>
            <span className="block text-[11px] text-slate-500 mt-1">
              Set by an admin.
            </span>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-page-100">
          {savedAt && <span className="text-xs text-ok font-medium">✓ Saved</span>}
          <button
            onClick={save}
            disabled={!isDirty || saving}
            className="px-4 py-2 bg-navy-900 text-chalk-50 text-sm font-medium rounded
                       hover:bg-navy-800 disabled:opacity-40 disabled:cursor-not-allowed
                       transition-colors"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </section>
  );
}

/* ────────── Password card ────────── */

function PasswordCard() {
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [savedAt, setSavedAt] = useState(null);

  const tooShort = newPwd.length > 0 && newPwd.length < 8;
  const mismatch = confirmPwd.length > 0 && confirmPwd !== newPwd;
  const canSave = newPwd.length >= 8 && newPwd === confirmPwd && !saving;

  async function save() {
    setSaving(true); setError(null);
    const { error } = await supabase.auth.updateUser({ password: newPwd });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNewPwd('');
    setConfirmPwd('');
    setSavedAt(Date.now());
    setTimeout(() => setSavedAt(null), 2500);
  }

  return (
    <section className="bg-white border border-page-200 rounded-lg overflow-hidden">
      <header className="px-4 md:px-5 py-3 border-b border-page-100">
        <h2 className="text-sm font-medium text-slate-900">Change password</h2>
      </header>
      <div className="p-4 md:p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-[11px] uppercase tracking-wider text-slate-600 mb-1 font-semibold">
              New password
            </span>
            <input
              type="password"
              autoComplete="new-password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              placeholder="At least 8 characters"
              className={`w-full px-3 py-2 bg-page-50 border rounded text-sm
                         focus:ring-2 focus:bg-white focus:outline-none transition-colors
                         ${tooShort
                           ? 'border-bad/50 focus:border-bad focus:ring-bad/10'
                           : 'border-page-200 focus:border-navy-500 focus:ring-navy-500/10'}`}
            />
            {tooShort && <span className="block text-[11px] text-bad mt-1">Must be at least 8 characters.</span>}
          </label>
          <label className="block">
            <span className="block text-[11px] uppercase tracking-wider text-slate-600 mb-1 font-semibold">
              Confirm new password
            </span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              placeholder="Re-enter password"
              className={`w-full px-3 py-2 bg-page-50 border rounded text-sm
                         focus:ring-2 focus:bg-white focus:outline-none transition-colors
                         ${mismatch
                           ? 'border-bad/50 focus:border-bad focus:ring-bad/10'
                           : 'border-page-200 focus:border-navy-500 focus:ring-navy-500/10'}`}
            />
            {mismatch && <span className="block text-[11px] text-bad mt-1">Passwords don't match.</span>}
          </label>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-page-100">
          {savedAt && <span className="text-xs text-ok font-medium">✓ Password updated</span>}
          <button
            onClick={save}
            disabled={!canSave}
            className="px-4 py-2 bg-navy-900 text-chalk-50 text-sm font-medium rounded
                       hover:bg-navy-800 disabled:opacity-40 disabled:cursor-not-allowed
                       transition-colors"
          >
            {saving ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </div>
    </section>
  );
}

/* ────────── Notifications card (v32) ────────── */

/**
 * NotificationsCard — controls the rep's email-notifications preference.
 * In-app bell notifications are always on; this toggle only affects email
 * delivery from the Pipeline dashboard.
 *
 * The flag is mirrored into pipeline `team_members.email_notifications_enabled`
 * (added in v32 migration). The email sender on the dashboard side reads
 * this column before sending; in-app notifications always fire.
 */
function NotificationsCard({ profile, session }) {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [savedAt, setSavedAt] = useState(null);

  // Load current preference on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { enabled: e, error: err } = await fetchEmailNotificationsEnabled(session.user.email);
      if (cancelled) return;
      if (err) setError(err.message);
      setEnabled(e);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [session.user.email]);

  async function toggle() {
    if (saving || loading) return;
    const next = !enabled;
    setSaving(true);
    setError(null);
    const { error: err } = await setEmailNotificationsEnabled(
      session.user.email,
      next,
      profile?.display_name
    );
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setEnabled(next);
    setSavedAt(Date.now());
    setTimeout(() => setSavedAt(null), 2500);
  }

  return (
    <section className="bg-white border border-page-200 rounded-lg overflow-hidden mb-4">
      <header className="px-4 md:px-5 py-3 border-b border-page-100">
        <h2 className="text-sm font-medium text-slate-900">Notifications</h2>
      </header>
      <div className="p-4 md:p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-900 font-medium">
              Email notifications
            </p>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              Get an email when there's activity on your deals (decisions, phase
              changes, ops notes). When off, you'll still see everything in the
              notification bell at the top of the app.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            disabled={loading || saving}
            onClick={toggle}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                       flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-navy-500/30
                       disabled:opacity-40 disabled:cursor-not-allowed
                       ${enabled ? 'bg-navy-900' : 'bg-slate-300'}`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow
                         ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`}
            />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {savedAt && (
          <p className="text-xs text-ok font-medium">
            ✓ Saved. Email is now {enabled ? 'on' : 'off'}.
          </p>
        )}

        <div className="pt-2 border-t border-page-100">
          <p className="text-[11px] text-slate-500">
            <span className="font-semibold text-slate-700">In-app notifications</span> can't be
            turned off — they're how you see deal activity inside the Deal Builder.
            Email is just the optional second channel.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ────────── Install app card (v32) ────────── */

/**
 * InstallAppCard — surfaces the PWA install instructions for reps who
 * want a desktop icon or home-screen shortcut. The browser handles the
 * actual install prompt; this card just explains what to do and
 * acknowledges the platform differences:
 *
 *   - Chrome / Edge / Brave on desktop: an install icon appears in the
 *     URL bar, plus a programmatic "Install app" button when the
 *     beforeinstallprompt event fires (captured below).
 *   - iOS Safari: no programmatic prompt; rep must Share → Add to Home Screen.
 *   - Android Chrome: usually shows an automatic mini-infobar, but Add
 *     to Home Screen from the menu also works.
 *
 * When the beforeinstallprompt event has been captured (set in main.jsx),
 * a literal "Install app" button is shown that fires the prompt directly.
 */
function InstallAppCard() {
  const [installPromptAvailable, setInstallPromptAvailable] = useState(
    !!window.__deferredInstallPrompt
  );
  const [installing, setInstalling] = useState(false);
  const [outcome, setOutcome] = useState(null);

  // The prompt may arrive after the card mounts. Listen for the event
  // (re-fired into a window-level custom event by main.jsx).
  useEffect(() => {
    function onCustom() {
      setInstallPromptAvailable(true);
    }
    window.addEventListener('pwa-install-available', onCustom);
    return () => window.removeEventListener('pwa-install-available', onCustom);
  }, []);

  async function handleInstall() {
    const promptEvent = window.__deferredInstallPrompt;
    if (!promptEvent) return;
    setInstalling(true);
    try {
      promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      setOutcome(choice?.outcome === 'accepted' ? 'installed' : 'dismissed');
      // The prompt can only be used once.
      window.__deferredInstallPrompt = null;
      setInstallPromptAvailable(false);
    } catch (e) {
      setOutcome('error');
    } finally {
      setInstalling(false);
    }
  }

  return (
    <section className="bg-white border border-page-200 rounded-lg overflow-hidden mb-4">
      <header className="px-4 md:px-5 py-3 border-b border-page-100">
        <h2 className="text-sm font-medium text-slate-900">Install Deal Builder</h2>
      </header>
      <div className="p-4 md:p-5 space-y-3">
        <p className="text-sm text-slate-700 leading-relaxed">
          Add the Deal Builder to your desktop or phone home screen so it
          launches like an app instead of a browser tab.
        </p>

        {installPromptAvailable && (
          <div className="pt-1">
            <button
              onClick={handleInstall}
              disabled={installing}
              className="px-4 py-2 bg-navy-900 text-chalk-50 text-sm font-medium rounded
                         hover:bg-navy-800 disabled:opacity-40 disabled:cursor-not-allowed
                         transition-colors inline-flex items-center gap-2"
            >
              {installing ? 'Installing…' : 'Install app'}
            </button>
            {outcome === 'installed' && (
              <p className="text-xs text-ok font-medium mt-2">
                ✓ Installed. Look for the Deal Builder icon on your dock or home screen.
              </p>
            )}
            {outcome === 'dismissed' && (
              <p className="text-xs text-slate-500 mt-2">
                No problem — you can install later from this same screen.
              </p>
            )}
            {outcome === 'error' && (
              <p className="text-xs text-bad mt-2">
                Couldn't open the install prompt. Try the manual steps below.
              </p>
            )}
          </div>
        )}

        <details className="pt-2 border-t border-page-100">
          <summary className="text-xs font-semibold text-slate-700 cursor-pointer hover:text-navy-700">
            Manual install instructions
          </summary>
          <div className="mt-3 space-y-3 text-xs text-slate-700 leading-relaxed">
            <div>
              <p className="font-semibold text-slate-800">Desktop (Chrome, Edge, Brave)</p>
              <p className="text-slate-600">
                Click the small install icon at the right side of the URL bar,
                or open the browser menu and choose <span className="font-medium">Install Deal Builder</span>.
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-800">iPhone or iPad (Safari)</p>
              <p className="text-slate-600">
                Tap the Share button (the square with the up arrow), scroll down,
                and choose <span className="font-medium">Add to Home Screen</span>. The Deal
                Builder icon will appear on your home screen.
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-800">Android (Chrome)</p>
              <p className="text-slate-600">
                Tap the three-dot menu in the top-right and choose
                <span className="font-medium"> Install app</span> or <span className="font-medium">Add to Home Screen</span>.
              </p>
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}
