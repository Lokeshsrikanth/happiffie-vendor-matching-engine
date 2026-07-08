import express, { Request, Response } from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { matchAndRankVendors } from './services/scoringService';
import { parseFreeTextRequirement, generateMatchRationale } from './services/llmService';

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 4000;

const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
app.use(cors({
  origin: CORS_ORIGIN === '*' ? '*' : CORS_ORIGIN.split(',').map(o => o.trim()),
  credentials: true
}));
app.use(express.json());

// Basic health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date() });
});

// Helper: Ensure a user exists (fallback to first user if none provided)
async function getOrCreateUser(userId?: string) {
  if (userId) {
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (existing) return existing;
  }
  const firstUser = await prisma.user.findFirst();
  if (firstUser) return firstUser;
  
  return prisma.user.create({
    data: {
      email: 'default@happiffie.com',
      name: 'Default Organizer',
      role: 'user',
    },
  });
}

// -------------------------------------------------------------
// POST /api/requirements/parse - AI intake query parser
// -------------------------------------------------------------
app.post('/api/requirements/parse', async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text prompt parameter is required.' });
    }

    const parsed = await parseFreeTextRequirement(text);
    res.json({ success: true, data: parsed });
  } catch (error: any) {
    console.error('Error parsing text requirement:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// -------------------------------------------------------------
// POST /api/requirements - Create a requirement & match vendors
// -------------------------------------------------------------
app.post('/api/requirements', async (req: Request, res: Response) => {
  try {
    const {
      userId,
      eventType,
      city,
      eventDate,
      guestCount,
      budget,
      theme,
      latitude,
      longitude,
    } = req.body;

    if (!eventType || !city || !eventDate || !budget) {
      return res.status(400).json({ error: 'Missing required event fields.' });
    }

    const matchedUser = await getOrCreateUser(userId);
    const parsedDate = new Date(eventDate);
    const parsedBudget = parseFloat(budget);
    const parsedGuestCount = parseInt(guestCount || '50');
    const parsedLat = parseFloat(latitude || '13.0827');
    const parsedLng = parseFloat(longitude || '80.2707');

    // 1. Create requirement in database
    const requirement = await prisma.requirement.create({
      data: {
        userId: matchedUser.id,
        eventType,
        city,
        eventDate: parsedDate,
        guestCount: parsedGuestCount,
        budget: parsedBudget,
        theme: theme || '',
        eventLat: parsedLat,
        eventLng: parsedLng,
        status: 'open',
      },
    });

    // 2. Trigger candidate matching & ranking
    const matches = await matchAndRankVendors({
      requirementId: requirement.id,
      category: eventType,
      city,
      eventDate: parsedDate,
      budget: parsedBudget,
      theme: theme || '',
      latitude: parsedLat,
      longitude: parsedLng,
    });

    // 3. Loop matches, fetch vendor models, generate real Claude rationales, and save
    console.log(`[Backend] Generating LLM rationales for top matches of Requirement ${requirement.id}...`);
    const matchesToInsert = [];
    
    // We only generate Claude rationales for the top 5 candidates to conserve tokens and reduce latency.
    // The rest of the candidate pool gets the default rules-based fallback.
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      let aiExplanationUser = match.aiExplanationUser;
      let aiExplanationVendor = match.aiExplanationVendor;
      
      if (i < 5) {
        try {
          const vendor = await prisma.vendor.findUnique({
            where: { id: match.vendorId },
            include: { profile: true }
          });
          
          if (vendor) {
            const rationale = await generateMatchRationale(requirement, vendor, match.rawScore);
            aiExplanationUser = rationale.userExplanation;
            aiExplanationVendor = rationale.vendorExplanation;
          }
        } catch (e) {
          console.warn(`Failed to generate LLM rationale for vendor ${match.vendorId}, falling back to defaults`, e);
        }
      }
      
      matchesToInsert.push({
        requirementId: requirement.id,
        vendorId: match.vendorId,
        rawScore: match.rawScore,
        scoreBreakdown: match.scoreBreakdown,
        overrideStatus: 'none',
        aiExplanationUser,
        aiExplanationVendor,
      });
    }

    if (matchesToInsert.length > 0) {
      await prisma.match.createMany({
        data: matchesToInsert,
      });
    }

    // 4. Staggered Invitation Outreach with Fatigue/Rate Limiting checks (Max 5/24h)
    const savedMatches = await prisma.match.findMany({
      where: { requirementId: requirement.id },
      orderBy: { rawScore: 'desc' },
    });

    const now = new Date();
    const expires = new Date(now.getTime() + 4 * 60 * 60 * 1000); // 4h expiry
    const RATE_LIMIT_CAP = 5;
    let invitesSent = 0;

    for (const match of savedMatches) {
      if (invitesSent >= 3) break; // Invite Top 3 unskipped candidates

      // Count invites sent to this vendor in the last 24h
      const recentInvitesCount = await prisma.invitation.count({
        where: {
          match: { vendorId: match.vendorId },
          sentAt: {
            gte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
          },
        },
      });

      if (recentInvitesCount >= RATE_LIMIT_CAP) {
        console.log(`[Fatigue Rate Limiter] Vendor ${match.vendorId} skipped. Received ${recentInvitesCount}/${RATE_LIMIT_CAP} invites.`);
        // Mark skip reason in db
        await prisma.match.update({
          where: { id: match.id },
          data: { skipReason: 'invite_cap_reached' },
        });
        continue;
      }

      // Send Invitation
      await prisma.invitation.create({
        data: {
          matchId: match.id,
          status: 'sent',
          inviteTier: 1,
          expiresAt: expires,
        },
      });

      // Increment stats
      await prisma.vendorPerformanceStats.updateMany({
        where: { vendorId: match.vendorId },
        data: {
          invitesReceived: { increment: 1 },
        },
      });

      invitesSent++;
    }

    res.status(201).json({
      success: true,
      message: `Requirement created. Matched ${matches.length} vendors. Invitations dispatched.`,
      requirementId: requirement.id,
      matchesCount: matches.length,
      invitesSent,
    });
  } catch (error: any) {
    console.error('Error creating requirement:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// -------------------------------------------------------------
// GET /api/requirements/:id/matches - Retrieve ranked matches
// -------------------------------------------------------------
app.get('/api/requirements/:id/matches', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const requirement = await prisma.requirement.findUnique({
      where: { id },
      include: {
        matches: {
          include: {
            vendor: {
              include: {
                profile: true,
              },
            },
            invitations: {
              orderBy: { sentAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!requirement) {
      return res.status(404).json({ error: 'Requirement not found.' });
    }

    const sortedMatches = requirement.matches
      .map((m) => {
        const latestInvite = m.invitations[0] || null;
        
        // Calculate dynamic adjusted score based on admin overrides
        let finalScore = Number(m.rawScore);
        if (m.overrideStatus === 'boosted') {
          finalScore = Math.min(100, finalScore + 20);
        }

        return {
          id: m.id,
          vendorId: m.vendorId,
          businessName: m.vendor.businessName,
          category: m.vendor.category,
          operatingCity: m.vendor.operatingCity,
          rating: m.vendor.profile?.ratingsAvg || 0.0,
          rawScore: finalScore,
          baseScore: Number(m.rawScore),
          scoreBreakdown: m.scoreBreakdown,
          overrideStatus: m.overrideStatus,
          overrideReason: m.overrideReason,
          skipReason: m.skipReason,
          aiExplanationUser: m.aiExplanationUser,
          latestInvitation: latestInvite
            ? {
                id: latestInvite.id,
                status: latestInvite.status,
                sentAt: latestInvite.sentAt,
                expiresAt: latestInvite.expiresAt,
              }
            : null,
        };
      })
      .sort((a, b) => {
        // Excluded candidates are pushed to the bottom
        if (a.overrideStatus === 'excluded' && b.overrideStatus !== 'excluded') return 1;
        if (b.overrideStatus === 'excluded' && a.overrideStatus !== 'excluded') return -1;
        
        // Force invite matches take absolute priority
        if (a.overrideStatus === 'force_invite' && b.overrideStatus !== 'force_invite') return -1;
        if (b.overrideStatus === 'force_invite' && a.overrideStatus !== 'force_invite') return 1;
        
        return b.rawScore - a.rawScore;
      });

    res.json({
      success: true,
      requirement: {
        id: requirement.id,
        eventType: requirement.eventType,
        city: requirement.city,
        eventDate: requirement.eventDate,
        budget: requirement.budget,
        theme: requirement.theme,
        status: requirement.status,
      },
      matches: sortedMatches,
    });
  } catch (error: any) {
    console.error('Error fetching matches:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// -------------------------------------------------------------
// POST /api/invitations - Staggered outreach
// -------------------------------------------------------------
app.post('/api/invitations', async (req: Request, res: Response) => {
  try {
    const { matchId, tier } = req.body;

    if (!matchId) {
      return res.status(400).json({ error: 'Missing matchId parameter.' });
    }

    const match = await prisma.match.findUnique({
      where: { id: matchId },
    });

    if (!match) {
      return res.status(404).json({ error: 'Match record not found.' });
    }

    // Verify rate limit cap
    const RATE_LIMIT_CAP = 5;
    const recentInvites = await prisma.invitation.count({
      where: {
        match: { vendorId: match.vendorId },
        sentAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    });

    if (recentInvites >= RATE_LIMIT_CAP) {
      // Record skip details
      await prisma.match.update({
        where: { id: match.id },
        data: { skipReason: 'invite_cap_reached' },
      });
      return res.status(429).json({
        success: false,
        error: `Invite rate limit hit. Vendor has received ${recentInvites}/${RATE_LIMIT_CAP} invites.`,
      });
    }

    const now = new Date();
    const expires = new Date(now.getTime() + 4 * 60 * 60 * 1000);

    const invitation = await prisma.invitation.create({
      data: {
        matchId: match.id,
        status: 'sent',
        inviteTier: tier || 1,
        expiresAt: expires,
      },
    });

    // Clear skip reason if manually sending invite successfully
    await prisma.match.update({
      where: { id: match.id },
      data: { skipReason: null },
    });

    await prisma.vendorPerformanceStats.updateMany({
      where: { vendorId: match.vendorId },
      data: {
        invitesReceived: { increment: 1 },
      },
    });

    res.status(201).json({
      success: true,
      invitationId: invitation.id,
      message: 'Invitation sent successfully.',
    });
  } catch (error: any) {
    console.error('Error sending invitation:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// -------------------------------------------------------------
// POST /api/responses - Record simulated vendor reply
// -------------------------------------------------------------
app.post('/api/responses', async (req: Request, res: Response) => {
  try {
    const { invitationId, status, quoteAmount, declineReason, message } = req.body;

    if (!invitationId || !status) {
      return res.status(400).json({ error: 'Missing invitationId or status.' });
    }

    const invitation = await prisma.invitation.findUnique({
      where: { id: invitationId },
      include: {
        match: {
          include: {
            requirement: true,
          },
        },
      },
    });

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found.' });
    }

    // 1. Create response
    const response = await prisma.response.create({
      data: {
        invitationId,
        vendorId: invitation.match.vendorId,
        status,
        quoteAmount: quoteAmount ? parseFloat(quoteAmount) : null,
        declineReason: declineReason || null,
        message: message || '',
      },
    });

    // 2. Update Invitation status
    await prisma.invitation.update({
      where: { id: invitationId },
      data: { status },
    });

    // 3. Update Vendor Stats
    const statsUpdate: any = {
      responsesCount: { increment: 1 },
    };

    if (status === 'accepted') {
      statsUpdate.acceptancesCount = { increment: 1 };
    }

    await prisma.vendorPerformanceStats.updateMany({
      where: { vendorId: invitation.match.vendorId },
      data: statsUpdate,
    });

    // 4. Create Booking & block calendar on Accept
    let booking = null;
    if (status === 'accepted') {
      const currentBooking = await prisma.booking.findFirst({
        where: { requirementId: invitation.match.requirementId },
      });

      if (!currentBooking) {
        booking = await prisma.booking.create({
          data: {
            requirementId: invitation.match.requirementId,
            vendorId: invitation.match.vendorId,
            userId: invitation.match.requirement.userId,
            bookedAmount: quoteAmount ? parseFloat(quoteAmount) : invitation.match.requirement.budget,
            status: 'confirmed',
          },
        });

        await prisma.vendorCalendar.create({
          data: {
            vendorId: invitation.match.vendorId,
            blockedDate: invitation.match.requirement.eventDate,
            reason: `Happiffie Booking Ref ${booking.id}`,
            bookingId: booking.id,
          },
        });

        await prisma.requirement.update({
          where: { id: invitation.match.requirementId },
          data: { status: 'booked' },
        });

        await prisma.vendorPerformanceStats.updateMany({
          where: { vendorId: invitation.match.vendorId },
          data: {
            bookingsCount: { increment: 1 },
          },
        });

        await prisma.vendorProfile.updateMany({
          where: { vendorId: invitation.match.vendorId },
          data: { isColdStart: false },
        });
      }
    }

    res.json({
      success: true,
      message: `Recorded response: ${status}.`,
      bookingCreated: !!booking,
      booking,
    });
  } catch (error: any) {
    console.error('Error recording response:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// -------------------------------------------------------------
// POST /api/admin/matches/:id/override - Manual override controls
// -------------------------------------------------------------
app.post('/api/admin/matches/:id/override', async (req: Request, res: Response) => {
  try {
    const { id } = req.params; // matchId
    const { action, reason } = req.body; // Action: 'boosted', 'force_invite', 'excluded', 'none'

    if (!action || !['boosted', 'force_invite', 'excluded', 'none'].includes(action)) {
      return res.status(400).json({ error: 'Invalid override action.' });
    }

    const match = await prisma.match.findUnique({
      where: { id },
      include: { requirement: true },
    });

    if (!match) {
      return res.status(404).json({ error: 'Match record not found.' });
    }

    // 1. Calculate old score vs new score for log history
    const oldScore = Number(match.rawScore);
    let newScore = oldScore;
    if (action === 'boosted') {
      newScore = Math.min(100, oldScore + 20);
    }

    // 2. Create Audit Trail log entry
    await prisma.adminAction.create({
      data: {
        matchId: match.id,
        actionType: action,
        performedBy: 'admin',
        oldScore,
        newScore,
        reason: reason || 'Manual adjustment applied from Dashboard',
      },
    });

    // 3. Update match override status
    const updatedMatch = await prisma.match.update({
      where: { id },
      data: {
        overrideStatus: action,
        overrideReason: reason || 'Manual adjustment applied from Dashboard',
      },
    });

    // 4. Dispatch invitation immediately on force_invite
    if (action === 'force_invite') {
      const now = new Date();
      const expires = new Date(now.getTime() + 4 * 60 * 60 * 1000);

      await prisma.invitation.create({
        data: {
          matchId: match.id,
          status: 'sent',
          inviteTier: 99,
          expiresAt: expires,
        },
      });

      // Clear skipReason if forcing invite
      await prisma.match.update({
        where: { id: match.id },
        data: { skipReason: null },
      });

      await prisma.vendorPerformanceStats.updateMany({
        where: { vendorId: match.vendorId },
        data: {
          invitesReceived: { increment: 1 },
        },
      });
    }

    res.json({
      success: true,
      message: `Override action '${action}' applied to vendor match. Audit log recorded.`,
      match: updatedMatch,
    });
  } catch (error: any) {
    console.error('Error applying override:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// -------------------------------------------------------------
// GET /api/admin/actions - Fetch override history log
// -------------------------------------------------------------
app.get('/api/admin/actions', async (req: Request, res: Response) => {
  try {
    const logs = await prisma.adminAction.findMany({
      include: {
        match: {
          include: {
            requirement: true,
            vendor: true,
          },
        },
      },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });

    const feed = logs.map((log) => ({
      id: log.id,
      actionType: log.actionType,
      performedBy: log.performedBy,
      oldScore: log.oldScore,
      newScore: log.newScore,
      reason: log.reason,
      timestamp: log.timestamp,
      requirementId: log.match.requirementId,
      eventType: log.match.requirement.eventType,
      vendorName: log.match.vendor.businessName,
    }));

    res.json({ success: true, actions: feed });
  } catch (e: any) {
    console.error('Error fetching admin action logs:', e);
    res.status(500).json({ error: e.message || 'Internal Server Error' });
  }
});

// -------------------------------------------------------------
// GET /api/admin/requirements - Fetch requirements for dashboard
// -------------------------------------------------------------
app.get('/api/admin/requirements', async (req: Request, res: Response) => {
  try {
    const requirements = await prisma.requirement.findMany({
      include: {
        user: true,
        matches: {
          include: {
            vendor: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      requirements,
    });
  } catch (error: any) {
    console.error('Error fetching admin requirements:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// -------------------------------------------------------------
// GET /api/vendors/:id/recommendations - Vendor invitations feed
// -------------------------------------------------------------
app.get('/api/vendors/:id/recommendations', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const invitations = await prisma.invitation.findMany({
      where: {
        match: {
          vendorId: id,
        },
        status: 'sent',
      },
      include: {
        match: {
          include: {
            requirement: true,
          },
        },
      },
      orderBy: { sentAt: 'desc' },
    });

    const feed = invitations.map((inv) => ({
      invitationId: inv.id,
      matchId: inv.matchId,
      sentAt: inv.sentAt,
      expiresAt: inv.expiresAt,
      requirement: {
        id: inv.match.requirementId,
        eventType: inv.match.requirement.eventType,
        city: inv.match.requirement.city,
        eventDate: inv.match.requirement.eventDate,
        budget: inv.match.requirement.budget,
        theme: inv.match.requirement.theme,
      },
      aiExplanationVendor: inv.match.aiExplanationVendor,
    }));

    res.json({
      success: true,
      invitations: feed,
    });
  } catch (error: any) {
    console.error('Error fetching recommendations:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// -------------------------------------------------------------
// GET /api/vendors - Fetch all vendors
// -------------------------------------------------------------
app.get('/api/vendors', async (req: Request, res: Response) => {
  try {
    const vendors = await prisma.vendor.findMany({
      include: {
        profile: true,
        performanceStats: true,
      },
      orderBy: { businessName: 'asc' },
    });
    res.json({ success: true, vendors });
  } catch (error: any) {
    console.error('Error fetching vendors:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// -------------------------------------------------------------
// GET /api/metrics - Analytics Dashboard Stats
// -------------------------------------------------------------
app.get('/api/metrics', async (req: Request, res: Response) => {
  try {
    // 1. Aggregations from performance stats
    const statsList = await prisma.vendorPerformanceStats.findMany();
    
    let totalInvites = 0;
    let totalResponses = 0;
    let totalAcceptances = 0;
    let totalBookings = 0;
    let sumResponseTimes = 0;
    let responseTimeCount = 0;

    for (const stats of statsList) {
      totalInvites += stats.invitesReceived;
      totalResponses += stats.responsesCount;
      totalAcceptances += stats.acceptancesCount;
      totalBookings += stats.bookingsCount;
      if (stats.avgResponseTimeSeconds > 0) {
        sumResponseTimes += stats.avgResponseTimeSeconds;
        responseTimeCount++;
      }
    }

    const responseRate = totalInvites > 0 ? Math.round((totalResponses / totalInvites) * 1000) / 10 : 0.0;
    const avgResponseTimeMins = responseTimeCount > 0 ? Math.round((sumResponseTimes / responseTimeCount) / 60) : 30;

    // Booking Conversion Rate: bookings relative to total requirements
    const totalRequirementsCount = await prisma.requirement.count();
    const totalBookingsCount = await prisma.booking.count();
    const bookingConversionRate = totalRequirementsCount > 0 
      ? Math.round((totalBookingsCount / totalRequirementsCount) * 1000) / 10 
      : 0.0;

    // 2. Score distribution histogram of the last submitted requirement
    const lastRequirement = await prisma.requirement.findFirst({
      orderBy: { createdAt: 'desc' },
      include: {
        matches: true,
      },
    });

    const histogram = {
      excellent: 0, // 90 - 100
      good: 0,      // 80 - 89
      average: 0,   // 70 - 79
      poor: 0,      // < 70
    };

    if (lastRequirement) {
      for (const m of lastRequirement.matches) {
        const s = Number(m.rawScore);
        if (s >= 90) histogram.excellent++;
        else if (s >= 80) histogram.good++;
        else if (s >= 70) histogram.average++;
        else histogram.poor++;
      }
    }

    res.json({
      success: true,
      summary: {
        totalRequirements: totalRequirementsCount,
        totalBookings: totalBookingsCount,
        responseRate,
        bookingConversionRate,
        avgResponseTimeMins,
      },
      lastRequirement: lastRequirement
        ? {
            id: lastRequirement.id,
            eventType: lastRequirement.eventType,
            theme: lastRequirement.theme,
          }
        : null,
      histogram,
    });
  } catch (error: any) {
    console.error('Error computing dashboard metrics:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

app.listen(PORT, () => {
  console.log(`[Backend Server] Happiffie engine backend running on http://localhost:${PORT}`);
});
