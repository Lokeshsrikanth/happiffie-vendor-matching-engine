# Happiffie AI Vendor Matching Engine - Product & Engineering Design

This document details the system design, database schemas, matching algorithms, scalability patterns, and future roadmap for the **Happiffie AI Vendor Matching Engine**. Happiffie is a high-volume marketplace connecting event organizers (Users) with event service providers (Vendors).

---

## 1. Problem Understanding

The core objective of the Happiffie matching engine is to pair user celebration requirements (weddings, birthdays, corporate events) with the most appropriate, available, and cost-effective vendors (decorators, caterers, photographers, venues) from a pool of up to 50,000 vendors, optimizing for **booking conversion rate** and **vendor experience**.

### Key Challenges
1. **Cold-Start Vendors**: New vendors joining the platform lack historical data (ratings, response time, acceptance rates, booking conversion), making them unlikely to rank well in purely historical-based scoring systems.
2. **Sparse Ratings**: Many users do not leave ratings or feedback post-event, leading to a highly skewed distribution of reviews where only a fraction of active vendors have high-confidence ratings.
3. **Geographic Sparsity & Distance Decay**: Match feasibility depends heavily on travel distance (e.g., a Chennai-based caterer cannot easily service a Bengaluru wedding without high logistics costs). Match quality decays exponentially with distance.
4. **Vendor Fatigue (Invite Overload)**: If a popular vendor receives dozens of automated invites daily, their response rate drops, leading to bad UX. We must stagger invitations and cap active invites.
5. **Budget Mismatch**: The variance in celebration budgets is wide. Matching a high-end luxury decorator with a budget-conscious birthday party wastes matching capacity and annoys the vendor.
6. **Time-to-Response vs. Quality**: The user wants response recommendations quickly, but the system must balance rapid automated outreach with the staggered, selective invitation of higher-tier vendors.

### Success Criteria
- **High Booking Conversion**: Maximize the ratio of successful bookings relative to requirements submitted.
- **Fast Response Times**: Reduce the time-to-first-response from matches to under 30 minutes.
- **Vendor Retention**: Maintain vendor acceptance rates by routing relevant, high-margin leads.
- **Fairness & Diversity**: Ensure fresh/cold-start vendors receive visibility (impressions) to build their reputation.

---

## 2. Assumptions

The design operates under the following engineering and business assumptions:
- **Vendor Profiles**: Vendors have populated profiles specifying their service category (e.g., Decorator, Venue), geographic base coordinates (latitude/longitude), and operating city.
- **Availability Calendar**: A real-time calendar exists for each vendor, showing booked dates. Matches are filtered out if the event date overlaps with a confirmed booking.
- **Base Pricing**: Vendors declare a "budget floor" (minimum booking price they accept) and a "budget ceiling" (standard maximum scale) in their profile.
- **Transactional Consistency**: Booking creation must be transactionally atomic, updating vendor availability and reservation state immediately.
- **Geocoding Availability**: Event addresses submitted by users can be mapped to geographic coordinates (latitude, longitude) upstream of the matching process.

---

## 3. User Journey

The sequence of events from requirement creation to booking confirmation is shown in the diagram below:

```mermaid
sequenceDiagram
    autonumber
    actor User as User / Client
    participant Core as Core Platform / API
    participant AI as AI Enrichment / LLM
    participant DB as Postgres Database
    participant Engine as Matching Engine
    actor Vendor as Shortlisted Vendor

    User->>Core: Submit Requirement (Event details, budget, theme text)
    Core->>AI: Enrich & Parse Request (Extract themes, sub-categories, geocoding)
    AI-->>Core: Structured Search Filters & Semantic Features
    Core->>DB: Persist Requirement & initial state
    Core->>Engine: Trigger Matching Run (Requirement ID)
    
    rect rgb(240, 248, 255)
        note right of Engine: Stage 1: Hard Filtering
        Engine->>DB: Query vendors (Category, City/Radius, Availability, Budget Floor)
        DB-->>Engine: Candidate Vendor Pool (Max ~1,000 candidates)
    end

    rect rgb(230, 245, 230)
        note right of Engine: Stage 2: Scoring & Ranking
        Engine->>Engine: Run scoring formula (Capability, distance, budget, performance, cold-start boost)
        Engine->>DB: Save Ranked Matches (Requirement ID, Vendor ID, Scores)
    end

    loop Staggered Invitations
        Engine->>DB: Fetch Top-N uninvited matched vendors
        Engine->>Vendor: Send Invitation Notification (WhatsApp / Push / Email)
        note over Vendor: Vendor reviews "Why Matched" & event details
        alt Vendor Accepts
            Vendor->>Core: Accept & Quote (Price, Message)
            Core->>DB: Save Response & Match State
            Core-->>User: Notify User of New Recommendation
        else Vendor Declines / Time-out
            Vendor->>Core: Decline Match (with Reason)
            Core->>DB: Update State; Trigger next invite tier in queue
        end
    end

    User->>Core: View Recommendations Feed (Ranked by score, with AI explanations)
    User->>Core: Pay Booking Deposit / Confirm Vendor
    Core->>DB: Create Booking, Lock Calendar, Update Vendor Stats
    Core-->>Vendor: Notify of Confirmed Booking
```

