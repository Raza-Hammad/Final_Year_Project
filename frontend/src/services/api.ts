/**
 * ===============================================================================
 * STUDENT EXPLANATORY GUIDE: api.ts
 * ===============================================================================
 * WHAT THIS FILE IS FOR:
 * ----------------------
 * This file configures the Centralized Axios HTTP Client for sending requests from
 * the React frontend to the FastAPI backend.
 * 
 * KEY FUNCTIONALITIES:
 * --------------------
 * 1. `axios.create()`: Establishes base API instance.
 * 2. Request Interceptor: Automatically attaches the logged-in user's JWT bearer token (`Authorization: Bearer <token>`) to every outgoing HTTP request.
 * 3. Response Interceptor: Catches HTTP `401 Unauthorized` responses and automatically boots expired sessions to the `/login` page.
 * 
 * LIBRARIES & TOOLS USED:
 * -----------------------
 * - `axios`: Promise-based HTTP client for browser requests.
 * ===============================================================================
 */

import axios from 'axios';

const api = axios.create({
  baseURL: '', // Uses relative path to hit Vite dev proxy
});

// Inject Authorization header from localStorage on every request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Intercept 401 responses to force redirect to login page
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      console.warn('Unauthorized request detected. Booting session to login page.');
      localStorage.removeItem('token');
      // Redirect to login page
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
