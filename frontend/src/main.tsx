/**
 * ===============================================================================
 * STUDENT EXPLANATORY GUIDE: main.tsx
 * ===============================================================================
 * WHAT THIS FILE IS FOR:
 * ----------------------
 * This is the Client-Side Bootstrap Entry Point for our React application.
 * It mounts the top-level React component tree (<App />) directly into the HTML DOM container (<div id="root">).
 * 
 * KEY FUNCTIONALITIES:
 * --------------------
 * 1. Imports global CSS styles (`index.css` & `tokens.css`).
 * 2. Uses React 18 `createRoot` to render `<App />` inside React's `StrictMode` runtime wrapper.
 * 
 * LIBRARIES & TOOLS USED:
 * -----------------------
 * - `react`: Core React library & StrictMode wrapper.
 * - `react-dom/client`: Modern React 18 root rendering API.
 * ===============================================================================
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
