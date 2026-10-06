/* Domain vocabulary: statuses, disciplines, agencies, default phases, built-in templates, seed projects. */
(function () {
  'use strict';

  // cls maps to CSS status tokens; glyph gives every status a non-color cue.
  const STATUSES = [
    { key: 'Not Started', cls: 'idle', glyph: '○' },
    { key: 'In Prep', cls: 'prep', glyph: '◐' },
    { key: 'Submitted', cls: 'sub', glyph: '↗' },
    { key: 'In Review', cls: 'rev', glyph: '◷' },
    { key: 'Comments Received', cls: 'com', glyph: '✎' },
    { key: 'Resubmittal in Prep', cls: 'resub', glyph: '↻' },
    { key: 'Approved', cls: 'ok', glyph: '✓' },
    { key: 'Approved w/ Conditions', cls: 'okc', glyph: '✓' },
    { key: 'Recorded/Closed', cls: 'closed', glyph: '■' },
    { key: 'On Hold', cls: 'hold', glyph: '‖' },
  ];

  const C = {
    STATUSES,
    STATUS_KEYS: STATUSES.map((s) => s.key),
    STATUS_BY_KEY: Object.fromEntries(STATUSES.map((s) => [s.key, s])),
    DONE: ['Approved', 'Approved w/ Conditions', 'Recorded/Closed'],
    WITH_AGENCY: ['Submitted', 'In Review'],
    NEEDS_SUBMIT: ['Not Started', 'In Prep', 'Comments Received', 'Resubmittal in Prep'],
    BALL: ['Us', 'Consultant', 'Agency'],
    PRIORITY: ['High', 'Normal', 'Low'],
    FEES: ['', 'Paid', 'Unpaid', 'N/A'],
    PROJECT_TYPES: ['Residential', 'Commercial', 'Mixed-Use', 'Industrial'],

    DEFAULT_PHASES: [
      'Entitlement',
      'Design / Plan Check',
      'Final Map & Recordation',
      'Bonds & Agreements',
      'Permits / Construction',
      'Close-out',
    ],

    DEPARTMENTS: ['Planning', 'Engineering', 'Fire', 'Landscape', 'Building', 'Utilities (OMUC)', 'Traffic', 'Outside Agency'],

    // Discipline → default department; used to prefill quick-add.
    DISCIPLINES: [
      ['Tentative Map', 'Planning'],
      ['Site Plan / Development Plan', 'Planning'],
      ['Architecture', 'Planning'],
      ['CEQA / Environmental', 'Planning'],
      ['Rough Grading', 'Engineering'],
      ['Precise Grading', 'Engineering'],
      ['Erosion Control / SWPPP', 'Engineering'],
      ['Street', 'Engineering'],
      ['Storm Drain', 'Engineering'],
      ['Sewer', 'Engineering'],
      ['Water', 'Utilities (OMUC)'],
      ['Recycled Water', 'Utilities (OMUC)'],
      ['WQMP', 'Engineering'],
      ['Hydrology', 'Engineering'],
      ['Geotechnical', 'Engineering'],
      ['Signing & Striping', 'Traffic'],
      ['Traffic Signal', 'Traffic'],
      ['Street Lighting', 'Engineering'],
      ['Traffic Study / VMT', 'Traffic'],
      ['Dry Utility', 'Outside Agency'],
      ['Landscape', 'Landscape'],
      ['Fire', 'Fire'],
      ['Final Map', 'Engineering'],
      ['Parcel Map', 'Engineering'],
      ['Title', 'Engineering'],
      ['Easement / Dedication', 'Engineering'],
      ['CC&Rs', 'Planning'],
      ['Agreement', 'Engineering'],
      ['Bond', 'Engineering'],
      ['Cost Estimate', 'Engineering'],
      ['Building', 'Building'],
      ['Permit', 'Engineering'],
      ['Other', ''],
    ],

    AGENCIES: [
      'City of Ontario',
      'City of Chino',
      'City of Chino Hills',
      'City of Eastvale',
      'City of Fontana',
      'City of Jurupa Valley',
      'City of Rancho Cucamonga',
      'City of Upland',
      'County of San Bernardino',
      'County of Riverside',
      'SB County Flood Control District',
      'Inland Empire Utilities Agency (IEUA)',
      'Cucamonga Valley Water District',
      'Monte Vista Water District',
      'Chino Basin Watermaster',
      'Santa Ana RWQCB',
      'State Water Board (SMARTS)',
      'Caltrans District 8',
      'Southern California Edison',
      'SoCalGas',
      'Frontier',
      'Spectrum',
      'CA Dept. of Fish & Wildlife',
      'US Army Corps of Engineers',
      'Chino Valley Unified School District',
    ],
  };

  C.DEPT_FOR = Object.fromEntries(C.DISCIPLINES);

  const t = (title, discipline, department, agency) => ({ title, discipline, department: department || C.DEPT_FOR[discipline] || '', agency: agency || '' });

  // Built-in package templates. Blank agency = use the project's jurisdiction.
  C.BUILTIN_TEMPLATES = [
    {
      id: 'bt-plancheck',
      builtin: true,
      name: 'Standard Plan Check Set',
      description: 'Full engineering plan check set for a tract.',
      items: [
        t('Rough Grading Plan', 'Rough Grading'),
        t('Precise Grading Plan', 'Precise Grading'),
        t('Street Improvement Plans', 'Street'),
        t('Storm Drain Plans', 'Storm Drain'),
        t('Sewer Plans', 'Sewer'),
        t('Water Plans', 'Water'),
        t('Recycled Water Plans', 'Recycled Water'),
        t('Final WQMP', 'WQMP'),
        t('Hydrology & Hydraulics Report', 'Hydrology'),
        t('Signing & Striping Plans', 'Signing & Striping'),
        t('Street Light Plans', 'Street Lighting'),
        t('Dry Utility Composite', 'Dry Utility', 'Engineering'),
        t('Landscape & Irrigation Plans', 'Landscape'),
        t('Fire Master Plan', 'Fire'),
      ],
    },
    {
      id: 'bt-roughgrading',
      builtin: true,
      name: 'Rough Grading 1st Submittal',
      description: 'Grading plan and supporting reports.',
      items: [
        t('Rough Grading Plan', 'Rough Grading'),
        t('Erosion Control Plan', 'Erosion Control / SWPPP'),
        t('Geotechnical Report', 'Geotechnical'),
        t('Hydrology Report', 'Hydrology'),
        t('WQMP', 'WQMP'),
        t('SWPPP / WDID', 'Erosion Control / SWPPP', 'Outside Agency', 'State Water Board (SMARTS)'),
      ],
    },
    {
      id: 'bt-wet',
      builtin: true,
      name: 'Wet Utility Plans',
      description: 'Sewer, water, recycled water, storm drain.',
      items: [
        t('Sewer Plans', 'Sewer'),
        t('Water Plans', 'Water'),
        t('Recycled Water Plans', 'Recycled Water'),
        t('Storm Drain Plans', 'Storm Drain'),
      ],
    },
    {
      id: 'bt-dry',
      builtin: true,
      name: 'Dry Utility Design',
      description: 'Utility company design submittals.',
      items: [
        t('SCE Electrical Design', 'Dry Utility', 'Outside Agency', 'Southern California Edison'),
        t('SoCalGas Design', 'Dry Utility', 'Outside Agency', 'SoCalGas'),
        t('Telecom Design', 'Dry Utility', 'Outside Agency', 'Frontier'),
        t('Joint Trench Composite', 'Dry Utility', 'Engineering'),
      ],
    },
    {
      id: 'bt-finalmap',
      builtin: true,
      name: 'Final Map Package',
      description: 'Map check through recordation.',
      items: [
        t('Final Map', 'Final Map'),
        t('Preliminary Title Report / Map Guarantee', 'Title'),
        t('Closure Calculations', 'Final Map'),
        t('Easement & Dedication Documents', 'Easement / Dedication'),
        t('CC&Rs', 'CC&Rs'),
        t('Tax Clearance / Tax Bond', 'Bond', 'Outside Agency', 'County of San Bernardino'),
      ],
    },
    {
      id: 'bt-bonds',
      builtin: true,
      name: 'Bonds & Agreements',
      description: 'Improvement security and agreements.',
      items: [
        t('Subdivision Improvement Agreement', 'Agreement'),
        t("Engineer's Cost Estimate", 'Cost Estimate'),
        t('Faithful Performance Bond', 'Bond'),
        t('Labor & Materials Bond', 'Bond'),
        t('Monumentation Bond', 'Bond'),
        t('Certificate of Insurance', 'Agreement'),
      ],
    },
    {
      id: 'bt-entitlement',
      builtin: true,
      name: 'Entitlement Application (TTM)',
      description: 'Tentative map application and technical studies.',
      items: [
        t('Tentative Tract Map', 'Tentative Map'),
        t('Development Plan / Site Plan', 'Site Plan / Development Plan'),
        t('Preliminary WQMP', 'WQMP', 'Engineering'),
        t('Preliminary Hydrology Report', 'Hydrology'),
        t('Preliminary Geotechnical Report', 'Geotechnical'),
        t('Traffic Study / VMT Analysis', 'Traffic Study / VMT'),
        t('CEQA Technical Studies', 'CEQA / Environmental'),
        t('Conceptual Landscape Plan', 'Landscape'),
        t('Architecture & Elevations', 'Architecture'),
      ],
    },
  ];

  C.SEED_PROJECTS = [
    { name: 'Bosma', caseNumbers: ['PMTT26-001', 'TTM 20780'], type: 'Residential' },
    { name: 'The District', caseNumbers: ['TTM 20779'], type: 'Residential' },
    { name: 'Rich Haven PA1', caseNumbers: ['PDEV25-017', 'TM-20526'], type: 'Residential' },
    { name: 'Pietersma Commercial', caseNumbers: [], type: 'Commercial' },
    { name: 'Randall South Commercial', caseNumbers: ['TPM 20792'], type: 'Commercial' },
    { name: 'Rais Devries', caseNumbers: [], type: 'Residential' },
  ];

  window.C = C;
})();
