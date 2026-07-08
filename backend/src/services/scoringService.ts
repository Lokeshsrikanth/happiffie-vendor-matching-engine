import { PrismaClient } from '@prisma/client';
import { generateEmbeddings } from './llmService';

const prisma = new PrismaClient();

/**
 * Computes cosine similarity between two vector arrays of equal length.
 */
export function computeCosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}


// Interface representing the inputs to the scoring service
export interface MatchRequirementInput {
  requirementId: string;
  category: string; // decorator, caterer, venue, photographer
  city: string;
  eventDate: Date;
  budget: number;
  theme: string;
  latitude: number;
  longitude: number;
}

// Interface representing the scoring weights config
export interface ScoreWeights {
  capability: number;  // w_cap
  distance: number;    // w_geo
  budget: number;      // w_budget
  rating: number;      // w_rating
  responseTime: number;// w_resp
  acceptance: number;  // w_acc
  conversion: number;  // w_conv
}

// Default Weights that sum up to 1.0
export const DEFAULT_WEIGHTS: ScoreWeights = {
  capability: 0.15,
  distance: 0.15,
  budget: 0.20,
  rating: 0.15,
  responseTime: 0.15,
  acceptance: 0.10,
  conversion: 0.10,
};

/**
 * Calculates the great-circle distance between two points on the Earth's surface
 * using the Haversine formula. Returns distance in kilometers (km).
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * CORE MATCHING AND SCORING FUNCTION
 * Performs hard filtering first (Phase 1), then computes a weighted ranking score (Phase 2)
 * for all qualifying vendors.
 */
