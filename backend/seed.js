// seed.js — Run once to add sample jobs for testing
// Usage: node seed.js
require('dotenv').config();
const getDb = require('./db/connection');

const db = getDb();

const jobs = [
  {
    title: 'Executive Assistant to CEO',
    company: 'Safaricom PLC',
    location: 'Nairobi, Kenya',
    remote: 0,
    description: 'We are looking for a highly organised Executive Assistant to support our CEO. The ideal candidate has excellent communication skills, strong administrative background, and experience managing calendars, travel, and correspondence.',
    requirements: 'Minimum 3 years experience as Executive Assistant. Proficiency in Microsoft Office Suite. Excellent written and verbal communication. Experience with calendar management and travel coordination.',
    salary: 'KES 80,000 - 120,000',
    apply_email: 'careers@safaricom.co.ke',
    source: 'seed',
  },
  {
    title: 'Sales Coordinator',
    company: 'KCB Group',
    location: 'Nairobi, Kenya',
    remote: 0,
    description: 'KCB Group is seeking a Sales Coordinator to support our retail banking division. You will coordinate sales activities, manage client relationships, and support the sales team in achieving targets.',
    requirements: 'Bachelor degree in Business or related field. 2+ years sales experience. Strong interpersonal skills. CRM experience preferred.',
    salary: 'KES 60,000 - 90,000',
    apply_email: 'hr@kcbgroup.com',
    source: 'seed',
  },
  {
    title: 'Virtual Assistant',
    company: 'Andela',
    location: 'Remote',
    remote: 1,
    description: 'Andela is hiring a Virtual Assistant to support our distributed team. Responsibilities include scheduling, email management, research, data entry, and project coordination.',
    requirements: 'Excellent English communication. 2+ years VA experience. Proficiency in Google Workspace and Slack. Reliable internet connection. Organised and self-motivated.',
    salary: 'USD 800 - 1,200/month',
    apply_email: 'talent@andela.com',
    source: 'seed',
  },
  {
    title: 'Customer Service Representative',
    company: "Africa's Talking",
    location: 'Nairobi, Kenya',
    remote: 0,
    description: "Join Africa's Talking customer support team. Handle inbound queries from developers and businesses using our API platform. Provide technical and account support via email, chat, and phone.",
    requirements: 'Excellent communication skills. Tech-savvy with ability to learn APIs quickly. Patient and solution-oriented. Previous customer service experience required.',
    salary: 'KES 50,000 - 70,000',
    apply_email: 'jobs@africastalking.com',
    source: 'seed',
  },
  {
    title: 'Administrative Officer',
    company: 'UNDP Kenya',
    location: 'Nairobi, Kenya',
    remote: 0,
    description: 'UNDP Kenya seeks an Administrative Officer to manage day-to-day office operations, procurement, HR coordination, and support programme delivery.',
    requirements: 'University degree in Business Administration or related. 3+ years administrative experience. Knowledge of UN systems preferred. Excellent organisational skills.',
    salary: 'KES 100,000 - 150,000',
    apply_email: 'jobs@ke.undp.org',
    source: 'seed',
  },
  {
    title: 'Remote Sales Representative',
    company: 'Doulas by Bay',
    location: 'Remote',
    remote: 1,
    description: 'We are looking for a motivated remote sales representative to expand our client base across East Africa. You will handle inbound leads, conduct demos, and close deals.',
    requirements: 'Proven sales track record. Excellent phone and email communication. Self-motivated and target-driven. Familiarity with CRM tools.',
    salary: 'USD 600 base + commission',
    apply_email: 'work@doulasbybay.com',
    source: 'seed',
  },
  {
    title: 'Operations Coordinator',
    company: 'Twiga Foods',
    location: 'Nairobi, Kenya',
    remote: 0,
    description: 'Twiga Foods is hiring an Operations Coordinator to support supply chain and logistics operations. You will track orders, coordinate with vendors, and ensure on-time delivery.',
    requirements: '2+ years operations or logistics experience. Strong Excel skills. Excellent attention to detail. Experience in FMCG or agri-business preferred.',
    salary: 'KES 65,000 - 85,000',
    apply_email: 'talent@twigafoods.com',
    source: 'seed',
  },
  {
    title: 'Personal Assistant',
    company: 'Equity Bank',
    location: 'Nairobi, Kenya',
    remote: 0,
    description: 'Equity Bank seeks a Personal Assistant for a senior executive. You will manage schedules, handle correspondence, prepare presentations, and coordinate meetings.',
    requirements: 'Diploma or degree in Secretarial Studies or Business. 3+ years PA experience. Excellent MS Office skills. Discreet and professional.',
    salary: 'KES 70,000 - 100,000',
    apply_email: 'careers@equitybank.co.ke',
    source: 'seed',
  },
  {
    title: 'Customer Success Manager',
    company: 'M-KOPA Solar',
    location: 'Nairobi, Kenya',
    remote: 0,
    description: 'M-KOPA is looking for a Customer Success Manager to manage relationships with our growing customer base, handle escalations, and drive retention.',
    requirements: '3+ years customer success or account management. Strong communication and problem-solving skills. Experience with CRM software. Passion for impact-driven work.',
    salary: 'KES 90,000 - 130,000',
    apply_email: 'hr@m-kopa.com',
    source: 'seed',
  },
  {
    title: 'Executive Assistant (Remote)',
    company: 'Toptal',
    location: 'Remote',
    remote: 1,
    description: 'Toptal is hiring a remote Executive Assistant to support senior leadership across time zones. Responsibilities include scheduling, travel booking, inbox management, and document preparation.',
    requirements: '4+ years EA experience. Exceptional English. Experience supporting C-level executives. Available for EST/EAT overlap hours. Highly proactive and organised.',
    salary: 'USD 1,500 - 2,500/month',
    apply_email: 'ea-jobs@toptal.com',
    source: 'seed',
  },
];

// Insert jobs
const insert = db.prepare(`
  INSERT OR IGNORE INTO jobs
    (title, company, location, remote, description, requirements, salary, apply_email, source)
  VALUES
    (@title, @company, @location, @remote, @description, @requirements, @salary, @apply_email, @source)
`);

let count = 0;
const insertAll = db.transaction((jobs) => {
  for (const job of jobs) {
    insert.run(job);
    count++;
  }
});

insertAll(jobs);
console.log(`✅ Seeded ${count} jobs into the database`);
console.log(`Total jobs in DB: ${db.prepare('SELECT COUNT(*) as c FROM jobs').get().c}`);