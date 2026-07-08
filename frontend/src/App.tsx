import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  MapPin, 
  Calendar, 
  Users, 
  Send, 
  ShieldAlert, 
  UserCheck, 
  CheckCircle, 
  Star, 
  Clock,
  TrendingUp, 
  Database,
  RefreshCw,
  History,
  AlertTriangle,
  BarChart3,
  BookOpen,
  Filter
} from 'lucide-react';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

interface Match {
  id: string;
  vendorId: string;
  businessName: string;
  category: string;
  operatingCity: string;
  rating: number;
  rawScore: number;
  baseScore: number;
  scoreBreakdown: {
    capabilityFit: number;
    distanceDecay: number;
    budgetAlignment: number;
    vendorRating: number;
    responseTime: number;
    acceptanceRate: number;
    conversionRate: number;
    coldStartBoost: number;
  };
  overrideStatus: string;
  overrideReason: string | null;
  skipReason: string | null;
  aiExplanationUser: string;
  latestInvitation: {
    id: string;
    status: string;
    sentAt: string;
    expiresAt: string;
  } | null;
}

interface Requirement {
  id: string;
  eventType: string;
  city: string;
  eventDate: string;
  budget: number;
  theme: string;
  status: string;
}

interface Vendor {
  id: string;
  businessName: string;
  category: string;
  operatingCity: string;
  profile: {
    ratingsAvg: number;
    budgetFloor: number;
    budgetCeiling: number;
    experienceYears: number;
    responseTimeAvgMins: number;
    isColdStart: boolean;
    specialties: string[];
    imageUrl?: string;
    portfolioUrls?: string[];
  } | null;
  performanceStats: {
    invitesReceived: number;
    responsesCount: number;
    acceptancesCount: number;
    bookingsCount: number;
  } | null;
}

interface AdminAction {
  id: string;
  actionType: string;
  performedBy: string;
  oldScore: number;
  newScore: number;
  reason: string;
  timestamp: string;
  requirementId: string;
  eventType: string;
  vendorName: string;
}

interface Metrics {
  summary: {
    totalRequirements: number;
    totalBookings: number;
    responseRate: number;
    bookingConversionRate: number;
    avgResponseTimeMins: number;
  };
  lastRequirement: {
    id: string;
    eventType: string;
    theme: string;
  } | null;
  histogram: {
    excellent: number;
    good: number;
    average: number;
    poor: number;
  };
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'user' | 'vendor_portal' | 'admin' | 'vendors' | 'metrics'>('user');
  
  // Requirement form state
  const [eventType, setEventType] = useState('decorator');
  const [city, setCity] = useState('Chennai');
  const [eventDate, setEventDate] = useState('2026-10-12');
  const [guestCount, setGuestCount] = useState(250);
  const [budget, setBudget] = useState(200000);
  const [theme, setTheme] = useState('Rustic garden wedding with fairy lights and pastel roses');
  const [latitude, setLatitude] = useState(13.0063); // Default Adyar
  const [longitude, setLongitude] = useState(80.2574);
  
  // Free text intake state
  const [freeTextPrompt, setFreeTextPrompt] = useState('Need a traditional south-indian wedding caterer in Chennai for 300 guests on 12th Oct 2026, budget around 1.5 lakhs');
  const [parsingAI, setParsingAI] = useState(false);

  // Vendor Directory filter state
  const [vendorSearchQuery, setVendorSearchQuery] = useState('');
  const [vendorCategoryFilter, setVendorCategoryFilter] = useState('all');
  const [vendorCityFilter, setVendorCityFilter] = useState('all');
  const [vendorMinExperience, setVendorMinExperience] = useState('all');
  const [vendorMaxBudget, setVendorMaxBudget] = useState('all');
  const [vendorMinRating, setVendorMinRating] = useState('all');

  // Match recommendation status filter
  const [matchStatusFilter, setMatchStatusFilter] = useState<'all' | 'invited' | 'booked' | 'skipped'>('all');

  // Vendor Portal states
  const [selectedVendorId, setSelectedVendorId] = useState<string>('');
  const [vendorInvitations, setVendorInvitations] = useState<any[]>([]);
  const [vendorQuoteAmounts, setVendorQuoteAmounts] = useState<Record<string, number>>({});
  const [vendorDeclineReasons, setVendorDeclineReasons] = useState<Record<string, string>>({});
  const [vendorQuoteMessages, setVendorQuoteMessages] = useState<Record<string, string>>({});

