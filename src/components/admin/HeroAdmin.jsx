import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase.js';
import { useSiteSettings } from '../../lib/useSiteSettings.js';
import HeroHeader from '../HeroHeader.jsx';

export default function HeroAdmin({ onBack, userId }) {
  const { settings, loading, error, reload } = useSiteSettings();
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const fileRef = useRef(null);

  // Initialize draft when settings load
  useEffect(() => {
    if (settings && !draft) {
      setDraft({
        hero_enabled:  settings.hero_enabled,
        hero_image_url: settings.hero_image_url || '',
        hero_headline:  settings.hero_headline || '',
        hero_subhead:   settings.hero_subhead || '',
        hero_overlay:   settings.hero_overlay ?? 40,
      });
    }
  }, [settings, draft]);

  const update = (k, v) => setDraft((p) => ({ ...p, [k]: v }));
  const isDirty = settings && draft && (
    draft.hero_enabled   !== settings.hero_enabled ||
    draft.hero_image_url !== (settings.hero_image_url || '') ||
    draft.hero_headline  !== (settings.hero_headline || '') ||
    draft.hero_subhead   !== (settings.hero_subhead || '') ||
    draft.hero_overlay   !== (settings.hero_overlay ?? 40)
  );

  async function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true); setSaveError(null);

    // Filename: hero-<timestamp>.<ext> — timestamped so re-uploads never
    // collide and old images stay in the bucket if anyone wants to roll back.
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `hero-${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('site-content')
      .upload(path, file, { cacheControl: '3600', upsert: false });

    if (upErr) {
      setUploading(false);
      setSaveError(`Upload failed: ${upErr.message}`);
      return;
    }

    const { data } = supabase.storage.from('site-content').getPublicUrl(path);
    update('hero_image_url', data.publicUrl);
    setUploading(false);
  }

  async function save() {
    setSaving(true); setSaveError(null);
    const payload = {
      hero_enabled:   !!draft.hero_enabled,
      hero_image_url: draft.hero_image_url?.trim() || null,
      hero_headline:  draft.hero_headline?.trim()  || null,
      hero_subhead:   draft.hero_subhead?.trim()   || null,
      hero_overlay:   parseInt(draft.hero_overlay, 10) || 0,
      updated_by:     userId,
    };
    const { error } = await supabase
      .from('site_settings')
      .update(payload)
      .eq('id', 1);
    setSaving(false);
    if (error) setSaveError(error.message);
    else reload();
  }

  function discard() {
    if (!settings) return;
    setDraft({
      hero_enabled:   settings.hero_enabled,
      hero_image_url: settings.hero_image_url || '',
      hero_headline:  settings.hero_headline || '',
      hero_subhead:   settings.hero_subhead || '',
      hero_overlay:   settings.hero_overlay ?? 40,
    });
    setSaveError(null);
  }

  if (loading || !draft) {
    return (
      <div className="px-4 md:px-10 py-10 text-center text-slate-500 text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="px-4 md:px-6 lg:px-10 py-4 md:py-6">
      <div className="flex items-center gap-3 mb-4 md:mb-6">
        <button onClick={onBack}
                className="text-sm text-navy-700 hover:text-navy-900 font-medium flex items-center gap-1">
          ← Admin
        </button>
      </div>

      <div className="mb-5 md:mb-6">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-1 font-medium">Admin</p>
        <h1 className="text-2xl md:text-3xl font-light text-slate-900">Home page hero</h1>
        <p className="text-sm text-slate-600 mt-2 leading-relaxed max-w-2xl">
          The hero banner at the top of the home page. Upload a background image, set a headline and supporting text, and adjust the overlay darkness so the text stays readable.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Live preview using the current draft */}
      <section className="mb-6">
        <h3 className="text-xs uppercase tracking-[0.2em] text-slate-500 font-medium mb-3">Preview</h3>
        <div className="border border-page-200 rounded-lg overflow-hidden">
          <HeroHeader settings={{
            hero_enabled:   draft.hero_enabled,
            hero_image_url: draft.hero_image_url,
            hero_headline:  draft.hero_headline,
            hero_subhead:   draft.hero_subhead,
            hero_overlay:   draft.hero_overlay,
          }} />
          {!draft.hero_enabled && (
            <div className="p-6 text-center text-sm text-slate-500 italic bg-page-50">
              Hero is hidden — toggle "Show hero on home page" below to display it.
            </div>
          )}
        </div>
      </section>

      {/* Edit form */}
      <section className="space-y-5 bg-white border border-page-200 rounded-lg p-4 md:p-6 max-w-3xl">
        <Checkbox
          label="Show hero on home page"
          checked={draft.hero_enabled}
          onChange={(v) => update('hero_enabled', v)}
        />

        {/* Image upload */}
        <div>
          <span className="block text-xs uppercase tracking-wider text-slate-600 mb-1.5 font-medium">
            Background image
          </span>
          <div className="flex items-center gap-4 mt-2">
            <div className="w-32 h-20 flex-shrink-0 flex items-center justify-center
                            bg-page-50 border border-page-200 rounded overflow-hidden">
              {draft.hero_image_url ? (
                <img src={draft.hero_image_url} alt="Hero preview"
                     className="w-full h-full object-cover" />
              ) : (
                <span className="text-[10px] text-slate-400 uppercase tracking-wider">No image</span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileSelected}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="px-3 py-2 text-sm border border-page-200 bg-white rounded
                           hover:bg-page-50 disabled:opacity-40 transition-colors">
                {uploading ? 'Uploading…' : draft.hero_image_url ? 'Replace image' : 'Upload image'}
              </button>
              {draft.hero_image_url && (
                <button
                  type="button"
                  onClick={() => update('hero_image_url', '')}
                  className="text-xs text-bad hover:underline self-start">
                  Remove
                </button>
              )}
            </div>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            PNG, JPG, or WebP. Max 10 MB. Landscape orientation works best (e.g. 1920×600 or wider).
            If no image is uploaded, a navy fallback background is used.
          </p>
        </div>

        <Input label="Headline"
               hint="Big, attention-grabbing text. Leave blank to show no headline."
               value={draft.hero_headline}
               onChange={(v) => update('hero_headline', v)} />

        <Textarea label="Subheadline"
                  hint="Supporting text below the headline. Leave blank to omit."
                  rows={2}
                  value={draft.hero_subhead}
                  onChange={(v) => update('hero_subhead', v)} />

        {/* Overlay slider — only meaningful if there's an image */}
        <div className={draft.hero_image_url ? '' : 'opacity-60'}>
          <span className="block text-xs uppercase tracking-wider text-slate-600 mb-1.5 font-medium">
            Overlay darkness · {draft.hero_overlay}%
          </span>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={draft.hero_overlay}
            onChange={(e) => update('hero_overlay', parseInt(e.target.value, 10))}
            className="w-full accent-navy-600"
            disabled={!draft.hero_image_url}
          />
          <div className="flex justify-between text-[10px] uppercase tracking-wider text-slate-500 mt-1">
            <span>Bright</span>
            <span>Dark</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {draft.hero_image_url
              ? 'Higher values dim the image for better text readability. Try 40-60% for typical photos.'
              : 'Overlay is only used when a background image is set.'}
          </p>
        </div>

        {saveError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded">
            <p className="text-sm text-red-700">{saveError}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-page-100">
          <button onClick={discard} disabled={!isDirty || saving}
                  className="px-3 md:px-4 py-2 text-sm border border-page-200 bg-white rounded
                             hover:bg-page-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            Discard
          </button>
          <button onClick={save} disabled={!isDirty || saving}
                  className="px-3 md:px-4 py-2 text-sm bg-navy-900 text-chalk-50 rounded
                             hover:bg-navy-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </section>
    </div>
  );
}

function Input({ label, hint, value, onChange }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wider text-slate-600 mb-1.5 font-medium">{label}</span>
      <input type="text" value={value ?? ''} onChange={(e) => onChange(e.target.value)}
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

function Checkbox({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
             className="accent-navy-600 w-4 h-4" />
      <span className="text-sm text-slate-800">{label}</span>
    </label>
  );
}
