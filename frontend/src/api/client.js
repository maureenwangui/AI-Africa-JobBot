// src/api/client.js
import axios from 'axios';

const API = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '/api',
  timeout: 30000,
});

// Attach JWT token automatically
API.interceptors.request.use(config => {
  const token = localStorage.getItem('jobbot_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally
API.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('jobbot_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ─── Auth ────────────────────────────────────────────────────────────────────
export const register = (data) => API.post('/auth/register', data);
export const login = (data) => API.post('/auth/login', data);
export const getMe = () => API.get('/auth/me');
export const forgotPassword = (email) => API.post('/auth/forgot-password', { email });
export const resetPassword = (data) => API.post('/auth/reset-password', data);

// ─── Profile ─────────────────────────────────────────────────────────────────
export const getProfile = () => API.get('/profile');
export const updateProfile = (data) => API.put('/profile', data);
export const uploadCV = (file) => {
  const form = new FormData();
  form.append('cv', file);
  return API.post('/profile/upload-cv', form, { headers: { 'Content-Type': 'multipart/form-data' } });
};

// ─── Jobs ─────────────────────────────────────────────────────────────────────
export const getJobs = (params) => API.get('/jobs', { params });
export const getMatchedJobs = () => API.get('/jobs/matches');
export const getJob = (id) => API.get(`/jobs/${id}`);

// ─── Applications ────────────────────────────────────────────────────────────
export const getApplications = () => API.get('/applications');
export const getApplicationStats = () => API.get('/applications/stats');
export const submitApplication = (data) => API.post('/applications', data);
export const updateApplicationStatus = (id, status) => API.patch(`/applications/${id}/status`, { status });

// ─── AI ──────────────────────────────────────────────────────────────────────
export const generateCoverLetter = (job_id) => API.post('/ai/generate-cover-letter', { job_id });
export const autoApply = (job_ids) => API.post('/ai/auto-apply', { job_ids });

// ─── Subscription ────────────────────────────────────────────────────────────
export const getPlans = () => API.get('/subscription/plans');
export const createSubscription = (plan, billing_cycle) => API.post('/subscription/create', { plan, billing_cycle });
export const verifySubscription = (subscription_id) => API.post('/subscription/verify', { subscription_id });
export const cancelSubscription = () => API.post('/subscription/cancel');
export const getSubscriptionStatus = () => API.get('/subscription/status');

// ─── Dashboard ───────────────────────────────────────────────────────────────
export const getDashboard = () => API.get('/dashboard');

// ─── Notifications ───────────────────────────────────────────────────────────
export const getNotifications = () => API.get('/notifications');
export const markAllRead = () => API.patch('/notifications/read-all');

// ─── Admin ───────────────────────────────────────────────────────────────────
export const adminGetUsers = () => API.get('/admin/users');
export const adminGetStats = () => API.get('/admin/stats');
export const adminGetApplications = () => API.get('/admin/applications');
export const adminGetJobs = () => API.get('/admin/jobs');