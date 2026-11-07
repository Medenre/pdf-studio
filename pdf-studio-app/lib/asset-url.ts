// Vite replaces BASE_URL for both the regular application and the static build.
// A project Pages site serves assets from /repository/, rather than the domain root.
export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
}
