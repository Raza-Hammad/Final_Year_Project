/** Window event used to open the tour modal from anywhere without prop-drilling. */
export const OPEN_TOUR_EVENT = 'open-tour';

/** Ask the app shell to open the tour modal (Login CTA, sidebar button, ...). */
export function openTour(): void {
  window.dispatchEvent(new Event(OPEN_TOUR_EVENT));
}
