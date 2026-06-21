// test-api.js — Quick API smoke test
// Usage: node test-api.js
// Make sure server is running on port 5000 first

const http = require('http');

const BASE = 'http://localhost:5000';
let token = '';
let userId = '';
let jobId = '';
let passed = 0;
let failed = 0;

async function req(method, path, body, authToken) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'localhost',
      port: 5000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const reqHttp = http.request(options, (res) => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    reqHttp.on('error', reject);
    if (data) reqHttp.write(data);
    reqHttp.end();
  });
}

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label} ${detail}`);
    failed++;
  }
}

async function run() {
  console.log('\n🧪 Africa JobBot API Test Suite\n');
  console.log('━'.repeat(40));

  // Health
  console.log('\n📡 Health Check');
  const health = await req('GET', '/health');
  check('GET /health → 200', health.status === 200);
  check('Returns service name', health.body.service === 'Africa JobBot API');

  // Register
  console.log('\n👤 Auth: Register');
  const testEmail = `test_${Date.now()}@jobbot.test`;
  const reg = await req('POST', '/api/auth/register', { email: testEmail, password: 'testpass123', name: 'Test User', phone: '+254700000000' });
  check('POST /api/auth/register → 201', reg.status === 201, JSON.stringify(reg.body));
  check('Returns JWT token', !!reg.body.token);
  check('Returns user object', !!reg.body.user);
  if (reg.body.token) token = reg.body.token;
  if (reg.body.user) userId = reg.body.user.id;

  // Duplicate register
  const dup = await req('POST', '/api/auth/register', { email: testEmail, password: 'testpass123' });
  check('Duplicate email → 409', dup.status === 409);

  // Login
  console.log('\n🔐 Auth: Login');
  const login = await req('POST', '/api/auth/login', { email: testEmail, password: 'testpass123' });
  check('POST /api/auth/login → 200', login.status === 200, JSON.stringify(login.body));
  check('Returns JWT token', !!login.body.token);
  if (login.body.token) token = login.body.token;

  // Wrong password
  const badLogin = await req('POST', '/api/auth/login', { email: testEmail, password: 'wrongpass' });
  check('Wrong password → 401', badLogin.status === 401);

  // Me
  console.log('\n🙋 Auth: Get Me');
  const me = await req('GET', '/api/auth/me', null, token);
  check('GET /api/auth/me → 200', me.status === 200);
  check('Returns email', me.body.email === testEmail);

  // Unauthenticated
  const unauth = await req('GET', '/api/auth/me');
  check('No token → 401', unauth.status === 401);

  // Profile
  console.log('\n📋 Profile');
  const profile = await req('GET', '/api/profile', null, token);
  check('GET /api/profile → 200', profile.status === 200);

  const updateProfile = await req('PUT', '/api/profile', {
    skills: ['Customer Service', 'Sales', 'Administration', 'Microsoft Office'],
    preferred_roles: ['Executive Assistant', 'Sales Coordinator'],
    preferred_location: 'Nairobi, Kenya',
    remote_preference: true,
    keywords: ['assistant', 'coordinator', 'admin', 'sales'],
    experience: [{ title: 'Executive Assistant', company: 'Test Corp', duration: '2020-2024' }],
    education: [{ degree: 'Bachelor of Business', institution: 'University of Nairobi', year: '2019' }],
    summary: 'Experienced Executive Assistant with 4 years in corporate environment.',
  }, token);
  check('PUT /api/profile → 200', updateProfile.status === 200);

  // Jobs
  console.log('\n💼 Jobs');
  const jobs = await req('GET', '/api/jobs', null, token);
  check('GET /api/jobs → 200', jobs.status === 200);
  check('Returns array', Array.isArray(jobs.body));
  if (jobs.body.length > 0) jobId = jobs.body[0].id;
  console.log(`     Found ${jobs.body.length} jobs in database`);

  // Job matches
  const matches = await req('GET', '/api/jobs/matches', null, token);
  check('GET /api/jobs/matches → 200', matches.status === 200);
  check('Returns array', Array.isArray(matches.body));
  console.log(`     Found ${matches.body.length} matched jobs`);

  // Dashboard
  console.log('\n📊 Dashboard');
  const dash = await req('GET', '/api/dashboard', null, token);
  check('GET /api/dashboard → 200', dash.status === 200);
  check('Has stats object', !!dash.body.stats);
  check('Has usage object', !!dash.body.usage);
  check('Has plan', !!dash.body.plan);

  // Applications
  console.log('\n📤 Applications');
  const apps = await req('GET', '/api/applications', null, token);
  check('GET /api/applications → 200', apps.status === 200);

  if (jobId) {
    const apply = await req('POST', '/api/applications', { job_id: jobId, cover_letter: 'Test cover letter' }, token);
    check('POST /api/applications → 201', apply.status === 201, JSON.stringify(apply.body));

    // Duplicate application
    const dup2 = await req('POST', '/api/applications', { job_id: jobId }, token);
    check('Duplicate application → 409', dup2.status === 409);
  }

  // Subscription
  console.log('\n💳 Subscription');
  const subStatus = await req('GET', '/api/subscription/status', null, token);
  check('GET /api/subscription/status → 200', subStatus.status === 200);

  // Plans
  const plans = await req('GET', '/api/subscription/plans');
  check('GET /api/subscription/plans → 200', plans.status === 200);
  check('Has monthly plans', !!plans.body.monthly);

  // Notifications
  console.log('\n🔔 Notifications');
  const notifs = await req('GET', '/api/notifications', null, token);
  check('GET /api/notifications → 200', notifs.status === 200);

  // Summary
  console.log('\n' + '━'.repeat(40));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
  if (failed === 0) {
    console.log('🎉 All tests passed! Your API is working correctly.\n');
  } else {
    console.log(`⚠️  ${failed} test(s) failed. Check the errors above.\n`);
  }
}

run().catch(err => {
  console.error('❌ Test runner failed:', err.message);
  console.error('Make sure the server is running: node server.js');
});