/** Page index counter for auto-naming new pages */
let PAGE_INDEX = 1;

export function getPageIndex(): number {
  return PAGE_INDEX;
}

export function setPageIndex(val: number): void {
  PAGE_INDEX = val;
}

export function incrementPageIndex(): number {
  PAGE_INDEX += 1;
  return PAGE_INDEX;
}

/** Minimum zoom level (10%) to maintain readability on small screens */
export const MIN_ZOOM = 0.1;

/** Maximum zoom level (100%) to prevent excessive zoom on sparse content */
export const MAX_ZOOM = 1;