  const fetchVendorInvitations = async (vendorId: string) => {
    if (!vendorId) {
      setVendorInvitations([]);
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/vendors/${vendorId}/recommendations`);
      const data = await res.json();
      if (data.success) {
        setVendorInvitations(data.invitations);
      }
    } catch (e) {
      console.error('Failed to fetch vendor invitations:', e);
    }
  };

  useEffect(() => {
    if (selectedVendorId) {
      fetchVendorInvitations(selectedVendorId);
    } else {
      setVendorInvitations([]);
    }
  }, [selectedVendorId]);

  const handleVendorResponsePortal = async (invitationId: string, status: 'accepted' | 'declined', quoteAmt: number | null, noteOrReason: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invitationId,
          status,
          quoteAmount: status === 'accepted' ? quoteAmt : null,
          declineReason: status === 'declined' ? noteOrReason : null,
          message: status === 'accepted' ? noteOrReason : 'Sorry, fully committed on this date.',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResponseStatusMsg(
          status === 'accepted' 
            ? `Successfully booked! Confirmed at ₹${(quoteAmt || 0).toLocaleString('en-IN')}` 
            : `Invitation declined (${noteOrReason})`
        );
        if (selectedRequirement) {
          fetchMatches(selectedRequirement.id);
        }
        loadBackendData();
        if (selectedVendorId) {
          fetchVendorInvitations(selectedVendorId);
        }
        setTimeout(() => setResponseStatusMsg(''), 5000);
      }
    } catch (e) {
      console.error('Error submitting vendor reply:', e);
    }
  };

  // Coordinate Preset data mapping
  const locationPresets: Record<string, { name: string; lat: number; lng: number }[]> = {
    Chennai: [
      { name: 'Adyar (South)', lat: 13.0063, lng: 80.2574 },
      { name: 'Nungambakkam (Central)', lat: 13.0626, lng: 80.2376 },
      { name: 'OMR Sholinganallur (Suburban)', lat: 12.9010, lng: 80.2279 },
      { name: 'Anna Nagar (North)', lat: 13.0850, lng: 80.2101 },
    ],
    Bangalore: [
      { name: 'Koramangala (Southeast)', lat: 12.9279, lng: 77.6271 },
      { name: 'Indiranagar (East)', lat: 12.9719, lng: 77.6412 },
      { name: 'Whitefield (East Outskirts)', lat: 12.9698, lng: 77.7499 },
      { name: 'Jayanagar (South)', lat: 12.9308, lng: 77.5838 },
    ],
  };

  // Advanced Feature: One-Click Premium Query Presets
  const QUICK_PRESETS = [
    {
      title: "Bangalore Royal Wedding",
      prompt: "Need a luxury wedding photographer in Bangalore for 250 guests on 2026-10-12, budget around 4.5 lakhs, rustic outdoor theme",
      details: { eventType: 'photographer', city: 'Bangalore', eventDate: '2026-10-12', guestCount: 250, budget: 450000, theme: 'Bohemian outdoor wedding with warm lighting' }
    },
    {
      title: "Chennai Traditional Catering",
      prompt: "Need a traditional south-indian caterer in Chennai for 400 guests on 2026-11-20, budget 2.5 lakhs, banana leaf service",
      details: { eventType: 'caterer', city: 'Chennai', eventDate: '2026-11-20', guestCount: 400, budget: 250000, theme: 'Traditional south-indian wedding meal on banana leaves' }
    },
    {
      title: "Chennai Stage Decorator",
      prompt: "Looking for an elite stage decorator in Chennai on 2026-10-12, budget around 3 lakhs, luxury floral theme",
      details: { eventType: 'decorator', city: 'Chennai', eventDate: '2026-10-12', guestCount: 300, budget: 300000, theme: 'Luxury rose panels and fairy light installations' }
    }
  ];

  // UI loaded lists
  const [loading, setLoading] = useState(false);
  const [requirementsList, setRequirementsList] = useState<any[]>([]);
  const [selectedRequirement, setSelectedRequirement] = useState<Requirement | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [adminActions, setAdminActions] = useState<AdminAction[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [responseStatusMsg, setResponseStatusMsg] = useState('');

  // Cleaned up old simulated state variables

  // Load backend database records
  const loadBackendData = async () => {
    try {
      const reqRes = await fetch(`${API_BASE_URL}/api/admin/requirements`);
      const reqJson = await reqRes.json();
      if (reqJson.success) {
        setRequirementsList(reqJson.requirements);
        if (reqJson.requirements.length > 0 && !selectedRequirement) {
          fetchMatches(reqJson.requirements[0].id);
        }
      }

      const vendRes = await fetch(`${API_BASE_URL}/api/vendors`);
      const vendJson = await vendRes.json();
      if (vendJson.success) {
        setVendors(vendJson.vendors);
      }

      const actRes = await fetch(`${API_BASE_URL}/api/admin/actions`);
      const actJson = await actRes.json();
      if (actJson.success) {
        setAdminActions(actJson.actions);
      }

      const metRes = await fetch(`${API_BASE_URL}/api/metrics`);
      const metJson = await metRes.json();
      if (metJson.success) {
        setMetrics(metJson);
      }
      if (selectedVendorId) {
        fetchVendorInvitations(selectedVendorId);
      }
    } catch (e) {
      console.error('Failed to load system tables:', e);
    }
  };

  useEffect(() => {
    loadBackendData();
  }, []);

  // Update presets
  const handlePresetChange = (lat: number, lng: number) => {
    setLatitude(lat);
    setLongitude(lng);
  };

  // Sync city presets
  useEffect(() => {
    const list = locationPresets[city];
    if (list && list.length > 0) {
      setLatitude(list[0].lat);
      setLongitude(list[0].lng);
    }
  }, [city]);

  // AI Free Text Parsing call
  const handleAIFreeTextParse = async () => {
    if (!freeTextPrompt.trim()) return;
    setParsingAI(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/requirements/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: freeTextPrompt }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        const d = json.data;
        if (d.eventType) setEventType(d.eventType);
        if (d.city) setCity(d.city);
        if (d.eventDate) setEventDate(d.eventDate.split('T')[0]);
        if (d.guestCount) setGuestCount(d.guestCount);
        if (d.budget) setBudget(d.budget);
        if (d.theme) setTheme(d.theme);
        
        setResponseStatusMsg('AI successfully parsed your requirement! Review parameters below.');
        setTimeout(() => setResponseStatusMsg(''), 5000);
      }
    } catch (e) {
      console.error('Failed to parse text', e);
      alert('Failed to connect to parser service.');
    } finally {
      setParsingAI(false);
    }
  };

  // Quick Preset Selection & Instant Submission
  const handleSelectPreset = async (preset: typeof QUICK_PRESETS[0]) => {
    setFreeTextPrompt(preset.prompt);
    setEventType(preset.details.eventType);
    setCity(preset.details.city);
    setEventDate(preset.details.eventDate);
    setGuestCount(preset.details.guestCount);
    setBudget(preset.details.budget);
    setTheme(preset.details.theme);
    
    // Auto-update coordinates based on city
    const list = locationPresets[preset.details.city];
    let lat = 13.0063;
    let lng = 80.2574;
    if (list && list.length > 0) {
      lat = list[0].lat;
      lng = list[0].lng;
      setLatitude(lat);
      setLongitude(lng);
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/requirements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: preset.details.eventType,
          city: preset.details.city,
          eventDate: preset.details.eventDate,
          guestCount: preset.details.guestCount,
          budget: preset.details.budget,
          theme: preset.details.theme,
          latitude: lat,
          longitude: lng,
        }),
      });
      const data = await res.json();
      if (data.success) {
        fetchMatches(data.requirementId);
        loadBackendData();
        setResponseStatusMsg(`Matched successfully using preset: ${preset.title}!`);
        setTimeout(() => setResponseStatusMsg(''), 5000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Submit Requirement Match
  const handleSubmitRequirement = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/requirements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType,
          city,
          eventDate,
          guestCount,
          budget,
          theme,
          latitude,
          longitude,
        }),
      });
      const data = await res.json();
      if (data.success) {
        fetchMatches(data.requirementId);
        loadBackendData();
        setActiveTab('user');
      } else {
        alert('Matching failed: ' + data.error);
      }
    } catch (err) {
      console.error(err);
      alert('Server error matching requirement.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch matches list
  const fetchMatches = async (reqId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/requirements/${reqId}/matches`);
      const data = await res.json();
      if (data.success) {
        setSelectedRequirement(data.requirement);
        setMatches(data.matches);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Send Manual invitation
  const sendManualInvitation = async (matchId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, tier: 1 }),
      });
      const data = await res.json();
      if (data.success) {
        if (selectedRequirement) {
          fetchMatches(selectedRequirement.id);
        }
        loadBackendData();
      } else {
        alert(data.error || 'Failed to send invite.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Admin adjustments override
  const applyAdminOverride = async (matchId: string, action: 'boosted' | 'force_invite' | 'excluded' | 'none') => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/matches/${matchId}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          reason: `Admin adjustment trigger: ${action.toUpperCase()}`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (selectedRequirement) {
          fetchMatches(selectedRequirement.id);
        }
        loadBackendData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Live filter computation for directory tab
  const filteredVendors = vendors.filter((vendor) => {
    const matchesSearch = vendor.businessName.toLowerCase().includes(vendorSearchQuery.toLowerCase());
    const matchesCategory = vendorCategoryFilter === 'all' || vendor.category === vendorCategoryFilter;
    const matchesCity = vendorCityFilter === 'all' || vendor.operatingCity === vendorCityFilter;
    
    const exp = vendor.profile?.experienceYears || 0;
    const matchesExperience = vendorMinExperience === 'all' || exp >= Number(vendorMinExperience);
    
    const budgetFloor = vendor.profile?.budgetFloor || 0;
    const matchesBudget = vendorMaxBudget === 'all' || budgetFloor <= Number(vendorMaxBudget);
    
    const rating = vendor.profile?.ratingsAvg || 0;
    const matchesRating = vendorMinRating === 'all' || rating >= Number(vendorMinRating);

    return matchesSearch && matchesCategory && matchesCity && matchesExperience && matchesBudget && matchesRating;
  });

  // Filter matched recommendations dynamically based on selection state
  const filteredMatches = matches.filter((match) => {
    if (matchStatusFilter === 'all') return true;
    if (matchStatusFilter === 'invited') return match.latestInvitation !== null;
    if (matchStatusFilter === 'booked') return match.latestInvitation?.status === 'accepted';
    if (matchStatusFilter === 'skipped') return match.skipReason !== null;
    return true;
  });

  return (
    <div className="min-h-screen flex flex-col bg-[#F5F2EA] text-[#1A0512] selection:bg-[#C96C52] selection:text-white antialiased font-sans">
      
      {/* Header */}
      <header className="sticky top-0 z-50 px-4 sm:px-8 py-4 sm:py-5 flex flex-col lg:flex-row justify-between items-center gap-4 border-b bg-[#FAF7F2] border-[#2E1220]/15 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-[#C96C52] to-[#D88D7A] p-2.5 rounded-2xl shadow-lg">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold tracking-tight text-[#1A0512]">
              Happiffie
            </h1>
            <p className="text-[9px] sm:text-[10px] font-bold tracking-widest uppercase text-[#2E1220]/60">
              AI Event Matchmaking Dashboard
            </p>
          </div>
        </div>

        <nav className="flex p-0.5 rounded-xl border bg-white border-[#2E1220]/15 shadow-sm flex-wrap justify-center sm:justify-start">
          <button 
            onClick={() => setActiveTab('user')}
            className={`px-2.5 sm:px-3.5 py-1.5 rounded-lg font-semibold text-[11px] transition-all duration-300 flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-[#C96C52] ${
              activeTab === 'user' 
                ? 'bg-[#C96C52] text-white shadow-sm' 
                : 'text-[#2E1220]/75 hover:text-[#2E1220]'
            }`}
            title="Recommendation Feed"
          >
            <UserCheck className="h-3.5 w-3.5" /> <span className="hidden md:inline">Recommendation Feed</span>
          </button>
          <button 
            onClick={() => {
              setActiveTab('vendor_portal');
              loadBackendData();
            }}
            className={`px-2.5 sm:px-3.5 py-1.5 rounded-lg font-semibold text-[11px] transition-all duration-300 flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-[#C96C52] ${
              activeTab === 'vendor_portal' 
                ? 'bg-[#C96C52] text-white shadow-md' 
                : 'text-[#2E1220]/75 hover:text-[#2E1220]'
            }`}
            title="Vendor Portal"
          >
            <Users className="h-3.5 w-3.5" /> <span className="hidden md:inline">Vendor Portal</span>
          </button>
          <button 
            onClick={() => {
              setActiveTab('admin');
              loadBackendData();
            }}
            className={`px-2.5 sm:px-3.5 py-1.5 rounded-lg font-semibold text-[11px] transition-all duration-300 flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-[#C96C52] ${
              activeTab === 'admin' 
                ? 'bg-[#C96C52] text-white shadow-md' 
                : 'text-[#2E1220]/75 hover:text-[#2E1220]'
            }`}
            title="Admin Console"
          >
            <ShieldAlert className="h-3.5 w-3.5" /> <span className="hidden md:inline">Admin Console</span>
          </button>
          <button 
            onClick={() => {
              setActiveTab('metrics');
              loadBackendData();
            }}
            className={`px-2.5 sm:px-3.5 py-1.5 rounded-lg font-semibold text-[11px] transition-all duration-300 flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-[#C96C52] ${
              activeTab === 'metrics' 
                ? 'bg-[#C96C52] text-white shadow-md' 
                : 'text-[#2E1220]/75 hover:text-[#2E1220]'
            }`}
            title="Performance Dashboard"
          >
            <BarChart3 className="h-3.5 w-3.5" /> <span className="hidden md:inline">Performance Dashboard</span>
          </button>
          <button 
            onClick={() => {
              setActiveTab('vendors');
              loadBackendData();
            }}
            className={`px-2.5 sm:px-3.5 py-1.5 rounded-lg font-semibold text-[11px] transition-all duration-300 flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-[#C96C52] ${
              activeTab === 'vendors' 
                ? 'bg-[#C96C52] text-white shadow-md' 
                : 'text-[#2E1220]/75 hover:text-[#2E1220]'
            }`}
            title="Vendor Directory"
          >
            <Database className="h-3.5 w-3.5" /> <span className="hidden md:inline">Vendor Directory</span>
          </button>
        </nav>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full px-4 sm:px-8 lg:px-12 py-6 grid grid-cols-1 gap-8">
        
        {/* ============================================================= */}
        {/* TAB 1: CLIENT PORTAL FEED */}
        {/* ============================================================= */}
        {activeTab === 'user' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            
            {/* Column 1: Client intake */}
            <div className="lg:col-span-1 flex flex-col gap-6">
              
              {/* Premium One-Click Presets Hub */}
              <div className="bg-white p-6 rounded-3xl border border-[#2E1220]/15 shadow-[0_8px_30px_rgba(46,18,35,0.04)] flex flex-col gap-3">
                <div className="flex items-center gap-1.5 border-b border-[#2E1220]/5 pb-2">
                  <Sparkles className="h-4.5 w-4.5 text-[#C96C52]" />
                  <h4 className="text-[10px] font-bold text-[#1A0512] uppercase tracking-wider">
                    One-Click Match Presets
                  </h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  {QUICK_PRESETS.map((preset) => (
                    <button
                      key={preset.title}
                      onClick={() => handleSelectPreset(preset)}
                      className="px-3.5 py-2 rounded-xl border border-[#2E1220]/10 hover:border-[#C96C52] bg-[#FAF7F2] hover:bg-white text-xs font-serif font-bold text-[#2E1220] hover:text-[#C96C52] transition-all focus:outline-none focus:ring-1 focus:ring-[#C96C52] shadow-sm"
                    >
                      ✨ {preset.title}
                    </button>
                  ))}
                </div>
              </div>

              {/* Core Requirement Intake */}
              <div className="bg-white p-6 rounded-3xl border border-[#2E1220]/15 shadow-[0_8px_30px_rgba(46,18,35,0.04)] flex flex-col gap-4">
                <div>
                  <h3 className="text-lg font-serif font-bold text-[#1A0512]">
                    Event Requirement Form
                  </h3>
                  <p className="text-xs text-[#2E1220]/60 mt-1">
                    Describe your criteria or use the AI intake text box to auto-parse parameters.
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  <label className="text-[10px] font-bold text-[#2E1220]/50 uppercase tracking-wider">
                    AI Plain-English Intake
                  </label>
                  <textarea
                    rows={3}
                    value={freeTextPrompt}
                    onChange={(e) => setFreeTextPrompt(e.target.value)}
                    placeholder="E.g. Traditional wedding decorator in Chennai on Oct 12..."
                    className="w-full bg-[#FAF7F2] border border-[#2E1220]/15 rounded-2xl p-3.5 text-xs text-[#1A0512] focus:outline-none focus:border-[#C96C52] focus:ring-1 focus:ring-[#C96C52] leading-relaxed"
                  />
                  <button
                    type="button"
                    onClick={handleAIFreeTextParse}
                    disabled={parsingAI}
                    className="py-2.5 px-4 rounded-xl bg-white border border-[#2E1220]/15 hover:border-[#C96C52] text-xs font-bold text-[#C96C52] transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-sm"
                  >
                    {parsingAI ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        AI Parsing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Run AI Parse
                      </>
                    )}
                  </button>
                </div>

                <div className="border-t border-[#2E1220]/10 my-1"></div>

                <form onSubmit={handleSubmitRequirement} className="flex flex-col gap-4">
                  {/* Category Selection */}
                  <div>
                    <label className="text-[10px] font-bold text-[#2E1220]/50 uppercase tracking-wider block mb-2">
                      Event Category
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {['decorator', 'caterer', 'photographer', 'venue'].map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setEventType(cat)}
                          className={`py-2.5 rounded-xl border text-xs capitalize text-center transition-all focus:outline-none focus:ring-1 focus:ring-[#C96C52] ${
                            eventType === cat 
                              ? 'border-[#C96C52] bg-[#C96C52]/5 text-[#C96C52] font-bold shadow-sm' 
                              : 'border-[#2E1220]/10 bg-white text-[#2E1220]/70 hover:border-[#2E1220]/30'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* City & Date */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-[#2E1220]/50 uppercase tracking-wider block mb-1">
                        Operating City
                      </label>
                      <select 
                        value={city} 
                        onChange={(e) => setCity(e.target.value)}
                        className="w-full bg-[#FAF7F2] border border-[#2E1220]/15 rounded-xl p-3 text-xs text-[#1A0512] font-semibold focus:outline-none focus:border-[#C96C52]"
                      >
                        <option value="Chennai">Chennai</option>
                        <option value="Bangalore">Bangalore</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#2E1220]/50 uppercase tracking-wider block mb-1">
                        Event Date
                      </label>
                      <input 
                        type="date"
                        value={eventDate}
                        onChange={(e) => setEventDate(e.target.value)}
                        className="w-full bg-[#FAF7F2] border border-[#2E1220]/15 rounded-xl p-2.5 text-xs text-[#1A0512] font-semibold focus:outline-none focus:border-[#C96C52]"
                      />
                    </div>
                  </div>

                  {/* Zone presets */}
                  <div>
                    <label className="text-[10px] font-bold text-[#2E1220]/50 uppercase tracking-wider block mb-1.5">
                      Event Location Zone Coordinate
                    </label>
                    <div className="grid grid-cols-1 gap-1.5">
                      {locationPresets[city]?.map((pres) => (
                        <button
                          key={pres.name}
                          type="button"
                          onClick={() => handlePresetChange(pres.lat, pres.lng)}
                          className={`text-xs p-2.5 text-left rounded-xl border flex justify-between items-center transition-all focus:outline-none focus:ring-1 focus:ring-[#C96C52] ${
                            latitude === pres.lat && longitude === pres.lng
                              ? 'border-[#C96C52] bg-[#C96C52]/5 text-[#C96C52] font-bold'
                              : 'border-[#2E1220]/10 bg-white text-[#2E1220]/60 hover:bg-[#FAF7F2]'
                          }`}
                        >
                          <span className="flex items-center gap-1.5"><MapPin className="h-4.5 w-4.5" /> {pres.name}</span>
                          <span className="opacity-70 text-[9px] font-mono">{pres.lat.toFixed(4)}, {pres.lng.toFixed(4)}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Guests & Budget */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-[#2E1220]/50 uppercase tracking-wider block mb-1">
                        Guests Count
                      </label>
                      <div className="flex items-center bg-[#FAF7F2] border border-[#2E1220]/15 rounded-xl px-2.5 focus-within:border-[#C96C52]">
                        <Users className="h-4.5 w-4.5 text-[#2E1220]/45" />
                        <input 
                          type="number"
                          value={guestCount}
                          onChange={(e) => setGuestCount(Number(e.target.value))}
                          className="w-full bg-transparent p-2.5 text-xs focus:outline-none text-[#1A0512] font-semibold"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-[#2E1220]/50 uppercase tracking-wider block mb-1">
                        Budget Limit
                      </label>
                      <div className="flex items-center bg-[#FAF7F2] border border-[#2E1220]/15 rounded-xl px-2.5 focus-within:border-[#C96C52]">
                        <span className="text-[11px] text-[#2E1220]/45 font-bold px-0.5">₹</span>
                        <input 
                          type="number"
                          value={budget}
                          onChange={(e) => setBudget(Number(e.target.value))}
                          className="w-full bg-transparent p-2.5 text-xs focus:outline-none text-[#1A0512] font-semibold"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Theme text */}
                  <div>
                    <label className="text-[10px] font-bold text-[#2E1220]/50 uppercase tracking-wider block mb-1">
                      Theme description keywords
                    </label>
                    <textarea
                      rows={2}
                      value={theme}
                      onChange={(e) => setTheme(e.target.value)}
                      className="w-full bg-[#FAF7F2] border border-[#2E1220]/15 rounded-xl p-3 text-xs text-[#1A0512] focus:outline-none focus:border-[#C96C52]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3.5 rounded-xl bg-[#C96C52] hover:bg-[#B75C43] text-white text-xs font-bold tracking-wide transition-all shadow-md flex items-center justify-center gap-2 mt-1 disabled:opacity-50"
                  >
                    {loading ? (
                      <RefreshCw className="h-4.5 w-4.5 animate-spin" />
                    ) : (
                      <>
                        <Send className="h-4.5 w-4.5" />
                        Run Matching Query
                      </>
                    )}
                  </button>
                </form>

                {/* Submissions scroll log */}
                <div className="border-t border-[#2E1220]/10 pt-4.5 mt-1 flex flex-col gap-2.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-[#2E1220]/50">
                    Recent Requirements History ({requirementsList.length})
                  </span>
                  <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto pr-1">
                    {requirementsList.map((req) => (
                      <button
                        key={req.id}
                        onClick={() => fetchMatches(req.id)}
                        className={`p-2.5 rounded-xl text-left text-xs transition-all flex justify-between items-center border focus:outline-none focus:ring-1 focus:ring-[#C96C52] ${
                          selectedRequirement?.id === req.id
                            ? 'bg-[#FAF7F2] border-[#C96C52]/30 text-[#C96C52] font-bold shadow-sm'
                            : 'bg-transparent border-transparent text-[#2E1220]/70 hover:bg-[#FAF7F2]/50'
                        }`}
                      >
                        <div className="truncate pr-2">
                          <span className="font-serif font-bold text-[#1A0512] capitalize">{req.eventType}</span>
                          <span className="text-[10px] text-[#2E1220]/50 block truncate mt-0.5">{req.theme || 'No theme description'}</span>
                        </div>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                          req.status === 'booked' ? 'bg-[#5B7C62]/10 text-[#5B7C62]' : 'bg-slate-200 text-slate-650'
                        }`}>
                          {req.status}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            </div>

            {/* Column 2 & 3: Match Feed Recommendations */}
            <div className="lg:col-span-2 flex flex-col gap-6">
              
              {/* Selected Requirement header summary */}
              {selectedRequirement ? (
                <div className="bg-white p-6 rounded-3xl border border-[#2E1220]/15 shadow-[0_8px_30px_rgba(46,18,35,0.04)] flex justify-between items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-[#2E1220]/5 text-[#2E1220] border border-[#2E1220]/10 px-2.5 py-0.5 rounded-full">
                        {selectedRequirement.eventType}
                      </span>
                      <span className="text-xs text-[#2E1220]/75 flex items-center gap-1 font-semibold">
                        <MapPin className="h-4.5 w-4.5 text-[#C96C52]" /> {selectedRequirement.city}
                      </span>
                      <span className="text-xs text-[#2E1220]/75 flex items-center gap-1 font-semibold">
                        <Calendar className="h-4.5 w-4.5 text-[#C96C52]" /> {new Date(selectedRequirement.eventDate).toLocaleDateString()}
                      </span>
                    </div>
                    <h3 className="text-xl font-serif font-bold text-[#1A0512] leading-snug">
                      Theme: {selectedRequirement.theme || 'Default Theme'}
                    </h3>
                    <p className="text-xs text-[#2E1220]/60 mt-1.5">
                      Budget Scale: <span className="font-bold text-[#C96C52] text-sm">₹{selectedRequirement.budget.toLocaleString('en-IN')}</span>
                    </p>
                  </div>
                  
                  <div className="text-right">
                    <span className="text-[9px] text-[#2E1220]/50 block uppercase tracking-wider font-bold">Status</span>
                    <span className={`text-[10px] font-bold px-3 py-1 rounded-lg block mt-1.5 ${
                      selectedRequirement.status === 'booked' 
                        ? 'bg-[#5B7C62]/10 border border-[#5B7C62]/20 text-[#5B7C62]' 
                        : 'bg-[#2E1220]/5 text-[#2E1220]/70'
                    }`}>
                      {selectedRequirement.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="bg-white p-20 rounded-3xl text-center text-[#2E1220]/50 border-dashed border-2 border-[#2E1220]/15 shadow-[0_8px_30px_rgba(46,18,35,0.02)]">
                  <Sparkles className="h-12 w-12 text-[#C96C52]/30 mx-auto mb-4 animate-pulse" />
                  <h3 className="font-serif text-xl font-bold text-[#1A0512]">No Active Matching Run</h3>
                  <p className="text-xs mt-2 max-w-sm mx-auto leading-relaxed text-[#2E1220]/70">
                    Select one of the premium quick presets on the left or enter event parameters to run the semantic matching algorithms.
                  </p>
                </div>
              )}

              {/* Status Banner */}
              {responseStatusMsg && (
                <div className="bg-[#5B7C62]/10 border border-[#5B7C62]/25 text-[#5B7C62] px-5 py-3.5 rounded-2xl text-xs font-semibold flex items-center gap-2 animate-bounce shadow-sm">
                  <CheckCircle className="h-5 w-5 text-[#5B7C62] flex-shrink-0" />
                  <span>{responseStatusMsg}</span>
                </div>
              )}

              {/* Match list */}
              {selectedRequirement && (
                <div className="flex flex-col gap-6">
                  
                  {/* Advanced UX: Match Recommendation Filters */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-[#2E1220]/10 pb-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#2E1220]/50 flex items-center gap-1.5">
                      <Filter className="h-4 w-4" /> Suggestions filters
                    </h3>
                    <div className="flex p-0.5 rounded-xl border bg-white border-[#2E1220]/15 shadow-sm">
                      {[
                        { key: 'all', label: 'All suggestions' },
                        { key: 'invited', label: 'Invited' },
                        { key: 'booked', label: 'Booked' },
                        { key: 'skipped', label: 'Skipped (Cap)' }
                      ].map((tab) => (
                        <button
                          key={tab.key}
                          onClick={() => setMatchStatusFilter(tab.key as any)}
                          className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${
                            matchStatusFilter === tab.key
                              ? 'bg-[#C96C52] text-white shadow-sm'
                              : 'text-[#2E1220]/60 hover:text-[#2E1220]'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {filteredMatches.length === 0 ? (
                    <div className="p-12 bg-white border border-[#2E1220]/15 rounded-3xl text-center text-xs text-[#2E1220]/60">
                      No matching vendors in this filter group.
                    </div>
                  ) : (
                    filteredMatches.map((match, idx) => (
                      <div 
                        key={match.id} 
                        className={`p-6 rounded-3xl transition-all duration-300 bg-white border border-[#2E1220]/15 shadow-[0_8px_30px_rgba(46,18,35,0.04)] hover:-translate-y-1 hover:shadow-md hover:border-[#2E1220]/25 ${
                          match.overrideStatus === 'force_invite'
                            ? 'border-indigo-300 bg-indigo-50/5'
                            : ''
                        }`}
                      >
                        {/* Card Header */}
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <span className="font-serif font-bold text-[#1A0512] text-lg">{idx + 1}. {match.businessName}</span>
                              {match.overrideStatus === 'boosted' && (
                                <span className="text-[9px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded border border-amber-250 font-bold uppercase">
                                  Admin Boosted
                                </span>
                              )}
                              {match.overrideStatus === 'force_invite' && (
                                <span className="text-[9px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded border border-indigo-200 font-bold uppercase">
                                  Force Invited
                                </span>
                              )}
                              {match.skipReason === 'invite_cap_reached' && (
                                <span className="text-[9px] bg-rose-50 text-rose-600 px-2 py-0.5 rounded border border-rose-200 font-bold uppercase flex items-center gap-1">
                                  <AlertTriangle className="h-3.5 w-3.5" /> Skipped: Cap Reached
                                </span>
                              )}
                              {match.scoreBreakdown.coldStartBoost > 0 && (
                                <span className="text-[9px] bg-rose-50 text-rose-500 px-2 py-0.5 rounded border border-rose-200 font-bold uppercase animate-pulse">
                                  Cold Start
                                </span>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-4 text-xs text-[#2E1220]/60">
                              <span className="flex items-center gap-0.5 text-amber-550 font-bold">
                                <Star className="h-4 w-4 fill-amber-500 text-transparent" /> {match.rating > 0 ? match.rating.toFixed(1) : 'New'}
                              </span>
                              <span>Category: <span className="text-[#1A0512] capitalize font-semibold">{match.category}</span></span>
                              <span>City: <span className="text-[#1A0512] font-semibold">{match.operatingCity}</span></span>
                            </div>
                          </div>

                          {/* Signature Match Alignment Prism */}
                          <div className="relative flex items-center justify-center select-none" title="Score Prism Breakdown: Outer Green = Theme, Middle Terracotta = Budget, Inner Fig = Proximity">
                            <svg className="h-20 w-20 transform -rotate-90" viewBox="0 0 100 100">
                              {/* Track circles */}
                              <circle cx="50" cy="50" r="38" fill="transparent" stroke="#F5F2EA" strokeWidth="4" />
                              <circle cx="50" cy="50" r="28" fill="transparent" stroke="#F5F2EA" strokeWidth="4" />
                              <circle cx="50" cy="50" r="18" fill="transparent" stroke="#F5F2EA" strokeWidth="4" />

                              {/* Outer Circle: Theme Match (Sage) */}
                              <circle cx="50" cy="50" r="38" fill="transparent" stroke="#5B7C62" strokeWidth="5.5" 
                                      strokeDasharray={2 * Math.PI * 38} 
                                      strokeDashoffset={2 * Math.PI * 38 * (1 - match.scoreBreakdown.capabilityFit / 100)} 
                                      strokeLinecap="round" />
                                      
                              {/* Middle Circle: Budget Match (Terracotta) */}
                              <circle cx="50" cy="50" r="28" fill="transparent" stroke="#C96C52" strokeWidth="5.5" 
                                      strokeDasharray={2 * Math.PI * 28} 
                                      strokeDashoffset={2 * Math.PI * 28 * (1 - Math.max(0, match.scoreBreakdown.budgetAlignment) / 100)} 
                                      strokeLinecap="round" />
                                      
                              {/* Inner Circle: Distance Match (Fig) */}
                              <circle cx="50" cy="50" r="18" fill="transparent" stroke="#2E1220" strokeWidth="5.5" 
                                      strokeDasharray={2 * Math.PI * 18} 
                                      strokeDashoffset={2 * Math.PI * 18 * (1 - match.scoreBreakdown.distanceDecay / 100)} 
                                      strokeLinecap="round" />
                            </svg>
                            <div className="absolute flex flex-col items-center justify-center">
                              <span className="text-xs font-serif font-bold text-[#1A0512]">{match.rawScore}%</span>
                            </div>
                          </div>
                        </div>

                        {/* Breakdown Key */}
                        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[9px] text-[#2E1220]/50 justify-end border-b border-[#2E1220]/10 pb-2.5">
                          <span className="flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#5B7C62]"></span> Theme Alignment: {match.scoreBreakdown.capabilityFit}%
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#C96C52]"></span> Budget Fit: {match.scoreBreakdown.budgetAlignment}%
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#2E1220]"></span> Proximity Fit: {match.scoreBreakdown.distanceDecay}%
                          </span>
                        </div>

                        {/* AI Match Explanation */}
                        {match.aiExplanationUser && (
                          <div className="mt-4 bg-[#FAF7F2] p-4.5 rounded-2xl text-xs border border-[#2E1220]/10 text-[#1A0512]/90 shadow-inner">
                            <div className="flex gap-2 items-start">
                              <Sparkles className="h-4.5 w-4.5 text-[#C96C52] flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="font-serif font-bold text-[10px] text-[#2E1220] tracking-wider uppercase">
                                  Why matched to you
                                </p>
                                <p className="mt-1.5 leading-relaxed italic text-[#2E1220]">
                                  "{match.aiExplanationUser}"
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Invitation Outreach portal */}
                        <div className="mt-5 flex flex-col md:flex-row justify-between items-center gap-4 pt-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-[#2E1220]/60 font-semibold">Invitation Status:</span>
                            {match.latestInvitation ? (
                              <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded ${
                                match.latestInvitation.status === 'accepted'
                                  ? 'bg-[#5B7C62]/10 text-[#5B7C62]'
                                  : match.latestInvitation.status === 'declined'
                                  ? 'bg-rose-50 text-rose-600 border border-rose-100'
                                  : 'bg-indigo-50 text-indigo-650 border border-indigo-150 animate-pulse'
                              }`}>
                                {match.latestInvitation.status.toUpperCase()}
                              </span>
                            ) : (
                              <span className="text-[10px] text-[#2E1220]/50 italic">Not Invited</span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                            {!match.latestInvitation && (
                              <button
                                onClick={() => sendManualInvitation(match.id)}
                                className="py-1.5 px-4 bg-white border border-[#2E1220]/20 hover:border-[#C96C52] text-xs font-bold text-[#C96C52] rounded-xl transition-all shadow-sm focus:outline-none focus:ring-1 focus:ring-[#C96C52]"
                              >
                                Send Match Invite
                              </button>
                            )}

                            {match.latestInvitation && match.latestInvitation.status === 'sent' && (
                              <span className="text-xs text-indigo-650 flex items-center gap-1.5 font-semibold bg-indigo-50 px-3 py-1 rounded-xl border border-indigo-150 animate-pulse">
                                <Clock className="h-4 w-4 text-indigo-600" /> Awaiting Reply
                              </span>
                            )}

                            {match.latestInvitation && match.latestInvitation.status === 'accepted' && (
                              <span className="text-xs text-[#5B7C62] flex items-center gap-1.5 font-bold bg-[#5B7C62]/10 px-3 py-1 rounded-xl border border-[#5B7C62]/20">
                                <CheckCircle className="h-4 w-4" /> Booked Match
                              </span>
                            )}

                            {match.latestInvitation && match.latestInvitation.status === 'declined' && (
                              <span className="text-xs text-rose-600 flex items-center gap-1.5 font-semibold bg-rose-50 px-3 py-1 rounded-xl border border-rose-150">
                                <AlertTriangle className="h-4 w-4 text-rose-605" /> Declined Invite
                              </span>
                            )}
                          </div>
                        </div>

                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

          </div>
        )}

        {/* ============================================================= */}
        {/* TAB 1.5: VENDOR PORTAL INVITATIONS (Light-Mode) */}
        {/* ============================================================= */}
        {activeTab === 'vendor_portal' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start font-sans">
            
            {/* Left Column: Vendor Picker Sidebar */}
            <div className="lg:col-span-1 bg-white p-6 rounded-3xl border border-[#2E1220]/15 shadow-[0_8px_30px_rgba(46,18,35,0.04)] flex flex-col gap-4">
              <div>
                <h2 className="text-md font-serif font-bold text-[#1A0512]">
                  Select Vendor Profile
                </h2>
                <p className="text-[10px] text-[#2E1220]/50 uppercase tracking-wider font-bold mt-0.5">
                  Demo Auth Bypass picker
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-[#2E1220]/50 uppercase tracking-wider">
                  Select Active Vendor
                </label>
                <select
                  value={selectedVendorId}
                  onChange={(e) => setSelectedVendorId(e.target.value)}
                  className="bg-[#FAF7F2] border border-[#2E1220]/15 rounded-xl p-3 text-xs text-[#1A0512] font-semibold focus:outline-none focus:border-[#C96C52]"
                >
                  <option value="">-- Choose Vendor --</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.businessName} ({v.category})
                    </option>
                  ))}
                </select>
              </div>

              {selectedVendorId && (
                <div className="bg-[#FAF7F2] p-4 rounded-2xl border border-[#2E1220]/10 flex flex-col gap-2.5 text-xs text-[#2E1220]/70">
                  <span className="text-[9px] text-[#2E1220]/45 font-bold uppercase tracking-wider">Vendor Stats Overview</span>
                  {vendors.find(v => v.id === selectedVendorId)?.profile?.imageUrl && (
                    <img 
                      src={vendors.find(v => v.id === selectedVendorId)?.profile?.imageUrl || ''} 
                      alt="vendor" 
                      className="w-full h-32 object-cover rounded-xl border border-[#2E1220]/10 shadow-sm mb-1" 
                    />
                  )}
                  <div>
                    <span className="font-semibold text-[#1A0512]">Operating City:</span> {vendors.find(v => v.id === selectedVendorId)?.operatingCity}
                  </div>
                  <div>
                    <span className="font-semibold text-[#1A0512]">Experience:</span> {vendors.find(v => v.id === selectedVendorId)?.profile?.experienceYears} yrs
                  </div>
                  <div>
                    <span className="font-semibold text-[#1A0512]">Star Rating:</span> {vendors.find(v => v.id === selectedVendorId)?.profile?.ratingsAvg || 'New'} ⭐
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Invitations Feed & Outreach Replies */}
            <div className="lg:col-span-3 flex flex-col gap-6">
              
              {/* Selected Vendor invitation summary banner */}
              {selectedVendorId ? (
                <div className="bg-white p-6 rounded-3xl border border-[#2E1220]/15 shadow-[0_8px_30px_rgba(46,18,35,0.04)]">
                  <h2 className="text-lg font-serif font-bold text-[#1A0512]">
                    Match Invitations for {vendors.find(v => v.id === selectedVendorId)?.businessName}
                  </h2>
                  <p className="text-xs text-[#2E1220]/65 mt-1">
                    Manage direct matching invitations, send custom quotes, or decline requests due to constraints.
                  </p>
                </div>
              ) : (
                <div className="bg-white p-16 text-center text-[#2E1220]/50 rounded-3xl border border-[#2E1220]/15 flex flex-col items-center justify-center gap-3.5 shadow-sm">
                  <Users className="h-10 w-10 text-[#C96C52]/40 animate-pulse" />
                  <h3 className="font-serif text-md font-bold text-[#1A0512]">No Vendor Profile Selected</h3>
                  <p className="text-xs max-w-xs mx-auto leading-relaxed text-[#2E1220]/60">
                    Please select a vendor profile from the dropdown list on the left to view active invitations and submit simulated response quotes.
                  </p>
                </div>
              )}

              {/* Status alerts */}
              {responseStatusMsg && (
                <div className="bg-[#5B7C62]/10 border border-[#5B7C62]/25 text-[#5B7C62] px-5 py-3.5 rounded-2xl text-xs font-semibold flex items-center gap-2 animate-bounce shadow-sm">
                  <CheckCircle className="h-5 w-5 text-[#5B7C62] flex-shrink-0" />
                  <span>{responseStatusMsg}</span>
                </div>
              )}

              {/* Invitations Cards List */}
              {selectedVendorId && (
                <div className="flex flex-col gap-6">
                  {vendorInvitations.length === 0 ? (
                    <div className="p-16 text-center text-xs text-[#2E1220]/60 bg-white border border-[#2E1220]/15 rounded-3xl shadow-sm">
                      No active invitations for this vendor. Create a client matching request matching this category to trigger staggered outreach!
                    </div>
                  ) : (
                    vendorInvitations.map((inv) => {
                      const quoteVal = vendorQuoteAmounts[inv.invitationId] ?? Math.round(inv.requirement.budget * 0.95);
                      const msgVal = vendorQuoteMessages[inv.invitationId] ?? 'We would love to do this! We have standard packages matching your theme.';
                      const declineVal = vendorDeclineReasons[inv.invitationId] ?? 'Fully Booked';

                      return (
                        <div 
                          key={inv.invitationId} 
                          className="bg-white p-6 rounded-3xl border border-[#2E1220]/15 shadow-[0_8px_30px_rgba(46,18,35,0.04)] flex flex-col gap-4"
                        >
                          {/* Header */}
                          <div className="flex justify-between items-start gap-4">
                            <div>
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <span className="text-[10px] font-bold uppercase tracking-wider bg-[#C96C52]/5 text-[#C96C52] border border-[#C96C52]/10 px-2 py-0.5 rounded-lg">
                                  {inv.requirement.eventType.toUpperCase()}
                                </span>
                                <span className="text-xs text-[#2E1220]/70 font-semibold flex items-center gap-1">
                                  <MapPin className="h-4 w-4 text-[#C96C52]" /> {inv.requirement.city}
                                </span>
                                <span className="text-xs text-[#2E1220]/70 font-semibold flex items-center gap-1">
                                  <Calendar className="h-4 w-4 text-[#C96C52]" /> {new Date(inv.requirement.eventDate).toLocaleDateString()}
                                </span>
                              </div>
                              <h3 className="text-md font-serif font-bold text-[#1A0512]">
                                Theme: {inv.requirement.theme || 'Default Theme'}
                              </h3>
                              <p className="text-xs text-[#2E1220]/50 block mt-1">
                                Client Budget ceiling: <span className="font-bold text-[#C96C52]">₹{inv.requirement.budget.toLocaleString('en-IN')}</span>
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="text-[9px] text-[#2E1220]/50 uppercase tracking-wider font-bold block">Sent At</span>
                              <span className="text-[10px] text-[#1A0512] font-semibold mt-1 block">
                                {new Date(inv.sentAt).toLocaleTimeString()}
                              </span>
                            </div>
                          </div>

                          {/* Why Invited block */}
                          {inv.aiExplanationVendor && (
                            <div className="bg-[#FAF7F2] p-4.5 rounded-2xl border border-[#2E1220]/10 text-xs text-[#1A0512]/90 shadow-inner">
                              <div className="flex gap-2 items-start">
                                <Sparkles className="h-4.5 w-4.5 text-[#C96C52] flex-shrink-0 mt-0.5" />
                                <div>
                                  <p className="font-serif font-bold text-[10px] text-[#2E1220] tracking-wider uppercase">
                                    Why you were matched
                                  </p>
                                  <p className="mt-1.5 leading-relaxed italic text-[#2E1220]">
                                    "{inv.aiExplanationVendor}"
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Simulated response form block */}
                          <div className="border-t border-[#2E1220]/10 pt-4 mt-1 flex flex-col md:flex-row justify-between items-center gap-4">
                            <span className="text-xs text-[#2E1220]/60 font-semibold">Response:</span>
                            
                            <div className="flex flex-col gap-2 w-full lg:w-auto">
                              <div className="flex flex-col sm:flex-row flex-wrap gap-2 items-stretch sm:items-center justify-end">
                                <span className="text-[10px] text-[#2E1220]/65 font-bold uppercase select-none flex items-center sm:justify-end">Quote Amount (₹):</span>
                                <input 
                                  type="number"
                                  value={quoteVal}
                                  onChange={(e) => {
                                    setVendorQuoteAmounts({
                                      ...vendorQuoteAmounts,
                                      [inv.invitationId]: Number(e.target.value)
                                    });
                                  }}
                                  className="w-full sm:w-28 bg-[#FAF7F2] border border-[#2E1220]/15 p-2 text-xs rounded-xl focus:outline-none focus:border-[#C96C52] text-[#1A0512] font-semibold"
                                />
                                <input 
                                  type="text"
                                  value={msgVal}
                                  onChange={(e) => {
                                    setVendorQuoteMessages({
                                      ...vendorQuoteMessages,
                                      [inv.invitationId]: e.target.value
                                    });
                                  }}
                                  placeholder="Reply notes..."
                                  className="w-full sm:w-48 bg-[#FAF7F2] border border-[#2E1220]/15 p-2 text-xs rounded-xl focus:outline-none focus:border-[#C96C52] text-[#1A0512]"
                                />
                                <button
                                  onClick={() => handleVendorResponsePortal(inv.invitationId, 'accepted', quoteVal, msgVal)}
                                  className="py-2 px-4 w-full sm:w-auto bg-[#5B7C62] hover:bg-[#4E6B54] text-xs font-bold text-white rounded-xl transition-all shadow-md text-center justify-center flex items-center"
                                >
                                  Accept & Send Quote
                                </button>
                              </div>

                              <div className="border-t border-[#2E1220]/10 my-1"></div>

                              <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-end">
                                <span className="text-[10px] text-[#2E1220]/65 font-bold uppercase select-none flex items-center sm:justify-end">Decline reason:</span>
                                <select
                                  value={declineVal}
                                  onChange={(e) => {
                                    setVendorDeclineReasons({
                                      ...vendorDeclineReasons,
                                      [inv.invitationId]: e.target.value
                                    });
                                  }}
                                  className="w-full sm:w-auto bg-white border border-[#2E1220]/15 p-2 text-xs rounded-xl text-[#1A0512] font-semibold focus:outline-none"
                                >
                                  <option value="Fully Booked">Fully Booked</option>
                                  <option value="Budget Too Low">Budget Too Low</option>
                                  <option value="Distance Too Far">Distance Too Far</option>
                                </select>
                                <button
                                  onClick={() => handleVendorResponsePortal(inv.invitationId, 'declined', null, declineVal)}
                                  className="py-2 px-4 w-full sm:w-auto bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white rounded-xl transition-all shadow-md text-center justify-center flex items-center"
                                >
                                  Decline Match
                                </button>
                              </div>
                            </div>

                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

            </div>

          </div>
        )}

        {/* ============================================================= */}
        {/* TAB 2: PLATFORM ADMIN CONTROL PANEL & OVERRIDES (Light-Mode) */}
        {/* ============================================================= */}
        {activeTab === 'admin' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start font-sans">
            
            {/* Left Column: Requirements list */}
            <div className="lg:col-span-1 bg-white p-6 rounded-3xl border border-[#2E1220]/15 shadow-[0_8px_30px_rgba(46,18,35,0.04)] flex flex-col gap-4">
              <div>
                <h2 className="text-md font-serif font-bold text-[#1A0512] flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-[#C96C52]" /> Active Event Ledger
                </h2>
                <p className="text-[10px] text-[#2E1220]/50 mt-0.5 uppercase font-bold tracking-wider">
                  Audit logs and override limits.
                </p>
              </div>

              <div className="flex flex-col gap-2.5 max-h-[380px] overflow-y-auto pr-1">
                {requirementsList.map((req) => (
                  <button
                    key={req.id}
                    onClick={() => fetchMatches(req.id)}
                    className={`p-4 rounded-2xl text-left text-xs transition-all border-y border-r flex flex-col gap-1.5 focus:outline-none shadow-sm hover:shadow ${
                      selectedRequirement?.id === req.id
                        ? 'border-l-4 border-l-[#C96C52] border-y-[#2E1220]/15 border-r-[#2E1220]/15 bg-[#FAF7F2] text-[#1A0512] font-bold'
                        : 'border-l-4 border-l-transparent border-y-[#2E1220]/10 border-r-[#2E1220]/10 hover:border-l-[#C96C52]/50 hover:bg-[#FAF7F2]/30 bg-white text-[#2E1220]/75'
                    }`}
                  >
                    <div className="flex justify-between items-center w-full">
                      <span className="font-serif font-bold capitalize text-[#1A0512] text-sm">{req.eventType}</span>
                      <span className={`text-[9px] px-2.5 py-0.5 rounded-lg border font-bold ${
                        req.status === 'booked' 
                          ? 'bg-[#5B7C62]/10 border-[#5B7C62]/20 text-[#5B7C62]' 
                          : 'bg-[#C96C52]/10 border-[#C96C52]/20 text-[#C96C52]'
                      }`}>
                        {req.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="text-[10px] text-[#2E1220]/65 truncate w-full italic">Theme: "{req.theme || 'N/A'}"</div>
                    <div className="flex justify-between text-[9px] text-[#2E1220]/50 pt-2.5 mt-1.5 border-t border-[#2E1220]/10 w-full font-semibold">
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3 text-[#C96C52]" /> {new Date(req.eventDate).toLocaleDateString()}</span>
                      <span>Budget: ₹{req.budget.toLocaleString('en-IN')}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Right Column: Selected Matches and Override History logs */}
            <div className="lg:col-span-2 flex flex-col gap-6">
              
              {/* Override Control */}
              {selectedRequirement ? (
                <div className="bg-white p-6 rounded-3xl border border-[#2E1220]/15 shadow-[0_8px_30px_rgba(46,18,35,0.04)] flex flex-col gap-4">
                  <div>
                    <span className="text-[9px] text-[#2E1220]/50 block uppercase tracking-wider font-bold">
                      Override Control / Requirement ID:
                    </span>
                    <h3 className="text-xs font-mono font-bold text-[#C96C52] truncate">{selectedRequirement.id}</h3>
                  </div>

                  <div className="flex flex-col gap-3">
                    <span className="text-[10px] font-bold text-[#2E1220]/40 uppercase tracking-wider block">
                      Candidate Scoring adjustments
                    </span>

                    <div className="flex flex-col gap-2">
                      {matches.map((match, idx) => (
                        <div 
                          key={match.id}
                          className="bg-[#FAF7F2] p-4 rounded-2xl border border-[#2E1220]/10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-[#2E1220]/20 transition-all text-xs text-[#1A0512]"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-[#1A0512]">{idx + 1}. {match.businessName}</span>
                              <span className="text-[9px] bg-white px-2 py-0.5 rounded text-[#2E1220]/80 border border-[#2E1220]/10 font-bold">
                                Score: {match.baseScore}%
                              </span>
                              {match.overrideStatus !== 'none' && (
                                <span className="text-[8px] bg-[#C96C52]/10 text-[#C96C52] px-2 py-0.5 rounded border border-[#C96C52]/20 uppercase font-bold">
                                  {match.overrideStatus}
                                </span>
                              )}
                            </div>
                            
                            <div className="text-[10px] text-[#2E1220]/60 mt-1 flex gap-3 flex-wrap">
                              <span>Stars: {match.rating}</span>
                              <span>City: {match.operatingCity}</span>
                              {match.overrideReason && (
                                <span className="text-[#2E1220]/70 italic truncate max-w-xs">
                                  Reason: "{match.overrideReason}"
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            <button
                              onClick={() => applyAdminOverride(match.id, match.overrideStatus === 'boosted' ? 'none' : 'boosted')}
                              className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all shadow-sm ${
                                match.overrideStatus === 'boosted'
                                  ? 'bg-amber-600 text-white'
                                  : 'bg-white border border-[#2E1220]/15 hover:border-[#C96C52] text-[#2E1220]/80 hover:text-[#C96C52]'
                              }`}
                            >
                              Boost (+20)
                            </button>
                            <button
                              disabled={match.latestInvitation !== null}
                              onClick={() => applyAdminOverride(match.id, 'force_invite')}
                              className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all disabled:opacity-50 shadow-sm ${
                                match.overrideStatus === 'force_invite'
                                  ? 'bg-[#C96C52] text-white'
                                  : 'bg-white border border-[#2E1220]/15 hover:border-[#C96C52] text-[#2E1220]/80 hover:text-[#C96C52]'
                              }`}
                            >
                              Force
                            </button>
                            <button
                              onClick={() => applyAdminOverride(match.id, match.overrideStatus === 'excluded' ? 'none' : 'excluded')}
                              className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all shadow-sm ${
                                match.overrideStatus === 'excluded'
                                  ? 'bg-rose-600 text-white'
                                  : 'bg-white border border-[#2E1220]/15 hover:border-[#C96C52] text-[#2E1220]/80 hover:text-[#C96C52]'
                              }`}
                            >
                              Exclude
                            </button>
                            {match.overrideStatus !== 'none' && (
                              <button
                                onClick={() => applyAdminOverride(match.id, 'none')}
                                className="px-2 py-1.5 rounded-xl bg-white border border-transparent hover:border-[#2E1220]/15 text-[10px] text-[#2E1220]/50"
                              >
                                Reset
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white p-16 text-center text-[#2E1220]/50 rounded-3xl border border-[#2E1220]/15 flex flex-col items-center justify-center gap-3.5 shadow-sm">
                  <Database className="h-10 w-10 text-[#C96C52]/40 animate-pulse" />
                  <h3 className="font-serif text-md font-bold text-[#1A0512]">No Active Audit Selection</h3>
                  <p className="text-xs max-w-xs mx-auto leading-relaxed text-[#2E1220]/60">
                    Select an event requirement ledger item from the log to audit score weights, apply custom boosts, or manage exclusions.
                  </p>
                </div>
              )}

              {/* Override audit trail list */}
              <div className="bg-white p-6 rounded-3xl border border-[#2E1220]/15 shadow-[0_8px_30px_rgba(46,18,35,0.04)] flex flex-col gap-3.5">
                <div className="flex items-center gap-1.5 border-b border-[#2E1220]/10 pb-2.5">
                  <History className="h-4.5 w-4.5 text-[#C96C52]" />
                  <h3 className="text-xs font-serif font-bold text-[#1A0512] uppercase tracking-wider">
                    Override Action Logs
                  </h3>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left text-[#1A0512]">
                    <thead className="text-[9px] text-[#2E1220]/50 uppercase border-b border-[#2E1220]/10 font-bold">
                      <tr>
                        <th className="py-3">Timestamp</th>
                        <th>Vendor Name</th>
                        <th>Override Action</th>
                        <th>Delta Score</th>
                        <th>Reasoning</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2E1220]/10 text-xs">
                      {adminActions.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-[#2E1220]/50 italic">No manual overrides logged in database.</td>
                        </tr>
                      ) : (
                        adminActions.map((log) => (
                          <tr key={log.id} className="hover:bg-[#FAF7F2]/60">
                            <td className="py-3 text-[10px] text-[#2E1220]/50">{new Date(log.timestamp).toLocaleTimeString()}</td>
                            <td className="font-semibold text-[#1A0512]">{log.vendorName}</td>
                            <td>
                              <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold ${
                                log.actionType === 'boosted' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                                log.actionType === 'force_invite' ? 'bg-indigo-50 text-indigo-650 border border-indigo-150' :
                                log.actionType === 'excluded' ? 'bg-rose-50 text-rose-600 border border-rose-150' : 'bg-slate-100 text-slate-500'
                              }`}>
                                {log.actionType}
                              </span>
                            </td>
                            <td>{log.oldScore}% → {log.newScore}%</td>
                            <td className="italic text-[#2E1220]/60">{log.reason}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* ============================================================= */}
        {/* TAB 3: ANALYTICS & METRICS DASHBOARD (Light-Mode) */}
        {/* ============================================================= */}
        {activeTab === 'metrics' && !metrics && (
          <div className="bg-white p-12 text-center text-[#2E1220]/50 rounded-3xl border border-[#2E1220]/15 flex flex-col items-center justify-center gap-3 shadow-sm">
            <RefreshCw className="h-8 w-8 animate-spin text-[#C96C52]" />
            <p className="text-sm font-semibold text-[#1A0512]">Generating live platform telemetry ledger...</p>
          </div>
        )}

        {activeTab === 'metrics' && metrics && (
          <div className="flex flex-col gap-6 text-xs text-[#1A0512]">
            
            {/* KPI Cards Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              
              <div className="bg-white p-6 rounded-3xl border border-[#2E1220]/15 flex items-center justify-between shadow-[0_8px_30px_rgba(46,18,35,0.02)] hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                <div>
                  <span className="text-[10px] font-bold text-[#2E1220]/50 uppercase tracking-wider block">
                    Vendor Response Rate
                  </span>
                  <span className="text-3xl font-serif font-bold text-[#5B7C62] block mt-1">
                    {metrics.summary.responseRate}%
                  </span>
                  <span className="text-[9px] text-[#2E1220]/50 font-semibold block mt-1.5">
                    Match invite acceptance speed
                  </span>
                </div>
                <div className="bg-[#5B7C62]/10 p-3 rounded-2xl border border-[#5B7C62]/20">
                  <UserCheck className="h-5 w-5 text-[#5B7C62]" />
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-[#2E1220]/15 flex items-center justify-between shadow-[0_8px_30px_rgba(46,18,35,0.02)] hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                <div>
                  <span className="text-[10px] font-bold text-[#2E1220]/50 uppercase tracking-wider block">
                    Avg Response Speed
                  </span>
                  <span className="text-3xl font-serif font-bold text-amber-600 block mt-1">
                    {metrics.summary.avgResponseTimeMins} mins
                  </span>
                  <span className="text-[9px] text-[#2E1220]/50 font-semibold block mt-1.5">
                    Average time for reply callback
                  </span>
                </div>
                <div className="bg-amber-50 p-3 rounded-2xl border border-amber-250">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-[#2E1220]/15 flex items-center justify-between shadow-[0_8px_30px_rgba(46,18,35,0.02)] hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                <div>
                  <span className="text-[10px] font-bold text-[#2E1220]/50 uppercase tracking-wider block">
                    Booking Conversion
                  </span>
                  <span className="text-3xl font-serif font-bold text-[#C96C52] block mt-1">
                    {metrics.summary.bookingConversionRate}%
                  </span>
                  <span className="text-[9px] text-[#2E1220]/50 font-semibold block mt-1.5">
                    Conversion rate of matched leads
                  </span>
                </div>
                <div className="bg-[#C96C52]/10 p-3 rounded-2xl border border-[#C96C52]/20">
                  <TrendingUp className="h-5 w-5 text-[#C96C52]" />
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-[#2E1220]/15 flex items-center justify-between shadow-[0_8px_30px_rgba(46,18,35,0.02)] hover:shadow-md hover:-translate-y-1 transition-all duration-300">
                <div>
                  <span className="text-[10px] font-bold text-[#2E1220]/50 uppercase tracking-wider block">
                    Total Requirements
                  </span>
                  <span className="text-3xl font-serif font-bold text-[#1A0512] block mt-1">
                    {metrics.summary.totalRequirements} / {metrics.summary.totalBookings}
                  </span>
                  <span className="text-[9px] text-[#2E1220]/50 font-semibold block mt-1.5">
                    Total intake orders / bookings
                  </span>
                </div>
                <div className="bg-[#FAF7F2] p-3 rounded-2xl border border-[#2E1220]/10">
                  <BookOpen className="h-5 w-5 text-[#2E1220]/70" />
                </div>
              </div>

            </div>

            {/* Score Distribution Histogram */}
            <div className="bg-white p-6 rounded-3xl border border-[#2E1220]/15 shadow-[0_8px_30px_rgba(46,18,35,0.04)] flex flex-col gap-6">
              <div>
                <h3 className="text-md font-serif font-bold text-[#1A0512] uppercase tracking-wide">
                  Score Distribution Histogram
                </h3>
                <p className="text-[10px] text-[#2E1220]/50 mt-1 uppercase font-bold tracking-wider">
                  Latest Computed Query: 
                  <span className="text-[#C96C52] ml-1">
                    {metrics.lastRequirement 
                      ? `${metrics.lastRequirement.eventType} - "${metrics.lastRequirement.theme ? metrics.lastRequirement.theme.slice(0, 45) : 'Default'}..."` 
                      : 'N/A'}
                  </span>
                </p>
              </div>

              <div className="flex flex-col gap-4 max-w-xl text-xs">
                
                {/* Excellent Row */}
                <div className="flex items-center gap-4">
                  <span className="w-28 text-[#2E1220]/75 font-semibold">Excellent (90-100)</span>
                  <div className="flex-1 bg-[#FAF7F2] h-3.5 rounded-full overflow-hidden border border-[#2E1220]/10">
                    <div 
                      style={{ width: `${Math.min(100, (metrics.histogram.excellent || 0) * 10)}%` }} 
                      className="bg-[#5B7C62] h-full rounded-full transition-all duration-1000"
                    ></div>
                  </div>
                  <span className="w-8 text-right font-bold text-[#1A0512]">{metrics.histogram.excellent || 0}</span>
                </div>

                {/* Good Row */}
                <div className="flex items-center gap-4">
                  <span className="w-28 text-[#2E1220]/75 font-semibold">Good (80-89)</span>
                  <div className="flex-1 bg-[#FAF7F2] h-3.5 rounded-full overflow-hidden border border-[#2E1220]/10">
                    <div 
                      style={{ width: `${Math.min(100, (metrics.histogram.good || 0) * 10)}%` }} 
                      className="bg-[#5B7C62]/60 h-full rounded-full transition-all duration-1000"
                    ></div>
                  </div>
                  <span className="w-8 text-right font-bold text-[#1A0512]">{metrics.histogram.good || 0}</span>
                </div>

                {/* Average Row */}
                <div className="flex items-center gap-4">
                  <span className="w-28 text-[#2E1220]/75 font-semibold">Average (70-79)</span>
                  <div className="flex-1 bg-[#FAF7F2] h-3.5 rounded-full overflow-hidden border border-[#2E1220]/10">
                    <div 
                      style={{ width: `${Math.min(100, (metrics.histogram.average || 0) * 10)}%` }} 
                      className="bg-amber-500 h-full rounded-full transition-all duration-1000"
                    ></div>
                  </div>
                  <span className="w-8 text-right font-bold text-[#1A0512]">{metrics.histogram.average || 0}</span>
                </div>

                {/* Poor Row */}
                <div className="flex items-center gap-4">
                  <span className="w-28 text-[#2E1220]/75 font-semibold">Poor (&lt;70)</span>
                  <div className="flex-1 bg-[#FAF7F2] h-3.5 rounded-full overflow-hidden border border-[#2E1220]/10">
                    <div 
                      style={{ width: `${Math.min(100, (metrics.histogram.poor || 0) * 10)}%` }} 
                      className="bg-slate-400 h-full rounded-full transition-all duration-1000"
                    ></div>
                  </div>
                  <span className="w-8 text-right font-bold text-[#1A0512]">{metrics.histogram.poor || 0}</span>
                </div>

              </div>
            </div>

          </div>
        )}

        {/* ============================================================= */}
        {/* TAB 4: VENDOR PLATFORM DIRECTORY */}
        {/* ============================================================= */}
        {activeTab === 'vendors' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
            
            {/* Left Column: Sidebar Filters Panel */}
            <div className="lg:col-span-1 bg-white p-6 rounded-3xl border border-[#2E1220]/15 shadow-[0_8px_30px_rgba(46,18,35,0.04)] flex flex-col gap-5">
              <div>
                <h3 className="text-md font-serif font-bold text-[#1A0512]">
                  Directory Filters
                </h3>
                <p className="text-[10px] text-[#2E1220]/50 uppercase tracking-wider font-bold mt-0.5">
                  Refine the catalog list
                </p>
              </div>

              {/* Name Search */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-[#2E1220]/50 uppercase tracking-wider">
                  Search Name
                </label>
                <input
                  type="text"
                  value={vendorSearchQuery}
                  onChange={(e) => setVendorSearchQuery(e.target.value)}
                  placeholder="Type vendor name..."
                  className="bg-[#FAF7F2] border border-[#2E1220]/15 rounded-xl p-3 text-xs text-[#1A0512] font-semibold focus:outline-none focus:border-[#C96C52]"
                />
              </div>

              {/* Category */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-[#2E1220]/50 uppercase tracking-wider">
                  Category
                </label>
                <select
                  value={vendorCategoryFilter}
                  onChange={(e) => setVendorCategoryFilter(e.target.value)}
                  className="bg-[#FAF7F2] border border-[#2E1220]/15 rounded-xl p-2.5 text-xs text-[#1A0512] font-semibold focus:outline-none focus:border-[#C96C52]"
                >
                  <option value="all">All Categories</option>
                  <option value="decorator">Decorator</option>
                  <option value="caterer">Caterer</option>
                  <option value="photographer">Photographer</option>
                  <option value="venue">Venue</option>
                </select>
              </div>

              {/* City */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-[#2E1220]/50 uppercase tracking-wider">
                  City
                </label>
                <select
                  value={vendorCityFilter}
                  onChange={(e) => setVendorCityFilter(e.target.value)}
                  className="bg-[#FAF7F2] border border-[#2E1220]/15 rounded-xl p-2.5 text-xs text-[#1A0512] font-semibold focus:outline-none focus:border-[#C96C52]"
                >
                  <option value="all">All Cities</option>
                  <option value="Chennai">Chennai</option>
                  <option value="Bangalore">Bangalore</option>
                </select>
              </div>

              {/* Additional Filter 1: Min Experience */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-[#2E1220]/50 uppercase tracking-wider">
                  Min Experience
                </label>
                <select
                  value={vendorMinExperience}
                  onChange={(e) => setVendorMinExperience(e.target.value)}
                  className="bg-[#FAF7F2] border border-[#2E1220]/15 rounded-xl p-2.5 text-xs text-[#1A0512] font-semibold focus:outline-none focus:border-[#C96C52]"
                >
                  <option value="all">Any Experience</option>
                  <option value="2">2+ Years</option>
                  <option value="5">5+ Years</option>
                  <option value="8">8+ Years</option>
                </select>
              </div>

              {/* Additional Filter 2: Max Budget Floor */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-[#2E1220]/50 uppercase tracking-wider">
                  Max Budget Floor
                </label>
                <select
                  value={vendorMaxBudget}
                  onChange={(e) => setVendorMaxBudget(e.target.value)}
                  className="bg-[#FAF7F2] border border-[#2E1220]/15 rounded-xl p-2.5 text-xs text-[#1A0512] font-semibold focus:outline-none focus:border-[#C96C52]"
                >
                  <option value="all">Any Budget</option>
                  <option value="150000">Under ₹1.5 Lakhs</option>
                  <option value="250000">Under ₹2.5 Lakhs</option>
                  <option value="400000">Under ₹4 Lakhs</option>
                </select>
              </div>

              {/* Additional Filter 3: Min Rating */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-[#2E1220]/50 uppercase tracking-wider">
                  Min Rating
                </label>
                <select
                  value={vendorMinRating}
                  onChange={(e) => setVendorMinRating(e.target.value)}
                  className="bg-[#FAF7F2] border border-[#2E1220]/15 rounded-xl p-2.5 text-xs text-[#1A0512] font-semibold focus:outline-none focus:border-[#C96C52]"
                >
                  <option value="all">Any Rating</option>
                  <option value="4">4.0+ Stars</option>
                  <option value="4.5">4.5+ Stars</option>
                </select>
              </div>

              {/* Reset Filters Button */}
              <button
                type="button"
                onClick={() => {
                  setVendorSearchQuery('');
                  setVendorCategoryFilter('all');
                  setVendorCityFilter('all');
                  setVendorMinExperience('all');
                  setVendorMaxBudget('all');
                  setVendorMinRating('all');
                }}
                className="py-2.5 px-4 w-full rounded-xl bg-white border border-[#2E1220]/15 hover:border-[#C96C52] text-xs font-bold text-[#C96C52] transition-all shadow-sm"
              >
                Reset All Filters
              </button>
            </div>

            {/* Right Column: Registered Vendor Directory list */}
            <div className="lg:col-span-3 bg-white p-6 rounded-3xl border border-[#2E1220]/15 shadow-[0_8px_30px_rgba(46,18,35,0.04)] flex flex-col gap-6">
              <div className="flex justify-between items-center border-b border-[#2E1220]/10 pb-4">
                <div>
                  <h2 className="text-lg font-serif font-bold text-[#1A0512]">
                    Registered Vendor Directory ({filteredVendors.length})
                  </h2>
                  <p className="text-xs text-[#2E1220]/65 mt-0.5">
                    Curated list of professional decorators, photographers, caterers, and venues.
                  </p>
                </div>
              </div>

              {/* Grid cards */}
              {filteredVendors.length === 0 ? (
                <div className="p-16 text-center text-xs text-[#2E1220]/60 italic bg-[#FAF7F2] rounded-2xl border border-[#2E1220]/10">
                  No registered vendors match your sidebar filter selections.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredVendors.map((vendor) => {
                    const specialties = vendor.profile?.specialties || [];
                    const stats = vendor.performanceStats;
                    const profile = vendor.profile;

                    return (
                      <div 
                        key={vendor.id} 
                        className="bg-white rounded-3xl border border-[#2E1220]/15 hover:border-[#C96C52]/35 shadow-[0_8px_30px_rgba(46,18,35,0.02)] hover:shadow-[0_20px_50px_rgba(46,18,35,0.06)] hover:-translate-y-1.5 transition-all duration-300 flex flex-col justify-between overflow-hidden"
                      >
                        {/* Cover Image */}
                        <div className="relative h-32 w-full overflow-hidden bg-[#FAF7F2]">
                          {profile?.imageUrl ? (
                            <img 
                              src={profile.imageUrl} 
                              alt={vendor.businessName} 
                              className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-[#FAF7F2] text-[#C96C52]">
                              <Sparkles className="h-8 w-8 opacity-45" />
                            </div>
                          )}
                          <div className="absolute top-3 right-3">
                            <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded bg-white/95 text-[#C96C52] border border-[#C96C52]/15 shadow-sm">
                              {vendor.category}
                            </span>
                          </div>
                        </div>

                        <div className="p-5 flex-grow flex flex-col justify-between">
                          <div>
                            <h4 className="font-serif font-bold text-sm text-[#1A0512] leading-snug mb-1 truncate">
                              {vendor.businessName}
                            </h4>

                            <div className="flex gap-2 text-[10px] text-[#2E1220]/60 mb-3 font-semibold items-center">
                              <span className="flex items-center gap-0.5 text-amber-700 bg-amber-50 border border-amber-200/50 px-1.5 py-0.5 rounded-lg">
                                <Star className="h-3 w-3 fill-amber-500 text-transparent" /> 
                                {profile?.ratingsAvg && profile.ratingsAvg > 0 ? profile.ratingsAvg.toFixed(1) : 'New'}
                              </span>
                              <span>•</span>
                              <span>{vendor.operatingCity}</span>
                              <span>•</span>
                              <span>{profile?.experienceYears} yrs exp</span>
                            </div>

                            <div className="flex flex-wrap gap-1 mb-4">
                              {specialties.map(spec => (
                                <span key={spec} className="text-[9px] px-2 py-0.5 rounded bg-[#FAF7F2] border border-[#2E1220]/10 text-[#2E1220]/70 font-mono shadow-sm">
                                  #{spec}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="bg-[#FAF7F2] p-4 rounded-2xl border border-[#2E1220]/10 text-[10px] text-[#2E1220]/70 grid grid-cols-2 gap-3 shadow-inner mt-2">
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[9px] text-[#2E1220]/40 uppercase tracking-wider font-bold">Invited</span>
                              <span className="text-xs font-bold text-[#C96C52]">{stats?.invitesReceived || 0} times</span>
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[9px] text-[#2E1220]/40 uppercase tracking-wider font-bold">Replies</span>
                              <span className="text-xs font-bold text-[#2E1220]">{stats?.responsesCount || 0} times</span>
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[9px] text-[#2E1220]/40 uppercase tracking-wider font-bold">Floor cost</span>
                              <span className="text-xs font-bold text-[#1A0512]">₹{profile?.budgetFloor.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[9px] text-[#2E1220]/40 uppercase tracking-wider font-bold">Bookings</span>
                              <span className="text-xs font-bold text-[#5B7C62]">{stats?.bookingsCount || 0} secured</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

      </main>

      {/* Footer */}
      <footer className="border-t py-6 px-8 text-center text-xs bg-[#FAF7F2] border-[#2E1220]/15 text-[#2E1220]/50">
        <p>© 2026 Caladium Systems. All rights reserved. Built for assessment purposes.</p>
      </footer>
    </div>
  );
}