---

## 4. Product Design

### Persona 1: Event Organizer (User)
- **Requirement Form**: A multi-step flow capturing: Event Type, Date, City, Guest Count, Budget Range, and a free-form text description ("A warm, rustic backyard engagement ceremony with pastel roses and fairy lights").
- **Recommendation Feed**: A curated timeline showing matched vendors who have accepted the invite and provided a quote. Each recommendation card features:
  - Match Score percentage (e.g., **94% Match**).
  - **AI Match Explanation**: "Matched because they excel in 'rustic' & 'pastels' and are located 4km from your venue, fitting your ₹1,50,000 budget."
  - Quote details, portfolio highlight reel, and a button to message or Book.

### Persona 2: Vendor
- **Invite Notification**: A mobile-first notification (WhatsApp, Push, or SMS) reading: "New wedding decorator match in Chennai for Oct 12th! Est. budget ₹2,00,000."
- **Accept/Decline/Quote Flow**: Clicking the notification opens a simple landing page:
  - Brief customer request summary (theme, guest count, location).
  - Match Context: "You were matched because of your high score for 'Boho/Rustic' events and excellent 15-minute average response time."
  - Options: **Accept & Send Quote** (pre-filled with standard pricing, editable) or **Decline** (with dropdown reasons: Fully Booked, Budget Too Low, Distance Too Far, Out of Town).
- **Vendor Dashboard**: Overview of conversion stats, response speed, current rating, and monthly earnings.

### Persona 3: Platform Administrator (Admin)
- **Match Override Dashboard**: A portal displaying active and historical requirements. Admins can view the full scoring breakdown of the top 50 vendors for a requirement.
- **Manual Intervention**: Admins can:
  - Manually add a vendor to the match list (forces an invitation, overriding the engine).
  - Apply a manual rank boost (+20 points) or penalty (-50 points) to a vendor.
  - View database logs explaining why a specific vendor was filtered out.
- **Vendor Performance View**: Comprehensive monitoring of vendor profiles, including ratings, response time histories, flag count, and booking conversion tracking.

---

## 5. Database Design

Below is the database schema for PostgreSQL. It includes tables for core entities, indexes for spatial queries (PostGIS-compatible coordinates), and matching state tracking.

