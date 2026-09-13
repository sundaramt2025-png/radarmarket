/**
 * RadarMarket - Complex Spatial Proximity & Value Index Algorithm (DSP-VI)
 * 
 * Computes geodesic distance, bearing angle, multi-factor ranking,
 * signal strength (RSSI), and spatial cluster jitter for radar visualization.
 */

const EARTH_RADIUS_METERS = 6371000; // Mean Earth radius

/**
 * Degrees to Radians
 */
function toRad(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * Radians to Degrees
 */
function toDeg(radians) {
  return (radians * 180) / Math.PI;
}

/**
 * Haversine Formula: calculates great-circle distance between two GPS coordinates in meters
 */
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 0;
  if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) return 0;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Calculate forward azimuth / bearing in degrees (0 = North, 90 = East, 180 = South, 270 = West)
 */
function calculateBearingDegrees(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 0;
  if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) return 0;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaLambda = toRad(lon2 - lon1);

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  let brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
}

/**
 * Format meters into human-readable distance (e.g., "350 m" or "1.4 km")
 */
function formatDistance(meters) {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
}

/**
 * Estimate walking time based on distance (standard walking speed ~80 meters / min)
 */
function estimateWalkingTime(meters) {
  if (meters < 70) {
    return "< 1 min walk";
  }
  const mins = Math.max(1, Math.round(meters / 80));
  if (mins === 1) return "~1 min walk";
  if (mins < 60) return `~${mins} min walk`;
  const hours = (mins / 60).toFixed(1);
  return `~${hours} hr walk`;
}

/**
 * Categorize distance into visual proximity tier
 */
function calculateProximityTier(meters) {
  if (meters <= 150) {
    return { tier: "immediate", label: "Immediate (< 2 min)", colorClass: "text-emerald-400", bgClass: "bg-emerald-950/80 border-emerald-500/40" };
  }
  if (meters <= 500) {
    return { tier: "near", label: "Campus Quad (~5 min)", colorClass: "text-cyan-400", bgClass: "bg-cyan-950/80 border-cyan-500/40" };
  }
  if (meters <= 1200) {
    return { tier: "mid", label: "Vicinity (~10-15 min)", colorClass: "text-amber-400", bgClass: "bg-amber-950/80 border-amber-500/40" };
  }
  return { tier: "far", label: "Outer Zone (> 15 min)", colorClass: "text-slate-400", bgClass: "bg-slate-900 border-slate-700" };
}

/**
 * Multi-Factor DSP-VI Algorithm (Dynamic Spatial Proximity & Value Index)
 * Evaluates an item relative to user position, max scan radius, and search filters.
 */
