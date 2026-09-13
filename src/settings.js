export function pitchInput(keys, touchPitch = 0, sensitivity = 1, invertY = true) {
  const up = keys.has('KeyW') || keys.has('ArrowUp');
  const down = keys.has('KeyS') || keys.has('ArrowDown');
  return ((Number(up) - Number(down)) + touchPitch) * sensitivity * (invertY ? -1 : 1) || 0;
}

// NOAA's approximate solar elevation: https://gml.noaa.gov/grad/solcalc/solareqns.PDF
export function localDayPeriod(date, latitude, longitude) {
  const radians = Math.PI / 180;
  const day = (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86400000;
  const hour = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const daysInYear = (Date.UTC(date.getUTCFullYear() + 1, 0, 1) - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86400000;
  const yearAngle = 2 * Math.PI / daysInYear * (day - 1 + (hour - 12) / 24);
  const equation = 229.18 * (0.000075 + 0.001868 * Math.cos(yearAngle)
    - 0.032077 * Math.sin(yearAngle) - 0.014615 * Math.cos(2 * yearAngle)
    - 0.040849 * Math.sin(2 * yearAngle));
  const declination = 0.006918 - 0.399912 * Math.cos(yearAngle) + 0.070257 * Math.sin(yearAngle)
    - 0.006758 * Math.cos(2 * yearAngle) + 0.000907 * Math.sin(2 * yearAngle)
    - 0.002697 * Math.cos(3 * yearAngle) + 0.00148 * Math.sin(3 * yearAngle);
  const angle = (hour * 60 + equation + 4 * longitude) / 4 - 180;
  const sineElevation = Math.sin(latitude * radians) * Math.sin(declination)
    + Math.cos(latitude * radians) * Math.cos(declination) * Math.cos(angle * radians);
  return sineElevation >= Math.sin(-0.833 * radians) ? 'day' : 'night';
}
