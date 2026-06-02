export const BUNDLES_GUIDE_SECTIONS = [
  {
    id: 'bundle-vs-general',
    title: 'Distributor Branded bundle deal vs general sale or lease',
    intro:
      'Use bundles when the customer is a fit for a defined distributor-backed beverage program. Use a general sale, finance, or lease when the account needs a custom equipment package or a nonbundle structure.',
    cards: [
      {
        eyebrow: 'Distributor Branded bundle',
        title: 'Sell the full program',
        bullets: [
          'Best when the customer matches one of the bundle program types already in Deal Builder.',
          'Built to support a distributor branded rollout instead of a one-off equipment quote.',
          'Positions the deal around equipment, program support, branding, and easier implementation.',
        ],
      },
      {
        eyebrow: 'General deal',
        title: 'Sell the exact equipment path needed',
        bullets: [
          'Best when the account needs flexibility, custom equipment, or a direct purchase or finance path.',
          'Useful when the customer does not fit a standard bundled program.',
          'The rep is selling equipment structure and terms more than a standardized beverage package.',
        ],
      },
    ],
  },
  {
    id: 'calculation',
    title: 'How bundle pricing is calculated',
    intro:
      'Bundle pricing in this app is not a generic lease estimate. It is built from the bundle record itself, using its configured target monthly fee and pricing model.',
    bullets: [
      'The bundle starts from its configured equipment list and the monthly target saved in the bundle setup.',
      'Deal Builder calculates the pricing using the bundle math fields, including hardware total, soft cost, reserve, term months, and lease rate.',
      'When a rep starts a deal from a bundle, the deal is locked into bundle mode and defaults to a lease-style bundle structure.',
      'Eligible add-on equipment can be added, and those additions change the actual monthly outcome shown in the bundle pricing section.',
    ],
    note:
      'Simple rep explanation: a general lease is driven mostly by total equipment value, while a bundle is driven by the program package and its configured monthly model.',
  },
  {
    id: 'why-different',
    title: 'Why bundles are different',
    intro:
      'Bundles are different because they are meant to standardize the sale, improve distributor alignment, and make the customer rollout easier to manage.',
    bullets: [
      'They package the program into a repeatable offer instead of rebuilding every deal from scratch.',
      'They keep the customer focused on business outcome and simplicity, not just individual machine pricing.',
      'They support cleaner handoff into the post-submission workflow because the program and expected equipment are already defined.',
      'They help the rep sell consistency and speed with the distributor, not just the lowest possible equipment number.',
    ],
  },
  {
    id: 'how-to-sell',
    title: 'How to sell bundles against a general sale',
    intro:
      'Lead with the program story first. The rep should make the account feel like the bundle is a smarter business setup, not just a different way to pay for equipment.',
    bullets: [
      'Talk about speed to rollout, standardization, distributor alignment, and easier support.',
      'Explain that the bundle is designed to create a more complete beverage solution, not just place equipment.',
      'Use a general sale when the customer truly needs something custom and the bundle would force the wrong fit.',
      'Do not oversell bundle fit. If the account is not a good match, move it into the correct general path instead.',
    ],
    note:
      'Recommended rep language: “The bundle gives you a cleaner launch path with a defined program and support model. The general deal is better when you need a custom equipment structure.”',
  },
  {
    id: 'process-after-submit',
    title: 'What happens after a bundle deal is submitted',
    intro:
      'Once a rep submits the deal, the work moves from sales positioning into pipeline execution. The route depends on whether the deal is still a quote or is submitted directly as a deal.',
    steps: [
      {
        title: 'Rep qualifies the account',
        body: 'The rep confirms the customer fits the bundle and starts the deal from the selected bundle in Deal Builder.',
      },
      {
        title: 'Bundle deal is built',
        body: 'The customer information, equipment list, and bundle pricing are captured in the deal sheet. The bundle snapshot is saved with the deal.',
      },
      {
        title: 'Quote or direct deal is submitted',
        body: 'If submitted as a quote, the customer reviews it and the rep records the customer decision. If submitted as a direct deal, it moves immediately into the pipeline workflow.',
      },
      {
        title: 'Pipeline takes over',
        body: 'The deal is written into the pipeline record with customer data, equipment summary, and bundle-related pricing context for the downstream team.',
      },
      {
        title: 'Leasing or operations workflow continues',
        body: 'Lease and finance style outcomes move through financing workflow. Purchase or loan outcomes move into operations handling.',
      },
      {
        title: 'Account setup and fulfillment',
        body: 'After approvals, the downstream teams coordinate paperwork, setup, fulfillment, and install timing.',
      },
    ],
  },
  {
    id: 'rep-responsibilities',
    title: 'Sales rep responsibilities',
    intro:
      'The rep still owns the quality of the deal even after submission. The main responsibility is making sure the right account is put into the right structure, with complete information.',
    cards: [
      {
        eyebrow: 'Before submission',
        title: 'Pick the right structure',
        bullets: [
          'Confirm the customer is truly a bundle fit.',
          'Start from the correct bundle and make only eligible changes.',
          'Set expectations with the customer about what the bundle includes and how the process will move.',
        ],
      },
      {
        eyebrow: 'At submission',
        title: 'Submit a clean deal',
        bullets: [
          'Make sure customer, distributor, and install details are complete.',
          'Choose whether it should go out as a quote first or move straight to a deal.',
          'Capture clear notes so downstream teams do not have to guess.',
        ],
      },
      {
        eyebrow: 'After submission',
        title: 'Stay attached to the account',
        bullets: [
          'Track the customer response if it was sent as a quote.',
          'Record the decision correctly in My Deals when the customer accepts or declines.',
          'Help resolve open questions from leasing or operations and keep the customer moving forward.',
        ],
      },
    ],
  },
];
