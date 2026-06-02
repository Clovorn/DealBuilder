import { BUNDLES_GUIDE_SECTIONS } from './bundlesGuideContent.js';
import { DISTRIBUTOR_PROGRAM_BENEFITS, DISTRIBUTOR_PROGRAM_COMPLIANCE, DISTRIBUTOR_PROGRAM_CUSTOMER_SUMMARY } from './distributorProgramMessaging.js';

/**
 * Ronnoco Deal Builder — Help & FAQ content.
 *
 * Structured as data (not raw markdown) so we keep full control over styling
 * and don't need a markdown parser in the bundle. Each section is an object:
 *
 *   {
 *     id:    'slug-for-the-anchor',
 *     number: 1,                    // displayed as "1." in the heading
 *     title: 'Section title',
 *     blocks: [ ...content blocks ]
 *   }
 *
 * Content block types (each is just a JS object with a `type` discriminator):
 *
 *   { type: 'p',         text: '...' }                          // paragraph (markdown-lite inline supported)
 *   { type: 'h3',        text: '...' }                          // subheading inside a section
 *   { type: 'ul',        items: ['...', '...'] }                // bulleted list
 *   { type: 'ol',        items: ['...', '...'] }                // numbered list
 *   { type: 'callout',   tone: 'info' | 'warning' | 'tip',  text: '...' }
 *   { type: 'table',     headers: [...], rows: [[...], ...] }   // table
 *
 * Inline formatting inside text strings:
 *   **bold**         → bold
 *   *italic*         → italic
 *   `code`           → inline code
 *   [text](#anchor)  → link to another section anchor
 *
 * The renderer handles those — see InlineText in FaqPage.jsx.
 */

