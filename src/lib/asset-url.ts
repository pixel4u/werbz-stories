export function getAssetUrl(assetId: string): string {
  return `/api/assets/${encodeURIComponent(assetId)}`;
}