```sql
-- Enable PostGIS extension for geo-spatial operations
CREATE EXTENSION IF NOT EXISTS postgis;

-- 1. Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    role VARCHAR(50) NOT NULL CHECK (role IN ('user', 'admin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Vendors Table
CREATE TABLE vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL, -- e.g., 'decorator', 'caterer', 'venue', 'photographer'
    contact_phone VARCHAR(20),
    operating_city VARCHAR(100) NOT NULL,
    base_lat DOUBLE PRECISION NOT NULL,
    base_lng DOUBLE PRECISION NOT NULL,
    geom GEOMETRY(Point, 4326), -- PostGIS spatial point
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'onboarding')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Vendor Profiles Table (Separated for fast lookup of metrics & metadata)
CREATE TABLE vendor_profiles (
    vendor_id UUID PRIMARY KEY REFERENCES vendors(id) ON DELETE CASCADE,
    bio TEXT,
    budget_floor DECIMAL(12, 2) NOT NULL,
    budget_ceiling DECIMAL(12, 2) NOT NULL,
    experience_years INT DEFAULT 0,
    ratings_avg DECIMAL(3, 2) DEFAULT 0.00,
    response_time_avg_mins INT DEFAULT 60,
    acceptance_rate DECIMAL(5, 2) DEFAULT 100.00, -- percentage (0-100)
    overall_conversion_rate DECIMAL(5, 2) DEFAULT 0.00, -- percentage (0-100)
    specialties TEXT[], -- e.g., ['rustic', 'bohemian', 'traditional']
    is_cold_start BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Service Areas Table (For vendors with multiple service radii/cities)
CREATE TABLE service_areas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
    city VARCHAR(100) NOT NULL,
    radius_km INT NOT NULL,
    geom GEOMETRY(Polygon, 4326), -- Spatial polygon representing service boundaries
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Requirements Table (User request)
CREATE TABLE requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    city VARCHAR(100) NOT NULL,
    event_date DATE NOT NULL,
    guest_count INT NOT NULL,
    budget DECIMAL(12, 2) NOT NULL,
    theme VARCHAR(255),
    details TEXT,
    event_lat DOUBLE PRECISION NOT NULL,
    event_lng DOUBLE PRECISION NOT NULL,
    event_geom GEOMETRY(Point, 4326),
    status VARCHAR(50) DEFAULT 'open' CHECK (status IN ('open', 'matched', 'booked', 'cancelled', 'expired')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Matches Table (Stores matching results & scores for a requirement)
CREATE TABLE matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requirement_id UUID REFERENCES requirements(id) ON DELETE CASCADE,
    vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
    raw_score DECIMAL(5, 2) NOT NULL, -- Core matching score (0-100)
    score_breakdown JSONB NOT NULL, -- Breakdowns: { distance: 10, budget: 15, rating: 20... }
    override_status VARCHAR(50) DEFAULT 'none' CHECK (override_status IN ('none', 'boosted', 'force_invite', 'excluded')),
    override_reason TEXT,
    ai_explanation_user TEXT,
    ai_explanation_vendor TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (requirement_id, vendor_id)
);

-- 7. Invitations Table (Staggered outreach tracking)
CREATE TABLE invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'sent' CHECK (status IN ('sent', 'read', 'accepted', 'declined', 'expired')),
    invite_tier INT DEFAULT 1, -- Staggering tier (1, 2, 3...)
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. Responses Table (Vendor response to invitation)
CREATE TABLE responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invitation_id UUID REFERENCES invitations(id) ON DELETE CASCADE,
    vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL CHECK (status IN ('accepted', 'declined')),
    quote_amount DECIMAL(12, 2),
    decline_reason VARCHAR(255),
    message TEXT,
    responded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 9. Bookings Table (Final transaction record)
CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requirement_id UUID REFERENCES requirements(id) ON DELETE CASCADE,
    vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    booked_amount DECIMAL(12, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'completed', 'cancelled')),
    booked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. Vendor Performance Stats Table
CREATE TABLE vendor_performance_stats (
    vendor_id UUID PRIMARY KEY REFERENCES vendors(id) ON DELETE CASCADE,
    invites_received INT DEFAULT 0,
    responses_count INT DEFAULT 0,
    acceptances_count INT DEFAULT 0,
    bookings_count INT DEFAULT 0,
    avg_response_time_seconds INT DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. Vendor Calendar Table (Booked dates)
CREATE TABLE vendor_calendar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID REFERENCES vendors(id) ON DELETE CASCADE,
    blocked_date DATE NOT NULL,
    reason VARCHAR(255),
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (vendor_id, blocked_date)
);

-- Indices for performance optimization
CREATE INDEX idx_vendors_geom ON vendors USING gist (geom);
CREATE INDEX idx_requirements_geom ON requirements USING gist (event_geom);
CREATE INDEX idx_vendors_category_city ON vendors(category, operating_city);
CREATE INDEX idx_matches_requirement_score ON matches(requirement_id, raw_score DESC);
CREATE INDEX idx_invitations_status ON invitations(status);
CREATE INDEX idx_vendor_calendar_date ON vendor_calendar(vendor_id, blocked_date);
```

---

## 6. API Design

