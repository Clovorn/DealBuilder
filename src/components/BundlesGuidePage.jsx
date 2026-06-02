export default function BundlesGuidePage({ bundles = [], navigate }) {
  const featuredBundles = bundles.filter((b) => b.image_url).slice(0, 6);

  return (
    <div className="px-4 md:px-6 lg:px-10 py-4 md:py-6">
      <div className="rounded-3xl bg-gradient-to-br from-navy-900 via-navy-800 to-accent-700 text-chalk-50 p-6 md:p-8 shadow-card mb-6">
        <p className="text-xs uppercase tracking-[0.18em] text-chalk-300 mb-2 font-medium">
          Bundles Decision Guide
        </p>
        <h1 className="text-3xl md:text-4xl font-light leading-tight mb-3">
          Is this customer in a program, or not?
        </h1>
        <p className="text-sm md:text-base text-chalk-100/90 leading-relaxed max-w-4xl">
          Most business goes through distributors. The key question is not <strong>distributor or not</strong>. The key question is <strong>program or not</strong>. When the customer is a fit, the Distributor Program is a complete beverage growth program, not just an equipment path.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            onClick={() => navigate?.('bundles')}
            className="px-4 py-2 rounded bg-white text-navy-900 text-sm font-medium hover:bg-chalk-50 transition-colors"
          >
            Back to Bundles
          </button>
        </div>
      </div>

      <section className="mb-6 bg-white border border-page-200 rounded-3xl p-5 md:p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-2 font-medium">
          Fast decision tree
        </p>
        <h2 className="text-2xl font-light text-slate-900 mb-4">
          Ask these questions in order
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <DecisionCard
            emoji="1️⃣"
            title="Is the customer buying through a distributor?"
            answer="Usually yes"
            text="That is normal. This alone does not make it a program deal."
          />
          <DecisionCard
            emoji="2️⃣"
            title="Is the customer going into a Distributor Program or Ronnoco Branded bundle program?"
            answer="This is the real decision"
            text="If yes, it is a bundle program deal. If no, it is a general deal."
          />
          <DecisionCard
            emoji="3️⃣"
            title="What path should the rep use?"
            answer="Program = bundle path, no program = normal deal sheet"
            text="Keep it that simple."
          />
        </div>
      </section>

      <section className="mb-6 grid grid-cols-1 xl:grid-cols-2 gap-4">
        <PathCard
          emoji="📦"
          title="YES, the customer is in a program"
          subtitle="Bundle Program Deal"
          bullets={[
            'Customer is in a Distributor Program or Ronnoco Branded bundle program.',
            'Use the bundle program path.',
            'Digital media delivery and marketing are included.',
            'Service is included when the customer is in compliance with the service agreement.',
            'This is the stronger full-program sell built around equipment, media, service, and approved product participation.',
          ]}
          tone="emerald"
        />
        <PathCard
          emoji="🧾"
          title="NO, the customer is not in a program"
          subtitle="General Deal"
          bullets={[
            'Customer may still buy through a distributor.',
            'Use the normal deal sheet.',
            'No included bundle-program digital media or marketing.',
            'No included bundle-program service structure.',
            'This is a regular equipment deal, not a program sell.',
          ]}
          tone="slate"
        />
      </section>

      <section className="mb-6 bg-amber-50 border border-amber-200 rounded-3xl p-5 md:p-6">
        <p className="text-xs uppercase tracking-[0.18em] text-amber-800 mb-2 font-semibold">
          Main selling point
        </p>
        <h2 className="text-2xl font-light text-slate-900 mb-4">
          Why move the customer into the program?
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <VisualNote
            emoji="📺"
            title="Digital media included"
            text="Distributor Programs include Ronnoco digital media delivery and marketing, including delivery to customer-installed screens."
            linkLabel="Learn more in FAQ"
            onClick={() => navigate?.('faq', { anchor: 'understanding-bundles' })}
          />
          <VisualNote
            emoji="🧰"
            title="Service included"
            text="Service is included when the customer is in compliance with the service agreement."
            linkLabel="Service and program details"
            onClick={() => navigate?.('faq', { anchor: 'understanding-bundles' })}
          />
          <VisualNote
            emoji="⭐"
            title="Better overall story"
            text="You are not just selling equipment. You are selling a beverage growth program that helps the store look better, run smoother, and sell more product."
            linkLabel="Deal type FAQ"
            onClick={() => navigate?.('faq', { anchor: 'deal-types-explained' })}
          />
        </div>
      </section>

      <section className="mb-6 bg-blue-50 border border-blue-200 rounded-3xl p-5 md:p-6">
        <p className="text-xs uppercase tracking-[0.18em] text-blue-800 mb-2 font-semibold">
          Special case
        </p>
        <h2 className="text-2xl font-light text-slate-900 mb-4">
          DSD or individual customer wanting media
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <VisualNote
            emoji="🚚"
            title="DSD media rule"
            text="For DSD customers or individual customers wanting media services, the customer must be a Ronnoco customer with enough volume to cover monthly media delivery."
            linkLabel="See deal sheet help"
            onClick={() => navigate?.('faq', { anchor: 'building-a-deal-sheet' })}
          />
          <VisualNote
            emoji="💵"
            title="Media cost"
            text="Monthly digital media delivery usually costs about $30 to $70 per player, depending on setup. That cost is billed to Ronnoco and must be passed through to the customer."
            linkLabel="Lease math and pricing FAQ"
            onClick={() => navigate?.('faq', { anchor: 'lease-math' })}
          />
        </div>
      </section>

      {featuredBundles.length > 0 && (
        <section className="mb-6">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-2 font-medium">
            Bundle examples
          </p>
          <h2 className="text-2xl font-light text-slate-900 mb-4">
            These fit the bundle program path
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {featuredBundles.map((bundle) => (
              <div key={bundle.id} className="bg-white border border-page-200 rounded-2xl p-3 shadow-sm">
                <div className="aspect-[4/3] rounded-xl overflow-hidden bg-page-100 mb-3 flex items-center justify-center">
                  <img src={bundle.image_url} alt={bundle.name} className="w-full h-full object-contain" />
                </div>
                <div className="text-sm font-medium text-slate-900 leading-snug">{bundle.name}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="bg-white border border-page-200 rounded-3xl p-5 md:p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-2 font-medium">
          Rep reminder
        </p>
        <h2 className="text-2xl font-light text-slate-900 mb-4">
          Remember these 3 things
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ChecklistCard
            emoji="1️⃣"
            title="Distributor does not mean program"
            bullets={[
              'A customer can be through a distributor and still be a general deal.',
            ]}
          />
          <ChecklistCard
            emoji="2️⃣"
            title="Program means media + service value"
            bullets={[
              'That is the reason to move them into the bundle program when they fit.',
            ]}
          />
          <ChecklistCard
            emoji="3️⃣"
            title="Pick the right path"
            bullets={[
              'Program customer = bundle path.',
              'Non-program customer = normal deal sheet.',
            ]}
          />
        </div>
      </section>
    </div>
  );
}


function FlatIcon({ label }) {
  return (
    <div className="w-11 h-11 rounded-2xl border border-page-200 bg-page-50 flex items-center justify-center text-lg shadow-sm">
      <span aria-hidden="true">{label}</span>
    </div>
  );
}

function DecisionCard({ emoji, title, answer, text }) {
  return (
    <div className="rounded-2xl border border-page-200 bg-page-50 p-4">
      <div className="mb-3"><FlatIcon label={emoji} /></div>
      <h3 className="text-base font-medium text-slate-900 mb-2">{title}</h3>
      <div className="inline-block rounded-full bg-navy-900 text-chalk-50 text-xs font-semibold px-3 py-1 mb-3">
        {answer}
      </div>
      <p className="text-sm text-slate-600 leading-relaxed">{text}</p>
    </div>
  );
}

function PathCard({ emoji, title, subtitle, bullets, tone = 'emerald' }) {
  const tones = {
    emerald: 'border-emerald-200 bg-emerald-50/70',
    slate: 'border-slate-200 bg-slate-50/70',
  };

  return (
    <div className={`rounded-3xl border p-5 md:p-6 ${tones[tone] || 'border-page-200 bg-white'}`}>
      <div className="mb-3"><FlatIcon label={emoji} /></div>
      <h2 className="text-2xl font-light text-slate-900">{title}</h2>
      <p className="text-sm text-slate-500 mb-4">{subtitle}</p>
      <ul className="space-y-2.5">
        {bullets.map((bullet) => (
          <li key={bullet} className="text-sm text-slate-700 leading-relaxed flex gap-2.5">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent-600 flex-shrink-0" />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function VisualNote({ emoji, title, text, linkLabel, onClick }) {
  return (
    <div className="rounded-2xl border border-page-200 p-4 bg-white">
      <div className="mb-3"><FlatIcon label={emoji} /></div>
      <h3 className="text-base font-medium text-slate-900 mb-1">{title}</h3>
      <p className="text-sm text-slate-600 leading-relaxed">{text}</p>
      {linkLabel && onClick && (
        <button
          onClick={onClick}
          className="mt-3 text-sm font-medium text-navy-700 hover:text-navy-900 underline decoration-navy-300 hover:decoration-navy-700"
        >
          {linkLabel} →
        </button>
      )}
    </div>
  );
}

function ChecklistCard({ emoji, title, bullets }) {
  return (
    <div className="rounded-2xl border border-page-200 p-4 bg-white">
      <div className="mb-3"><FlatIcon label={emoji} /></div>
      <h3 className="text-base font-medium text-slate-900 mb-3">{title}</h3>
      <ul className="space-y-2">
        {bullets.map((bullet) => (
          <li key={bullet} className="text-sm text-slate-600 leading-relaxed flex gap-2">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-accent-600 flex-shrink-0" />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
