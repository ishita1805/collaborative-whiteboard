/**
 * Generate a random hex color string.
 */
export function randomColor(): string {
  const color = Math.floor(Math.random() * 16777215).toString(16);
  return '#' + color.padStart(6, '0');
}

/**
 * Generate initials from a name string (max 2 characters).
 */
export function getInitials(name: string): string {
  const parts = name.split(' ');
  let initials = '';
  parts.forEach((part, index) => {
    if (index < 2 && part[0]) {
      initials += part[0].toUpperCase();
    }
  });
  return initials || 'P';
}
