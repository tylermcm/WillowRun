/*
 * Willow Run Dental: new patient intake schema.
 * Digitized from "Patient Health Record" (4 pages) and "Authorization to Release Dental Information".
 * Both the on-screen wizard (intake.js) and the PDF (pdf.js) are generated from this file.
 *
 * Structure:  steps (big sections)  ->  blocks (one short screen each)  ->  fields
 * Block:  title = screen heading, blurb = intro line, heading = subheading used in the PDF, validate = extra rules
 * Field:  k = data key, l = label / question, t = type, w = grid columns (of 12), req = required,
 *         showIf = visibility rule, opts = choices, ph = placeholder, ac = autocomplete, help = hint text
 * Types:  text tel email date ssn area radio yn chips select check initials
 */
window.INTAKE_SCHEMA = (() => {
  const CONDITIONS = [
    'Heart disease', 'Heart murmur', 'Jaundice', 'Ulcers', 'Diabetes', 'Epilepsy', 'Anemia', 'Cough',
    'Arthritis', 'Osteoporosis', 'Stroke', 'Glaucoma', 'Sinus trouble', 'Asthma', 'Hay fever', 'HIV',
    'Hepatitis A, B or C', 'Lung disease', 'Tuberculosis'
  ];
  const yes = k => d => d[k] === 'Yes';
  const canBePregnant = d => d.sex === 'Female' || d.sex === 'Prefer not to say';
  function digits(s) { return String(s || '').replace(/\D/g, ''); }

  const steps = [
    {
      id: 'you', title: 'About you',
      blocks: [
        {
          title: 'Let’s start with you', blurb: 'Fields marked * are required.',
          fields: [
            { k: 'lastName', l: 'Last name', t: 'text', w: 5, req: 1, ac: 'family-name' },
            { k: 'firstName', l: 'First name', t: 'text', w: 5, req: 1, ac: 'given-name' },
            { k: 'mi', l: 'MI', t: 'text', w: 2, ac: 'additional-name', max: 1 },
            { k: 'nickname', l: 'Nickname (what should we call you?)', t: 'text', w: 6 },
            { k: 'dob', l: 'Date of birth', t: 'date', w: 6, req: 1, ph: 'MM/DD/YYYY', ac: 'bday' },
            { k: 'sex', l: 'Sex', t: 'radio', w: 12, req: 1, opts: ['Male', 'Female', 'Prefer not to say'] },
            { k: 'marital', l: 'Marital status', t: 'radio', w: 12, req: 1, opts: ['Single', 'Married', 'Widowed', 'Divorced'] }
          ]
        },
        {
          title: 'How can we reach you?', blurb: 'We need at least one phone number.',
          fields: [
            { k: 'address', l: 'Street address', t: 'text', w: 12, req: 1, ac: 'street-address' },
            { k: 'city', l: 'City', t: 'text', w: 6, req: 1, ac: 'address-level2' },
            { k: 'state', l: 'State', t: 'text', w: 3, req: 1, ac: 'address-level1', def: 'CO', max: 2 },
            { k: 'zip', l: 'Zip', t: 'text', w: 3, req: 1, ac: 'postal-code', im: 'numeric', max: 10 },
            { k: 'cellPhone', l: 'Cell phone', t: 'tel', w: 6, ac: 'tel' },
            { k: 'homePhone', l: 'Home phone', t: 'tel', w: 6 },
            { k: 'email', l: 'Email address', t: 'email', w: 12, ac: 'email' }
          ],
          validate(d) {
            const e = {};
            if (!digits(d.cellPhone) && !digits(d.homePhone)) e.cellPhone = 'Please give us at least one phone number.';
            return e;
          }
        },
        {
          title: 'A few more details', blurb: 'All of these are optional. You can skip ahead.',
          fields: [
            { k: 'referredBy', l: 'Referred by', t: 'text', w: 6 },
            { k: 'employer', l: 'Employer', t: 'text', w: 6, ac: 'organization' },
            { k: 'workPhone', l: 'Work phone', t: 'tel', w: 6 },
            { k: 'ssn', l: 'Social Security number (optional)', t: 'ssn', w: 6, ph: '###-##-####', help: 'You’re welcome to give this to us in person instead.' }
          ]
        }
      ]
    },
    {
      id: 'spouse', title: 'Spouse or partner',
      blocks: [{
        title: 'Spouse or partner', blurb: 'Only if you’d like to add one. You can skip this.',
        fields: [
          { k: 'hasSpouse', l: 'Would you like to add a spouse or partner?', t: 'yn', w: 12, req: 1 },
          { k: 'spLast', l: 'Last name', t: 'text', w: 5, req: 1, showIf: yes('hasSpouse') },
          { k: 'spFirst', l: 'First name', t: 'text', w: 5, req: 1, showIf: yes('hasSpouse') },
          { k: 'spMi', l: 'MI', t: 'text', w: 2, showIf: yes('hasSpouse'), max: 1 },
          { k: 'spDob', l: 'Date of birth', t: 'date', w: 6, showIf: yes('hasSpouse'), ph: 'MM/DD/YYYY' },
          { k: 'spCell', l: 'Cell phone', t: 'tel', w: 6, showIf: yes('hasSpouse') },
          { k: 'spSsn', l: 'Social Security number (optional)', t: 'ssn', w: 6, showIf: yes('hasSpouse'), ph: '###-##-####' },
          { k: 'spEmployer', l: 'Employer', t: 'text', w: 6, showIf: yes('hasSpouse') },
          { k: 'spWorkPhone', l: 'Work phone', t: 'tel', w: 6, showIf: yes('hasSpouse') }
        ]
      }]
    },
    {
      id: 'insurance', title: 'Dental insurance',
      blocks: [{
        title: 'Dental insurance', blurb: 'Have your insurance card handy. If you’re unsure about something, leave it blank and we’ll sort it out together.',
        fields: [
          { k: 'noIns', l: 'I don’t have dental insurance', t: 'check', w: 12 },
          { k: 'insurer', l: 'Dental insurance company', t: 'text', w: 6, req: 1, showIf: d => !d.noIns },
          { k: 'insGroup', l: 'Group #', t: 'text', w: 6, showIf: d => !d.noIns },
          { k: 'insuredName', l: 'Name the insurance is under', t: 'text', w: 6, showIf: d => !d.noIns },
          { k: 'insPhone', l: 'Insurance phone #', t: 'tel', w: 6, showIf: d => !d.noIns },
          { k: 'insRel', l: 'Relationship to insured', t: 'select', w: 6, showIf: d => !d.noIns, opts: ['Self', 'Spouse', 'Parent', 'Other'], def: 'Self' }
        ]
      }]
    },
    {
      id: 'medical', title: 'Medical health',
      blocks: [
        {
          title: 'Your general health', heading: 'General health', blurb: 'This helps Dr. McMurtrey keep you safe. Answer as best you can.',
          fields: [
            { k: 'genHealth', l: 'How would you describe your general health?', t: 'radio', w: 12, req: 1, opts: ['Excellent', 'Good', 'Fair', 'Poor'] },
            { k: 'physName', l: 'Physician’s name', t: 'text', w: 6 },
            { k: 'physPhone', l: 'Physician’s phone #', t: 'tel', w: 6 },
            { k: 'physAddress', l: 'Physician’s address', t: 'text', w: 8 },
            { k: 'lastPhysical', l: 'Last physical exam', t: 'text', w: 4, ph: 'e.g. June 2025' }
          ]
        },
        {
          title: 'Medications', heading: 'Medications',
          fields: [
            { k: 'takesMeds', l: 'Are you taking any medications now?', t: 'yn', w: 12, req: 1 },
            { k: 'medsList', l: 'Please list each medication and what it’s for', t: 'area', w: 12, req: 1, showIf: yes('takesMeds') }
          ]
        },
        {
          title: 'Medical conditions', blurb: 'Select everything you’ve ever been treated for.',
          fields: [
            { k: 'conditions', l: 'Have you ever been treated for…', t: 'chips', w: 12, req: 1, opts: CONDITIONS, noneLabel: 'None of these' }
          ]
        },
        {
          title: 'Special care', heading: 'Special care',
          fields: [
            { k: 'premed', l: 'Do you require dental pre-medication (antibiotic)?', t: 'yn', w: 12, req: 1 },
            { k: 'covidVax', l: 'Have you had the COVID-19 vaccine?', t: 'yn', w: 12 },
            { k: 'surgery', l: 'Have you had any surgery with instrumentation placed?', t: 'yn', w: 12, req: 1 },
            { k: 'surgeryDetail', l: 'When, and what type?', t: 'area', w: 12, req: 1, showIf: yes('surgery') },
            { k: 'xrayTx', l: 'Have you ever been treated (other than diagnostic) with X-ray?', t: 'yn', w: 12, req: 1 },
            { k: 'xrayWhy', l: 'For what purpose?', t: 'area', w: 12, req: 1, showIf: yes('xrayTx') }
          ]
        },
        {
          title: 'Allergies', heading: 'Allergies',
          fields: [
            { k: 'algPen', l: 'Are you allergic to penicillin?', t: 'yn', w: 12, req: 1 },
            { k: 'algCod', l: 'Are you allergic to codeine?', t: 'yn', w: 12, req: 1 },
            { k: 'algAnes', l: 'Are you allergic to local injected anesthetics?', t: 'yn', w: 12, req: 1 },
            { k: 'algOther', l: 'Any other medication allergies?', t: 'text', w: 12 }
          ]
        },
        {
          title: 'A few more health questions', heading: 'Other health questions',
          fields: [
            { k: 'bleeding', l: 'Are you subject to prolonged bleeding?', t: 'yn', w: 12, req: 1 },
            { k: 'fainting', l: 'Are you subject to fainting spells?', t: 'yn', w: 12, req: 1 },
            { k: 'thirst', l: 'Do you have excessive urination and/or thirst?', t: 'yn', w: 12, req: 1 },
            { k: 'pregnant', l: 'Are you pregnant?', t: 'yn', w: 12, req: 1, showIf: canBePregnant },
            { k: 'pregWeeks', l: 'How many weeks?', t: 'text', w: 4, showIf: d => canBePregnant(d) && d.pregnant === 'Yes', im: 'numeric' }
          ]
        }
      ]
    },
    {
      id: 'dental', title: 'Dental health',
      blocks: [
        {
          title: 'What brings you in?', heading: 'Your visit', blurb: 'Tell us about your teeth and what brings you in. There are no wrong answers.',
          fields: [
            { k: 'reason', l: 'Reason for visit', t: 'area', w: 12, req: 1 },
            { k: 'lastExam', l: 'When was your last dental exam?', t: 'text', w: 12, ph: 'e.g. about a year ago' },
            { k: 'priorProblem', l: 'Have you ever had any serious problem associated with previous dental treatment?', t: 'yn', w: 12, req: 1 },
            { k: 'priorProblemWhy', l: 'Please explain', t: 'area', w: 12, req: 1, showIf: yes('priorProblem') }
          ]
        },
        {
          title: 'Your home care', heading: 'Home care',
          fields: [
            { k: 'brushFreq', l: 'How often do you brush your teeth?', t: 'text', w: 6 },
            { k: 'flossFreq', l: 'How often do you floss?', t: 'text', w: 6 },
            { k: 'brushType', l: 'What texture of toothbrush do you use?', t: 'radio', w: 12, opts: ['Hard', 'Medium', 'Soft'] },
            { k: 'familiarPrev', l: 'Are you familiar with the term “Preventative Dentistry”?', t: 'yn', w: 12 }
          ]
        },
        {
          title: 'Your gums', heading: 'Gums & comfort',
          fields: [
            { k: 'bleedBrush', l: 'Do your gums bleed while brushing?', t: 'yn', w: 12, req: 1 },
            { k: 'bleedFloss', l: 'Do your gums bleed while flossing?', t: 'yn', w: 12, req: 1 },
            { k: 'gumsTender', l: 'Do your gums feel tender or swollen?', t: 'yn', w: 12, req: 1 },
            { k: 'painBrush', l: 'Do you feel pain in any of your teeth when brushing or flossing?', t: 'yn', w: 12, req: 1 },
            { k: 'avoidBrush', l: 'Do you avoid brushing any part of your mouth because of pain?', t: 'yn', w: 12, req: 1 }
          ]
        },
        {
          title: 'Sensitivity', heading: 'Sensitivity', blurb: 'Do you feel twinges of pain when your teeth come in contact with…',
          fields: [
            { k: 'twHot', l: 'Hot foods or liquids (soup, coffee, tea…)?', t: 'yn', w: 12, req: 1 },
            { k: 'twCold', l: 'Cold foods or liquids (ice cream, cold fruit, ice water…)?', t: 'yn', w: 12, req: 1 },
            { k: 'twSweet', l: 'Sweets (candy, fruit, sweet desserts…)?', t: 'yn', w: 12, req: 1 },
            { k: 'twSour', l: 'Sours (lemons, limes, grapefruit…)?', t: 'yn', w: 12, req: 1 }
          ]
        },
        {
          title: 'Bite & jaw', heading: 'Bite & jaw',
          fields: [
            { k: 'oneSide', l: 'Do you chew on only one side of your mouth?', t: 'yn', w: 12, req: 1 },
            { k: 'oneSideWhy', l: 'Please explain', t: 'text', w: 12, showIf: yes('oneSide') },
            { k: 'grind', l: 'Do you clench or grind your teeth while sleeping or during the day?', t: 'yn', w: 12, req: 1 },
            { k: 'jawTired', l: 'Do your jaws ever feel tired?', t: 'yn', w: 12, req: 1 },
            { k: 'jawWhen', l: 'When?', t: 'text', w: 12, showIf: yes('jawTired') },
            { k: 'dentures', l: 'Do you wear dentures?', t: 'yn', w: 12, req: 1 }
          ]
        },
        {
          title: 'Fillings & anything else', heading: 'Fillings & other',
          fields: [
            { k: 'cavities', l: 'Do you usually have many cavities?', t: 'yn', w: 12, req: 1 },
            { k: 'loseFillings', l: 'Do you lose or break fillings?', t: 'yn', w: 12, req: 1 },
            { k: 'gag', l: 'Do you gag easily?', t: 'yn', w: 12, req: 1 },
            { k: 'important', l: 'Is there anything else you feel is important for us to know?', t: 'area', w: 12 }
          ]
        }
      ]
    }
  ];

  return { steps, CONDITIONS, digits };
})();
