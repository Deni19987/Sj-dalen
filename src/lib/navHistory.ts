// Föregående sida i appen. Uppdateras av routern vid varje sidbyte (se router.tsx).
let previousPath: string | null = null;
let currentPath: string | null = null;

export function recordNavigation(pathname: string) {
  if (pathname === currentPath) return;
  previousPath = currentPath;
  currentPath = pathname;
}

/**
 * Sidan man kom från till `pathname`. Sidan ritas upp innan sidbytet registreras,
 * så om `pathname` inte registrerats än är det den nuvarande som är "föregående".
 */
export const getPreviousPath = (pathname: string) => (pathname === currentPath ? previousPath : currentPath);
