import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';

const TYPE_OPTIONS = [
  { value: 'promotion',    label: 'Promotion' },
  { value: 'special_deal', label: 'Special Deal' },
  { value: 'news',         label: 'News' },
];

const TYPE_BADGE = {
  promotion:    { bg: 'bg-accent-500/10',  text: 'text-accent-700' },
  special_deal: { bg: 'bg-navy-500/10',    text: 'text-navy-700' },
  news:         { bg: 'bg-slate-100',      text: 'text-slate-700' },
};

export default function AnnouncementsAdmin({ onBack, userId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // either a row object or { _new: true }

  async function reload() {
    setLoading(true);
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .order('type')
      .order('sort_order')
      .order('created_at', { ascending: false });
    if (error) setError(error.message);
    else setRows(data || []);
    setLoading(false);
  }

  useEffect(() => { reload(); }, []);

  return (
    <div className="px-4 md:px-6 lg:px-10 py-4 md:py-6">
      <div className="flex items-center gap-3 mb-4 md:mb-6">
        <button onClick={onBack}
                className="text-sm text-navy-700 hover:text-navy-900 font-medium flex items-center gap-1">
          ← Admin
        </button>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4 md:mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-1 font-medium">
            Admin
          </p>
          <h1 className="text-2xl md:text-3xl font-light text-slate-900">
            Announcements
            <span className="ml-2 md:ml-3 text-sm md:text-base text-slate-500 font-normal">
              {rows.length}
            </span>
          </h1>
        </div>
        <button onClick={() => setEditing({ _new: true })}
                className="px-4 py-2 bg-navy-900 text-chalk-50 text-sm font-medium rounded
                           hover:bg-navy-800 transition-colors">
          + New announcement
        </button>
      </div>

      {loading && <div className="py-20 text-center text-slate-500">Loading…</div>}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="bg-white border border-page-200 rounded-lg py-16 text-center">
          <p className="text-slate-500 text-sm mb-3">No announcements yet.</p>
          <button onClick={() => setEditing({ _new: true })}
                  className="text-sm text-navy-700 hover:text-navy-900 font-medium">
            Create your first one →
          </button>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="space-y-2">
          {rows.map((row) => (
            <article key={row.id} onClick={() => setEditing(row)}
                     className="bg-white border border-page-200 rounded-lg p-3 md:p-4 cursor-pointer
                                hover:border-navy-300 hover:shadow-card transition-all">
              <div className="flex items-start gap-3">
                <span className={`inline-block px-2 py-0.5 rounded text-[10px] uppercase tracking-wider
                                  font-bold flex-shrink-0
                                  ${TYPE_BADGE[row.type].bg} ${TYPE_BADGE[row.type].text}`}>
                  {row.type.replace('_', ' ')}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm md:text-base font-medium text-slate-900 mb-0.5">
                    {row.title}
                  </h3>
                  {row.summary && (
                    <p className="text-xs md:text-sm text-slate-600 line-clamp-2">{row.summary}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-500 uppercase tracking-wider">
                    <span className={row.active ? 'text-ok' : 'text-slate-400'}>
                      {row.active ? '● Active' : '○ Inactive'}
                    </span>
                    <span>Order {row.sort_order}</span>
                    {row.starts_at && <span>From {row.starts_at.slice(0, 10)}</span>}
                    {row.ends_at && <span>Until {row.ends_at.slice(0, 10)}</span>}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && (
        <AnnouncementEditor
          row={editing}
          userId={userId}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
          onDeleted={() => { setEditing(null); reload(); }}
        />
      )}
    </div>
  );
}

function AnnouncementEditor({ row, userId, onClose, onSaved, onDeleted }) {
  const isNew = row._new;
  const [draft, setDraft] = useState(
    isNew
      ? {
          type: 'promotion',
          title: '',
          summary: '',
          body: '',
          image_url: '',
          link_url: '',
          sort_order: 10,
          active: true,
          starts_at: '',
          ends_at: '',
        }
      : { ...row }
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  const update = (k, v) => setDraft((p) => ({ ...p, [k]: v }));

  async function save() {
    setSaving(true); setError(null);
    const payload = { ...draft };
    // Empty strings for date columns must become null
    ['starts_at', 'ends_at', 'summary', 'body', 'image_url', 'link_url'].forEach((k) => {
      if (payload[k] === '') payload[k] = null;
    });
    delete payload._new;

    let result;
    if (isNew) {
      payload.created_by = userId;
      result = await supabase.from('announcements').insert(payload).select().single();
    } else {
      delete payload.created_by;
      delete payload.created_at;
      delete payload.updated_at;
      delete payload.id;
      result = await supabase.from('announcements').update(payload).eq('id', row.id).select().single();
    }
    setSaving(false);
    if (result.error) setError(result.error.message);
    else onSaved();
  }

  async function remove() {
    if (!confirm('Delete this announcement? This cannot be undone.')) return;
    setDeleting(true);
    const { error } = await supabase.from('announcements').delete().eq('id', row.id);
    setDeleting(false);
    if (error) setError(error.message);
    else onDeleted();
  }

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 bg-navy-950/50 backdrop-blur-[2px] z-40" />
      <aside className="fixed bg-white shadow-elevated z-50 overflow-y-auto border-page-200
                        inset-x-0 bottom-0 top-12 rounded-t-2xl border-t
                        md:inset-y-0 md:right-0 md:left-auto md:top-0 md:max-w-xl md:w-full
                        md:rounded-t-none md:border-l md:border-t-0">

        <div className="md:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-page-300" />
        </div>

        <div className="sticky top-0 bg-navy-900 text-chalk-50 px-4 md:px-6 py-3 md:py-4 z-10
                        flex items-center justify-between border-b border-navy-800">
          <h2 className="text-base md:text-lg font-medium text-chalk-50">
            {isNew ? 'New announcement' : 'Edit announcement'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded transition-colors" aria-label="Close">
            <svg className="w-5 h-5 text-chalk-100" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 md:p-6 space-y-4 pb-32">
          <Select label="Type" value={draft.type} onChange={(v) => update('type', v)} options={TYPE_OPTIONS} />
          <Input label="Title" value={draft.title} onChange={(v) => update('title', v)} required />
          <Textarea label="Summary" hint="Shown on the card." value={draft.summary || ''}
                    onChange={(v) => update('summary', v)} rows={2} />
          <Textarea label="Body" hint="Optional long form, shown when expanded." value={draft.body || ''}
                    onChange={(v) => update('body', v)} rows={4} />
          <Input label="Image URL" type="url" value={draft.image_url || ''} onChange={(v) => update('image_url', v)} />
          <Input label="Link URL (for 'Learn more')" type="url" value={draft.link_url || ''} onChange={(v) => update('link_url', v)} />

          <div className="grid grid-cols-2 gap-3">
            <Input label="Sort order" type="number" value={draft.sort_order}
                   onChange={(v) => update('sort_order', parseInt(v, 10) || 0)} />
            <Checkbox label="Active" checked={!!draft.active} onChange={(v) => update('active', v)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Show from" type="date"
                   value={draft.starts_at ? draft.starts_at.slice(0, 10) : ''}
                   onChange={(v) => update('starts_at', v)} />
            <Input label="Show until" type="date"
                   value={draft.ends_at ? draft.ends_at.slice(0, 10) : ''}
                   onChange={(v) => update('ends_at', v)} />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-page-200 px-4 md:px-6 py-3 md:py-4
                        flex items-center justify-between">
          {!isNew ? (
            <button onClick={remove} disabled={deleting || saving}
                    className="px-3 md:px-4 py-2 text-sm text-bad hover:bg-red-50 rounded
                               disabled:opacity-40 transition-colors">
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          ) : <div />}
          <div className="flex gap-2">
            <button onClick={onClose}
                    className="px-3 md:px-4 py-2 text-sm border border-page-200 bg-white rounded
                               hover:bg-page-50 transition-colors">
              Cancel
            </button>
            <button onClick={save} disabled={saving || !draft.title?.trim()}
                    className="px-3 md:px-4 py-2 text-sm bg-navy-900 text-chalk-50 rounded
                               hover:bg-navy-800 disabled:opacity-40 disabled:cursor-not-allowed
                               transition-colors font-medium">
              {saving ? 'Saving…' : isNew ? 'Create' : 'Save'}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

// Small form primitives used by both admin editors
function Input({ label, hint, type = 'text', value, onChange, required }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wider text-slate-600 mb-1.5 font-medium">
        {label}{required && <span className="text-bad ml-0.5">*</span>}
      </span>
      <input type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} required={required}
             className="w-full px-3 py-2.5 md:py-2 bg-white border border-page-200 rounded text-sm
                        focus:border-navy-500 focus:ring-2 focus:ring-navy-500/10 focus:outline-none transition-colors" />
      {hint && <span className="block text-[11px] text-slate-500 mt-1">{hint}</span>}
    </label>
  );
}

function Textarea({ label, hint, value, onChange, rows = 3 }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wider text-slate-600 mb-1.5 font-medium">{label}</span>
      <textarea value={value ?? ''} onChange={(e) => onChange(e.target.value)} rows={rows}
                className="w-full px-3 py-2.5 md:py-2 bg-white border border-page-200 rounded text-sm
                           focus:border-navy-500 focus:ring-2 focus:ring-navy-500/10 focus:outline-none transition-colors resize-y" />
      {hint && <span className="block text-[11px] text-slate-500 mt-1">{hint}</span>}
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wider text-slate-600 mb-1.5 font-medium">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
              className="w-full px-3 py-2.5 md:py-2 bg-white border border-page-200 rounded text-sm
                         focus:border-navy-500 focus:ring-2 focus:ring-navy-500/10 focus:outline-none transition-colors">
        {options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
    </label>
  );
}

function Checkbox({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none pt-6">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
             className="accent-navy-600 w-4 h-4" />
      <span className="text-sm text-slate-800">{label}</span>
    </label>
  );
}
