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
  BookOpen
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
  const [activeTab, setActiveTab] = useState<'user' | 'admin' | 'vendors' | 'metrics'>('user');
  
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
  const [freeTextPrompt, setFreeTextPrompt] = useState('Need a traditional south-indian wedding caterer in Bangalore for 300 guests on 12th Oct 2026, budget around 1.5 lakhs');
  const [parsingAI, setParsingAI] = useState(false);

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

  // UI loaded lists
  const [loading, setLoading] = useState(false);
  const [requirementsList, setRequirementsList] = useState<any[]>([]);
  const [selectedRequirement, setSelectedRequirement] = useState<Requirement | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [adminActions, setAdminActions] = useState<AdminAction[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [responseStatusMsg, setResponseStatusMsg] = useState('');

  // Vendor response mock inputs
  const [mockQuote, setMockQuote] = useState<number>(180000);
  const [declineReason, setDeclineReason] = useState('Fully Booked');
  const [declineMessage] = useState('Sorry, fully committed on this date.');
  const [vendorQuoteMsg, setVendorQuoteMsg] = useState('We would love to do this! We have standard sets matching your theme.');

  // Load backend database records
  const loadBackendData = async () => {
    try {
      const reqRes = await fetch(`${API_BASE_URL}/api/admin/requirements`);
      const reqJson = await reqRes.json();
      if (reqJson.success) {
        setRequirementsList(reqJson.requirements);
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
        
        setResponseStatusMsg('AI successfully parsed your requirement! Review the form below.');
        setTimeout(() => setResponseStatusMsg(''), 5000);
      }
    } catch (e) {
      console.error('Failed to parse text', e);
      alert('Failed to connect to parser service.');
    } finally {
      setParsingAI(false);
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
        setMockQuote(data.requirement.budget * 0.95);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Mock Vendor response
  const handleVendorResponse = async (invitationId: string, status: 'accepted' | 'declined') => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invitationId,
          status,
          quoteAmount: status === 'accepted' ? mockQuote : null,
          declineReason: status === 'declined' ? declineReason : null,
          message: status === 'accepted' ? vendorQuoteMsg : declineMessage,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setResponseStatusMsg(
          status === 'accepted' 
            ? `Successfully booked! Confirmed at ₹${mockQuote.toLocaleString('en-IN')}` 
            : `Invitation declined (${declineReason})`
        );
        if (selectedRequirement) {
          fetchMatches(selectedRequirement.id);
        }
        loadBackendData();
        setTimeout(() => setResponseStatusMsg(''), 5000);
      }
    } catch (e) {
      console.error(e);
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

  const isDarkMode = activeTab === 'admin' || activeTab === 'metrics';

  return (
    <div className={`min-h-screen flex flex-col motion-safe:transition-colors motion-safe:duration-500 selection:bg-[#C96C52] selection:text-white ${
      isDarkMode ? 'bg-[#16181C] text-slate-100' : 'bg-[#FDFBF7] text-[#2E1220]'
    }`}>
      
      {/* Header */}
      <header className={`sticky top-0 z-50 px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4 border-b motion-safe:transition-colors motion-safe:duration-500 ${
        isDarkMode ? 'bg-[#1D2025] border-slate-800' : 'bg-[#FDFBF7] border-[#2E1220]/10'
      }`}>
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-[#C96C52] to-[#D88D7A] p-2.5 rounded-2xl shadow-md">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-serif font-bold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-[#2E1220] to-[#C96C52] dark:from-white dark:to-rose-300">
              Happiffie
            </h1>
            <p className={`text-[10px] font-semibold tracking-widest uppercase ${
              isDarkMode ? 'text-slate-400' : 'text-[#2E1220]/50'
            }`}>
              AI Vendor Matching Engine
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className={`flex p-1 rounded-2xl border ${
          isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-[#FAF7F2] border-[#2E1220]/10'
        }`}>
          <button 
            onClick={() => setActiveTab('user')}
            className={`px-4 py-2 rounded-xl font-medium text-xs transition-all duration-300 flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-[#C96C52] ${
              activeTab === 'user' 
                ? 'bg-[#C96C52] text-white shadow-md' 
                : isDarkMode ? 'text-slate-450 hover:text-slate-200' : 'text-[#2E1220]/60 hover:text-[#2E1220]'
            }`}
          >
            <UserCheck className="h-4 w-4" /> Recommendation Feed
          </button>
          <button 
            onClick={() => {
              setActiveTab('admin');
              loadBackendData();
            }}
            className={`px-4 py-2 rounded-xl font-medium text-xs transition-all duration-300 flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-[#C96C52] ${
              activeTab === 'admin' 
                ? 'bg-[#C96C52] text-white shadow-md' 
                : isDarkMode ? 'text-slate-450 hover:text-slate-200' : 'text-[#2E1220]/60 hover:text-[#2E1220]'
            }`}
          >
            <ShieldAlert className="h-4 w-4" /> Admin Console
          </button>
          <button 
            onClick={() => {
              setActiveTab('metrics');
              loadBackendData();
            }}
            className={`px-4 py-2 rounded-xl font-medium text-xs transition-all duration-300 flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-[#C96C52] ${
              activeTab === 'metrics' 
                ? 'bg-[#C96C52] text-white shadow-md' 
                : isDarkMode ? 'text-slate-450 hover:text-slate-200' : 'text-[#2E1220]/60 hover:text-[#2E1220]'
            }`}
          >
            <BarChart3 className="h-4 w-4" /> Metrics Dashboard
          </button>
          <button 
            onClick={() => {
              setActiveTab('vendors');
              loadBackendData();
            }}
            className={`px-4 py-2 rounded-xl font-medium text-xs transition-all duration-300 flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-[#C96C52] ${
              activeTab === 'vendors' 
                ? 'bg-[#C96C52] text-white shadow-md' 
                : isDarkMode ? 'text-slate-450 hover:text-slate-200' : 'text-[#2E1220]/60 hover:text-[#2E1220]'
            }`}
          >
            <Database className="h-4 w-4" /> Vendor Directory
          </button>
        </nav>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 gap-6">
        
        {/* ============================================================= */}
        {/* TAB 1: CLIENT PORTAL FEED */}
        {/* ============================================================= */}
        {activeTab === 'user' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            
            {/* Column 1: Client intake */}
            <div className="lg:col-span-1 flex flex-col gap-6">
              
              {/* Coherent Intake Experience */}
              <div className="bg-[#FAF7F2] p-6 rounded-3xl border border-[#2E1220]/5 shadow-sm flex flex-col gap-4">
                <div>
                  <h3 className="text-md font-serif font-bold text-[#2E1220]">
                    Tell us about your event
                  </h3>
                  <p className="text-xs text-[#2E1220]/60 mt-1">
                    Describe your celebration in plain English, or refine the details using the form inputs.
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  <textarea
                    rows={4}
                    value={freeTextPrompt}
                    onChange={(e) => setFreeTextPrompt(e.target.value)}
                    placeholder="Describe your event..."
                    className="w-full bg-white border border-[#2E1220]/10 rounded-2xl p-3.5 text-xs text-[#2E1220] focus:outline-none focus:border-[#C96C52] focus:ring-1 focus:ring-[#C96C52]"
                  />
                  <button
                    type="button"
                    onClick={handleAIFreeTextParse}
                    disabled={parsingAI}
                    className="py-2.5 px-4 rounded-xl bg-white border border-[#2E1220]/10 hover:border-[#C96C52] text-xs font-semibold text-[#C96C52] transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {parsingAI ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        AI Parsing Vibe...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" />
                        AI Auto-Fill Details
                      </>
                    )}
                  </button>
                </div>

                <div className="border-t border-[#2E1220]/5 my-1"></div>

                <form onSubmit={handleSubmitRequirement} className="flex flex-col gap-4">
                  {/* Category Buttons */}
                  <div>
                    <label className="text-[10px] font-semibold text-[#2E1220]/50 uppercase tracking-wider block mb-2">
                      Event Category
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {['decorator', 'caterer', 'photographer', 'venue'].map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setEventType(cat)}
                          className={`py-2 rounded-xl border text-xs capitalize text-center transition-all ${
                            eventType === cat 
                              ? 'border-[#C96C52] bg-[#C96C52]/5 text-[#C96C52] font-semibold' 
                              : 'border-[#2E1220]/10 bg-white text-[#2E1220]/60 hover:border-[#2E1220]/30'
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
                      <label className="text-[10px] font-semibold text-[#2E1220]/50 uppercase tracking-wider block mb-1">
                        City
                      </label>
                      <select 
                        value={city} 
                        onChange={(e) => setCity(e.target.value)}
                        className="w-full bg-white border border-[#2E1220]/10 rounded-xl p-2.5 text-xs text-[#2E1220] focus:outline-none focus:border-[#C96C52]"
                      >
                        <option value="Chennai">Chennai</option>
                        <option value="Bangalore">Bangalore</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-[#2E1220]/50 uppercase tracking-wider block mb-1">
                        Date
                      </label>
                      <input 
                        type="date"
                        value={eventDate}
                        onChange={(e) => setEventDate(e.target.value)}
                        className="w-full bg-white border border-[#2E1220]/10 rounded-xl p-2 text-xs text-[#2E1220] focus:outline-none focus:border-[#C96C52]"
                      />
                    </div>
                  </div>

                  {/* Area Presets */}
                  <div>
                    <label className="text-[10px] font-semibold text-[#2E1220]/50 uppercase tracking-wider block mb-1">
                      Event Location Zone
                    </label>
                    <div className="grid grid-cols-1 gap-1.5">
                      {locationPresets[city]?.map((pres) => (
                        <button
                          key={pres.name}
                          type="button"
                          onClick={() => handlePresetChange(pres.lat, pres.lng)}
                          className={`text-[10px] p-2 text-left rounded-xl border flex justify-between items-center transition-all ${
                            latitude === pres.lat && longitude === pres.lng
                              ? 'border-[#C96C52] bg-[#C96C52]/5 text-[#C96C52] font-semibold'
                              : 'border-[#2E1220]/10 bg-white text-[#2E1220]/50 hover:bg-[#FAF7F2]'
                          }`}
                        >
                          <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {pres.name}</span>
                          <span className="opacity-60 text-[9px]">{pres.lat.toFixed(4)}, {pres.lng.toFixed(4)}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Guests & Budget */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-semibold text-[#2E1220]/50 uppercase tracking-wider block mb-1">
                        Guests
                      </label>
                      <div className="flex items-center bg-white border border-[#2E1220]/10 rounded-xl px-2">
                        <Users className="h-4 w-4 text-[#2E1220]/40" />
                        <input 
                          type="number"
                          value={guestCount}
                          onChange={(e) => setGuestCount(Number(e.target.value))}
                          className="w-full bg-transparent p-2 text-xs focus:outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-[#2E1220]/50 uppercase tracking-wider block mb-1">
                        Budget
                      </label>
                      <div className="flex items-center bg-white border border-[#2E1220]/10 rounded-xl px-2">
                        <span className="text-[11px] text-[#2E1220]/40 font-semibold px-0.5">₹</span>
                        <input 
                          type="number"
                          value={budget}
                          onChange={(e) => setBudget(Number(e.target.value))}
                          className="w-full bg-transparent p-2 text-xs focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Theme Description */}
                  <div>
                    <label className="text-[10px] font-semibold text-[#2E1220]/50 uppercase tracking-wider block mb-1">
                      Theme Keywords
                    </label>
                    <textarea
                      rows={2}
                      value={theme}
                      onChange={(e) => setTheme(e.target.value)}
                      className="w-full bg-white border border-[#2E1220]/10 rounded-xl p-2.5 text-xs text-[#2E1220] focus:outline-none focus:border-[#C96C52]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 rounded-xl bg-[#C96C52] hover:bg-[#B75C43] text-white text-xs font-semibold tracking-wide transition-all shadow-md flex items-center justify-center gap-1.5 mt-1 disabled:opacity-50"
                  >
                    {loading ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Search matching vendors
                      </>
                    )}
                  </button>
                </form>

                {/* Submissions list */}
                <div className="border-t border-[#2E1220]/5 pt-3 mt-1 flex flex-col gap-2">
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-[#2E1220]/50">
                    Recent Requirements ({requirementsList.length})
                  </span>
                  <div className="flex flex-col gap-1 max-h-32 overflow-y-auto pr-1">
                    {requirementsList.map((req) => (
                      <button
                        key={req.id}
                        onClick={() => fetchMatches(req.id)}
                        className={`p-2 rounded-xl text-left text-[11px] transition-all flex justify-between items-center border ${
                          selectedRequirement?.id === req.id
                            ? 'bg-white border-[#C96C52]/20 text-[#C96C52]'
                            : 'bg-transparent border-transparent text-[#2E1220]/60 hover:bg-white/70'
                        }`}
                      >
                        <div className="truncate pr-2">
                          <span className="font-semibold text-[#2E1220] capitalize">{req.eventType}</span>
                          <span className="text-[9px] text-[#2E1220]/40 block truncate">{req.theme || 'No details'}</span>
                        </div>
                        <span className={`text-[8px] px-1.5 py-0.5 rounded-full ${
                          req.status === 'booked' ? 'bg-[#5B7C62]/10 text-[#5B7C62]' : 'bg-slate-200/60 text-slate-550'
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
              
              {/* Selected Requirement summary */}
              {selectedRequirement ? (
                <div className="bg-[#FAF7F2] p-6 rounded-3xl border border-[#2E1220]/5 flex justify-between items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-[9px] font-semibold uppercase tracking-wider bg-[#2E1220]/5 text-[#2E1220] border border-[#2E1220]/10 px-2 py-0.5 rounded-full">
                        {selectedRequirement.eventType}
                      </span>
                      <span className="text-xs text-[#2E1220]/60 flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" /> {selectedRequirement.city}
                      </span>
                      <span className="text-xs text-[#2E1220]/60 flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" /> {new Date(selectedRequirement.eventDate).toLocaleDateString()}
                      </span>
                    </div>
                    <h3 className="text-md font-serif font-bold text-[#2E1220]">
                      Theme: {selectedRequirement.theme || 'Default Theme'}
                    </h3>
                    <p className="text-xs text-[#2E1220]/60 mt-1">
                      Budget Scale: <span className="font-semibold text-[#C96C52]">₹{selectedRequirement.budget.toLocaleString('en-IN')}</span>
                    </p>
                  </div>
                  
                  <div className="text-right">
                    <span className="text-[9px] text-[#2E1220]/40 block uppercase tracking-wider">Status</span>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg block mt-1 ${
                      selectedRequirement.status === 'booked' 
                        ? 'bg-[#5B7C62]/10 border border-[#5B7C62]/20 text-[#5B7C62]' 
                        : 'bg-[#2E1220]/5 text-[#2E1220]/70'
                    }`}>
                      {selectedRequirement.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="bg-[#FAF7F2]/50 p-16 rounded-3xl text-center text-[#2E1220]/50 border-dashed border-2 border-[#2E1220]/10">
                  <Sparkles className="h-10 w-10 text-[#C96C52]/30 mx-auto mb-3" />
                  <h3 className="font-serif text-lg font-bold text-[#2E1220]">No requirement matched</h3>
                  <p className="text-xs mt-1 max-w-sm mx-auto leading-relaxed">
                    Paste a brief details in the plain-English intake or refine search parameters on the left to review matching vendors.
                  </p>
                </div>
              )}

              {/* Status Banner */}
              {responseStatusMsg && (
                <div className="bg-[#5B7C62]/10 border border-[#5B7C62]/20 text-[#5B7C62] px-4 py-3 rounded-2xl text-xs flex items-center gap-2 animate-bounce">
                  <CheckCircle className="h-4 w-4 text-[#5B7C62] flex-shrink-0" />
                  <span>{responseStatusMsg}</span>
                </div>
              )}

              {/* Match list */}
              {selectedRequirement && (
                <div className="flex flex-col gap-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#2E1220]/40">
                      Ranked AI Match Suggestions ({matches.length})
                    </h3>
                  </div>

                  {matches.length === 0 ? (
                    <div className="p-8 bg-[#FAF7F2] border border-[#2E1220]/5 rounded-2xl text-center text-xs text-[#2E1220]/60">
                      No matching vendors met the hard filters (location, dates availability, or budget floors).
                    </div>
                  ) : (
                    matches.map((match, idx) => (
                      <div 
                        key={match.id} 
                        className={`p-6 rounded-3xl transition-all duration-300 bg-white border border-[#2E1220]/5 hover:-translate-y-1 hover:shadow-md hover:border-[#2E1220]/10 ${
                          match.overrideStatus === 'force_invite'
                            ? 'border-indigo-200 bg-indigo-50/10'
                            : ''
                        }`}
                      >
                        {/* Card Header */}
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              <span className="font-serif font-bold text-[#2E1220] text-md">{idx + 1}. {match.businessName}</span>
                              {match.overrideStatus === 'boosted' && (
                                <span className="text-[8px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded border border-amber-250 font-semibold uppercase">
                                  Admin Boosted
                                </span>
                              )}
                              {match.overrideStatus === 'force_invite' && (
                                <span className="text-[8px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded border border-indigo-200 font-semibold uppercase">
                                  Force Invited
                                </span>
                              )}
                              {match.skipReason === 'invite_cap_reached' && (
                                <span className="text-[8px] bg-rose-50 text-rose-600 px-2 py-0.5 rounded border border-rose-200 font-semibold uppercase flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3" /> Skipped: Cap Reached
                                </span>
                              )}
                              {match.scoreBreakdown.coldStartBoost > 0 && (
                                <span className="text-[8px] bg-rose-50 text-rose-500 px-2 py-0.5 rounded border border-rose-200 font-semibold uppercase animate-pulse">
                                  Cold Start
                                </span>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-4 text-xs text-[#2E1220]/50">
                              <span className="flex items-center gap-0.5 text-amber-500 font-semibold">
                                <Star className="h-3.5 w-3.5 fill-amber-500 text-transparent" /> {match.rating > 0 ? match.rating.toFixed(1) : 'New'}
                              </span>
                              <span>Category: <span className="text-[#2E1220] capitalize font-medium">{match.category}</span></span>
                              <span>City: <span className="text-[#2E1220] font-medium">{match.operatingCity}</span></span>
                            </div>
                          </div>

                          {/* Signature Match Alignment Prism */}
                          <div className="relative flex items-center justify-center select-none" title="Score Prism Breakdown: Outer Green = Theme, Middle Terracotta = Budget, Inner Fig = Proximity">
                            <svg className="h-20 w-20 transform -rotate-90" viewBox="0 0 100 100">
                              {/* Track circles */}
                              <circle cx="50" cy="50" r="38" fill="transparent" stroke="#FAF7F2" strokeWidth="4" />
                              <circle cx="50" cy="50" r="28" fill="transparent" stroke="#FAF7F2" strokeWidth="4" />
                              <circle cx="50" cy="50" r="18" fill="transparent" stroke="#FAF7F2" strokeWidth="4" />

                              {/* Outer Circle: Theme Match (Sage) */}
                              <circle cx="50" cy="50" r="38" fill="transparent" stroke="#5B7C62" strokeWidth="5.5" 
                                      strokeDasharray={`${2 * Math.PI * 38}`} 
                                      strokeDashoffset={`${2 * Math.PI * 38 * (1 - match.scoreBreakdown.capabilityFit / 100)}`} 
                                      strokeLinecap="round" />
                                      
                              {/* Middle Circle: Budget Match (Terracotta) */}
                              <circle cx="50" cy="50" r="28" fill="transparent" stroke="#C96C52" strokeWidth="5.5" 
                                      strokeDasharray={`${2 * Math.PI * 28}`} 
                                      strokeDashoffset={`${2 * Math.PI * 28 * (1 - Math.max(0, match.scoreBreakdown.budgetAlignment) / 100)}`} 
                                      strokeLinecap="round" />
                                      
                              {/* Inner Circle: Distance Match (Fig) */}
                              <circle cx="50" cy="50" r="18" fill="transparent" stroke="#2E1220" strokeWidth="5.5" 
                                      strokeDasharray={`${2 * Math.PI * 18}`} 
                                      strokeDashoffset={`${2 * Math.PI * 18 * (1 - match.scoreBreakdown.distanceDecay / 100)}`} 
                                      strokeLinecap="round" />
                            </svg>
                            <div className="absolute flex flex-col items-center justify-center">
                              <span className="text-xs font-serif font-bold text-[#2E1220]">{match.rawScore}%</span>
                            </div>
                          </div>
                        </div>

                        {/* Breakdown Key */}
                        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[9px] text-[#2E1220]/40 justify-end border-b border-[#2E1220]/5 pb-2.5">
                          <span className="flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#5B7C62]"></span> Theme: {match.scoreBreakdown.capabilityFit}%
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#C96C52]"></span> Budget: {match.scoreBreakdown.budgetAlignment}%
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#2E1220]"></span> Proximity: {match.scoreBreakdown.distanceDecay}%
                          </span>
                        </div>

                        {/* AI Match Explanation */}
                        {match.aiExplanationUser && (
                          <div className="mt-3.5 bg-[#FAF7F2] p-4 rounded-2xl text-xs border border-[#2E1220]/5 text-[#2E1220]/80">
                            <div className="flex gap-2 items-start">
                              <Sparkles className="h-4 w-4 text-[#C96C52] flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="font-serif font-bold text-[10px] text-[#2E1220] tracking-wide uppercase">
                                  Why matched to you
                                </p>
                                <p className="mt-1 leading-relaxed italic">
                                  "{match.aiExplanationUser}"
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Invitation Outreach portal */}
                        <div className="mt-4 flex flex-col md:flex-row justify-between items-center gap-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-[#2E1220]/50">Invitation Status:</span>
                            {match.latestInvitation ? (
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                                match.latestInvitation.status === 'accepted'
                                  ? 'bg-[#5B7C62]/10 text-[#5B7C62]'
                                  : match.latestInvitation.status === 'declined'
                                  ? 'bg-rose-50 text-rose-600 border border-rose-100'
                                  : 'bg-indigo-50 text-indigo-600 border border-indigo-100 animate-pulse'
                              }`}>
                                {match.latestInvitation.status.toUpperCase()}
                              </span>
                            ) : (
                              <span className="text-[10px] text-[#2E1220]/40 italic">Not Invited</span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {!match.latestInvitation && (
                              <button
                                onClick={() => sendManualInvitation(match.id)}
                                className="py-1 px-3 bg-white border border-[#2E1220]/15 hover:border-[#C96C52] text-xs font-semibold text-[#C96C52] rounded-lg transition-all"
                              >
                                Send Match Invite
                              </button>
                            )}

                            {/* Respectful Vendor portal */}
                            {match.latestInvitation && match.latestInvitation.status === 'sent' && (
                              <div className="p-4 bg-[#FAF7F2] rounded-2xl border border-[#2E1220]/5 flex flex-col gap-2.5 w-full md:w-auto">
                                <div className="text-[10px] text-[#2E1220]/60 font-bold uppercase tracking-wider">
                                  Simulate Vendor Response:
                                </div>
                                <div className="flex flex-col gap-2">
                                  <div className="flex flex-wrap gap-2 items-center">
                                    <span className="text-[10px] text-[#2E1220]/60">Your Quote (₹):</span>
                                    <input 
                                      type="number"
                                      value={mockQuote}
                                      onChange={(e) => setMockQuote(Number(e.target.value))}
                                      className="w-24 bg-white border border-[#2E1220]/10 p-1 text-[11px] rounded-lg focus:outline-none focus:border-[#C96C52] text-[#2E1220]"
                                    />
                                    <input 
                                      type="text"
                                      value={vendorQuoteMsg}
                                      onChange={(e) => setVendorQuoteMsg(e.target.value)}
                                      placeholder="Message to client..."
                                      className="w-48 bg-white border border-[#2E1220]/10 p-1 text-[10px] rounded-lg focus:outline-none text-[#2E1220]"
                                    />
                                    <button
                                      onClick={() => handleVendorResponse(match.latestInvitation!.id, 'accepted')}
                                      className="py-1 px-3 bg-[#5B7C62] hover:bg-[#4E6B54] text-[10px] font-bold text-white rounded-lg transition-all flex items-center gap-1 justify-center"
                                    >
                                      Accept & Book
                                    </button>
                                  </div>

                                  <div className="border-t border-[#2E1220]/5 my-0.5"></div>

                                  <div className="flex gap-2 items-center justify-end">
                                    <span className="text-[10px] text-[#2E1220]/60">Reason:</span>
                                    <select
                                      value={declineReason}
                                      onChange={(e) => setDeclineReason(e.target.value)}
                                      className="bg-white border border-[#2E1220]/10 p-0.5 text-[10px] rounded text-[#2E1220]"
                                    >
                                      <option value="Fully Booked">Fully Booked</option>
                                      <option value="Budget Too Low">Budget Too Low</option>
                                      <option value="Distance Too Far">Distance Too Far</option>
                                    </select>
                                    <button
                                      onClick={() => handleVendorResponse(match.latestInvitation!.id, 'declined')}
                                      className="py-1 px-3 bg-rose-600 hover:bg-rose-500 text-[10px] font-bold text-white rounded-lg transition-all flex items-center gap-1 justify-center"
                                    >
                                      Decline Match
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}

                            {match.latestInvitation && match.latestInvitation.status === 'accepted' && (
                              <span className="text-xs text-[#5B7C62] flex items-center gap-1 font-semibold">
                                <CheckCircle className="h-4 w-4" /> Booked Ref Match
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
        {/* TAB 2: PLATFORM ADMIN CONTROL PANEL & OVERRIDES (Dense Dark-Mode) */}
        {/* ============================================================= */}
        {activeTab === 'admin' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start font-sans">
            
            {/* Left Column: Requirements list */}
            <div className="lg:col-span-1 bg-[#1A1D22] p-5 rounded-2xl border border-slate-800 flex flex-col gap-4">
              <div>
                <h2 className="text-md font-mono font-bold text-white flex items-center gap-2">
                  <ShieldAlert className="h-4.5 w-4.5 text-rose-450" /> OVERRIDE_LOG
                </h2>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                  Scan active requirements and override ranks.
                </p>
              </div>

              <div className="flex flex-col gap-1.5 max-h-[350px] overflow-y-auto pr-1">
                {requirementsList.map((req) => (
                  <button
                    key={req.id}
                    onClick={() => fetchMatches(req.id)}
                    className={`p-3 rounded-lg text-left text-xs transition-all border font-mono flex flex-col gap-1 ${
                      selectedRequirement?.id === req.id
                        ? 'bg-slate-900 border-rose-900/60 text-rose-300'
                        : 'bg-slate-950/20 border-slate-900 text-slate-400 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-bold capitalize">{req.eventType}</span>
                      <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold ${
                        req.status === 'booked' ? 'bg-[#5B7C62]/10 text-emerald-400' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {req.status}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 truncate mt-0.5">Theme: {req.theme || 'N/A'}</div>
                    <div className="flex justify-between text-[9px] text-slate-550 pt-1.5 mt-1 border-t border-slate-850">
                      <span>Date: {new Date(req.eventDate).toLocaleDateString()}</span>
                      <span>Budget: ₹{req.budget}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Right Column: Selected Matches and Override History logs */}
            <div className="lg:col-span-2 flex flex-col gap-6">
              
              {/* Override Control */}
              {selectedRequirement ? (
                <div className="bg-[#1A1D22] p-5 rounded-2xl border border-slate-800 flex flex-col gap-4 font-mono">
                  <div>
                    <span className="text-[9px] text-slate-500 block uppercase">
                      Override Console / Requirement_ID
                    </span>
                    <h3 className="text-xs font-bold text-rose-455 truncate">{selectedRequirement.id}</h3>
                  </div>

                  <div className="flex flex-col gap-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      CANDIDATE_POOL
                    </span>

                    <div className="flex flex-col gap-2">
                      {matches.map((match, idx) => (
                        <div 
                          key={match.id}
                          className="bg-slate-950 p-3 rounded-lg border border-slate-900 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-slate-850 transition-all text-xs"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-200">{idx + 1}. {match.businessName}</span>
                              <span className="text-[9px] bg-slate-900 px-1.5 py-0.5 rounded text-slate-400 border border-slate-800">
                                Score: {match.baseScore}%
                              </span>
                              {match.overrideStatus !== 'none' && (
                                <span className="text-[8px] bg-[#C96C52]/20 text-[#C96C52] px-1 py-0.5 rounded border border-[#C96C52]/40 uppercase font-bold">
                                  {match.overrideStatus}
                                </span>
                              )}
                            </div>
                            
                            <div className="text-[9px] text-slate-500 mt-1 flex gap-3">
                              <span>Stars: {match.rating}</span>
                              <span>City: {match.operatingCity}</span>
                              {match.overrideReason && (
                                <span className="text-slate-500 italic truncate max-w-xs">
                                  Reason: "{match.overrideReason}"
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            <button
                              onClick={() => applyAdminOverride(match.id, match.overrideStatus === 'boosted' ? 'none' : 'boosted')}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                                match.overrideStatus === 'boosted'
                                  ? 'bg-amber-600 text-white'
                                  : 'bg-slate-900 hover:bg-slate-800 text-slate-400'
                              }`}
                            >
                              Boost (+20)
                            </button>
                            <button
                              disabled={match.latestInvitation !== null}
                              onClick={() => applyAdminOverride(match.id, 'force_invite')}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all disabled:opacity-50 ${
                                match.overrideStatus === 'force_invite'
                                  ? 'bg-indigo-650 text-white'
                                  : 'bg-slate-900 hover:bg-slate-800 text-indigo-400'
                              }`}
                            >
                              Force
                            </button>
                            <button
                              onClick={() => applyAdminOverride(match.id, match.overrideStatus === 'excluded' ? 'none' : 'excluded')}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                                match.overrideStatus === 'excluded'
                                  ? 'bg-rose-600 text-white'
                                  : 'bg-slate-900 hover:bg-slate-800 text-rose-400'
                              }`}
                            >
                              Exclude
                            </button>
                            {match.overrideStatus !== 'none' && (
                              <button
                                onClick={() => applyAdminOverride(match.id, 'none')}
                                className="px-1.5 py-0.5 rounded bg-slate-850 hover:bg-slate-800 text-[10px] text-slate-500"
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
                <div className="bg-[#1A1D22] p-12 text-center text-slate-500 rounded-2xl border border-slate-800 font-mono text-xs">
                  Select a requirement log from the ledger to apply overrides.
                </div>
              )}

              {/* Override audit trail list */}
              <div className="bg-[#1A1D22] p-5 rounded-2xl border border-slate-800 flex flex-col gap-3 font-mono">
                <div className="flex items-center gap-1.5 border-b border-slate-800 pb-2">
                  <History className="h-4 w-4 text-[#C96C52]" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Override Audit Trail Log
                  </h3>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-[10px] text-left text-slate-400">
                    <thead className="text-[9px] text-slate-500 uppercase border-b border-slate-850">
                      <tr>
                        <th className="py-2">Timestamp</th>
                        <th>Vendor</th>
                        <th>Action</th>
                        <th>Delta</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      {adminActions.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-4 text-center text-slate-500 italic">No manual overrides logged.</td>
                        </tr>
                      ) : (
                        adminActions.map((log) => (
                          <tr key={log.id} className="hover:bg-slate-900/40">
                            <td className="py-2 text-[9px] text-slate-500">{new Date(log.timestamp).toLocaleTimeString()}</td>
                            <td className="font-semibold text-slate-350">{log.vendorName}</td>
                            <td>
                              <span className={`px-1.5 py-0.5 rounded text-[8px] uppercase font-bold ${
                                log.actionType === 'boosted' ? 'bg-amber-950 text-amber-400' :
                                log.actionType === 'force_invite' ? 'bg-indigo-950 text-indigo-405' :
                                log.actionType === 'excluded' ? 'bg-rose-950 text-rose-405' : 'bg-slate-850 text-slate-400'
                              }`}>
                                {log.actionType}
                              </span>
                            </td>
                            <td>{log.oldScore}% → {log.newScore}%</td>
                            <td className="italic text-slate-500">{log.reason}</td>
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
        {/* TAB 3: ANALYTICS & METRICS DASHBOARD (Dark-Mode) */}
        {/* ============================================================= */}
        {activeTab === 'metrics' && !metrics && (
          <div className="bg-[#1A1D22] p-12 text-center text-slate-400 rounded-2xl border border-slate-850 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="h-8 w-8 animate-spin text-[#C96C52]" />
            <p className="text-sm font-mono font-semibold">Loading engine metrics ledger...</p>
          </div>
        )}

        {activeTab === 'metrics' && metrics && (
          <div className="flex flex-col gap-6 font-mono text-xs">
            
            {/* KPI Cards Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              
              <div className="bg-[#1A1D22] p-5 rounded-2xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[9px] text-slate-500 uppercase tracking-wider block">
                    Response Rate
                  </span>
                  <span className="text-xl font-bold text-emerald-450 block mt-1">
                    {metrics.summary.responseRate}%
                  </span>
                </div>
                <div className="bg-emerald-950/20 p-2 rounded-xl border border-emerald-900/30">
                  <UserCheck className="h-5 w-5 text-emerald-400" />
                </div>
              </div>

              <div className="bg-[#1A1D22] p-5 rounded-2xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[9px] text-slate-500 uppercase tracking-wider block">
                    Avg Response Speed
                  </span>
                  <span className="text-xl font-bold text-amber-450 block mt-1">
                    {metrics.summary.avgResponseTimeMins} mins
                  </span>
                </div>
                <div className="bg-amber-950/20 p-2 rounded-xl border border-amber-900/30">
                  <Clock className="h-5 w-5 text-amber-400" />
                </div>
              </div>

              <div className="bg-[#1A1D22] p-5 rounded-2xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[9px] text-slate-500 uppercase tracking-wider block">
                    Booking Conversion
                  </span>
                  <span className="text-xl font-bold text-[#C96C52] block mt-1">
                    {metrics.summary.bookingConversionRate}%
                  </span>
                </div>
                <div className="bg-rose-950/20 p-2 rounded-xl border border-rose-900/30">
                  <TrendingUp className="h-5 w-5 text-[#C96C52]" />
                </div>
              </div>

              <div className="bg-[#1A1D22] p-5 rounded-2xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[9px] text-slate-500 uppercase tracking-wider block">
                    Requests / Booked
                  </span>
                  <span className="text-xl font-bold text-slate-350 block mt-1">
                    {metrics.summary.totalRequirements} / {metrics.summary.totalBookings}
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                  <BookOpen className="h-5 w-5 text-slate-400" />
                </div>
              </div>

            </div>

            {/* Score Distribution Histogram */}
            <div className="bg-[#1A1D22] p-6 rounded-2xl border border-slate-800 flex flex-col gap-6">
              <div>
                <h3 className="text-sm font-bold text-white uppercase">
                  SCORE_DISTRIBUTION_HISTOGRAM
                </h3>
                <p className="text-[10px] text-slate-500 mt-1 uppercase">
                  Latest Run ID: 
                  <span className="text-rose-350 ml-1">
                    {metrics.lastRequirement 
                      ? `${metrics.lastRequirement.eventType} - "${metrics.lastRequirement.theme ? metrics.lastRequirement.theme.slice(0, 45) : 'Default'}..."` 
                      : 'N/A'}
                  </span>
                </p>
              </div>

              <div className="flex flex-col gap-4 max-w-xl text-[10px]">
                
                {/* Excellent Row */}
                <div className="flex items-center gap-4">
                  <span className="w-28 text-slate-400">EXCELLENT (90-100)</span>
                  <div className="flex-1 bg-slate-950 h-2.5 rounded border border-slate-900 overflow-hidden">
                    <div 
                      style={{ width: `${Math.min(100, (metrics.histogram.excellent || 0) * 10)}%` }} 
                      className="bg-emerald-500 h-full rounded transition-all duration-1000"
                    ></div>
                  </div>
                  <span className="w-8 text-right font-bold text-slate-300">{metrics.histogram.excellent || 0}</span>
                </div>

                {/* Good Row */}
                <div className="flex items-center gap-4">
                  <span className="w-28 text-slate-400">GOOD (80-89)</span>
                  <div className="flex-1 bg-slate-950 h-2.5 rounded border border-slate-900 overflow-hidden">
                    <div 
                      style={{ width: `${Math.min(100, (metrics.histogram.good || 0) * 10)}%` }} 
                      className="bg-teal-500 h-full rounded transition-all duration-1000"
                    ></div>
                  </div>
                  <span className="w-8 text-right font-bold text-slate-300">{metrics.histogram.good || 0}</span>
                </div>

                {/* Average Row */}
                <div className="flex items-center gap-4">
                  <span className="w-28 text-slate-400">AVERAGE (70-79)</span>
                  <div className="flex-1 bg-slate-950 h-2.5 rounded border border-slate-900 overflow-hidden">
                    <div 
                      style={{ width: `${Math.min(100, (metrics.histogram.average || 0) * 10)}%` }} 
                      className="bg-amber-500 h-full rounded transition-all duration-1000"
                    ></div>
                  </div>
                  <span className="w-8 text-right font-bold text-slate-300">{metrics.histogram.average || 0}</span>
                </div>

                {/* Poor Row */}
                <div className="flex items-center gap-4">
                  <span className="w-28 text-slate-400">POOR (&lt;70)</span>
                  <div className="flex-1 bg-slate-950 h-2.5 rounded border border-slate-900 overflow-hidden">
                    <div 
                      style={{ width: `${Math.min(100, (metrics.histogram.poor || 0) * 10)}%` }} 
                      className="bg-slate-700 h-full rounded transition-all duration-1000"
                    ></div>
                  </div>
                  <span className="w-8 text-right font-bold text-slate-300">{metrics.histogram.poor || 0}</span>
                </div>

              </div>
            </div>

          </div>
        )}

        {/* ============================================================= */}
        {/* TAB 4: VENDOR PLATFORM DIRECTORY */}
        {/* ============================================================= */}
        {activeTab === 'vendors' && (
          <div className="bg-[#FAF7F2] p-6 rounded-3xl border border-[#2E1220]/5 flex flex-col gap-4">
            <div>
              <h2 className="text-md font-serif font-bold text-[#2E1220]">
                Seeded Platform Vendor Directory
              </h2>
              <p className="text-xs text-[#2E1220]/55">
                Overview of seeded decorators, venues, caterers, and photographers with pgvector specialties embeddings.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {vendors.map((vendor) => {
                const specialties = vendor.profile?.specialties || [];
                const stats = vendor.performanceStats;
                const profile = vendor.profile;

                return (
                  <div 
                    key={vendor.id} 
                    className="bg-white p-4.5 rounded-2xl border border-[#2E1220]/5 hover:border-[#C96C52]/30 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <h4 className="font-serif font-bold text-xs text-[#2E1220] leading-snug truncate">
                          {vendor.businessName}
                        </h4>
                        <span className="text-[8px] uppercase font-semibold px-2 py-0.5 rounded bg-[#2E1220]/5 text-[#2E1220]/75">
                          {vendor.category}
                        </span>
                      </div>

                      <div className="flex gap-2 text-[10px] text-[#2E1220]/50 mb-2.5">
                        <span className="flex items-center gap-0.5 text-amber-500 font-medium">
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
                          <span key={spec} className="text-[8px] px-1.5 py-0.5 rounded bg-[#FAF7F2] text-[#2E1220]/60 font-mono">
                            #{spec}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="bg-[#FAF7F2] p-2.5 rounded-xl border border-[#2E1220]/5 text-[9px] text-[#2E1220]/60 grid grid-cols-2 gap-y-1 gap-x-2">
                      <div>
                        <span>Invited:</span> <span className="font-semibold text-[#2E1220]">{stats?.invitesReceived || 0}</span>
                      </div>
                      <div>
                        <span>Replies:</span> <span className="font-semibold text-[#2E1220]">{stats?.responsesCount || 0}</span>
                      </div>
                      <div>
                        <span>Floor cost:</span> <span className="font-semibold text-[#2E1220]">₹{profile?.budgetFloor.toLocaleString('en-IN')}</span>
                      </div>
                      <div>
                        <span>Booked:</span> <span className="font-semibold text-[#5B7C62]">{stats?.bookingsCount || 0}</span>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          </div>
        )}

      </main>

      {/* Footer */}
      <footer className={`border-t py-6 px-6 text-center text-xs motion-safe:transition-colors motion-safe:duration-500 ${
        isDarkMode ? 'bg-[#1D2025] border-slate-800 text-slate-500' : 'bg-[#FDFBF7] border-[#2E1220]/10 text-[#2E1220]/50'
      }`}>
        <p>© 2026 Caladium Systems. All rights reserved. Built for assessment purposes.</p>
      </footer>
    </div>
  );
}
