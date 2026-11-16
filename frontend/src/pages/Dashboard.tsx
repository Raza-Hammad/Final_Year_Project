/**
 * Compatibility re-export — the monolith was split in Phase 3.
 * Prefer routing through App.tsx → DashboardLayout + page modules.
 */
export { default, DashboardLayout as Dashboard } from '../dashboard/DashboardLayout';