### 6.1 Create Requirement
- **Endpoint**: `POST /api/v1/requirements`
- **Request Payload**:
```json
{
  "userId": "990780b3-298e-4c13-9183-e6d101dda988",
  "eventType": "wedding",
  "city": "Chennai",
  "eventDate": "2026-10-12",
  "guestCount": 250,
  "budget": 200000.00,
  "theme": "Rustic garden with fairy lights and pastel roses",
  "latitude": 13.0827,
  "longitude": 80.2707
}
```
- **Response Payload**:
```json
{
  "success": true,
  "message": "Requirement successfully processed and matched.",
  "data": {
    "requirementId": "c0446ad0-cf2a-4db5-9ce2-bdf4758d4380",
    "status": "open",
    "matchesTriggered": 12
  }
}
```

### 6.2 Get Ranked Matches
- **Endpoint**: `GET /api/v1/requirements/:id/matches`
- **Response Payload**:
```json
{
  "success": true,
  "data": {
    "requirementId": "c0446ad0-cf2a-4db5-9ce2-bdf4758d4380",
    "matches": [
      {
        "vendorId": "a90dfb2f-90e8-46cc-acbe-02b4ef21396a",
        "businessName": "Vibrant Blooms Decorators",
        "rawScore": 94.20,
        "scoreBreakdown": {
          "capabilityFit": 95,
          "distanceDecay": 98,
          "budgetAlignment": 90,
          "vendorRating": 96,
          "responseTime": 92,
          "acceptanceRate": 90,
          "conversionRate": 95
        },
        "overrideStatus": "none",
        "aiExplanationUser": "Vibrant Blooms is matched because their signature floral themes align perfectly with your 'Rustic garden' request, they are located only 3.2km away from your event center, and their budget matches your ₹2,00,000 threshold."
      }
    ]
  }
}
```

### 6.3 Staggered Send Invitations
- **Endpoint**: `POST /api/v1/invitations`
- **Request Payload**:
```json
{
  "requirementId": "c0446ad0-cf2a-4db5-9ce2-bdf4758d4380",
  "tier": 1,
  "limit": 3
}
```
- **Response Payload**:
```json
{
  "success": true,
  "invitationsSent": 3,
  "recipients": [
    { "vendorId": "a90dfb2f-90e8-46cc-acbe-02b4ef21396a", "invitationId": "ebffc49e-ec86-4e5b-b9d9-bb4319808ef0" }
  ]
}
```

### 6.4 Get Vendor Recommendations
- **Endpoint**: `GET /api/v1/vendors/:id/recommendations`
- **Response Payload**:
```json
{
  "success": true,
  "invitations": [
    {
      "invitationId": "ebffc49e-ec86-4e5b-b9d9-bb4319808ef0",
      "requirement": {
        "id": "c0446ad0-cf2a-4db5-9ce2-bdf4758d4380",
        "eventType": "wedding",
        "eventDate": "2026-10-12",
        "budget": 200000.00,
        "theme": "Rustic garden with fairy lights and pastel roses"
      },
      "aiExplanationVendor": "You were matched because you are the top-rated decorator in Chennai with experience in 'Rustic' styles and are free on Oct 12th."
    }
  ]
}
```

### 6.5 Post Vendor Response
- **Endpoint**: `POST /api/v1/responses`
- **Request Payload**:
```json
{
  "invitationId": "ebffc49e-ec86-4e5b-b9d9-bb4319808ef0",
  "status": "accepted",
  "quoteAmount": 195000.00,
  "message": "We have the perfect lighting sets and floral arrangements for this theme! Would love to chat."
}
```
- **Response Payload**:
```json
{
  "success": true,
  "bookingCreated": false,
  "message": "Response recorded successfully."
}
```

### 6.6 Admin Override Controls
- **Endpoint**: `POST /api/v1/admin/matches/:id/override`
- **Request Payload**:
```json
{
  "vendorId": "a90dfb2f-90e8-46cc-acbe-02b4ef21396a",
  "action": "force_invite",
  "reason": "Top premium customer request; manually overriding ranking to prioritize local partner."
}
```
- **Response Payload**:
```json
{
  "success": true,
  "message": "Override status updated to 'force_invite'."
}
```

---

## 7. Matching Logic

The matching system consists of two sequential phases: **Phase 1: Hard Filtering** (deterministic query narrowing), and **Phase 2: Weighted Scoring** (ranking optimization).

