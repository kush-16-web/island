const Astronomy = require('astronomy-engine');

/**
 * Weather Astronomical Calculations Engine (powered by Astronomy Engine - JPL DE405 / VSOP87).
 * Provides continuous solar elevation, twilight transitions, and scientifically accurate lunar phase/illumination.
 */

/**
 * Standard atmospheric twilight thresholds (degrees of solar elevation):
 * - Daylight: alpha > 0° (or > -0.833° accounting for refraction and solar radius)
 * - Civil Twilight: 0° to -6°
 * - Nautical Twilight: -6° to -12°
 * - Astronomical Twilight: -12° to -18°
 * - Astronomical Night: alpha <= -18°
 */
function getTwilightPhase(solarElevationDeg) {
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

/**
 * Compute 8 standard lunar phases from ecliptic longitude difference (0° to 360°).
 */
function getLunarPhaseDetails(phaseDegrees, fractionIlluminated) {
  const deg = (phaseDegrees + 360) % 360;
  let phaseIndex = 0;
  let phaseName = 'New Moon';

  // 8 octants with tolerance on primary quarters
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

/**
 * Calculate complete astronomical metrics for an observer location at a specific UTC Date.
 * @param {number} lat - Latitude in degrees
 * @param {number} lon - Longitude in degrees
 * @param {Date} date - UTC Date
 * @param {string} [timeZone] - Optional IANA timezone string (e.g. "Asia/Kolkata")
 */
function calculateAstroMetrics(lat, lon, date = new Date(), timeZone = 'UTC') {
  const obs = new Astronomy.Observer(lat, lon, 0);

  // 1. Solar Elevation & Azimuth
  const sunEq = Astronomy.Equator('Sun', date, obs, true, true);
  const sunHor = Astronomy.Horizon(date, obs, sunEq.ra, sunEq.dec, 'normal');
  const solarElevation = Math.round(sunHor.altitude * 100) / 100;
  const solarAzimuth = Math.round(sunHor.azimuth * 100) / 100;

  // Real atmospheric refraction threshold: -0.833°
  const isDay = solarElevation > -0.833;
  const twilightPhase = getTwilightPhase(solarElevation);

  // 2. Sunrise & Sunset for the current observer day
  let sunriseIso = null;
  let sunsetIso = null;
  try {
    const riseResult = Astronomy.SearchRiseSet('Sun', obs, +1, date, 1);
    const setResult = Astronomy.SearchRiseSet('Sun', obs, -1, date, 1);
    if (riseResult && riseResult.date) sunriseIso = riseResult.date.toISOString();
    if (setResult && setResult.date) sunsetIso = setResult.date.toISOString();
  } catch (err) {
    // Non-fatal edge case (e.g. polar day/night)
  }

  // 3. Lunar Position, Phase, and Illumination
  const moonEq = Astronomy.Equator('Moon', date, obs, true, true);
  const moonHor = Astronomy.Horizon(date, obs, moonEq.ra, moonEq.dec, 'normal');
  const moonAltitude = Math.round(moonHor.altitude * 100) / 100;
  const moonAzimuth = Math.round(moonHor.azimuth * 100) / 100;
  const isMoonUp = moonAltitude > -0.5;

  const phaseDeg = Astronomy.MoonPhase(date);
  const moonIllum = Astronomy.Illumination('Moon', date);
  const lunarDetails = getLunarPhaseDetails(phaseDeg, moonIllum.phase_fraction);

  // Calculate tilt angle of the illuminated limb towards the Sun in observer horizontal frame
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

/**
 * Calculate solar elevation and isDay for an individual hourly forecast point.
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {number} unixTimestampSec - Epoch seconds
 */
function getHourlySolarDetails(lat, lon, unixTimestampSec) {
  const d = new Date(unixTimestampSec * 1000);
  const obs = new Astronomy.Observer(lat, lon, 0);
  const sunEq = Astronomy.Equator('Sun', d, obs, true, true);
  const sunHor = Astronomy.Horizon(d, obs, sunEq.ra, sunEq.dec, 'normal');
  const solarElevation = Math.round(sunHor.altitude * 100) / 100;
  return {
    solarElevation,
    isDay: solarElevation > -0.833,
    twilightPhase: getTwilightPhase(solarElevation),
  };
}

module.exports = {
  calculateAstroMetrics,
  getHourlySolarDetails,
  getTwilightPhase,
  getLunarPhaseDetails,
};
