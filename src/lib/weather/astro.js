import * as Astronomy from 'astronomy-engine';

/**
 * Standard atmospheric twilight thresholds (degrees of solar elevation):
 * - Daylight: alpha > 0° (or > -0.833° accounting for refraction and solar radius)
 * - Civil Twilight: 0° to -6°
 * - Nautical Twilight: -6° to -12°
 * - Astronomical Twilight: -12° to -18°
 * - Astronomical Night: alpha <= -18°
 */
export function getTwilightPhase(solarElevationDeg) {
  if (solarElevationDeg > 0) {
    return solarElevationDeg <= 6 ? 'golden_hour' : 'daylight';
  }
  if (solarElevationDeg > -6) {
    return 'civil_twilight';
  }
  if (solarElevationDeg > -12) {
    return 'nautical_twilight';
  }
  if (solarElevationDeg > -18) {
    return 'astronomical_twilight';
  }
  return 'astronomical_night';
}

export function getLunarPhaseDetails(phaseDegrees, fractionIlluminated) {
  const deg = (phaseDegrees + 360) % 360;
  let phaseIndex = 0;
  let phaseName = 'New Moon';

  if (deg < 6 || deg >= 354) {
    phaseIndex = 0;
    phaseName = 'New Moon';
  } else if (deg < 84) {
    phaseIndex = 1;
    phaseName = 'Waxing Crescent';
  } else if (deg <= 96) {
    phaseIndex = 2;
    phaseName = 'First Quarter';
  } else if (deg < 174) {
    phaseIndex = 3;
    phaseName = 'Waxing Gibbous';
  } else if (deg <= 186) {
    phaseIndex = 4;
    phaseName = 'Full Moon';
  } else if (deg < 264) {
    phaseIndex = 5;
    phaseName = 'Waning Gibbous';
  } else if (deg <= 276) {
    phaseIndex = 6;
    phaseName = 'Last Quarter';
  } else {
    phaseIndex = 7;
    phaseName = 'Waning Crescent';
  }

  const waxing = deg < 180;

  return {
    phaseIndex,
    phaseName,
    phaseDegrees: Math.round(deg * 100) / 100,
    fractionIlluminated: Math.round(fractionIlluminated * 1000) / 1000,
    illuminationPercent: Math.round(fractionIlluminated * 100),
    waxing,
  };
}

export function calculateAstroMetrics(lat, lon, date = new Date()) {
  const obs = new Astronomy.Observer(lat, lon, 0);

  const sunEq = Astronomy.Equator('Sun', date, obs, true, true);
  const sunHor = Astronomy.Horizon(date, obs, sunEq.ra, sunEq.dec, 'normal');
  const solarElevation = Math.round(sunHor.altitude * 100) / 100;
  const solarAzimuth = Math.round(sunHor.azimuth * 100) / 100;

  const isDay = solarElevation > -0.833;
  const twilightPhase = getTwilightPhase(solarElevation);

  let sunriseIso = null;
  let sunsetIso = null;
  try {
    const riseResult = Astronomy.SearchRiseSet('Sun', obs, +1, date, 1);
    const setResult = Astronomy.SearchRiseSet('Sun', obs, -1, date, 1);
    if (riseResult && riseResult.date) sunriseIso = riseResult.date.toISOString();
    if (setResult && setResult.date) sunsetIso = setResult.date.toISOString();
  } catch (err) {
    // Non-fatal edge cases
  }

  const moonEq = Astronomy.Equator('Moon', date, obs, true, true);
  const moonHor = Astronomy.Horizon(date, obs, moonEq.ra, moonEq.dec, 'normal');
  const moonAltitude = Math.round(moonHor.altitude * 100) / 100;
  const moonAzimuth = Math.round(moonHor.azimuth * 100) / 100;
  const isMoonUp = moonAltitude > -0.5;

  const phaseDeg = Astronomy.MoonPhase(date);
  const moonIllum = Astronomy.Illumination('Moon', date);
  const lunarDetails = getLunarPhaseDetails(phaseDeg, moonIllum.phase_fraction);

  let tiltAngle = 0;
  const dAz = (sunHor.azimuth - moonHor.azimuth) * (Math.PI / 180);
  const dAlt = (sunHor.altitude - moonHor.altitude) * (Math.PI / 180);
  tiltAngle = Math.round(Math.atan2(dAlt, dAz) * (180 / Math.PI));

  return {
    solarElevation,
    solarAzimuth,
    isDay,
    twilightPhase,
    sunrise: sunriseIso,
    sunset: sunsetIso,
    lunar: {
      ...lunarDetails,
      altitude: moonAltitude,
      azimuth: moonAzimuth,
      isMoonUp,
      tiltAngle,
      magnitude: Math.round(moonIllum.mag * 10) / 10,
    },
  };
}