```
[Raw Vendor Pool (50k)] 
          │
          ▼
┌──────────────────┐
│  Phase 1:        │  Category, City/Radius, Availability, Budget Floor
│  Hard Filtering  │
└──────────────────┘
          │
          ▼
[Candidates (100-500)]
          │
          ▼
┌──────────────────┐
│  Phase 2:        │  Weighted Scoring & Ranking (Capability, Distance, Rating, 
│  Weighted Score  │  Acceptance, Response, Booking Conversion, Cold Start Boost)
└──────────────────┘
          │
          ▼
[Ranked matches list]
```

### 7.1 Phase 1: Hard Filters
To drop the evaluation size from 50,000 to a highly relevant candidate set ($< 1,000$), we run immediate filters on the database layer:
1. **Category Match**: Vendor category must match the requested service category exactly (e.g. `caterer` match to caterer requirements).
2. **Geographic Viability**: The distance between vendor base location and event location must be less than the vendor's service radius, or they must share the same `operating_city`.
3. **Availability Filter**: The vendor's calendar must not contain a blocked date on the event date.
4. **Budget Floor Filter**: The client's budget must be greater than or equal to the vendor's `budget_floor`. If client budget is ₹50,000 and the vendor's minimum engagement is ₹1,00,000, the match is discarded.

### 7.2 Phase 2: Weighted Scoring Model
Once candidates are generated, we compute the final score $S \in [0, 100]$ using the formula below. Let $S_i$ represent normalized sub-scores ($0 \le S_i \le 100$) and $W_i$ represent weights ($\sum W_i = 1.0$):

$$\text{Score} = w_{\text{cap}} S_{\text{cap}} + w_{\text{geo}} S_{\text{geo}} + w_{\text{budget}} S_{\text{budget}} + w_{\text{rating}} S_{\text{rating}} + w_{\text{resp}} S_{\text{resp}} + w_{\text{acc}} S_{\text{acc}} + w_{\text{conv}} S_{\text{conv}}$$

#### Example Score Weights
| Weight | Metric ($S_i$) | Percentage | Rationale |
|---|---|---|---|
| $w_{\text{cap}}$ | Capability & Theme Fit | 15% | Matching semantic themes (e.g. 'Boho', 'Rustic') to vendor specialties |
| $w_{\text{geo}}$ | Geographic Distance | 15% | Penalizing long distances to control logistic overhead |
| $w_{\text{budget}}$ | Budget Alignment | 20% | Highest weight to ensure client cost fits vendor scale comfortably |
| $w_{\text{rating}}$ | Vendor Rating | 15% | Quality metric from prior bookings |
| $w_{\text{resp}}$ | Response Time | 15% | Rewards speed of response to invitations |
| $w_{\text{acc}}$ | Acceptance Rate | 10% | Vendor's willingness to accept invites; minimizes wasted invites |
| $w_{\text{conv}}$ | Conversion Rate | 10% | Vendor's efficiency in converting accepted invites into paid bookings |

---

### Sub-Score Formula Detail

1. **Capability Fit ($S_{\text{cap}}$)**:
   Determined by matching the specialties listed on the vendor profile with the themes in the requirement.
   $$S_{\text{cap}} = \frac{|\text{Specialties} \cap \text{Themes}|}{|\text{Themes}|} \times 100 \quad (\text{Fallback to default benchmark if empty})$$

2. **Geographic Distance Decay ($S_{\text{geo}}$)**:
   Decays exponentially with distance $d$ (in km) between event and vendor base:
   $$S_{\text{geo}} = 100 \times e^{-\lambda \cdot d}$$
   Where $\lambda = 0.05$ (meaning score is $100$ at $0\text{km}$, $\approx 60$ at $10\text{km}$, and $\approx 36$ at $20\text{km}$).

3. **Budget Alignment ($S_{\text{budget}}$)**:
   Penalizes vendor budget range relative to the user's budget $B$:
   - If $B > \text{budget\_ceiling}$: Vendor is underpriced. Penalty: $S_{\text{budget}} = 100 - 15 \times \frac{B - \text{budget\_ceiling}}{\text{budget\_ceiling}}$ (capped at 50).
   - If $B < \text{budget\_floor}$: Hard filtered out in Phase 1.
   - If $\text{budget\_floor} \le B \le \text{budget\_ceiling}$: Normal fit. High alignment score:
     $$S_{\text{budget}} = 100 - 30 \times \left( \frac{|B - \text{budget\_floor}|}{\text{budget\_ceiling} - \text{budget\_floor}} \right)$$