function evaluateItemAlgorithm(item, userLocation, maxRadiusMeters, searchQuery = "") {
  // 1. Distance & Bearing
  const distance = calculateDistanceMeters(
    userLocation.lat,
    userLocation.lng,
    item.lat,
    item.lng
  );
  const bearing = calculateBearingDegrees(
    userLocation.lat,
    userLocation.lng,
    item.lat,
    item.lng
  );

  // 2. Proximity Factor (Exponential Distance Decay: S_prox in [0, 100])
  const normalizedDistanceRatio = Math.min(1.0, distance / Math.max(100, maxRadiusMeters));
  // Lambda decay factor: lambda = 1.6
  const proximityScore = Math.max(0, 100 * Math.exp(-1.6 * normalizedDistanceRatio));

  // 3. Value Index Factor (S_value in [0, 100])
  // Evaluates discount ratio adjusted by item condition rating
  const originalPrice = Math.max(item.price, item.originalPrice || item.price * 1.5);
  const discountRatio = Math.max(0, (originalPrice - item.price) / originalPrice);
  const conditionMultiplier = item.conditionScore || (
    item.condition === "Like New" ? 0.95 :
    item.condition === "Good" ? 0.85 : 0.70
  );
  const valueScore = Math.min(100, Math.max(15, (discountRatio * 85 + 15) * conditionMultiplier * 1.15));

  // 4. Seller Trust Factor (S_trust in [0, 100])
  const ratingNorm = (item.seller?.rating || 4.0) / 5.0; // 0 to 1
  let verifiedBonus = 0;
  if (item.seller?.campus_verified) {
    verifiedBonus = 30; // Verified Campus Student (.edu / .ac.in) Trust Bonus
  } else if (item.seller?.verified) {
    verifiedBonus = 20; // Verified Google Account Bonus
  }
  // Verified In-Person Handshake Trade Bonus (+5 per completed trade, up to +25)
  const handshakeTradeBonus = Math.min(25, (item.seller?.completed_trades || item.seller?.trades_completed || 0) * 5);
  const trustScore = Math.min(100, ratingNorm * 75 + verifiedBonus + handshakeTradeBonus);

  // 5. Freshness / Urgency Decay (S_fresh in [0, 100])
  // 7-day half life
  const ageHours = Math.max(0, (Date.now() - (item.createdAt || Date.now())) / 3600000);
  const halfLifeHours = 168; // 7 days
  const freshnessScore = 100 * Math.pow(0.5, ageHours / halfLifeHours);

  // 6. Keyword & Search Resonance
  let queryMultiplier = 1.0;
  let matchesQuery = true;

  if (searchQuery && searchQuery.trim() !== "") {
    const q = searchQuery.toLowerCase().trim();
    const searchableText = [
      item.title,
      item.category,
      item.subCategory,
      item.condition,
      item.landmark,
      ...(item.tags || [])
    ].join(" ").toLowerCase();

    if (searchableText.includes(q)) {
      queryMultiplier = 1.25; // Search hit booster
      matchesQuery = true;
    } else {
      queryMultiplier = 0.2; // Diminished relevance
      matchesQuery = false;
    }
  }

  // 7. Weighted Composite Score
  // Prox: 40%, Value: 30%, Trust: 20%, Freshness: 10%
  const rawComposite =
    proximityScore * 0.40 +
    valueScore * 0.30 +
    trustScore * 0.20 +
    freshnessScore * 0.10;

  const finalAlgorithmScore = Math.min(100, Math.round(rawComposite * queryMultiplier));

  // Signal Strength / RSSI (-95 dBm to -35 dBm)
  const rssi = Math.round(-95 + (finalAlgorithmScore / 100) * 60);

  // Signal Tier Classification
  let signalClass = "GAMMA";
  let signalBadgeColor = "text-yellow-400";
  if (finalAlgorithmScore >= 80) {
    signalClass = "ALPHA (Prime)";
    signalBadgeColor = "text-emerald-400";
  } else if (finalAlgorithmScore >= 60) {
    signalClass = "BETA (Strong)";
    signalBadgeColor = "text-cyan-400";
  } else if (finalAlgorithmScore >= 40) {
    signalClass = "GAMMA (Standard)";
    signalBadgeColor = "text-amber-400";
  } else {
    signalClass = "DELTA (Faint)";
    signalBadgeColor = "text-rose-400";
  }

  return {
    item,
    distance,
    distanceFormatted: formatDistance(distance),
    walkingTime: estimateWalkingTime(distance),
    proximityTier: calculateProximityTier(distance),
    bearing,
    bearingFormatted: `${Math.round(bearing)}°`,
    inRadarRange: distance <= maxRadiusMeters,
    algorithmScore: finalAlgorithmScore,
    rssi,
    signalClass,
    signalBadgeColor,
    matchesQuery,
    breakdown: {
      proximityScore: Math.round(proximityScore),
      valueScore: Math.round(valueScore),
      trustScore: Math.round(trustScore),
      freshnessScore: Math.round(freshnessScore),
      discountPct: Math.round(discountRatio * 100)
    }
  };
}

/**
 * Anti-Collision Cluster Solver
 * If multiple items have coordinates within a tight radius (< 40m),
 * applies a deterministic radial dispersion jitter so their radar blips don't overlap.
 */
function applyRadarClusterSolver(evaluatedList) {
  const result = [...evaluatedList];
  const thresholdMeters = 40;

  for (let i = 0; i < result.length; i++) {
    let clusterIndex = 0;
    for (let j = 0; j < i; j++) {
      const d = Math.abs(result[i].distance - result[j].distance);
      const angleDiff = Math.abs(result[i].bearing - result[j].bearing);
      if (d < thresholdMeters && (angleDiff < 8 || angleDiff > 352)) {
        clusterIndex++;
      }
    }
    if (clusterIndex > 0) {
      // Deterministic offset: disperse slightly in angle and distance
      const sign = clusterIndex % 2 === 0 ? 1 : -1;
      result[i].radarBearingOffset = sign * (clusterIndex * 4.5);
      result[i].radarDistanceOffset = (clusterIndex * 15);
    } else {
      result[i].radarBearingOffset = 0;
      result[i].radarDistanceOffset = 0;
    }
  }

  return result;
}

window.RadarAlgorithm = {
  calculateDistanceMeters,
  calculateBearingDegrees,
  formatDistance,
  estimateWalkingTime,
  calculateProximityTier,
  evaluateItemAlgorithm,
  applyRadarClusterSolver
};