export async function matchAndRankVendors(
  input: MatchRequirementInput,
  weights: ScoreWeights = DEFAULT_WEIGHTS
) {
  const {
    requirementId,
    category,
    city,
    eventDate,
    budget,
    theme,
    latitude: reqLat,
    longitude: reqLng,
  } = input;

  console.log(`[ScoringService] Starting matching run for Requirement: ${requirementId}`);
  console.log(`[ScoringService] Criteria - Cat: ${category}, City: ${city}, Date: ${eventDate.toISOString().split('T')[0]}, Budget: ₹${budget}`);

  // Fetch all vendor pgvector embeddings using raw query to bypass Prisma client limitations
  const embeddingsList = await prisma.$queryRaw<any[]>`
    SELECT vendor_id, embedding::text FROM vendor_profiles
  `;
  const embeddingMap = new Map<string, number[]>();
  for (const item of embeddingsList) {
    if (item.embedding) {
      try {
        const arr = JSON.parse(item.embedding);
        if (Array.isArray(arr) && arr.length === 384) {
          embeddingMap.set(item.vendor_id, arr);
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }
  }

  // Generate real semantic embedding for the request theme (via Hugging Face API or offline fallback)
  const themeEmbedding = await generateEmbeddings(theme || '');


  // ==========================================
  // PHASE 1: DETERMINISTIC HARD FILTERS
  // ==========================================
  
  // 1. Filter by category, operating city, status, and get vendor profiles & service areas
  const candidateVendors = await prisma.vendor.findMany({
    where: {
      category: category.toLowerCase(),
      operatingCity: {
        equals: city,
        mode: 'insensitive',
      },
      status: 'active',
    },
    include: {
      profile: true,
      serviceAreas: true,
      calendar: {
        where: {
          blockedDate: eventDate,
        },
      },
    },
  });

  console.log(`[ScoringService] Found ${candidateVendors.length} base active vendors in ${city} for category ${category}.`);

  const filteredCandidates = [];

  for (const vendor of candidateVendors) {
    // A. Check Availability Calendar (Hard filter out if vendor has blocked the date)
    if (vendor.calendar.length > 0) {
      console.log(`[ScoringService] [Hard Filter] Vendor "${vendor.businessName}" excluded: Date ${eventDate.toISOString().split('T')[0]} is blocked.`);
      continue;
    }

    // B. Check Budget Floor (Hard filter out if client budget is below vendor's absolute minimum floor)
    const profile = vendor.profile;
    if (!profile) {
      console.log(`[ScoringService] [Hard Filter] Vendor "${vendor.businessName}" excluded: Missing vendor profile.`);
      continue;
    }

    if (budget < profile.budgetFloor) {
      console.log(`[ScoringService] [Hard Filter] Vendor "${vendor.businessName}" excluded: Client budget ₹${budget} is below floor ₹${profile.budgetFloor}.`);
      continue;
    }

    // C. Check Service Area Radius
    const distance = calculateHaversineDistance(reqLat, reqLng, vendor.baseLat, vendor.baseLng);
    
    // Find service area record for this vendor. Default to 25km if none found.
    const serviceArea = vendor.serviceAreas.find(sa => sa.city.toLowerCase() === city.toLowerCase());
    const serviceRadius = serviceArea ? serviceArea.radiusKm : 25;

    if (distance > serviceRadius) {
      console.log(`[ScoringService] [Hard Filter] Vendor "${vendor.businessName}" excluded: Distance (${distance.toFixed(1)}km) exceeds service radius (${serviceRadius}km).`);
      continue;
    }

    // Vendor passes all Phase 1 checks! Add to candidates.
    filteredCandidates.push({ vendor, profile, distance });
  }

  console.log(`[ScoringService] Phase 1 complete. ${filteredCandidates.length} / ${candidateVendors.length} vendors passed hard filters.`);

  // ==========================================
  // PHASE 2: WEIGHTED SCORING & RANKING
  // ==========================================
  const rankedMatches = filteredCandidates.map(({ vendor, profile, distance }) => {
    // -------------------------------------------------------------
    // COLD-START MECHANISM
    // -------------------------------------------------------------
    // New vendors lack statistics. We impute system benchmarks
    // and apply a direct rank boost to help them acquire early clients.
    // -------------------------------------------------------------
    const isColdStart = profile.isColdStart;
    
    // Imputed stats for cold start
    const ratingsVal = isColdStart ? 4.2 : profile.ratingsAvg;
    const responseTimeVal = isColdStart ? 30 : profile.responseTimeAvgMins;
    const acceptanceVal = isColdStart ? 85.0 : profile.acceptanceRate;
    const conversionVal = isColdStart ? 10.0 : profile.overallConversionRate;

    // 1. Capability/Theme Fit Score (S_cap) - Phase 2 Embeddings Cosine Similarity
    // Calculates semantic overlap between client's plain text requirements and vendor portfolio vectors.
    let s_cap = 70.0; // Benchmark fallback score if no themes or specialties match
    const vendorEmbedding = embeddingMap.get(vendor.id);

    if (theme && vendorEmbedding && themeEmbedding) {
      const similarity = computeCosineSimilarity(themeEmbedding, vendorEmbedding);
      // Cosine similarity for typical text lies in [0, 1]. Map [0.0, 0.7] to [40, 100] for dynamic range.
      const normalizedSimilarity = Math.max(0, similarity);
      s_cap = 40 + (normalizedSimilarity * 60);
      s_cap = Math.min(100, Math.max(0, s_cap));
    } else if (theme && profile.specialties.length > 0) {
      // Keyword matching fallback if database vector coordinates are empty
      const themeKeywords = theme
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(word => word.length > 3);

      if (themeKeywords.length > 0) {
        const matchesCount = profile.specialties.filter(specialty =>
          themeKeywords.some(keyword => keyword.includes(specialty.toLowerCase()) || specialty.toLowerCase().includes(keyword))
        ).length;
        
        s_cap = themeKeywords.length > 0 
          ? (matchesCount / profile.specialties.length) * 100 
          : 70.0;
        
        s_cap = 50 + (s_cap * 0.5);
      }
    }

    // 2. Geographic Distance Decay Score (S_geo)
    // Score decays exponentially with distance. Decay parameter lambda = 0.05.
    const lambda = 0.05;
    const s_geo = 100 * Math.exp(-lambda * distance);

    // 3. Budget Alignment Score (S_budget)
    // Penalty scales linearly if the customer's budget is outside the vendor's primary ceiling.
    let s_budget = 100.0;
    const F = profile.budgetFloor;
    const C = profile.budgetCeiling;

    if (budget >= F && budget <= C) {
      // High alignment within preferred budget band
      // Compute score based on where the budget falls in the vendor's range
      const range = C - F || 1;
      s_budget = 100 - 30 * ((budget - F) / range);
    } else if (budget > C) {
      // Underpriced: Client budget is much higher than vendor's usual ceiling.
      // Vendor gets matches, but a slight penalty since they might be "too budget-friendly" for luxury demands
      const pctOver = (budget - C) / C;
      s_budget = Math.max(50, 100 - 15 * pctOver);
    }

    // 4. Rating Score (S_rating)
    // Out of 5.0 stars, normalized to a 100-point scale.
    const s_rating = (ratingsVal / 5.0) * 100;

    // 5. Response Time Score (S_resp)
    // 0-15 mins = 100 points, 15-120 mins decays linearly, >120 mins = 30 points.
    let s_resp = 30.0;
    if (responseTimeVal <= 15) {
      s_resp = 100.0;
    } else if (responseTimeVal <= 120) {
      s_resp = 100 - ((responseTimeVal - 15) / 1.05); // 120 mins results in 0, offsetted by baseline
      s_resp = Math.max(30, s_resp);
    }

    // 6. Acceptance Rate Score (S_acc)
    // Directly maps to vendor profile acceptance percentage.
    const s_acc = acceptanceVal;

    // 7. Conversion Rate Score (S_conv)
    // Conversion rate is normalized. Standard platform conversion tops at 40%.
    const s_conv = Math.min(100, conversionVal * 2.5);

    // Calculate final weighted score
    let finalScore =
      weights.capability * s_cap +
      weights.distance * s_geo +
      weights.budget * s_budget +
      weights.rating * s_rating +
      weights.responseTime * s_resp +
      weights.acceptance * s_acc +
      weights.conversion * s_conv;

    // Apply Cold Start discovery boost
    let coldStartBoost = 0;
    if (isColdStart) {
      // Impute +15 points boost. Capped at 95.0 to protect verified high-performers
      coldStartBoost = 15.0;
      finalScore = Math.min(95.0, finalScore + coldStartBoost);
    }

    // Clean up numerical precision to 2 decimal places
    const scoreBreakdown = {
      capabilityFit: Math.round(s_cap * 100) / 100,
      distanceDecay: Math.round(s_geo * 100) / 100,
      budgetAlignment: Math.round(s_budget * 100) / 100,
      vendorRating: Math.round(s_rating * 100) / 100,
      responseTime: Math.round(s_resp * 100) / 100,
      acceptanceRate: Math.round(s_acc * 100) / 100,
      conversionRate: Math.round(s_conv * 100) / 100,
      coldStartBoost: coldStartBoost,
    };

    const finalScoreRounded = Math.round(finalScore * 100) / 100;

    // ==========================================
    // MOCK LLM EXPLANATION GENERATOR
    // ==========================================
    // Generates natural-language reasoning explanations mapping how the characteristics
    // of the vendor align with the requirements of the client.
    const specialtiesList = profile.specialties.slice(0, 3).join(', ');
    const distanceText = `${distance.toFixed(1)}km`;
    
    let explanationUser = '';
    if (isColdStart) {
      explanationUser = `[New Star] ${vendor.businessName} is a newly verified vendor in Chennai who specializes in ${specialtiesList || 'creative themes'}. They are located ${distanceText} away and match your pricing floor. We are promoting them with a discovery boost due to verified background checks.`;
    } else {
      explanationUser = `${vendor.businessName} is matched with a high score of ${finalScoreRounded}%. They match your ${category} category, operate within ${distanceText} of your venue, and have a solid history of ${profile.ratingsAvg} stars. Their specialties in [${specialtiesList}] align with your theme request.`;
    }

    const explanationVendor = `You were matched to this requirement because you are an active ${category} in ${city} operating within ${distanceText} of the event site, and the event budget of ₹${budget} fits your pricing tier of ₹${profile.budgetFloor}-₹${profile.budgetCeiling}.`;

    return {
      vendorId: vendor.id,
      businessName: vendor.businessName,
      rawScore: finalScoreRounded,
      scoreBreakdown,
      overrideStatus: 'none',
      aiExplanationUser: explanationUser,
      aiExplanationVendor: explanationVendor,
    };
  });

  // Sort vendors descending by final matching score
  rankedMatches.sort((a, b) => b.rawScore - a.rawScore);

  console.log(`[ScoringService] Scored and ranked ${rankedMatches.length} matching vendors.`);
  return rankedMatches;
}
