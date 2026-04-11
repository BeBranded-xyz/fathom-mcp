export function getBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_URL;
  if (!url) {
    throw new Error('NEXT_PUBLIC_URL environment variable is required');
  }
  return url.replace(/\/$/, '');
}
