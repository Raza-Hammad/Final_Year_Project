/**
 * Shared dashboard API for split pages (Phase 3).
 * Pages consume this instead of prop-drilling the former monolith state.
 */
import { createContext, useContext } from 'react';
import type { DashboardApi } from './dashboardApi';

export const DashboardContext = createContext<DashboardApi | null>(null);

export function useDashboard(): DashboardApi {
  const ctx = useContext(DashboardContext);
  if (!ctx) {
    throw new Error('useDashboard must be used within DashboardLayout');
  }
  return ctx;
}
