export function minimapTerrainColor(visibility: number, blocked: boolean): string {
  if (visibility === 0) return '#000000';
  return blocked ? '#444b40' : '#526447';
}
