'use strict';

/**
 * ============================================================================
 * Africa JobBot CV Parser — 100% offline, no AI, no external APIs.
 * ============================================================================
 */

/**
 * ============================================================================
 * PART 1 — Utilities & Normalization
 * ============================================================================
 */

/** Normalize all whitespace */
function normalizeText(text = '') {
  if (typeof text !== 'string') return '';

  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Split text into clean lines */
function getLines(text = '') {
  return normalizeText(text)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

/** Remove duplicate values */
function unique(array = []) {
  return [...new Set(array)];
}

/** Remove duplicate values (case insensitive) */
function uniqueIgnoreCase(array = []) {
  const seen = new Set();
  return array.filter(item => {
    const key = String(item).toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Clean strings */
function clean(value = '') {
  return String(value)
    .replace(/\s+/g, ' ')
    .replace(/\u2022/g, '')
    .replace(/\*/g, '')
    .trim();
}

/** Safe regex search */
function match(text, regex) {
  if (!text) return '';
  const result = text.match(regex);
  return result ? result[0] : '';
}

/** Remove empty values */
function compact(arr = []) {
  return arr.filter(Boolean);
}

/** Check if string contains numbers */
function hasNumber(text = '') {
  return /\d/.test(text);
}

/** Check if string looks like a heading (generic fallback — NOT used for
 * section-boundary detection, since it's too aggressive for that: short,
 * Capitalized content like a job title or degree name also "looks like a
 * heading" and would wrongly truncate section parsing. Kept as a general
 * utility for callers that want a loose heuristic. */
function looksLikeHeading(line = '') {
  if (!line) return false;
  if (line.length > 60) return false;
  if (line === line.toUpperCase() && /[A-Z]/.test(line)) return true;
  return /^[A-Z][A-Za-z ]+$/.test(line);
}

/** Convert text to Title Case */
function titleCase(str = '') {
  return String(str).toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

/** Find all regex matches (auto-adds the 'g' flag if missing) */
function findAll(text, regex) {
  if (!text) return [];
  const safeRegex = regex.global ? regex : new RegExp(regex.source, regex.flags + 'g');
  return [...text.matchAll(safeRegex)].map(m => m[0]);
}

/** Count years between a start/end year */
function calculateYears(startYear, endYear) {
  if (!startYear) return 0;
  const start = Number(startYear);
  const end = endYear ? Number(endYear) : new Date().getFullYear();
  if (isNaN(start) || isNaN(end)) return 0;
  return Math.max(0, end - start);
}

/** Detect whether CV text is usable */
function isValidCv(text = '') {
  return normalizeText(text).length > 150;
}

/** Extract every 4-digit year appearing anywhere in the CV */
function extractYears(text = '') {
  return unique(findAll(text, /\b(19\d{2}|20\d{2})\b/g));
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * ============================================================================
 * PART 2 — Constants (SECTION_HEADERS, SKILL_SET, CERT_PATTERNS, LANGUAGES)
 * These were referenced throughout the draft but never defined.
 * ============================================================================
 */

// ── Section headers — used to find where a section starts/ends ──────────────
const SECTION_HEADERS = {
  summary: ['summary', 'professional summary', 'career summary', 'profile', 'about me', 'objective', 'career objective', 'personal statement', 'executive summary'],
  experience: ['experience', 'work experience', 'professional experience', 'employment', 'employment history', 'work history', 'career history', 'relevant experience'],
  education: ['education', 'academic background', 'academic qualifications', 'qualifications', 'educational background'],
  skills: ['skills', 'technical skills', 'key skills', 'core competencies', 'competencies', 'areas of expertise'],
  projects: ['projects', 'key projects', 'personal projects', 'notable projects'],
  certifications: ['certifications', 'certificates', 'professional certifications', 'licenses', 'licences'],
  languages: ['languages', 'language skills', 'language proficiency'],
  awards: ['awards', 'honors', 'honours', 'awards & honors', 'achievements'],
  publications: ['publications', 'research publications', 'published works', 'papers'],
  volunteer: ['volunteer experience', 'volunteer work', 'volunteering', 'community service', 'community involvement'],
  references: ['references', 'referees', 'references available upon request'],
};

const ALL_SECTION_HEADER_ALIASES = Object.values(SECTION_HEADERS).flat();

/**
 * Detect whether a line IS a section heading (Experience, Employment,
 * Professional Experience, Work History, Education, Skills, Projects,
 * Languages, Certifications, Awards, References, Summary, Objective,
 * Profile, ...). Matches literal known header text only — deliberately does
 * NOT fall back to a "looks short & Capitalized" heuristic, because that
 * would also match ordinary content (a job title, a degree name) and cause
 * section parsing to stop early, silently dropping real data.
 */
function isSectionHeader(line = '') {
  if (!line) return false;
  const key = clean(line).toLowerCase().replace(/:$/, '').trim();
  return ALL_SECTION_HEADER_ALIASES.includes(key);
}

/**
 * Grab the block of text between a named section header and the next
 * section header of any kind.
 */
function extractSection(text, headerKey) {
  const lines = getLines(text);
  const aliases = SECTION_HEADERS[headerKey] || [];
  let start = -1;

  for (let i = 0; i < lines.length; i++) {
    const key = lines[i].toLowerCase().replace(/:$/, '').trim();
    if (aliases.includes(key)) { start = i; break; }
  }
  if (start === -1) return '';

  let end = lines.length;
  for (let j = start + 1; j < lines.length; j++) {
    if (isSectionHeader(lines[j])) { end = j; break; }
  }

  return lines.slice(start + 1, end).join(' ').trim();
}

// ── Skill database — grouped by category, flattened into one canonical set ──
const SKILL_CATEGORIES = {
  programming: [
    'JavaScript', 'TypeScript', 'Python', 'Java', 'C', 'C++', 'C#', 'Go', 'Rust', 'Ruby',
    'PHP', 'Swift', 'Kotlin', 'Objective-C', 'Scala', 'Perl', 'R', 'MATLAB', 'Dart',
    'Shell Scripting', 'Bash', 'PowerShell', 'SQL', 'PostgreSQL', 'MySQL', 'MongoDB', 'NoSQL',
    'PL/SQL', 'HTML', 'CSS', 'SASS', 'React', 'Angular', 'Vue.js', 'Next.js', 'Node.js',
    'Express.js', 'Django', 'Flask', 'FastAPI', 'Spring Boot', 'Laravel', 'Ruby on Rails',
    'ASP.NET', 'jQuery', 'Redux', 'GraphQL', 'REST API', 'WebSockets', 'Microservices',
    '.NET', '.NET Core', 'Xamarin', 'React Native', 'Flutter', 'Android Development',
    'iOS Development', 'Unity',
  ],
  cloud: [
    'Amazon Web Services', 'Microsoft Azure', 'Google Cloud Platform', 'EC2', 'S3', 'Lambda',
    'CloudFormation', 'Azure DevOps', 'Azure Functions', 'Cloud Computing',
    'Serverless Architecture', 'Cloud Migration', 'Cloud Security', 'Cloud Architecture',
    'Heroku', 'DigitalOcean', 'Oracle Cloud', 'IBM Cloud', 'VMware', 'OpenStack',
    'Terraform', 'CloudWatch', 'Route 53', 'RDS', 'DynamoDB', 'Firebase',
  ],
  devops: [
    'DevOps', 'CI/CD', 'Continuous Integration', 'Continuous Deployment', 'Jenkins',
    'GitLab CI', 'GitHub Actions', 'Docker', 'Kubernetes', 'Ansible', 'Puppet', 'Chef',
    'Vagrant', 'Git', 'Version Control', 'Infrastructure as Code', 'Prometheus', 'Grafana',
    'ELK Stack', 'Site Reliability Engineering', 'Helm',
  ],
  networking: [
    'Networking', 'TCP/IP', 'DNS', 'DHCP', 'VPN', 'Firewall Configuration',
    'Network Security', 'LAN', 'WAN', 'Routing', 'Switching', 'Cisco', 'CCNA', 'CCNP',
    'Network Administration', 'Wireless Networking', 'Network Troubleshooting',
    'Load Balancing', 'VoIP', 'Network Monitoring', 'Subnetting', 'Wireshark',
  ],
  cybersecurity: [
    'Cybersecurity', 'Information Security', 'Penetration Testing', 'Ethical Hacking',
    'Vulnerability Assessment', 'Risk Assessment', 'Security Auditing', 'SIEM',
    'Incident Response', 'Malware Analysis', 'Cryptography', 'Application Security',
    'Identity and Access Management', 'ISO 27001', 'GDPR Compliance', 'Intrusion Detection',
    'Security Operations Center', 'Threat Intelligence', 'Digital Forensics',
    'Endpoint Security', 'Zero Trust Security',
  ],
  dataAnalysis: [
    'Data Analysis', 'Data Analytics', 'Data Visualization', 'Data Mining',
    'Statistical Analysis', 'Microsoft Excel', 'Power BI', 'Tableau', 'Data Modeling',
    'Data Warehousing', 'ETL', 'Business Intelligence', 'Predictive Analytics',
    'Data Cleaning', 'Google Analytics', 'SPSS', 'STATA', 'Big Data', 'Hadoop', 'Spark',
    'Quantitative Analysis', 'Qualitative Analysis', 'Dashboard Development', 'Reporting',
  ],
  machineLearning: [
    'Machine Learning', 'Deep Learning', 'Artificial Intelligence',
    'Natural Language Processing', 'Computer Vision', 'Neural Networks', 'TensorFlow',
    'PyTorch', 'Scikit-learn', 'Keras', 'Data Science', 'Feature Engineering',
    'Reinforcement Learning', 'Predictive Modeling', 'Generative AI',
    'Large Language Models', 'Prompt Engineering', 'MLOps', 'Recommendation Systems',
  ],
  finance: [
    'Financial Analysis', 'Financial Reporting', 'Financial Modeling', 'Budgeting',
    'Forecasting', 'Investment Analysis', 'Risk Management', 'Financial Planning',
    'Accounts Payable', 'Accounts Receivable', 'Cash Flow Management',
    'Treasury Management', 'Corporate Finance', 'Auditing', 'Tax Preparation',
    'Tax Compliance', 'Cost Accounting', 'Credit Analysis', 'Loan Processing',
    'Banking Operations', 'Portfolio Management', 'Mergers and Acquisitions', 'Valuation',
    'IFRS', 'GAAP',
  ],
  accounting: [
    'Accounting', 'Bookkeeping', 'QuickBooks', 'Sage', 'Payroll Processing',
    'General Ledger', 'Accounts Reconciliation', 'VAT Compliance', 'Cost Control',
    'Fixed Assets Management', 'Bank Reconciliation', 'Invoice Processing',
    'Journal Entries', 'Trial Balance', 'Balance Sheet Preparation', 'Expense Management',
    'Xero', 'Pastel', 'SAP',
  ],
  procurement: [
    'Procurement', 'Supply Chain Management', 'Vendor Management', 'Contract Negotiation',
    'Purchasing', 'Sourcing', 'Strategic Sourcing', 'Tender Management',
    'Inventory Management', 'Supplier Evaluation', 'Purchase Order Management',
    'Procurement Planning', 'RFP Management', 'Category Management', 'Contract Management',
  ],
  administration: [
    'Administration', 'Office Administration', 'Executive Assistance', 'Scheduling',
    'Records Management', 'Data Entry', 'Correspondence Management', 'Filing Systems',
    'Front Desk Management', 'Calendar Management', 'Travel Coordination',
    'Office Management', 'Document Management', 'Administrative Support',
    'Diary Management', 'Minute Taking', 'Event Coordination', 'Facilities Management',
  ],
  hr: [
    'Human Resources', 'Recruitment', 'Talent Acquisition', 'Employee Relations',
    'Performance Management', 'Onboarding', 'HR Policy Development',
    'Compensation and Benefits', 'Payroll Management', 'Training and Development',
    'HRIS', 'Employee Engagement', 'Workforce Planning', 'Labor Relations',
    'HR Compliance', 'Conflict Resolution', 'Succession Planning', 'Employee Retention',
    'Diversity and Inclusion', 'HR Administration', 'Talent Management',
  ],
  marketing: [
    'Marketing', 'Digital Marketing', 'Social Media Marketing', 'Content Marketing',
    'SEO', 'SEM', 'Email Marketing', 'Brand Management', 'Market Research',
    'Marketing Strategy', 'Campaign Management', 'Marketing Analytics', 'Google Ads',
    'Facebook Ads', 'Influencer Marketing', 'Public Relations', 'Copywriting',
    'Content Creation', 'Graphic Design', 'Product Marketing', 'Marketing Automation',
  ],
  sales: [
    'Sales', 'Sales Management', 'Business Development', 'Account Management',
    'Lead Generation', 'Negotiation', 'Cold Calling', 'Sales Strategy',
    'Customer Relationship Management', 'Salesforce', 'Sales Forecasting',
    'Territory Management', 'Upselling', 'Client Retention', 'B2B Sales', 'B2C Sales',
    'Sales Pipeline Management',
  ],
  ngo: [
    'NGO Management', 'Program Management', 'Grant Writing', 'Fundraising',
    'Donor Relations', 'Community Development', 'Humanitarian Aid',
    'Project Coordination', 'Advocacy', 'Policy Analysis', 'Capacity Building',
    'Stakeholder Engagement', 'Resource Mobilization', 'Proposal Writing',
    'Nonprofit Management', 'Volunteer Management', 'Field Coordination', 'Social Work',
    'Gender Mainstreaming', 'Child Protection',
  ],
  monitoringEvaluation: [
    'Monitoring and Evaluation', 'Data Collection', 'Impact Assessment',
    'Results-Based Management', 'Logical Framework Analysis', 'Baseline Surveys',
    'Program Evaluation', 'Indicator Development', 'Data Quality Assurance',
    'Theory of Change', 'KPI Tracking', 'Evaluation Design', 'Survey Design',
  ],
  projectManagement: [
    'Project Management', 'Agile', 'Scrum', 'Kanban', 'PRINCE2', 'PMP',
    'Project Planning', 'Stakeholder Management', 'Project Coordination',
    'Resource Allocation', 'Project Scheduling', 'Gantt Charts', 'Budget Management',
    'Scope Management', 'Quality Management', 'Sprint Planning', 'Change Management',
    'Project Delivery',
  ],
  healthcare: [
    'Healthcare Administration', 'Patient Care', 'Clinical Research', 'Nursing',
    'Medical Records Management', 'Healthcare Compliance', 'Public Health',
    'Epidemiology', 'Health Education', 'Medical Coding', 'Pharmacy Management',
    'Healthcare Management', 'Telemedicine', 'Health Informatics', 'Community Health',
    'Clinical Data Management', 'Health Policy', 'Infection Control', 'Emergency Response',
  ],
  engineering: [
    'Mechanical Engineering', 'Electrical Engineering', 'Civil Engineering',
    'Structural Engineering', 'Chemical Engineering', 'Industrial Engineering', 'AutoCAD',
    'SolidWorks', 'Engineering Design', 'Quality Assurance', 'Quality Control',
    'Manufacturing Processes', 'Process Engineering', 'Product Design', 'CAD Design',
    'Electrical Wiring', 'HVAC Systems', 'Technical Drawing', 'Prototyping',
    'Systems Engineering', 'Maintenance Engineering', 'Instrumentation', 'Control Systems',
  ],
  construction: [
    'Construction Management', 'Site Supervision', 'Building Codes', 'Blueprint Reading',
    'Cost Estimation', 'Quantity Surveying', 'Construction Safety', 'Contract Administration',
    'Building Inspection', 'Structural Design', 'Land Surveying', 'Construction Planning',
    'Materials Management', 'Health and Safety Compliance', 'Renovation Management',
    'Infrastructure Development',
  ],
  customerService: [
    'Customer Service', 'Customer Support', 'Call Center Operations',
    'Complaint Resolution', 'Customer Satisfaction', 'Help Desk Support',
    'Client Relations', 'Customer Retention', 'Live Chat Support', 'Technical Support',
    'Customer Experience', 'Service Delivery', 'Ticketing Systems', 'Customer Onboarding',
  ],
  agriculture: [
    'Agriculture', 'Agribusiness', 'Crop Production', 'Livestock Management',
    'Farm Management', 'Agricultural Extension', 'Soil Management', 'Irrigation Systems',
    'Agronomy', 'Horticulture', 'Food Security', 'Agricultural Economics',
    'Sustainable Agriculture', 'Pest Management', 'Veterinary Services',
    'Poultry Farming', 'Dairy Farming', 'Value Chain Development', 'Cooperative Management',
  ],
  logistics: [
    'Logistics Management', 'Supply Chain Coordination', 'Fleet Management',
    'Warehouse Management', 'Distribution Management', 'Freight Forwarding',
    'Transportation Management', 'Inventory Control', 'Shipping and Receiving',
    'Customs Clearance', 'Route Planning', 'Import/Export Operations',
    'Dispatch Coordination', 'Cold Chain Management', 'Order Fulfillment',
  ],
  education: [
    'Teaching', 'Curriculum Development', 'Lesson Planning', 'Classroom Management',
    'Educational Assessment', 'Instructional Design', 'E-Learning', 'Academic Advising',
    'Special Education', 'Early Childhood Education', 'Tutoring', 'Training Delivery',
    'Educational Technology', 'Student Counseling', 'Adult Education',
    'Learning Management Systems', 'Pedagogy', 'Facilitation',
  ],
  msOffice: [
    'Microsoft Word', 'Microsoft Excel', 'Microsoft PowerPoint', 'Microsoft Outlook',
    'Microsoft Access', 'Microsoft Office', 'Excel Pivot Tables', 'Excel Macros', 'VBA',
  ],
  softSkills: [
    'Communication', 'Leadership', 'Teamwork', 'Problem Solving', 'Critical Thinking',
    'Time Management', 'Adaptability', 'Creativity', 'Emotional Intelligence',
    'Conflict Resolution', 'Decision Making', 'Attention to Detail', 'Multitasking',
    'Interpersonal Skills', 'Presentation Skills', 'Negotiation', 'Work Ethic',
    'Collaboration', 'Analytical Thinking', 'Flexibility', 'Initiative', 'Self-Motivation',
    'Active Listening', 'Public Speaking', 'Mentoring', 'Coaching', 'Cultural Sensitivity',
    'Stress Management', 'Organizational Skills', 'Strategic Thinking',
  ],
};

// Flat set of every canonical skill name — 500+ entries across every
// category requested (programming, cloud, devops, networking, cybersecurity,
// data, ML/AI, finance, accounting, procurement, admin, HR, marketing,
// sales, NGO, M&E, project management, healthcare, engineering,
// construction, customer service, agriculture, logistics, education,
// MS Office, soft skills).
const SKILL_SET = new Set(Object.values(SKILL_CATEGORIES).flat());

// ── Skill normalization — common variants collapse to one canonical name ────
// (e.g. "Excel" / "MS Excel" / "Microsoft Office Excel" all -> "Microsoft Excel")
const SKILL_ALIASES = {
  'excel': 'Microsoft Excel', 'ms excel': 'Microsoft Excel', 'microsoft office excel': 'Microsoft Excel',
  'word': 'Microsoft Word', 'ms word': 'Microsoft Word',
  'powerpoint': 'Microsoft PowerPoint', 'ms powerpoint': 'Microsoft PowerPoint', 'ppt': 'Microsoft PowerPoint',
  'outlook': 'Microsoft Outlook', 'ms outlook': 'Microsoft Outlook',
  'access': 'Microsoft Access', 'ms access': 'Microsoft Access',
  'js': 'JavaScript', 'ecmascript': 'JavaScript',
  'ts': 'TypeScript',
  'node': 'Node.js', 'nodejs': 'Node.js',
  'reactjs': 'React', 'react.js': 'React',
  'vuejs': 'Vue.js',
  'nextjs': 'Next.js',
  'expressjs': 'Express.js', 'express': 'Express.js',
  'py': 'Python',
  'golang': 'Go',
  'ml': 'Machine Learning',
  'ai': 'Artificial Intelligence',
  'nlp': 'Natural Language Processing',
  'aws': 'Amazon Web Services', 'amazon web services (aws)': 'Amazon Web Services',
  'gcp': 'Google Cloud Platform', 'google cloud': 'Google Cloud Platform',
  'azure': 'Microsoft Azure', 'ms azure': 'Microsoft Azure',
  'k8s': 'Kubernetes',
  'ci/cd': 'CI/CD', 'cicd': 'CI/CD',
  'crm': 'Customer Relationship Management',
  'pm': 'Project Management', 'project mgmt': 'Project Management',
  'm&e': 'Monitoring and Evaluation', 'monitoring & evaluation': 'Monitoring and Evaluation',
  'hr': 'Human Resources',
  'seo': 'SEO', 'search engine optimization': 'SEO',
  'qa': 'Quality Assurance', 'qc': 'Quality Control',
  'bi': 'Business Intelligence',
};

// Register every canonical skill as its own identity alias too, so the same
// lookup table drives both matching and normalization.
for (const skill of SKILL_SET) {
  SKILL_ALIASES[skill.toLowerCase()] = skill;
}

// One combined regex, built once at module load (not per-parse) — this is
// the main performance win over iterating hundreds of individual regexes
// against the same text on every single call. Lookaround boundaries (rather
// than \b) are used deliberately: \b doesn't work reliably around symbol
// characters like the '+' in "C++" or the '.' in "Node.js", since a
// non-word char followed by another non-word char never satisfies \b.
const SKILL_TERMS = Object.keys(SKILL_ALIASES).sort((a, b) => b.length - a.length);
const SKILL_MATCH_REGEX = new RegExp(
  '(?<![a-zA-Z0-9])(' + SKILL_TERMS.map(escapeRegex).join('|') + ')(?![a-zA-Z0-9])',
  'gi'
);

// ── Certifications ────────────────────────────────────────────────────────────
// NOTE: character classes deliberately exclude '\s' (which also matches
// newlines) in favour of '[ \t-]' — an open-ended [A-Za-z\s]* here would let
// a match run across a line break and swallow the start of the next
// certification into one garbled string.
const CERT_PATTERNS = [
  /\bCPA\b/gi, /\bACCA\b/gi, /\bCFA\b/gi, /\bCFE\b/gi, /\bCIA\b/gi, /\bCPIM\b/gi, /\bCIPS\b/gi,
  /\bCIMA\b/gi, /\bACA\b/gi, /\bICAN\b/gi, /\bSAICA\b/gi, /\bCA\s*\(SA\)/gi,
  /\bCISA\b/gi, /\bCISSP\b/gi, /\bCISM\b/gi,
  /\bCCNA\b/gi, /\bCCNP\b/gi, /\bCCIE\b/gi,
  /\bCompTIA(?:\s+(?:A\+|Network\+|Security\+|Cloud\+|Linux\+))?\b/gi,
  /\bAWS\s+Certified[A-Za-z \t-]{0,40}/gi,
  /\bMicrosoft\s+Certified[A-Za-z \t-]{0,40}/gi,
  /\bGoogle\s+Certified[A-Za-z \t-]{0,40}/gi,
  /\bOracle\s+Certified[A-Za-z \t-]{0,40}/gi,
  /\bAzure\s+(?:Fundamentals|Administrator|Developer|Solutions\s+Architect)[A-Za-z \t]{0,30}/gi,
  /\bSalesforce\s+Certified[A-Za-z \t]{0,30}/gi,
  /\bHubSpot\s+Certified[A-Za-z \t]{0,30}/gi,
  /\bPMP\b/gi, /\bPRINCE2\b/gi, /\bITIL(?:\s+Foundation)?\b/gi,
  /\bSix\s+Sigma(?:\s+(?:Green|Black|Yellow)\s+Belt)?\b/gi,
  /\bScrum\s+Master\b/gi, /\bCSM\b/gi, /\bSAFe\b/gi,
  /\bSHRM-CP\b/gi, /\bSHRM-SCP\b/gi, /\bPHR\b/gi, /\bSPHR\b/gi,
];

// ── Languages ──────────────────────────────────────────────────────────────
const LANGUAGES = [
  'English', 'Swahili', 'Kiswahili', 'French', 'German', 'Arabic', 'Chinese', 'Mandarin',
  'Portuguese', 'Spanish', 'Italian', 'Dutch', 'Russian', 'Hindi', 'Urdu', 'Somali',
  'Amharic', 'Luganda', 'Kinyarwanda', 'Zulu', 'Xhosa', 'Afrikaans', 'Yoruba', 'Igbo',
  'Hausa', 'Turkish', 'Japanese', 'Korean', 'Luo', 'Kikuyu', 'Kalenjin', 'Luhya', 'Twi',
];

/**
 * ============================================================================
 * PART 3 — Contact Information Extraction
 * (extractName / extractEmail / extractPhone / extractLocation /
 *  extractLinkedIn / extractGitHub / extractPortfolio were referenced by
 *  parseCV() but never implemented — completed below.)
 * ============================================================================
 */

// ── Email ──────────────────────────────────────────────────────────────────
const EMAIL_REGEX = /[a-zA-Z0-9][a-zA-Z0-9._%+-]*@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,24}/g;
const BAD_EMAIL_TLDS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp']);

/** Extract & validate the primary email address, ignoring image-filename false positives */
function extractEmail(text) {
  if (!text) return '';
  const candidates = findAll(text, EMAIL_REGEX);
  for (const candidate of candidates) {
    const tld = candidate.split('.').pop().toLowerCase();
    if (!BAD_EMAIL_TLDS.has(tld)) return candidate.toLowerCase();
  }
  return '';
}

// ── Phone — Kenya, Nigeria, South Africa, Ghana, Uganda, Tanzania, Rwanda,
//    generic international, and US/Canada formats ─────────────────────────
const KENYAN_PHONE_REGEX = /(?<![\d+])(?:\+254|254|0)(?:7\d{8}|1\d{8})\b/g;
// Nigeria (+234), South Africa (+27), Ghana (+233), Uganda (+256),
// Tanzania (+255), Rwanda (+250) — country code (with or without leading +)
// followed by 7-10 digits. Guarded on the left so it can't start matching
// mid-way through a digit run that belongs to some other prefix.
const AFRICAN_COUNTRY_CODES = ['234', '27', '233', '256', '255', '250'];
const AFRICAN_PHONE_REGEX = new RegExp(
  `(?<![\\d+])(?:\\+(?:${AFRICAN_COUNTRY_CODES.join('|')})|(?:${AFRICAN_COUNTRY_CODES.join('|')}))\\d{7,10}\\b`,
  'g'
);
const INTL_PHONE_REGEX = /(?<![\d+])\+\d{1,3}[\s.-]?\(?\d{1,4}\)?(?:[\s.-]?\d{2,4}){2,5}/g;
const US_PHONE_REGEX = /(?<!\d)\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g;
// Generic fallback local format used across Africa: a leading 0 followed by
// 9 digits (10 total, e.g. Kenya/Uganda/Tanzania/Rwanda/Ghana/South Africa)
// or 10 digits (11 total, Nigeria's local format).
const GENERIC_LOCAL_PHONE_REGEX = /(?<![\d+])0\d{9,10}\b/g;

function normalizePhone(raw = '') {
  return raw.replace(/[\s().-]/g, '');
}

/** Extract a phone number, trying the most specific pattern first */
function extractPhone(text) {
  if (!text) return '';

  const kenyan = findAll(text, KENYAN_PHONE_REGEX);
  if (kenyan.length) return normalizePhone(kenyan[0]);

  const african = findAll(text, AFRICAN_PHONE_REGEX);
  if (african.length) return normalizePhone(african[0]);

  const intl = findAll(text, INTL_PHONE_REGEX);
  if (intl.length) return normalizePhone(intl[0]);

  const us = findAll(text, US_PHONE_REGEX);
  if (us.length) return normalizePhone(us[0]);

  const generic = findAll(text, GENERIC_LOCAL_PHONE_REGEX);
  if (generic.length) return normalizePhone(generic[0]);

  return '';
}

// ── LinkedIn / GitHub ────────────────────────────────────────────────────────
const LINKEDIN_REGEX = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/[a-zA-Z0-9\-_/%]+/i;
// Bare "linkedin.com/in/username" is already covered above; this also
// catches a standalone "in/username" fragment some CVs use without the domain.
const LINKEDIN_USERNAME_REGEX = /\bin\/[a-zA-Z0-9\-_]{3,}\b/i;
const GITHUB_REGEX = /(?:https?:\/\/)?(?:www\.)?github\.com\/[a-zA-Z0-9\-_/%]+/i;

/** Extract & normalize a LinkedIn profile URL */
function extractLinkedIn(text) {
  if (!text) return '';
  const found = match(text, LINKEDIN_REGEX);
  if (found) return /^https?:\/\//i.test(found) ? found : `https://${found}`;

  const usernameOnly = match(text, LINKEDIN_USERNAME_REGEX);
  if (usernameOnly) return `https://linkedin.com/${usernameOnly}`;

  return '';
}

/** Extract & normalize a GitHub profile URL */
function extractGitHub(text) {
  if (!text) return '';
  const found = match(text, GITHUB_REGEX);
  if (!found) return '';
  return /^https?:\/\//i.test(found) ? found : `https://${found}`;
}

// ── Portfolio ──────────────────────────────────────────────────────────────
const URL_REGEX = /(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s,;]*)?/gi;
const EXCLUDED_PORTFOLIO_DOMAINS = [
  'linkedin.com', 'github.com', 'facebook.com', 'twitter.com', 'x.com', 'instagram.com',
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'wa.me', 'whatsapp.com',
];
const PLAUSIBLE_TLDS = new Set([
  'com', 'org', 'net', 'io', 'dev', 'co', 'me', 'info', 'app', 'tech', 'biz', 'xyz',
  'site', 'online', 'ke', 'ug', 'tz', 'rw', 'ng', 'za', 'gh', 'edu', 'gov', 'ac', 'us', 'uk',
]);
// Common "word.ext" tech terms that parse exactly like a domain but aren't one.
const PORTFOLIO_FALSE_POSITIVES = new Set([
  'node.js', 'vue.js', 'next.js', 'express.js', 'nuxt.js', 'react.js', 'asp.net',
  '.net', 'd3.js', 'three.js', 'chart.js', 'ext.js',
]);

/** Extract a personal portfolio/website URL, ignoring LinkedIn/GitHub/social/email domains */
function extractPortfolio(text) {
  if (!text) return '';

  // Strip real email addresses first — otherwise the local part of an email
  // (e.g. "john.mwangi" from "john.mwangi@gmail.com") parses exactly like a
  // domain name and gets matched as a fake portfolio URL.
  const withoutEmails = text.replace(EMAIL_REGEX, ' ');
  const candidates = findAll(withoutEmails, URL_REGEX);

  for (const url of candidates) {
    if (url.includes('@')) continue;
    const lower = url.toLowerCase();
    if (PORTFOLIO_FALSE_POSITIVES.has(lower)) continue;
    if (EXCLUDED_PORTFOLIO_DOMAINS.some(d => lower.includes(d))) continue;

    const tld = lower.split('/')[0].split('.').pop();
    if (!PLAUSIBLE_TLDS.has(tld)) continue;

    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
  }

  return '';
}

// ── Location ───────────────────────────────────────────────────────────────
const LOCATION_LABEL_REGEX = /(?:location|address|based in|residing in)\s*[:\-]?\s*([A-Za-z\s,]{3,40})/i;
// "City, ST" or "City, Country" — e.g. "San Francisco, CA" / "Nairobi, Kenya"
const CITY_REGION_REGEX = /\b([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)*),\s*([A-Z]{2}\b|[A-Z][a-zA-Z]+)\b/;

const KNOWN_LOCATIONS = [
  // Kenya
  'Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret', 'Thika', 'Malindi', 'Kakamega',
  // Nigeria
  'Lagos', 'Abuja', 'Port Harcourt', 'Ibadan', 'Kano', 'Enugu',
  // South Africa
  'Johannesburg', 'Cape Town', 'Pretoria', 'Durban', 'Bloemfontein',
  // Ghana
  'Accra', 'Kumasi', 'Tamale',
  // Uganda
  'Kampala', 'Entebbe', 'Gulu',
  // Tanzania
  'Dar es Salaam', 'Arusha', 'Dodoma', 'Zanzibar',
  // Rwanda
  'Kigali',
  // Other
  'Addis Ababa', 'Cairo', 'Alexandria',
  'London', 'Manchester', 'Birmingham', 'Edinburgh',
  'New York', 'Los Angeles', 'Chicago', 'Toronto', 'Dubai', 'Abu Dhabi',
  // Countries
  'Kenya', 'Nigeria', 'South Africa', 'Ghana', 'Uganda', 'Tanzania', 'Rwanda',
  'Burundi', 'Ethiopia', 'Egypt', 'Zambia', 'Malawi', 'South Sudan', 'Somalia',
  'United Kingdom', 'United States', 'USA', 'UK', 'Canada', 'UAE',
];

/**
 * Extract city/country location. Ignores company addresses by only
 * scanning the CV's contact block (first few lines) for the fallback
 * "City, Region" heuristic, and by requiring an explicit label or a
 * known place name for anything found elsewhere in the document.
 */
function extractLocation(text) {
  if (!text) return '';

  const labelMatch = text.match(LOCATION_LABEL_REGEX);
  if (labelMatch && labelMatch[1]) {
    const candidate = clean(labelMatch[1]).split(/[\n.]/)[0].trim();
    if (candidate.length >= 3 && candidate.length <= 40) return titleCase(candidate);
  }

  for (const loc of KNOWN_LOCATIONS) {
    const regex = new RegExp(`\\b${escapeRegex(loc)}\\b`, 'i');
    if (regex.test(text)) return loc;
  }

  // Heuristic fallback, scoped to the contact block only (first few lines)
  // so a company's office address further down the CV is never mistaken
  // for the candidate's own location.
  const topLines = getLines(text).slice(0, 6);
  for (const line of topLines) {
    if (line.includes('@') || hasNumber(line)) continue;
    const cityMatch = line.match(CITY_REGION_REGEX);
    if (cityMatch) return clean(`${cityMatch[1]}, ${cityMatch[2]}`);
  }

  return '';
}

// ── Name ───────────────────────────────────────────────────────────────────
const NAME_BLOCKLIST = new Set([
  'curriculum vitae', 'resume', 'cv', 'personal details', 'bio data', 'biodata',
  'profile', 'contact information', 'contact details', 'career objective',
]);

/**
 * Robust name extraction: scans the first few non-empty lines for something
 * that reads like "Firstname Lastname" (2-5 Capitalized or ALL-CAPS words,
 * no digits, no email/URL, not a known heading/blocklisted phrase). Falls
 * back to '' — parseCV() derives a name from the email as a last resort.
 */
function extractName(lines) {
  if (!lines || !lines.length) return '';

  const candidateLines = lines.slice(0, 6);

  for (const line of candidateLines) {
    const lower = line.toLowerCase().replace(/[.,:]/g, '').trim();
    if (NAME_BLOCKLIST.has(lower)) continue;
    if (ALL_SECTION_HEADER_ALIASES.includes(lower)) continue;
    if (line.includes('@')) continue;
    if (hasNumber(line)) continue;
    if (/https?:\/\//i.test(line)) continue;

    const words = compact(line.split(/\s+/));
    if (words.length < 2 || words.length > 5) continue;

    const looksNamey = words.every(w => /^[A-Z][a-zA-Z'.-]*$/.test(w) || (w === w.toUpperCase() && /[A-Z]/.test(w)));
    if (looksNamey) return titleCase(clean(line));
  }

  return '';
}

/** Derive a fallback display name from an email, e.g. "jane.doe23@gmail.com" -> "Jane Doe" */
function nameFromEmail(email = '') {
  if (!email) return '';
  const localPart = email.split('@')[0].replace(/[0-9]+$/g, '');
  const words = localPart.split(/[._-]+/).filter(w => w.length > 1);
  if (!words.length) return '';
  return titleCase(words.join(' '));
}

/**
 * ============================================================================
 * PART 4 — Skills & Keywords
 * ============================================================================
 */

function extractSkills(text) {
  if (!text) return [];

  const found = new Set();
  const matches = text.matchAll(SKILL_MATCH_REGEX);

  for (const m of matches) {
    const canonical = SKILL_ALIASES[m[0].toLowerCase().trim()];
    if (canonical) found.add(canonical);
  }

  return [...found].sort((a, b) => a.localeCompare(b));
}

/** Split a skills array into { technical, soft } */
function splitSkillsByType(skills = []) {
  const softSet = new Set(SKILL_CATEGORIES.softSkills.map(s => s.toLowerCase()));
  const technical = [];
  const soft = [];
  for (const skill of skills) {
    if (softSet.has(skill.toLowerCase())) soft.push(skill);
    else technical.push(skill);
  }
  return { technical, soft };
}

function extractKeywords(text) {
  if (!text) return [];

  const keywords = [];
  keywords.push(...extractSkills(text));

  for (const pattern of CERT_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) keywords.push(...matches.map(m => clean(m)));
  }

  const lower = text.toLowerCase();
  for (const language of LANGUAGES) {
    if (lower.includes(language.toLowerCase())) keywords.push(language);
  }

  return uniqueIgnoreCase(compact(keywords));
}

/**
 * ============================================================================
 * PART 5 — Experience Extraction
 * Handles both the multi-line African-CV layout (Title / Company / Dates /
 * bullets on separate lines) and the single-line US/UK layout
 * ("Title, Company — Jan 2020 - Present"). Each entry also now carries
 * startYear / endYear / currentJob, derived from its duration string.
 * ============================================================================
 */

const MONTHS = 'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|June|July|August|September|October|November|December';
const MONTH_YEAR = `(?:${MONTHS})\\.?\\s*\\d{4}`;
const NUMERIC_DATE = '\\d{1,2}[/\\-.]\\d{4}|\\d{4}[/\\-.]\\d{1,2}';
const DATE_TOKEN = `(?:${MONTH_YEAR}|${NUMERIC_DATE}|\\d{4})`;
const PRESENT_TOKEN = '(?:Present|Current|Now|Ongoing|Till\\s+Date|To\\s+Date|Date)';
const DATE_RANGE_REGEX = new RegExp(
  `(${DATE_TOKEN})\\s*(?:-|–|—|to)\\s*(${DATE_TOKEN}|${PRESENT_TOKEN})`,
  'i'
);

/** Strip stray leading/trailing punctuation (commas, dashes, parens) left behind after pulling a date or delimiter out of a line */
function stripEdgePunct(s = '') {
  return clean(s).replace(/^[\s\-–—(|,]+/, '').replace(/[\s\-–—(|,]+$/, '');
}

/** Split a "Title, Company" / "Title at Company" / "Title - Company" fragment into its two parts */
function splitTitleCompany(fragment = '') {
  const delimiters = [' at ', ' @ ', ' — ', ' – ', ' - ', '|', ','];

  for (const delim of delimiters) {
    if (fragment.includes(delim)) {
      const idx = fragment.indexOf(delim);
      const title = stripEdgePunct(fragment.slice(0, idx));
      const company = stripEdgePunct(fragment.slice(idx + delim.length));
      if (title && company) return { title, company };
    }
  }

  return { title: stripEdgePunct(fragment), company: '' };
}

/** Heuristic: does this line look like a job title (short, mostly Capitalized, not a description sentence)? */
function looksLikeJobTitleLine(line = '') {
  if (!line || line.length > 70) return false;
  if (/[.]\s*$/.test(line)) return false;
  if (/^[•\-*]/.test(line)) return false;

  const words = compact(line.split(/\s+/));
  if (!words.length || words.length > 8) return false;

  const capRatio = words.filter(w => /^[A-Z]/.test(w)).length / words.length;
  return capRatio >= 0.5;
}

/** Derive startYear / endYear / currentJob from a free-text duration string */
function deriveDatesFromDuration(duration = '') {
  const years = duration.match(/\b(19|20)\d{2}\b/g) || [];
  const currentJob = /present|current|now|ongoing|till\s+date|to\s+date/i.test(duration);
  const startYear = years[0] || '';
  const endYear = currentJob ? 'Present' : (years[1] || years[0] || '');
  return { startYear, endYear, currentJob };
}

function extractExperience(text) {
  if (!text) return [];

  const lines = getLines(text);
  const experience = [];

  let currentSection = false;
  let currentJob = null;

  for (const line of lines) {
    const lower = line.toLowerCase();

    if (SECTION_HEADERS.experience.includes(lower.replace(':', ''))) {
      currentSection = true;
      continue;
    }

    if (currentSection && isSectionHeader(line)) break;
    if (!currentSection) continue;

    const dateMatch = line.match(DATE_RANGE_REGEX);

    if (dateMatch) {
      // A date completes the job already in progress (title/company found
      // first, on its own line) rather than always starting a new one.
      if (currentJob && !currentJob.duration && !currentJob.description) {
        currentJob.duration = dateMatch[0].trim();
        continue;
      }

      if (currentJob) experience.push(currentJob);

      const before = clean(line.slice(0, dateMatch.index));
      const after = clean(line.slice(dateMatch.index + dateMatch[0].length).replace(/^[)\]|,-]+/, ''));
      const remainder = clean(`${before} ${after}`);

      currentJob = { title: '', company: '', duration: dateMatch[0].trim(), description: '' };

      if (remainder) {
        const { title, company } = splitTitleCompany(remainder);
        currentJob.title = title;
        currentJob.company = company;
      }
      continue;
    }

    if (!currentJob) {
      const { title, company } = splitTitleCompany(line);
      if (title) currentJob = { title, company, duration: '', description: '' };
      continue;
    }

    if (!currentJob.title) {
      const { title, company } = splitTitleCompany(line);
      currentJob.title = title;
      if (company) currentJob.company = company;
      continue;
    }

    if (!currentJob.company) {
      currentJob.company = line.trim();
      continue;
    }

    // A new title line arriving once the current job already has a
    // duration is very likely the start of the NEXT role.
    if (currentJob.duration && looksLikeJobTitleLine(line)) {
      experience.push(currentJob);
      const { title, company } = splitTitleCompany(line);
      currentJob = { title, company, duration: '', description: '' };
      continue;
    }

    currentJob.description += line.replace(/^[•\-*]\s*/, '') + ' ';
  }

  if (currentJob) experience.push(currentJob);

  return experience
    .filter(job => job.title || job.company || job.duration)
    .map(job => {
      const duration = clean(job.duration);
      const { startYear, endYear, currentJob: isCurrent } = deriveDatesFromDuration(duration);
      return {
        title: clean(job.title),
        company: clean(job.company),
        duration,
        description: clean(job.description),
        startYear,
        endYear,
        currentJob: isCurrent,
      };
    });
}

/**
 * ============================================================================
 * PART 6 — Education Extraction
 * Supports African, UK, US and European formats, including degree +
 * institution + year all on one line, and now also extracts an academic
 * grade/classification where present (First Class, 2:1, GPA 3.8, etc.).
 * ============================================================================
 */

const DEGREE_KEYWORDS = [
  'bachelor', 'master', 'phd', 'doctor', 'diploma', 'certificate', 'degree',
  'bsc', 'b.sc', 'msc', 'm.sc', 'ba', 'b.a', 'ma', 'm.a', 'bcom', 'b.com', 'bed', 'b.ed',
  'llb', 'll.b', 'mba', 'associate', 'higher diploma', 'higher national diploma', 'hnd',
  'postgraduate', 'undergraduate', 'certificate in', 'advanced diploma',
];

const INSTITUTION_KEYWORDS = ['university', 'college', 'school', 'institute', 'polytechnic', 'academy'];

const GRADE_REGEX = /\b(First Class(?: Honours)?|Second Class(?: Upper| Lower)?(?: Honours)?|Upper Second|Lower Second|Distinction|Merit|Credit|Pass|1:1|2:1|2:2|3:1|GPA[:\s]*\d(?:\.\d{1,2})?(?:\/\d(?:\.\d)?)?|\d(?:\.\d{1,2})\/\d(?:\.\d)?)\b/i;

function extractEducation(text) {
  if (!text) return [];

  const lines = getLines(text);
  const education = [];

  let currentSection = false;
  let currentEducation = null;

  const yearRegex = /\b(19|20)\d{2}\b/;

  for (const line of lines) {
    const lower = line.toLowerCase();

    if (SECTION_HEADERS.education.includes(lower.replace(':', ''))) {
      currentSection = true;
      continue;
    }

    if (currentSection && isSectionHeader(line)) break;
    if (!currentSection) continue;

    if (DEGREE_KEYWORDS.some(k => lower.includes(k))) {
      if (currentEducation) education.push(currentEducation);

      currentEducation = { degree: line.trim(), institution: '', year: '', grade: '' };

      // Same-line institution (e.g. "BSc Computer Science, University of Nairobi, 2018")
      if (INSTITUTION_KEYWORDS.some(k => lower.includes(k))) {
        const parts = line.split(',').map(clean);
        const institutionPart = parts.find(p => INSTITUTION_KEYWORDS.some(k => p.toLowerCase().includes(k)));
        if (institutionPart) currentEducation.institution = institutionPart;
      }

      const sameLineYear = line.match(yearRegex);
      if (sameLineYear) currentEducation.year = sameLineYear[0];

      const sameLineGrade = line.match(GRADE_REGEX);
      if (sameLineGrade) currentEducation.grade = sameLineGrade[0];

      continue;
    }

    if (!currentEducation) continue;

    if (!currentEducation.institution && INSTITUTION_KEYWORDS.some(k => lower.includes(k))) {
      currentEducation.institution = line.trim();
      continue;
    }

    if (!currentEducation.year) {
      const yearMatch = line.match(yearRegex);
      if (yearMatch) currentEducation.year = yearMatch[0];
    }

    if (!currentEducation.grade) {
      const gradeMatch = line.match(GRADE_REGEX);
      if (gradeMatch) currentEducation.grade = gradeMatch[0];
    }
  }

  if (currentEducation) education.push(currentEducation);

  return education.map(edu => ({
    degree: clean(edu.degree),
    institution: clean(edu.institution),
    year: clean(edu.year),
    graduationYear: clean(edu.year),
    grade: clean(edu.grade),
  }));
}

/**
 * ============================================================================
 * PART 7 — Certifications & Languages
 * ============================================================================
 */

function extractCertifications(text) {
  if (!text) return [];

  const certifications = [];
  for (const pattern of CERT_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) certifications.push(...matches.map(m => clean(m)));
  }

  return uniqueIgnoreCase(certifications).sort();
}

function extractLanguages(text) {
  if (!text) return [];

  const lower = text.toLowerCase();
  const found = [];

  for (const language of LANGUAGES) {
    const regex = new RegExp(`\\b${escapeRegex(language.toLowerCase())}\\b`);
    if (regex.test(lower)) found.push(language);
  }

  return uniqueIgnoreCase(found).sort();
}

/**
 * ============================================================================
 * PART 7B — Projects, Awards, Publications, Volunteer Work, References
 * (all new — these sections weren't parsed at all before, only detected as
 * section-boundary markers)
 * ============================================================================
 */

/**
 * Like extractSection(), but preserves blank lines and returns an array of
 * raw (trimmed-per-line, blanks kept as '') lines rather than one joined
 * string — needed so block-structured sections (projects, awards,
 * publications) can tell entries apart by blank-line/bullet boundaries.
 */
function getRawLinesBetweenHeaders(text, headerKey) {
  const rawLines = normalizeText(text).split('\n');
  const aliases = SECTION_HEADERS[headerKey] || [];
  let start = -1;

  for (let i = 0; i < rawLines.length; i++) {
    const key = rawLines[i].trim().toLowerCase().replace(/:$/, '').trim();
    if (aliases.includes(key)) { start = i; break; }
  }
  if (start === -1) return [];

  let end = rawLines.length;
  for (let j = start + 1; j < rawLines.length; j++) {
    const trimmed = rawLines[j].trim();
    if (trimmed && isSectionHeader(trimmed)) { end = j; break; }
  }

  return rawLines.slice(start + 1, end);
}

/** Split raw lines into blocks separated by blank lines */
function splitIntoBlocksByBlankLine(rawLines) {
  const blocks = [];
  let current = [];
  for (const line of rawLines) {
    if (!line.trim()) {
      if (current.length) { blocks.push(current); current = []; }
      continue;
    }
    current.push(line.trim());
  }
  if (current.length) blocks.push(current);
  return blocks;
}

/** Fallback block splitter for sections with no blank lines: each bullet starts a new entry */
function splitIntoBlocksByBullet(rawLines) {
  const blocks = [];
  let current = [];
  for (const raw of rawLines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^[•\-*]/.test(line) && current.length) {
      blocks.push(current);
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current);
  return blocks;
}

function splitIntoEntryBlocks(rawLines) {
  const byBlank = splitIntoBlocksByBlankLine(rawLines);
  if (byBlank.length > 1) return byBlank;
  return splitIntoBlocksByBullet(rawLines);
}

/**
 * Projects: name, technologies used (parsed from a "Tech:"/"Stack:" line if
 * present, else detected against the skill database), and description.
 */
function extractProjects(text) {
  const rawLines = getRawLinesBetweenHeaders(text, 'projects');
  if (!rawLines.length) return [];

  const blocks = splitIntoEntryBlocks(rawLines);

  return blocks
    .map(blockLines => {
      const name = clean(blockLines[0].replace(/^[•\-*]\s*/, ''));
      const restLines = blockLines.slice(1);

      let technologies = [];
      const descriptionLines = [];

      for (const line of restLines) {
        // Only treat a line as the tech list if the WHOLE line is a
        // "Tech:"/"Stack:"/"Tools:" declaration — matching this loosely
        // against the joined block text let it swallow the description
        // that followed on the next line.
        const techMatch = line.match(/^(?:tech(?:nologies)?|stack|tools)\s*[:\-]\s*(.+)$/i);
        if (techMatch) {
          technologies = compact(techMatch[1].split(/[,;]/).map(clean));
        } else {
          descriptionLines.push(line);
        }
      }

      const description = clean(descriptionLines.join(' '));
      if (!technologies.length) technologies = extractSkills(description);

      return { name, technologies, description };
    })
    .filter(p => p.name);
}

/** Awards / honors: title, issuer (if stated), year (if stated) */
function extractAwards(text) {
  const rawLines = getRawLinesBetweenHeaders(text, 'awards');
  const lines = compact(rawLines.map(l => clean(l.trim().replace(/^[•\-*]\s*/, ''))));

  return lines
    .map(line => {
      const yearMatch = line.match(/\b(19|20)\d{2}\b/);
      const year = yearMatch ? yearMatch[0] : '';

      let title = line;
      let issuer = '';
      const delimMatch = line.match(/^(.*?)\s*[-–—]\s*(.*)$/);
      if (delimMatch && delimMatch[1] && delimMatch[2]) {
        title = delimMatch[1];
        issuer = delimMatch[2];
      }

      title = clean(title.replace(/\(?\b(19|20)\d{2}\b\)?/, ''));
      issuer = clean(issuer.replace(/\(?\b(19|20)\d{2}\b\)?/, ''));

      return { title: stripEdgePunct(title), issuer: stripEdgePunct(issuer), year };
    })
    .filter(a => a.title);
}

/** Publications: title, publisher/journal (if stated), year (if stated) */
function extractPublications(text) {
  const rawLines = getRawLinesBetweenHeaders(text, 'publications');
  const lines = compact(rawLines.map(l => clean(l.trim().replace(/^[•\-*]\s*/, ''))));

  return lines
    .map(line => {
      const yearMatch = line.match(/\b(19|20)\d{2}\b/);
      const year = yearMatch ? yearMatch[0] : '';
      const withoutYear = clean(line.replace(/\(?\b(19|20)\d{2}\b\)?/, ''));
      const parts = withoutYear.split(',');
      const title = stripEdgePunct(parts[0] || withoutYear);
      const publisher = stripEdgePunct(parts.slice(1).join(','));
      return { title, publisher, year };
    })
    .filter(p => p.title);
}

/**
 * Volunteer work: same shape as work experience (title/company/duration/
 * description/startYear/endYear/currentJob) — reuses the already
 * battle-tested experience parser by feeding it the volunteer section's
 * raw text under a synthetic "Experience" header, rather than
 * re-implementing the same multi-line/single-line parsing logic twice.
 */
function extractVolunteerWork(text) {
  const rawLines = getRawLinesBetweenHeaders(text, 'volunteer');
  if (!rawLines.length) return [];
  return extractExperience(`Experience\n${rawLines.join('\n')}`);
}

/**
 * References: either structured referee entries (name, title, company,
 * email, phone) or, very commonly, just a line like "References available
 * upon request" — in which case there's nothing to structure, so an empty
 * array is returned (the presence of the section itself is still reflected
 * via findMissingSections).
 */
function extractReferences(text) {
  const rawLines = getRawLinesBetweenHeaders(text, 'references');
  const lines = compact(rawLines.map(l => clean(l.trim().replace(/^[•\-*]\s*/, ''))));
  if (!lines.length) return [];

  if (lines.length === 1 && /available\s+(upon|on)\s+request|provided\s+(upon|on)\s+request/i.test(lines[0])) {
    return [];
  }

  return lines
    .map(line => {
      const email = extractEmail(line);
      const phone = extractPhone(line);
      const withoutContact = clean(line.replace(email, '').replace(phone, ''));
      const parts = compact(withoutContact.split(',').map(clean));
      return {
        name: parts[0] || '',
        title: parts[1] || '',
        company: parts[2] || '',
        email,
        phone,
      };
    })
    .filter(r => r.name);
}

/**
 * ============================================================================
 * PART 8 — Scoring, Summary, Preferred Role, Missing Sections
 * ============================================================================
 */

/** Basic 0-100 completeness score (name/email/phone/skills/experience/education/summary/linkedin) */
function calculateProfileScore(profile) {
  let score = 0;
  if (profile.name) score += 10;
  if (profile.email) score += 10;
  if (profile.phone) score += 10;
  if ((profile.skills || []).length >= 5) score += 20;
  if ((profile.experience || []).length) score += 20;
  if ((profile.education || []).length) score += 15;
  if (profile.summary) score += 10;
  if (profile.linkedin) score += 5;

  // Small bonus for optional-but-valuable sections
  const extras = [profile.projects, profile.awards, profile.publications, profile.volunteerWork]
    .filter(arr => (arr || []).length).length;
  score += extras * 2;

  return Math.min(score, 100);
}

/** Total years of experience — sums each job's own start/end span (handles overlapping/multiple concurrent roles reasonably) */
function calculateExperienceYears(experience = []) {
  let totalYears = 0;

  for (const job of experience) {
    if (!job.duration) continue;

    const years = job.duration.match(/\d{4}/g);
    if (!years) continue;

    if (years.length >= 2) {
      const start = parseInt(years[0], 10);
      const end = /present|current|now|ongoing|till\s+date|to\s+date/i.test(job.duration) ? new Date().getFullYear() : parseInt(years[1], 10);
      if (!isNaN(start) && !isNaN(end) && end >= start) totalYears += end - start;
    } else if (years.length === 1) {
      const start = parseInt(years[0], 10);
      if (!isNaN(start)) totalYears += new Date().getFullYear() - start;
    }
  }

  return Math.max(0, totalYears);
}

/** Generate a professional summary without AI, from whatever was actually extracted */
function generateSummary(profile = {}) {
  const years = calculateExperienceYears(profile.experience || []);
  const latestRole = profile.experience?.[0]?.title || 'professional';
  const degree = profile.education?.[0]?.degree || '';
  const skills = (profile.skills || []).slice(0, 6).join(', ');

  let summary = '';

  if (years > 0) {
    summary += `Experienced ${latestRole} with over ${years} years of professional experience.`;
  } else {
    summary += `Motivated ${latestRole} with practical industry knowledge.`;
  }

  if (degree) summary += ` Holds ${degree}.`;
  if (skills.length) summary += ` Skilled in ${skills}.`;

  summary += ' Committed to delivering high-quality results while working effectively both independently and within teams.';

  return summary.trim();
}

/** Infer the candidate's preferred/likely next role from their latest job or degree */
function detectPreferredRole(profile = {}) {
  if (profile.experience && profile.experience.length) {
    return profile.experience[0].title;
  }

  if (profile.education && profile.education.length) {
    const degree = (profile.education[0].degree || '').toLowerCase();
    if (degree.includes('computer')) return 'Software Developer';
    if (degree.includes('information')) return 'IT Specialist';
    if (degree.includes('business')) return 'Business Analyst';
    if (degree.includes('account')) return 'Accountant';
    if (degree.includes('marketing')) return 'Marketing Officer';
    if (degree.includes('human resource')) return 'HR Officer';
    if (degree.includes('engineering')) return 'Engineer';
  }

  return '';
}

/** ATS-parseability score — distinct from the general completeness score above */
function calculateATSScore(profile = {}) {
  let score = 0;
  if (profile.name) score += 10;
  if (profile.email) score += 10;
  if (profile.phone) score += 10;
  if (profile.location) score += 5;
  if (profile.summary && profile.summary.length > 50) score += 15;
  if ((profile.skills || []).length >= 5) score += 15;
  if ((profile.experience || []).length) score += 15;
  if ((profile.education || []).length) score += 10;
  if ((profile.certifications || []).length) score += 5;
  if ((profile.languages || []).length) score += 5;

  // Keyword density — more matched skills/keywords generally means better
  // ATS keyword-matching against job descriptions.
  if ((profile.keywords || []).length >= 15) score += 5;

  // Small bonus for optional-but-valuable sections
  const extras = [profile.projects, profile.awards, profile.publications, profile.volunteerWork]
    .filter(arr => (arr || []).length).length;
  score += extras * 2;

  return Math.min(score, 100);
}

/** List of human-readable missing sections, for profile-completion prompts */
function findMissingSections(profile = {}) {
  const missing = [];
  if (!profile.email) missing.push('Email address');
  if (!profile.phone) missing.push('Phone number');
  if (!profile.location) missing.push('Location');
  if (!profile.summary) missing.push('Professional summary');
  if (!(profile.skills || []).length) missing.push('Skills');
  if (!(profile.experience || []).length) missing.push('Work experience');
  if (!(profile.education || []).length) missing.push('Education');
  if (!(profile.languages || []).length) missing.push('Languages');
  if (!(profile.certifications || []).length) missing.push('Certifications');
  return missing;
}

/** Convert a numeric score into a human-readable rating */
function getResumeRating(score) {
  if (score >= 90) return 'Excellent';
  if (score >= 75) return 'Very Good';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Fair';
  return 'Needs Improvement';
}

/**
 * ============================================================================
 * PART 9 — Main Parser
 * ============================================================================
 */

function emptyProfile() {
  return {
    name: '', email: '', phone: '', location: '', linkedin: '', github: '', portfolio: '',
    summary: '', skills: [], technicalSkills: [], softSkills: [], keywords: [],
    experience: [], education: [], certifications: [], languages: [],
    projects: [], awards: [], publications: [], volunteerWork: [], references: [],
    yearsExperience: 0, preferredRole: '',
    atsScore: 0, profileScore: 0, missingSections: [
      'Email address', 'Phone number', 'Location', 'Professional summary', 'Skills',
      'Work experience', 'Education', 'Languages', 'Certifications',
    ],
    resumeRating: 'Needs Improvement',
  };
}

/**
 * Parse raw CV text (from a PDF, DOCX, or OCR pass) into a structured
 * profile. Never throws — malformed/empty/garbage input always returns a
 * valid, empty-but-well-shaped profile instead of crashing the caller.
 */
function parseCV(cvText) {
  try {
    if (!cvText || typeof cvText !== 'string' || !isValidCv(cvText)) {
      return emptyProfile();
    }

    cvText = normalizeText(cvText);
    const lines = getLines(cvText);

    let name = extractName(lines);
    const email = extractEmail(cvText);
    if (!name && email) name = nameFromEmail(email);

    const skills = extractSkills(cvText);
    const { technical: technicalSkills, soft: softSkills } = splitSkillsByType(skills);

    const profile = {
      name,
      email,
      phone: extractPhone(cvText),
      location: extractLocation(cvText),
      linkedin: extractLinkedIn(cvText),
      github: extractGitHub(cvText),
      portfolio: extractPortfolio(cvText),
      skills,
      technicalSkills,
      softSkills,
      keywords: extractKeywords(cvText),
      experience: extractExperience(cvText),
      education: extractEducation(cvText),
      certifications: extractCertifications(cvText),
      languages: extractLanguages(cvText),
      projects: extractProjects(cvText),
      awards: extractAwards(cvText),
      publications: extractPublications(cvText),
      volunteerWork: extractVolunteerWork(cvText),
      references: extractReferences(cvText),
    };

    profile.summary = generateSummary(profile);
    profile.yearsExperience = calculateExperienceYears(profile.experience);
    profile.preferredRole = detectPreferredRole(profile);
    profile.atsScore = calculateATSScore(profile);
    profile.profileScore = calculateProfileScore(profile);
    profile.missingSections = findMissingSections(profile);
    profile.resumeRating = getResumeRating(profile.profileScore);

    return profile;

  } catch (err) {
    console.error('cvParser: unexpected error while parsing CV:', err.message);
    return emptyProfile();
  }
}

/**
 * ============================================================================
 * EXPORTS
 * ============================================================================
 */

module.exports = {
  parseCV,

  // Contact extraction
  extractName,
  extractEmail,
  extractPhone,
  extractLocation,
  extractLinkedIn,
  extractGitHub,
  extractPortfolio,

  // Section extraction
  extractSkills,
  extractKeywords,
  extractExperience,
  extractEducation,
  extractCertifications,
  extractLanguages,
  extractProjects,
  extractAwards,
  extractPublications,
  extractVolunteerWork,
  extractReferences,
  splitSkillsByType,

  // Scoring / summary / recommendations
  calculateProfileScore,
  calculateExperienceYears,
  generateSummary,
  detectPreferredRole,
  calculateATSScore,
  findMissingSections,
  getResumeRating,

  // Low-level helpers (exported for testing / reuse)
  isSectionHeader,
  isValidCv,
}; 