4. **Vendor Rating ($S_{\text{rating}}$)**:
   Normalized out of 5 stars:
   $$S_{\text{rating}} = (\text{ratings\_avg} / 5.0) \times 100$$

5. **Response Time ($S_{\text{resp}}$)**:
   Rewards faster response history:
   - If average response time $\le 15\text{ mins}$: $S_{\text{resp}} = 100$
   - Else if $\le 120\text{ mins}$: $S_{\text{resp}} = 100 - \frac{\text{response\_time\_mins} - 15}{1.5}$
   - Else: $S_{\text{resp}} = 30$

6. **Acceptance Rate ($S_{\text{acc}}$) & Conversion Rate ($S_{\text{conv}}$)**:
   Directly mapped to the percentages stored in the profile, capped between $0$ and $100$.

---

### 7.3 Cold-Start Strategy
For new vendors with no history (`is_cold_start = true`):
1. **Metric Imputation**: Instead of using zero, we impute average platform stats for ratings ($4.2$), response time ($30$ mins), acceptance rate ($85\%$), and conversion rate ($10\%$).
2. **Cold Start Boost**: Apply an additive discovery boost ($+15$ points) to their final score for their first $10$ matching opportunities. This pushes them into the top rankings occasionally.
3. **Decay Boost**: The boost decays linearly: $\text{Boost} = 15 \times (1 - \frac{N}{10})$, where $N$ is the number of invitations sent. Once $N \ge 10$, `is_cold_start` is set to `false`.

---

### 7.4 Role of the LLM vs. Deterministic Core
To maintain auditability, **the deterministic scoring algorithm is the absolute source of truth** for matching and invite generation. The Large Language Model (LLM) behaves as an **assisting processor and explainer**:
- **Parsing**: The LLM parses free-text inputs (e.g., "A boho forest-like theme with lights") into structured tags (`['boho', 'forest', 'fairy lights']`) and extracts service categories.
- **Match Explanations**: The LLM consumes the matching score breakdown and details of both entities to generate custom natural-language text explaining "why matched" (e.g. *Why matched to user*: "Excellent rustic designer, 3km away." *Why matched to vendor*: "High budget wedding looking for your exact pastel aesthetic").
- **Quality / Sentiment Detection**: The LLM processes text messages sent by vendors in responses (e.g. "Sorry, I can't do Chennai dates that month due to high logistics costs") to update matching logic configurations automatically (e.g. updating the service area constraints of that vendor).

---

## 8. Scalability

To support a growing load (100K users, 50K vendors, thousands of concurrent requests), the following scalability measures are applied:

1. **Spatial Indexing & Pre-filtering**: PostGIS indexes (`GIST`) are set up on vendor location `geom` and requirement location `event_geom`. The bounding circle query `ST_DWithin(v.geom, r.event_geom, v.service_radius_km * 1000)` executes in sub-millisecond times on indexed datasets.
2. **Distributed Caching (Redis)**: Vendor profiles, static coordinates, ratings, and performance variables are cached in Redis. When matching runs, vendor metadata is loaded in batches directly from cache, avoiding Postgres query bottlenecks.
3. **Staggered Invites Queue**: Matching does not send 50 invitations simultaneously. Instead, it places the requirement on an asynchronous queue (e.g., BullMQ powered by Redis). The worker sends invites to the top 3 matches (Tier 1). If none accept within 4 hours, a cron triggers Tier 2 outreach to ranks 4-6. This prevents vendor spam.
4. **Read Replicas**: Write queries (bookings, updates) are routed to the primary DB, while heavy matching inquiries and administrative analytics dashboard loads query read replicas.
5. **Invite Rate Limiting**: The system implements an Invite Limiting middleware. If a vendor has $\ge 5$ active unresponded invitations, they are excluded from matches until they respond or the current invitations expire.

---

## 9. Success Metrics