export const FAQ_SECTIONS = [
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'getting-started',
    number: 1,
    title: 'Getting started',
    summary: 'What you see when you log in, navigation basics, first-time setup.',
    blocks: [
      { type: 'p', text: 'Welcome to the Ronnoco Deal Builder. This is the application your sales team uses to find equipment, build distributor bundles, and submit new deals to the leasing team.' },

      { type: 'h3', text: "What you'll see when you log in" },
      { type: 'p', text: 'The top of every page has a navigation bar with six sections:' },
      { type: 'ul', items: [
        '**Home** — recent announcements, featured vendors, and quick links',
        '**Catalog** — the full searchable list of all equipment',
        '**Bundles** — pre-built distributor program packages',
        '**Favorites** — items you\'ve starred for quick access',
        '**FAQ** — these help docs',
        '**+ New Deal** — opens the deal sheet. From there you can either send a quote to the customer for review or submit the deal straight to leasing.',
      ]},
      { type: 'p', text: 'On the far right is your user menu (your name and an avatar with your initials). Click it to access your profile, change your password, sign out, or — if you\'re an admin — get to the admin section.' },

      { type: 'h3', text: 'Finding your way around' },
      { type: 'p', text: 'Most pages have a consistent layout: search and filters at the top, results in the middle, and a detail view that opens as a side drawer when you click an item. You can navigate using the top tabs (or the bottom tab bar on a phone). Clicking the Ronnoco logo always takes you back home.' },

      { type: 'h3', text: 'First-time setup' },
      { type: 'p', text: 'If you\'re new, your account has been pre-created for you. Your first task should be:' },
      { type: 'ol', items: [
        'Open the user menu (top right)',
        'Click **My profile**',
        'Change your password from the temporary one to something only you know',
        'Update your display name if it doesn\'t look right',
      ]},
      { type: 'p', text: 'After that, you\'re set. Browse the catalog, look at the distributor bundles, and the next time you have a customer ready, send them a quote or build them a full deal sheet.' },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'using-the-catalog',
    number: 2,
    title: 'Using the catalog',
    summary: 'Browsing, searching, vendor pages, the item detail drawer, and favorites.',
    blocks: [
      { type: 'p', text: 'The catalog has every piece of equipment Ronnoco sells — currently around 259 active items across 35 vendors. There are several ways to find what you need.' },

      { type: 'h3', text: 'The catalog table' },
      { type: 'p', text: 'Open the **Catalog** tab. On desktop you\'ll see a sortable, searchable table; on mobile a card list. Each row shows:' },
      { type: 'ul', items: [
        '**SKU** — the unique product code',
        '**Vendor** — manufacturer name',
        '**Description** and model',
        '**Category**',
        '**List price**',
        '**Lease /mo** — the calculated monthly lease estimate (only for items $5,000 and up; under that, you\'ll see "Not eligible")',
      ]},
      { type: 'p', text: '**Searching.** Type in the search box to filter by description, SKU, model, or any other text. Search is instant — no need to press Enter.' },
      { type: 'p', text: '**Sorting.** Click any column header (Description, Category, or List price) to sort by that column. Click again to reverse the sort order.' },
      { type: 'p', text: '**Filtering.** There\'s a "Lease-eligible" checkbox above the table — toggle it on to see only items priced at $5,000 or higher.' },

      { type: 'h3', text: 'Vendor pages' },
      { type: 'p', text: 'The home page features four key vendors with logo buttons: Bunn, Curtis (SEB Professional), Newco, and Dr. Coffee. Click any of these to jump to a dedicated vendor page showing all that vendor\'s products grouped by category in an accordion view. You can also click "All vendors" to see the full list of every vendor in the catalog.' },

      { type: 'h3', text: 'Item detail drawer' },
      { type: 'p', text: 'Click any item — anywhere it appears — and a detail drawer slides in from the right (on desktop) or up from the bottom (on mobile). The drawer shows:' },
      { type: 'ul', items: [
        '**SKU** and item type at the top',
        '**Vendor links** — buttons that open the manufacturer\'s product page, spec sheet, and other documents in a new tab',
        '**Leasing** — the monthly lease estimate if the item qualifies, or a "cash sale only" note if it doesn\'t',
        '**Editable fields** — visible to all staff (description, list price, eligibility flags)',
        '**Confidential section** — only visible to admins and directors. Contains the item\'s cost and internal notes.',
      ]},
      { type: 'p', text: 'Sales reps see everything except cost and internal notes. Those are managed at the admin level for pricing strategy reasons.' },

      { type: 'h3', text: 'Favorites' },
      { type: 'p', text: 'Click the star icon on any item to add it to your favorites. Favorites are personal — only you see your own list. Visit the **Favorites** tab to see all the items you\'ve starred.' },
      { type: 'callout', tone: 'tip', text: 'When you\'re working on a deal, star the items you\'re considering. It makes finding them later much faster than searching.' },

      { type: 'h3', text: 'Common issues' },
      { type: 'ul', items: [
        '**Don\'t see an item?** It may be marked inactive. Contact an admin.',
        '**Wrong price?** Tell an admin. List prices come from the source-of-truth equipment list.',
        '**Need a spec sheet?** Use the "Spec sheet ↗" button in the item drawer. If a button isn\'t there, the vendor\'s URL template needs to be configured — let an admin know.',
      ]},
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'understanding-bundles',
    number: 3,
    title: 'Understanding bundles',
    summary: 'Distributor program bundles, monthly pricing, substitution rules, and add-ons.',
    blocks: [
      { type: 'p', text: 'Bundles are pre-built equipment packages with a single, fixed monthly lease price. They\'re the easiest way to put together a deal for a typical customer — instead of picking individual items one by one, you start with a complete program.' },

      { type: 'h3', text: 'Distributor program bundles' },
      { type: 'p', text: 'Today\'s available bundles are all distributor programs:' },
      { type: 'table',
        headers: ['Bundle', 'Monthly fee'],
        rows: [
          ['Small Coffee — Bottle Brewer', '$199/mo'],
          ['Small Coffee — Airpot Brewer', '$199/mo'],
          ['Small Coffee — Single Direct Heat', '$199/mo'],
          ['Medium/Large — Dual Direct Heat', '$299/mo'],
          ['Medium/Large — Combo Brewer', '$299/mo'],
          ['Polar Wave Bundle', '$299/mo'],
        ],
      },
      { type: 'p', text: 'Each one comes with a fully configured equipment list (brewers, servers, accessories) at a fixed monthly fee.' },
      { type: 'ul', items: DISTRIBUTOR_PROGRAM_BENEFITS },

      { type: 'h3', text: 'Important rules' },
      { type: 'p', text: 'Every distributor bundle follows these rules:' },
      { type: 'ul', items: [
        '**Lease only.** Bundles can\'t be sold outright or financed. They\'re a fixed-monthly-fee lease program.',
        '**Available to any customer.** Bundles aren\'t restricted to specific distributors or accounts. Any customer who fits the equipment program can be set up with one.',
        '**No substitutions.** The items inside a bundle are fixed. You can\'t swap a Bunn brewer for a Curtis brewer within a bundle — that defeats the purpose of the program pricing.',
        '**Add-ons are allowed.** You can add extra equipment to a bundled deal. Those extras lease at the standard per-item monthly rate (list price × 0.0395), and that monthly amount gets added on top of the bundle\'s fixed fee.',
      ]},

      { type: 'h3', text: 'How to view a bundle' },
      { type: 'p', text: 'Click the **Bundles** tab. Each bundle appears as a card with its image, name, monthly price, and short description. Click any card to open the detail view, which shows the full equipment list with quantities.' },

      { type: 'h3', text: 'Bundles in the deal sheet' },
      { type: 'p', text: 'When you build a deal sheet for a customer who\'s signing up for a bundle:' },
      { type: 'ol', items: [
        'Open the deal sheet',
        'Pick the bundle\'s equipment items in the Equipment Selection picker (so the leasing team sees what\'s included)',
        'Note "Distributor Program: [bundle name]" in the Notes section',
        'Add any extra equipment the customer wants on top',
        'Submit — the leasing team will apply the fixed $199/$299 monthly fee, with extras at the standard per-item rate',
      ]},

      { type: 'h3', text: 'When NOT to use a bundle' },
      { type: 'p', text: 'Don\'t use a bundle if:' },
      { type: 'ul', items: [
        'The customer wants a custom equipment set that doesn\'t match any of the six programs',
        'The customer wants to outright purchase or finance the equipment instead of leasing',
        'The total list price after additions changes the deal economics (bundles are priced as a program, not against list prices)',
      ]},
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'bundles-guide',
    number: 3.5,
    title: 'Bundles guide for reps',
    starred: true,
    summary: 'How Distributor Branded bundle deals differ from general sales and how reps should position and submit them.',
    blocks: [
      { type: 'p', text: 'This page explains the difference between Distributor Branded program bundles and general sale, finance, or lease deals. It also explains the math, sales positioning, submission flow, and rep responsibilities.' },
      ...BUNDLES_GUIDE_SECTIONS.flatMap((section) => {
        const blocks = [
          { type: 'h3', text: section.title },
        ];
        if (section.intro) blocks.push({ type: 'p', text: section.intro });
        if (section.cards) {
          section.cards.forEach((card) => {
            if (card.eyebrow) blocks.push({ type: 'p', text: `**${card.eyebrow}**` });
            if (card.title) blocks.push({ type: 'p', text: card.title });
            if (card.bullets?.length) blocks.push({ type: 'ul', items: card.bullets });
          });
        }
        if (section.bullets?.length) blocks.push({ type: 'ul', items: section.bullets });
        if (section.steps?.length) blocks.push({ type: 'ol', items: section.steps.map((s) => `**${s.title}** - ${s.body}`) });
        if (section.note) blocks.push({ type: 'callout', tone: 'tip', text: section.note });
        return blocks;
      }),
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'building-a-deal-sheet',
    number: 4,
    title: 'Building a deal sheet',
    summary: 'Walk through each section of the deal sheet — fields, dropdowns, and conditional logic.',
    blocks: [
      { type: 'p', text: 'The deal sheet is the form you fill out to send a new customer deal to the leasing team. Click **+ New Deal** in the top nav (or the prominent button on the home page) to start one. The deal sheet has up to eleven sections — they\'re numbered so you can work through them top to bottom, but you can fill them in any order. Required fields are marked with a red asterisk.' },

      { type: 'h3', text: 'Section 1 — Sales Rep & Submission' },
      { type: 'p', text: 'Your name and email auto-fill from your profile. If they\'re wrong, fix them in **My profile** rather than overriding them here. Route Number (RTE #) is optional.' },

      { type: 'h3', text: 'Section 2 — Customer Identity' },
      { type: 'ul', items: [
        'Toggle **Current Ronnoco Customer** off if this is a new (not-yet-in-CRM) customer',
        '**Customer Account #** — if they\'re existing',
        '**C-Store or Food Service** — required',
        '**Sub Group** — optional',
        '**Henderson Account** — Henderson is a Ronnoco brand; toggle on for Henderson deals',
        '**Change of Ownership** — toggle on for an account transfer; reveals fields for Prior Account # and Change Details',
      ]},

      { type: 'h3', text: 'Section 3 — Chain & Location' },
      { type: 'ul', items: [
        '**Chain Store** — toggle on for franchise/chain locations; reveals Group # and Number of Locations',
        '**Store / Business Name (DBA)** — required',
        '**Legal Business Name** — optional',
        '**Street Address, City, State, Zip Code** — required',
        '**Store Phone** — optional',
      ]},

      { type: 'h3', text: 'Section 4 — Primary Contact' },
      { type: 'p', text: 'The customer\'s contact person (operator, owner, manager). First name, last name, and email are required.' },

      { type: 'h3', text: 'Section 5 — Coffee Program & Delivery' },
      { type: 'ul', items: [
        '**Coffee Program** — beverage program type',
        '**Distribution Method** — required. Defaults to **Indirect (Distributor)** since most deals are Indirect; switch to **DSD** if Ronnoco is delivering directly. Picking Indirect reveals Section 6 (Distributor Information).',
        '**Current Coffee Supplier** — who they\'re using today',
        '**Service included with Sales and Marketing Agreement** — service terms / notes. The customer will need to sign the Sales and Marketing Agreement.',
      ]},
      { type: 'p', text: 'Two additional delivery fields appear only when **DSD** is selected (when Ronnoco delivers directly):' },
      { type: 'ul', items: [
        '**How will it be delivered?** — free text (e.g. truck, courier)',
        '**Final Delivery Recurrence** — weekly, bi-weekly, etc.',
      ]},
      { type: 'p', text: 'For Indirect deals, the distributor handles delivery, so these fields aren\'t asked here.' },

      { type: 'h3', text: 'Section 6 — Distributor Information' },
      { type: 'p', text: 'Only appears for Indirect deals.' },
      { type: 'ul', items: [
        '**Parent Distributor** — required dropdown. Picking Core-Mark reveals the Core-Mark Div # field.',
        '**Parent Distributor #, Warehouse, Customer #** — distributor reference info',
        '**Distributor Rep Name, Email, Phone** — your contact at the distributor. The email is used for install scheduling.',
      ]},

      { type: 'h3', text: 'Section 7 — Ronnoco Region (ROM)' },
      { type: 'ul', items: [
        '**Select the ROM** — required. ROM email auto-fills when you pick one.',
        '**ROM Region** — optional',
      ]},

      { type: 'h3', text: 'Section 8 — Equipment & Deal Information' },
      { type: 'ul', items: [
        '**Deal Type** — required. Pick Lease Equipment, Finance Equipment, Purchase From Ronnoco, or Loan Equipment. (See [Deal types explained](#deal-types-explained) below.)',
        '**Equipment Selection** — click "+ Add equipment" to open the picker. Search by description, SKU, model, or vendor.',
        '**Coffee Spend (Last 3 Months)** and **Expected Monthly Sales** — context for the leasing team',
      ]},
      { type: 'p', text: 'A Deal Summary card appears below as soon as you add equipment, showing the total equipment cost and either a Monthly Lease Estimate (for $5K+ deals) or a Cash Sale Only notice.' },

      { type: 'h3', text: 'Section 9 — Installation' },
      { type: 'ul', items: [
        '**Target Install Date** — required',
        '**Need By Date** — optional hard deadline',
        '**Emergency Install** — toggle on for priority scheduling; reveals a required details field',
      ]},

      { type: 'h3', text: 'Section 10 — Graphics' },
      { type: 'ul', items: [
        '**Graphics Package** — which package the customer wants',
        '**Ship Graphics with Equipment** — toggle on if graphics ship with the equipment',
        '**Existing Custom Graphics** — toggle on if the customer already has custom artwork on file',
      ]},

      { type: 'h3', text: 'Section 11 — Additional Notes' },
      { type: 'p', text: 'Free-text field for anything that doesn\'t fit elsewhere.' },

      { type: 'h3', text: 'Submitting the deal — quote or deal?' },
      { type: 'p', text: 'At the bottom of the form, you\'ll see **two** submit buttons:' },
      { type: 'ul', items: [
        '**Submit as Quote** — saves the record in the pipeline at the "sales" phase and opens your email client with a customer-facing quote link ready to send. Use this when the customer hasn\'t fully committed yet.',
        '**Submit Deal →** — sends the deal straight to the leasing team. Use this when the customer has already agreed and you\'re ready to start paperwork.',
      ]},
      { type: 'p', text: 'The form validates first; if anything required is missing, you\'ll see a red error message. Fill it in and try again.' },
      { type: 'p', text: 'On success: for a deal, you\'ll see a confirmation screen with the Deal ID. For a quote, you\'ll see the quote number and a link you can copy. See [Sending quotes to customers](#sending-quotes) for the full quote workflow.' },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'deal-types-explained',
    number: 5,
    title: 'Deal types explained',
    starred: true,
    summary: 'Lease vs. Finance vs. Purchase vs. Loan — when to use each, and what they mean for the customer.',
    blocks: [
      { type: 'callout', tone: 'info', text: 'This is the most important article. When you fill out the deal sheet, you pick one **Deal Type** — this single choice determines how the customer pays and what the leasing team does next.' },

      { type: 'p', text: 'The four deal types:' },
      { type: 'ul', items: [
        '**Lease Equipment** — customer pays a fixed monthly fee to use the equipment. Ronnoco retains ownership.',
        '**Finance Equipment** — customer pays in installments and owns the equipment outright at the end. Like a loan.',
        '**Purchase From Ronnoco** — customer pays the full list price upfront and owns the equipment immediately.',
        '**Loan Equipment** — Ronnoco places equipment at no charge, contingent on coffee program purchases.',
      ]},

      { type: 'h3', text: 'Lease Equipment' },
      { type: 'p', text: 'A lease is a long-term rental. The customer pays Ronnoco a fixed monthly fee for the right to use the equipment. Ronnoco continues to own it.' },
      { type: 'p', text: '**Best for:** customers who want predictable monthly costs, who don\'t want a large capital outlay upfront, equipment tied to a coffee supply contract, programs where equipment gets refreshed periodically.' },
      { type: 'p', text: '**Requirements:** total equipment cost must be at least $5,000. Below that, the Lease Equipment button is disabled.' },
      { type: 'p', text: '**Monthly estimate:** Total equipment list price × 0.0395. So a $10,000 package shows ~$395/month. The final lease terms (24, 36, 48, 60 months) may adjust the actual monthly amount.' },
      { type: 'p', text: 'Bundle leases override this formula — they have a fixed monthly fee ($199 or $299) regardless of the underlying equipment list price.' },

      { type: 'h3', text: 'Finance Equipment' },
      { type: 'p', text: 'Functionally a loan. The customer makes installment payments and owns the equipment at the end of the term.' },
      { type: 'p', text: '**Best for:** customers who want to own the equipment eventually, customers who can\'t pay upfront but want equity in what they\'re paying for, larger deals with negotiable terms.' },
      { type: 'p', text: '**Requirements:** total cost must be at least $5,000.' },
      { type: 'p', text: '**Difference from Lease:** at the end of a lease, Ronnoco still owns the equipment. At the end of a financed deal, the customer owns it. Lease and financed monthly payments may look similar, but the long-term picture is different — tax implications, warranty handoff, replacement strategy all differ.' },

      { type: 'h3', text: 'Purchase From Ronnoco' },
      { type: 'p', text: 'Outright cash purchase. Customer pays the full list price (less any negotiated discount) and owns the equipment immediately.' },
      { type: 'p', text: '**Best for:** customers with the capital and the preference to own outright, smaller deals where financing overhead isn\'t worth it, deals under $5,000 (which can\'t be leased or financed).' },
      { type: 'p', text: '**No minimum.** Always available regardless of deal total.' },

      { type: 'h3', text: 'Loan Equipment' },
      { type: 'p', text: 'A free placement — Ronnoco puts equipment at the customer\'s location at no upfront or recurring cost. In exchange, the customer commits to a coffee supply contract that recovers Ronnoco\'s investment over time through coffee margin.' },
      { type: 'p', text: '**Best for:** new accounts where volume justifies free placement, competitor conversion deals where free equipment eases the switch, strategic accounts (large chains, flagship locations).' },
      { type: 'p', text: '**Requirements:** leasing team and your ROM approve loan placements based on projected coffee volume. Don\'t promise loan placements to a customer until your ROM has signed off. Document the expected monthly coffee spend in the deal sheet.' },

      { type: 'h3', text: 'Quick comparison' },
      { type: 'table',
        headers: ['', 'Lease', 'Finance', 'Purchase', 'Loan'],
        rows: [
          ['Pays monthly?', 'Yes (fixed)', 'Yes (installments)', 'No', 'No'],
          ['Pays upfront?', 'No', 'Maybe down payment', 'Yes, in full', 'No'],
          ['Owns at end?', 'No (Ronnoco keeps)', 'Yes', 'Yes (immediately)', 'No (Ronnoco keeps)'],
          ['$5,000 minimum?', 'Yes', 'Yes', 'No', 'No (but ROM approval)'],
          ['Coffee contract required?', 'Often', 'Often', 'No', 'Yes — that\'s the point'],
        ],
      },

      { type: 'h3', text: 'How to choose' },
      { type: 'p', text: 'Walk through this with the customer:' },
      { type: 'ol', items: [
        'Do they want to own the equipment eventually? Yes → Finance or Purchase. No → Lease or Loan.',
        'Can they (and do they want to) pay upfront? Yes → Purchase.',
        'Are they committing to a substantial coffee program? Yes, attractive account → consider Loan (with ROM approval).',
        'Is the deal value at least $5,000? No → forced to Purchase. Yes → all four are technically available.',
        'Do they want flexibility to refresh equipment? Yes → Lease.',
      ]},
      { type: 'callout', tone: 'tip', text: '**When in doubt:** Lease for typical $5K+ accounts. Distributor bundles for accounts that fit a standard program. Purchase for under-$5K. Loan only with ROM approval.' },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'lease-math',
    number: 6,
    title: 'Lease math and the $5,000 minimum',
    summary: 'How the monthly lease estimate is calculated, the $5K threshold, and how bundles interact with the formula.',
    blocks: [
      { type: 'h3', text: 'The $5,000 minimum' },
      { type: 'p', text: 'Lease Equipment and Finance Equipment both require a minimum **total deal value** of $5,000. Below that, both options are disabled. The rule applies to total deal value, not individual items:' },
      { type: 'ul', items: [
        'A single $6,000 item → lease/finance available ✓',
        'Two $3,000 items totaling $6,000 → lease/finance available ✓',
        'A $4,500 item plus $400 in accessories ($4,900 total) → not available ✗',
        'A $4,800 item alone → not lease-eligible standalone, but can be included in a bundled lease',
      ]},

      { type: 'h3', text: 'Cash Sale Only' },
      { type: 'p', text: 'If your deal total is under $5,000, you\'ll see a "Cash Sale Only" card in the Deal Summary. Lease and Finance buttons will be grayed out. Your only options are Purchase From Ronnoco, or Loan Equipment (with ROM approval).' },
      { type: 'p', text: 'If the customer wants to lease, you have two paths:' },
      { type: 'ol', items: [
        'Add more equipment to bring the total above $5,000',
        'Use a distributor bundle (those have their own fixed monthly fee)',
      ]},

      { type: 'h3', text: 'The monthly lease formula' },
      { type: 'p', text: 'For deals at or above $5,000:' },
      { type: 'callout', tone: 'info', text: '**Total list price × 0.0395 = Monthly lease estimate**' },
      { type: 'table',
        headers: ['Equipment total', '× 0.0395', 'Monthly estimate'],
        rows: [
          ['$5,000', '0.0395', '$197.50'],
          ['$6,000', '0.0395', '$237.00'],
          ['$10,000', '0.0395', '$395.00'],
          ['$20,000', '0.0395', '$790.00'],
          ['$50,000', '0.0395', '$1,975.00'],
        ],
      },
      { type: 'p', text: 'You\'ll see this number prominently in the Deal Summary card. The math is shown right below it so you can explain it to a customer.' },

      { type: 'h3', text: 'Why 0.0395?' },
      { type: 'p', text: 'The 0.0395 rate is the standard monthly lease factor Ronnoco uses, calibrated to typical lease terms. The leasing team uses it as their working estimate; final terms may shift slightly based on lease length, customer credit, and any negotiated adjustments. The rate is centrally configured — if it changes, every estimate updates automatically.' },

      { type: 'h3', text: 'Bundles override the formula' },
      { type: 'p', text: 'Distributor bundles have a fixed monthly fee that\'s the same regardless of underlying equipment list price.' },
      { type: 'p', text: 'When a customer adds extra equipment on top of a bundle:' },
      { type: 'ul', items: [
        'The bundle\'s fixed fee stays the same',
        'The extras lease at the standard per-item rate (list × 0.0395)',
        'Total monthly = bundle fee + sum of extras',
      ]},
      { type: 'p', text: '**Example:** $199 bundle + a $2,500 add-on item:' },
      { type: 'ul', items: [
        'Bundle: $199/mo',
        'Extra: $2,500 × 0.0395 = $98.75/mo',
        'Total: $297.75/mo',
      ]},
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'sending-quotes',
    number: 7,
    title: 'Sending quotes to customers',
    starred: true,
    summary: 'When and how to send a quote vs. a direct deal, what the customer sees, and what happens after.',
    blocks: [
      { type: 'callout', tone: 'info', text: 'A **quote** is the same deal sheet, sent to the customer for review before committing. It lives in the pipeline at the "sales" phase and turns into a regular deal once the customer accepts.' },

      { type: 'h3', text: 'When to send a quote vs. a direct deal' },
      { type: 'p', text: 'Two paths from the deal sheet:' },
      { type: 'ul', items: [
        '**Submit as Quote** — for customers who are still deciding. Sends them a clean, branded page they can review, share with a partner, and reply to.',
        '**Submit Deal** — for customers who\'ve already agreed and you\'re ready to start paperwork. Skips the sales phase and goes straight to the leasing team.',
      ]},
      { type: 'p', text: 'When in doubt, **Submit as Quote**. The customer gets a record they can refer back to, you get a tracked sales-phase deal in the pipeline, and converting it to a deal later is a one-click action.' },

      { type: 'h3', text: 'How to send a quote' },
      { type: 'ol', items: [
        'Fill out the deal sheet as normal (all the same required fields apply)',
        'Make sure the **customer email** in Section 4 is correct — that\'s where the quote will be sent',
        'Optional: expand the **Quote options** panel above the submit buttons and add a cover note ("Hi Sarah, following up on our Tuesday conversation…") and/or a custom valid-until date',
        'Click **Submit as Quote**',
        'Your email client opens with a message ready to send. Review the email, edit anything you want, then click Send in your email client',
      ]},
      { type: 'p', text: 'The quote is saved in the pipeline with a quote number like **Q-2026-0042**. The customer-facing link is also shown on the success screen — you can copy it if you need to share it through another channel (text, Slack, in person).' },

      { type: 'h3', text: 'What the customer sees' },
      { type: 'p', text: 'When the customer clicks the link in your email, they see a clean Ronnoco-branded page with:' },
      { type: 'ul', items: [
        'Their store name and your cover note',
        'The complete equipment list with quantities and list prices',
        'The deal type (Lease, Finance, Purchase, or Loan) and pricing summary',
        'For lease deals: the estimated monthly amount with a brief explanation',
        'Your name and email so they can reply to you directly',
        'The validity date and standard disclaimers',
      ]},
      { type: 'p', text: 'They do **not** see internal data: cost, ROM info, distributor details, internal notes, or anything else that shouldn\'t leave the company. The customer page is read-only.' },

      { type: 'h3', text: 'After the customer responds' },
      { type: 'p', text: 'The customer replies (typically by email) with their decision. You then record what they chose in [My deals](#my-deals) — click the quote, scroll to **Record customer decision**, pick the outcome, and click Save. The deal advances automatically:' },
      { type: 'ul', items: [
        'Customer wants to **lease** or **finance** → the deal moves to the **financing** phase; the leasing team takes over from there',
        'Customer wants to **purchase** outright or accept a **loan placement** → the deal skips financing and goes straight to the **operations** phase for order processing',
        'Customer **declined** → the deal is marked closed; the quote stays in your history for reference but is no longer active',
      ]},
      { type: 'p', text: 'Every decision is logged with a timestamp and the optional note you add when saving. You can see the recorded decision and notes any time by opening the quote\'s detail panel in My deals.' },

      { type: 'h3', text: 'Editing a quote after it\'s sent' },
      { type: 'p', text: 'Customer wants to change something? Add an item, adjust quantities, fix a typo, extend the validity date? You can edit any quote you sent — straight from Deal Builder, no admin help needed.' },
      { type: 'p', text: 'Open [My deals](#my-deals) from your avatar menu, click the quote you want to change, and click **Edit & re-send**. The deal sheet reopens with everything pre-filled exactly as the customer last saw it. Change what you need and click **Re-send quote →**. The customer\'s existing link keeps working — when they reopen it, they see the new version automatically.' },
      { type: 'ul', items: [
        'Each edit bumps the **revision number** (rev 2, rev 3, ...) so you can tell at a glance which version you sent last',
        'The original first-send timestamp and any view history are **preserved** — you\'ll still see when the customer first opened the quote',
        'Every revision is logged with a timestamp + summary of what changed, so there\'s a complete audit trail',
      ]},
      { type: 'callout', tone: 'warning', text: 'Re-sending opens your email client with a fresh message to the customer. Make sure you actually want to notify them about the change before clicking — if you\'re just fixing a typo before they\'ve opened the quote, you may prefer to call instead.' },

      { type: 'h3', text: 'Quote numbers' },
      { type: 'p', text: 'Every quote gets a unique year-prefixed number: **Q-2026-0001**, **Q-2026-0002**, etc. The numbering resets on January 1. Customers can mention the number back to you ("about Q-2026-0042…") for easy reference.' },

      { type: 'h3', text: 'Quote validity' },
      { type: 'p', text: 'Every quote shows a "valid until" date. Default is 30 days from when you sent it; you can override it from the Quote options panel before submitting. After the validity date, the quote should be re-issued — list prices may have changed, equipment availability shifts, etc.' },

      { type: 'h3', text: 'Privacy of the quote link' },
      { type: 'p', text: 'Quote links contain a long random token, making them practically unguessable. Anyone with the link can view the quote — there\'s no password — so treat the link the way you\'d treat a draft quote. Don\'t post it publicly. If a link needs to be invalidated for any reason, ask an admin.' },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'after-submit',
    number: 8,
    title: 'What happens after you submit',
    summary: 'How a submitted deal flows into the Deal Pipeline and what the leasing team does next.',
    blocks: [
      { type: 'p', text: 'Once you click **Submit Deal**, the deal leaves Deal Builder and lands in the Deal Pipeline — Ronnoco\'s separate leasing dashboard where deals live their full lifecycle.' },

      { type: 'h3', text: 'Immediately after Submit' },
      { type: 'p', text: 'The deal sheet validates the form (required fields, equipment selected, deal-type rules). If anything\'s wrong, you get an error message — fix and retry. If validation passes, the deal is created in the pipeline with:' },
      { type: 'ul', items: [
        'Current step: **submitted**',
        'Phase: **leasing**',
        'Status: **active**',
      ]},
      { type: 'p', text: 'You\'ll see a success screen with the new **Deal ID** — that\'s your reference for asking the leasing team about the deal later.' },

      { type: 'h3', text: 'Where the data goes' },
      { type: 'p', text: 'The deal sheet writes to two databases:' },
      { type: 'ul', items: [
        'The **Deal Builder database** — your equipment selections are tied to real SKUs in the catalog. This is what powers the equipment picker and the monthly lease math.',
        'The **deal pipeline database** — the actual deal record (customer info, store info, distributor info, equipment summary, totals, dates, notes).',
      ]},
      { type: 'p', text: 'The pipeline record includes a structured snapshot of your equipment selections (exact SKUs and quantities) so the leasing team can pull this into POs, lease agreements, and invoices.' },

      { type: 'h3', text: 'What the leasing team does next' },
      { type: 'p', text: 'Once your deal is in the pipeline:' },
      { type: 'ol', items: [
        'The leasing team receives a notification',
        'They open the deal in their Pipeline dashboard',
        'They start the deal-type-specific paperwork — lease application, financing application, invoicing, or loan approval',
        'They may contact you with questions (distributor details, install logistics, customer preferences)',
      ]},

      { type: 'h3', text: 'You can no longer edit the deal in Deal Builder' },
      { type: 'p', text: 'Once submitted:' },
      { type: 'ul', items: [
        'The deal doesn\'t appear in Deal Builder\'s UI afterward',
        'You can\'t edit it from the deal sheet',
        'You can\'t resubmit it — don\'t try, you\'d create a duplicate',
      ]},
      { type: 'p', text: 'All further changes happen in the Deal Pipeline dashboard. To update contact info, add or remove equipment, change install date, or cancel — ask the leasing team. If you have access to the Pipeline dashboard yourself, edit there directly.' },

      { type: 'h3', text: 'Tracking deal progress' },
      { type: 'p', text: 'Two places to check: the **My deals** workspace (avatar → My deals) shows everything you\'ve submitted personally — drafts you\'re still working on, quotes waiting on the customer, and submitted deals. The **Deal Pipeline dashboard** is the leasing team\'s view across all reps. If you have access there, that\'s where to see deal status updates as the leasing team works through them. Otherwise, the leasing team can update you by Deal ID.' },

      { type: 'h3', text: 'Duplicate submissions' },
      { type: 'callout', tone: 'warning', text: 'The system doesn\'t auto-detect duplicates. If you submit the same deal twice by mistake (page failed to load → you re-clicked Submit), both appear in the pipeline. Contact the leasing team with both Deal IDs to merge or cancel. **To avoid:** after clicking Submit, wait for either the success screen or an error before doing anything else.' },

      { type: 'h3', text: 'Saving a draft if you can\'t finish in one sitting' },
      { type: 'p', text: 'Next to the Submit button there\'s a **Save draft** button. Click it any time to store what you\'ve filled in so far. Your draft shows up in [My deals](#my-deals) — click Resume from there to pick up exactly where you left off, on the same device or a different one.' },
      { type: 'p', text: 'When you eventually click Submit (quote or deal), the draft is deleted automatically — the form\'s contents have moved into the pipeline at that point, so the draft has done its job.' },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'my-deals',
    number: 9,
    title: 'My deals workspace',
    summary: 'Your in-progress drafts and your submitted quotes and deals — all in one place.',
    blocks: [
      { type: 'p', text: 'My deals is your personal workspace. It shows everything you\'ve been working on: drafts you saved but haven\'t submitted yet, plus every quote and deal you\'ve sent through the system.' },

      { type: 'h3', text: 'How to get there' },
      { type: 'p', text: 'Click your avatar in the top-right corner of the header. The user menu opens and **My deals** is at the top. Same path on mobile — tap your avatar.' },

      { type: 'h3', text: 'What\'s in it' },
      { type: 'p', text: 'Two sections, each independent:' },
      { type: 'ul', items: [
        '**Drafts** — deal sheets you saved without submitting. Resume any of them to keep working. Rename them so they\'re easier to recognize ("Smith\'s Deli — Chicago" is better than "Untitled draft"). Delete the ones you abandoned.',
        '**Submitted** — every quote and direct-submit deal you\'ve created. Filter by All, Quotes, or Deals. Each row shows the customer, the store, the total, when you submitted it, and the current status.',
      ]},

      { type: 'h3', text: 'Drafts' },
      { type: 'p', text: 'A draft is just the in-progress state of a deal sheet — every field you\'ve filled in, every piece of equipment you\'ve picked, your Quote-or-Deal mode choice, all of it. Drafts are stored per-user (only you see your own drafts) and are durable across devices, so a draft you save on your laptop is there when you sign in from your phone.' },
      { type: 'p', text: 'Three actions per draft:' },
      { type: 'ul', items: [
        '**Resume** — opens the deal sheet hydrated with everything you had saved. From here you can edit, save again, or finally submit.',
        '**Rename** — replaces the auto-generated name with whatever\'s easier for you to recognize.',
        '**Delete** (trash icon) — removes it. Permanent. Use this for drafts that aren\'t going anywhere.',
      ]},
      { type: 'callout', tone: 'tip', text: 'Drafts default to the name "**Store name — City**" (or just "Untitled draft" if you haven\'t filled in the store yet). Save early, then rename it later when the store name is clearer.' },

      { type: 'h3', text: 'Submitted' },
      { type: 'p', text: 'Every quote and deal you\'ve sent shows up here. Each row collapses to a single line so you can scan a lot of work at once. **Click any row** to expand it and see the full details — customer info, store address, equipment list, the current process flow, and any actions you can take.' },

      { type: 'h3', text: 'The detail panel' },
      { type: 'p', text: 'Clicking a submitted row opens an inline detail panel. What you see depends on the type of submission:' },
      { type: 'ul', items: [
        '**Phase progress** — a visual stepper showing every step in the deal\'s current phase (Financing or Operations) with the current step highlighted. Past steps show a green checkmark; future steps are greyed out. Read-only — the leasing/ops teams advance the steps from the Pipeline dashboard.',
        '**Customer & Store cards** — name, email, phone, store address, deal type. Pulled directly from the pipeline record so you\'re always seeing the latest data.',
        '**Equipment** — the full list of items, quantities, and per-item subtotals. Identical to what the customer sees on their quote page.',
        '**Cover note** (quotes only) — the message you wrote to the customer when you sent the quote.',
      ]},

      { type: 'h3', text: 'What you can do with a quote' },
      { type: 'p', text: 'Expand a quote row and you\'ll see three action buttons:' },
      { type: 'ul', items: [
        '**Edit & re-send** — reopens the deal sheet pre-filled with the quote\'s current contents. Make your changes, click **Re-send quote →**, and your email client opens with a fresh message to the customer. The customer\'s existing link keeps working — no need to send a new URL. See [Editing a quote after it\'s sent](#sending-quotes) for the full workflow.',
        '**Open quote page** — opens the customer-facing quote in a new tab. Useful for spot-checking what the customer is actually seeing.',
        '**Copy link** — copies the customer\'s URL to your clipboard so you can paste it into a text or other email.',
      ]},

      { type: 'h3', text: 'Recording the customer\'s decision' },
      { type: 'p', text: 'When the customer replies to your quote, expand the quote in My deals and scroll to the **Record customer decision** form at the bottom. Pick one of five outcomes:' },
      { type: 'ul', items: [
        '**Accepted — Lease** → deal moves to Financing phase, leasing team takes over',
        '**Accepted — Finance** → same as Lease, moves to Financing',
        '**Accepted — Purchase** → skips Financing, goes straight to Operations',
        '**Accepted — Loan** → skips Financing, goes straight to Operations',
        '**Declined** → deal is marked closed (you\'ll get a confirmation prompt since this is hard to undo)',
      ]},
      { type: 'p', text: 'Add an optional note (e.g. "Customer wants to delay install until next month") and click Save. The deal advances immediately. The original quote stays accessible — you\'ll see the recorded decision and any notes in the panel from then on.' },
      { type: 'callout', tone: 'warning', text: 'Once a decision is recorded, the deal is no longer a "pending quote" — it\'s moving through the pipeline. The decision form disappears and you\'ll see a read-only summary instead. To change a recorded decision, ask the leasing or ops team to handle it in the Pipeline dashboard.' },

      { type: 'h3', text: 'Direct-submit deals' },
      { type: 'p', text: 'For deals you submitted directly (skipping the quote step), the detail panel is view-only. You\'ll see the same customer/store/equipment info plus the phase stepper, but there\'s no edit button — the deal is already with the leasing or ops team, and further changes happen on their side. The panel includes the **Deal ID** if you need to reference it when talking to them.' },

      { type: 'h3', text: 'Status badges at a glance' },
      { type: 'p', text: 'Each row carries small badges so you can scan the list without expanding everything:' },
      { type: 'ul', items: [
        '**Quote** / **Deal** — the type of submission',
        '**Q-2026-NNNN · rev N** (quotes) — the quote number and revision count. Rev 2+ means you\'ve edited and re-sent at least once.',
        '**Awaiting reply** (grey) — quote sent, customer hasn\'t decided',
        '**Viewed** (green dot) — the customer has opened the quote page at least once',
        '**Accepted (Lease/Finance/Purchase/Loan)** (green) — customer decided and the deal has advanced',
        '**Declined** (red) — customer passed; deal is closed',
        '**Financing** / **Operations** (grey, phase pill) — current phase for direct-submit deals',
        '**Credit App Sent** / etc. (grey, step pill) — current step within the phase',
      ]},

      { type: 'h3', text: 'What\'s still in the Pipeline dashboard\'s hands' },
      { type: 'p', text: 'My deals lets you manage the sales lifecycle — drafts, quotes, decisions. Beyond that, the leasing and ops teams own the deal in the Pipeline dashboard. From here you can\'t:' },
      { type: 'ul', items: [
        'Advance a deal\'s step (e.g. mark "Credit Approved" → "Paperwork Sent") — that\'s the leasing team\'s job',
        'See other reps\' drafts or deals — by design, this view is scoped to you',
        'Bulk-delete drafts — one at a time only',
        'Undo a customer decision once you\'ve saved it',
      ]},
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'profile-and-account',
    number: 10,
    title: 'Profile and account',
    summary: 'Changing your name, your password, and understanding roles.',
    blocks: [
      { type: 'p', text: 'Your account is managed through the user menu in the top-right corner. Click your avatar to open the dropdown.' },

      { type: 'h3', text: "What's in the user menu" },
      { type: 'ul', items: [
        'A header with your full name, email, and role badge',
        'Menu items: **My profile**, **Help & FAQ**, **Admin** (admins/directors only)',
        '**Sign out**',
      ]},
      { type: 'p', text: 'There\'s also a version stamp at the bottom — useful for reporting issues.' },

      { type: 'h3', text: 'Changing your display name' },
      { type: 'p', text: 'Your display name appears in the user menu, on deals you submit, and anywhere else the app refers to you. To change it: avatar → **My profile** → update Display name → Save changes. It updates immediately throughout the app.' },

      { type: 'h3', text: 'Changing your password' },
      { type: 'p', text: 'Avatar → **My profile** → Change password section → enter new password twice (8+ characters) → Update password. You stay signed in.' },
      { type: 'p', text: 'If you forget your password, contact an admin. There\'s no self-serve "forgot password" email flow yet.' },

      { type: 'h3', text: 'What you cannot change yourself' },
      { type: 'p', text: 'A few things are admin-managed:' },
      { type: 'ul', items: [
        '**Email** — contact an admin (it\'s your login identifier)',
        '**Role** — only admins can grant/revoke admin, director, sales, or customer roles',
        '**Customer or sales rep linkage** — admins manage these',
      ]},

      { type: 'h3', text: 'Roles overview' },
      { type: 'table',
        headers: ['Role', 'Edit catalog?', 'See cost?', 'See admin pages?', 'Change roles?'],
        rows: [
          ['Admin', 'Yes', 'Yes', 'Yes', 'Yes'],
          ['Director', 'Yes', 'Yes', 'Yes', 'No'],
          ['Sales', 'No', 'No', 'No', 'No'],
          ['Customer', 'No', 'No', 'No', 'No'],
        ],
      },
      { type: 'p', text: 'Most sales reps are the **Sales** role.' },

      { type: 'h3', text: 'Locked out or something looks wrong?' },
      { type: 'ul', items: [
        '**Can\'t sign in:** check email/password. If sure they\'re right, contact an admin to reset.',
        '**Logged in but see "Not authorized" everywhere:** your account may exist but not have an active role. Contact an admin.',
        '**Display name not updating:** refresh the page. If still nothing, sign out and back in.',
        '**Don\'t see Admin tab:** you\'re not admin/director. If you should be, contact an existing admin.',
      ]},
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'troubleshooting',
    number: 11,
    title: 'Troubleshooting',
    summary: 'Common issues and what to do about them.',
    blocks: [
      { type: 'h3', text: "I can't find an item I know we sell" },
      { type: 'ul', items: [
        'It may be marked inactive — contact an admin',
        'It may be under a different vendor name (Curtis is listed as "SEB Professional")',
        'The SKU might not match exactly — try description or model',
        'It might be a new item not yet in the catalog — contact an admin',
      ]},

      { type: 'h3', text: "A vendor link doesn't work" },
      { type: 'p', text: 'Vendor links come from URL templates configured per vendor. Broken or missing → tell an admin which vendor and they can update the template once for all that vendor\'s products.' },

      { type: 'h3', text: "I can't select Lease Equipment or Finance Equipment" },
      { type: 'p', text: 'The buttons are disabled when total < $5,000. Workarounds: add more equipment, use a distributor bundle, or switch to Purchase.' },

      { type: 'h3', text: 'The monthly lease estimate looks wrong' },
      { type: 'p', text: 'Formula is total list price × 0.0395. Verify list prices and quantities. If still wrong, screenshot the Deal Summary and contact your admin — the 0.0395 rate is centrally set.' },

      { type: 'h3', text: 'My deal submission failed' },
      { type: 'ul', items: [
        '**"Deal pipeline not configured"** — an env variable is missing. Contact your admin.',
        '**Network/timeout error** — wait 30 seconds and try again.',
        '**Specific error** — screenshot and send to your admin.',
        '**Missing required field** — fix the named field and resubmit.',
      ]},
      { type: 'callout', tone: 'warning', text: 'After fixing: click Submit again. **If the first submission succeeded** (you saw a Deal ID), do NOT click Submit again — you\'d create a duplicate.' },

      { type: 'h3', text: 'I submitted a deal by mistake' },
      { type: 'p', text: 'Can\'t recall it from Deal Builder. Contact the leasing team with the Deal ID and ask them to cancel.' },

      { type: 'h3', text: 'I see "[TBD]" in front of equipment item names' },
      { type: 'p', text: 'These are placeholders — an item was added so a bundle could reference it, but vendor/SKU/list price needs to be confirmed. The leasing team knows to verify the details before finalizing. If you have the missing info, send it to your admin.' },

      { type: 'h3', text: 'My favorites disappeared' },
      { type: 'p', text: 'Sign out and back in. Confirm you\'re signed in as the right account. Contact admin if data appears actually lost.' },

      { type: 'h3', text: 'The page looks broken on my phone' },
      { type: 'p', text: 'Try rotating the device, try zooming, screenshot the issue plus device/browser info, send to admin.' },

      { type: 'h3', text: 'My role changed unexpectedly' },
      { type: 'p', text: 'Sign out and back in (sometimes auth needs to refresh). Contact admin to verify your intended role.' },

      { type: 'h3', text: 'I keep getting signed out' },
      { type: 'p', text: 'Check the browser isn\'t clearing cookies between visits. Try a different browser. Confirm your system clock is correct (large clock skew breaks auth).' },

      { type: 'h3', text: "I can't see the Admin section" },
      { type: 'p', text: 'The Admin item only appears for admin/director roles in the user menu dropdown. If you should be admin but don\'t see it, contact an existing admin.' },

      { type: 'h3', text: 'I clicked Submit as Quote but no email opened' },
      { type: 'p', text: 'Your browser may have blocked the mailto: action. The quote still saved — check the success screen for the customer-facing link and the "Open email client again" button. You can also copy the quote URL and paste it into a fresh email.' },

      { type: 'h3', text: 'The customer says "this link doesn\'t work"' },
      { type: 'p', text: 'Most common causes: (1) the email client mangled the URL — ask them to copy-paste the whole link rather than clicking, (2) the link is missing the `?t=...` token at the end (also from email mangling). Worst case, log in to the Pipeline dashboard, find the quote, copy the link from there, and re-send.' },

      { type: 'h3', text: 'Something else?' },
      { type: 'p', text: 'Screenshot what you\'re seeing (with any error and URL bar visible) and send to your admin. Include: what you were trying to do, what you expected, what actually happened, the version stamp from your user menu, and your browser + device type.' },
    ],
  },
];
