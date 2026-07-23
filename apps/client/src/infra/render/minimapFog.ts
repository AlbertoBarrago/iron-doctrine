export function minimapTerrainColor(visibility: number, blocked: boolean): string {
  if (visibility === 0) return '#000000';
  if (visibility === 1) return blocked ? '#252a23' : '#2d3827';
  return blocked ? '#444b40' : '#526447';
}