KPI monitoring covers product conversion, matchmaking quality, and vendor engagement:
- **Invite-to-Booking Conversion Rate**: $\frac{\text{Total Bookings}}{\text{Total Invitations Sent}}$. Goal: $> 12\%$.
- **Time to First Response**: Time elapsed between requirement creation and first vendor accept/decline. Goal: $< 15$ minutes.
- **Vendor Response Rate**: Percentage of invites that receive an explicit Accept or Decline. Goal: $> 80\%$.
- **Booking Match Precision**: The average ranking index of the vendor who eventually gets booked. A lower booking index (e.g., booked vendor is consistently ranked 1st or 2nd) indicates high matching engine quality.
- **Vendor Churn & Satiation Rate**: Percentage of vendors reporting invite fatigue (declining matches due to "too many notifications") and platform churn.

---

## 10. Future Roadmap

A 6-month roadmap introduces machine learning feedback loops and marketplace pricing models:

- **Month 1-2: Learning-to-Rank (LTR)**: Train a pairwise ranking model (e.g. XGBoost / LambdaMART) using features from actual bookings. The scoring weights will be tuned automatically based on actual user selections rather than static configurations.
- **Month 3-4: Supply & Demand Forecasting**: Identify geographical regions with low vendor supply in specific categories (e.g., insufficient decorators in Chennai during peak wedding season). Adjust platform fees and boost matching priority for underrepresented vendors to balance supply.
- **Month 5: Reverse-Auction Engine**: Allow users to publish requirements, inviting verified matching vendors to submit competitive bids. Bids are ranked by price, response speed, and customer ratings.
- **Month 6: Dynamic Urgency Scores**: Introduce price signals where vendors can pay small amounts of platform credits to receive early placement in the staggered invitation tiers for high-budget matching leads.

---

## 11. Phase 2 Enhancements

The system incorporates advanced features mapping to production-grade requirements:

### 11.1 Semantic pgvector Proximity vs. Keyword Searching
Traditional keyword matching fails when users use varied descriptions (e.g., "fairy lights" vs. "lighting illumination" or "vintage garden" vs. "backyard rustic"). We upgraded the capability scoring layer ($S_{\text{cap}}$) to utilize dense semantic sentence embeddings:
- Vendor specialty tags and bios are pre-embedded into a 384-dimensional vector space using the Hugging Face `all-MiniLM-L6-v2` transformer model (supported by a local mathematical hashing vector-space projection fallback).
- User requirements are dynamically embedded on submission.
- Cosine similarity is calculated to find true semantic matches, enabling deep similarity queries (e.g. matching "warm floral vibes" to "rose flower panels") that would be missed by naive substring searches.

### 11.2 Real LLM Match Rationales & Caching Policies
Rather than displaying generic boilerplate text ("Matched because this vendor has 4.5 stars"), the system passes candidate details, client requirements, and score breakdowns to Anthropic Claude to generate a natural, tailored 1-2 sentence match explanation for both the customer and the vendor.
- **Latency & Cost Mitigation**: To prevent repetitive expensive network requests and latency blockages, rationales are generated exactly once when matches are computed and stored directly inside the `matches` table columns (`ai_explanation_user`, `ai_explanation_vendor`). Recommendations retrieve these cached strings instantly.

### 11.3 Free-Text Intake Queries via LLM Parser
For enhanced user experience, the system provides a plain-English query intake. It prompts Claude with structured definitions to parse strings (e.g., *"decorator in Chennai on Oct 12, budget 2L"*) and output structured JSON pre-filling category, budget, guest count, city, date, and theme, falling back to regex token matching when offline.

### 11.4 Marketplace Audit Trail Ledger
Marketplace operations require trace logs for disputes and auditing (e.g., if a vendor complains they were unfairly excluded, or an admin manual boost is questioned). Every override action is logged in an `AdminAction` table recording:
- Event requirement and vendor details.
- Action type (`boosted`, `force_invite`, `excluded`).
- Old score vs. newly calculated score.
- Performer ID, timestamp, and optional intervention reason.
Surfacing this ledger ensures complete transparency for internal operations.

### 11.5 Active Vendor Fatigue Rate Limiting
To prevent email/push invite spam and fatigue, we enforce a strict rolling cap of **5 invitations per 24 hours** per vendor. If a vendor is the top matching candidate but has hit their cap, they are automatically skipped, a `skip_reason = 'invite_cap_reached'` is logged in the matches table, and outreach proceeds to the next candidate. This protects vendor response rates and long-term platform health.

