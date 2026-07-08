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
  ThumbsDown,
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
  const [latitude, setLatitude] = useState(13.0063); // Default Adyar Chennai
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
        
        // Auto toast feedback
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-rose-500 selection:text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 glass-premium px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-brand-600 to-rose-400 p-2.5 rounded-xl shadow-lg shadow-brand-900/40">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-sans tracking-wide bg-gradient-to-r from-rose-100 via-rose-300 to-rose-100 bg-clip-text text-transparent">
              HAPPIFFIE
            </h1>
            <p className="text-[10px] text-brand-300 font-medium tracking-widest uppercase">
              AI Vendor Matching Engine
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex bg-slate-900/80 p-1 rounded-xl border border-slate-850 flex-wrap justify-center">
          <button 
            onClick={() => setActiveTab('user')}
            className={`px-3 py-1.5 rounded-lg font-medium text-xs transition-all duration-300 flex items-center gap-1.5 ${
              activeTab === 'user' 
                ? 'bg-gradient-to-r from-brand-600 to-rose-500 text-white shadow-md' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserCheck className="h-3.5 w-3.5" /> Matching Feed
          </button>
          <button 
            onClick={() => {
              setActiveTab('admin');
              loadBackendData();
            }}
            className={`px-3 py-1.5 rounded-lg font-medium text-xs transition-all duration-300 flex items-center gap-1.5 ${
              activeTab === 'admin' 
                ? 'bg-gradient-to-r from-brand-600 to-rose-500 text-white shadow-md' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldAlert className="h-3.5 w-3.5" /> Admin Control
          </button>
          <button 
            onClick={() => {
              setActiveTab('metrics');
              loadBackendData();
            }}
            className={`px-3 py-1.5 rounded-lg font-medium text-xs transition-all duration-300 flex items-center gap-1.5 ${
              activeTab === 'metrics' 
                ? 'bg-gradient-to-r from-brand-600 to-rose-500 text-white shadow-md' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" /> Metrics Dashboard
          </button>
          <button 
            onClick={() => {
              setActiveTab('vendors');
              loadBackendData();
            }}
            className={`px-3 py-1.5 rounded-lg font-medium text-xs transition-all duration-300 flex items-center gap-1.5 ${
              activeTab === 'vendors' 
                ? 'bg-gradient-to-r from-brand-600 to-rose-500 text-white shadow-md' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="h-3.5 w-3.5" /> Vendor Directory
          </button>
        </nav>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 gap-6">
        
        {/* ============================================================= */}
        {/* TAB 1: CLIENT PORTAL FEED */}
        {/* ============================================================= */}
        {activeTab === 'user' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            
            {/* Column 1: Client intake */}
            <div className="lg:col-span-1 flex flex-col gap-6">
              
              {/* Optional AI Free Text Intake Panel */}
              <div className="glass p-5 rounded-2xl border border-brand-900/10 flex flex-col gap-3">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-4.5 w-4.5 text-brand-400" />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    AI Plain-English Intake
                  </h3>
                </div>
                <p className="text-[11px] text-slate-400">
                  Type your requirement naturally. Claude parses it into structured form details instantly.
                </p>
                <textarea
                  rows={3}
                  value={freeTextPrompt}
                  onChange={(e) => setFreeTextPrompt(e.target.value)}
                  className="w-full bg-slate-900/80 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-brand-500"
                />
                <button
                  type="button"
                  onClick={handleAIFreeTextParse}
                  disabled={parsingAI}
                  className="py-2 px-3 rounded-xl bg-slate-900 border border-slate-850 hover:border-brand-500 text-xs font-semibold text-brand-200 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {parsingAI ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin text-brand-400" />
                      Claude Parsing Query...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5 text-brand-400" />
                      AI Auto-Fill Form
                    </>
                  )}
                </button>
              </div>

              {/* Requirement details Form */}
              <div className="glass p-6 rounded-2xl flex flex-col gap-4">
                <div>
                  <h2 className="text-sm font-bold text-rose-200 uppercase tracking-wider">
                    Event Requirement Form
                  </h2>
                  <p className="text-[11px] text-slate-450 mt-0.5">
                    Refine structured query details mapped below.
                  </p>
                </div>

                <form onSubmit={handleSubmitRequirement} className="flex flex-col gap-4">
                  {/* Category Grid */}
                  <div>
                    <label className="text-[10px] font-semibold text-slate-400 uppercase block mb-1.5">
                      Service Category
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {['decorator', 'caterer', 'photographer', 'venue'].map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setEventType(cat)}
                          className={`py-1.5 rounded-lg border text-[11px] capitalize text-center font-medium transition-all ${
                            eventType === cat 
                              ? 'border-brand-500 bg-brand-950/20 text-brand-200 font-bold' 
                              : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
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
                      <label className="text-[10px] font-semibold text-slate-400 uppercase block mb-1">
                        Event City
                      </label>
                      <select 
                        value={city} 
                        onChange={(e) => setCity(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none"
                      >
                        <option value="Chennai">Chennai</option>
                        <option value="Bangalore">Bangalore</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 uppercase block mb-1">
                        Event Date
                      </label>
                      <input 
                        type="date"
                        value={eventDate}
                        onChange={(e) => setEventDate(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Area Preset */}
                  <div>
                    <label className="text-[10px] font-semibold text-slate-400 uppercase block mb-1">
                      Event Coordinate Zone (Radius filter)
                    </label>
                    <div className="grid grid-cols-1 gap-1.5">
                      {locationPresets[city]?.map((pres) => (
                        <button
                          key={pres.name}
                          type="button"
                          onClick={() => handlePresetChange(pres.lat, pres.lng)}
                          className={`text-[10px] p-2 text-left rounded-lg border flex justify-between items-center transition-all ${
                            latitude === pres.lat && longitude === pres.lng
                              ? 'border-brand-500/80 bg-brand-900/10 text-brand-100'
                              : 'border-slate-850 bg-slate-900/30 text-slate-400 hover:bg-slate-900/85'
                          }`}
                        >
                          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {pres.name}</span>
                          <span className="opacity-60 text-[9px]">{pres.lat.toFixed(4)}, {pres.lng.toFixed(4)}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Guest Count & Budget */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 uppercase block mb-1">
                        Guests
                      </label>
                      <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg px-2">
                        <Users className="h-3 w-3 text-slate-500" />
                        <input 
                          type="number"
                          value={guestCount}
                          onChange={(e) => setGuestCount(Number(e.target.value))}
                          className="w-full bg-transparent p-1.5 text-xs focus:outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 uppercase block mb-1">
                        Budget (₹)
                      </label>
                      <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg px-2">
                        <span className="text-[11px] text-slate-500 font-semibold px-0.5">₹</span>
                        <input 
                          type="number"
                          value={budget}
                          onChange={(e) => setBudget(Number(e.target.value))}
                          className="w-full bg-transparent p-1.5 text-xs focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Theme Description */}
                  <div>
                    <label className="text-[10px] font-semibold text-slate-400 uppercase block mb-1">
                      Theme Description (Embeddings comparison)
                    </label>
                    <textarea
                      rows={2}
                      value={theme}
                      onChange={(e) => setTheme(e.target.value)}
                      placeholder="Describe styling, e.g., bohemian backyard setup..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-250 focus:outline-none focus:border-brand-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-rose-500 hover:from-brand-500 hover:to-rose-400 text-white text-xs font-semibold tracking-wide transition-all shadow-md shadow-brand-900/10 flex items-center justify-center gap-1.5 mt-1 disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        Calculating pgvector matches...
                      </>
                    ) : (
                      <>
                        <Send className="h-3.5 w-3.5" />
                        Run Matching Query
                      </>
                    )}
                  </button>
                </form>

                {/* Submissions list */}
                <div className="border-t border-slate-850 pt-3 mt-1 flex flex-col gap-2">
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                    Recent Submissions ({requirementsList.length})
                  </span>
                  <div className="flex flex-col gap-1 max-h-32 overflow-y-auto pr-1">
                    {requirementsList.map((req) => (
                      <button
                        key={req.id}
                        onClick={() => fetchMatches(req.id)}
                        className={`p-2 rounded-lg text-left text-[11px] transition-all flex justify-between items-center border ${
                          selectedRequirement?.id === req.id
                            ? 'bg-slate-900 border-slate-800 text-rose-200'
                            : 'bg-slate-900/10 border-transparent text-slate-450 hover:bg-slate-900/60'
                        }`}
                      >
                        <div className="truncate pr-2">
                          <span className="font-semibold text-slate-300 capitalize">{req.eventType}</span>
                          <span className="text-[9px] text-slate-500 block truncate">{req.theme || 'No theme details'}</span>
                        </div>
                        <span className={`text-[8px] px-1.5 py-0.5 rounded-full ${
                          req.status === 'booked' ? 'bg-emerald-950 text-emerald-300' : 'bg-slate-850 text-slate-350'
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
                <div className="bg-gradient-to-r from-slate-900 to-slate-950 p-5 rounded-2xl border border-slate-850 flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[9px] font-semibold uppercase tracking-wider bg-brand-950 text-brand-300 border border-brand-800 px-2 py-0.5 rounded-full">
                        {selectedRequirement.eventType}
                      </span>
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {selectedRequirement.city}
                      </span>
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> {new Date(selectedRequirement.eventDate).toLocaleDateString()}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-200 font-serif">
                      Theme Description: {selectedRequirement.theme || 'Default Style'}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Budget Limit: <span className="font-semibold text-rose-300">₹{selectedRequirement.budget.toLocaleString('en-IN')}</span>
                    </p>
                  </div>
                  
                  <div className="text-right">
                    <span className="text-[9px] text-slate-500 block uppercase tracking-wider">Status</span>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-md block mt-1 ${
                      selectedRequirement.status === 'booked' 
                        ? 'bg-emerald-950 border border-emerald-850 text-emerald-300 animate-pulse' 
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      {selectedRequirement.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="glass p-12 rounded-2xl text-center text-slate-400 border-dashed border-2 border-slate-800">
                  <Sparkles className="h-8 w-8 text-rose-400/50 mx-auto mb-3" />
                  <p className="text-sm font-semibold">No requirement matched</p>
                  <p className="text-xs mt-1 text-slate-550">Use AI Intake on the left or select a recent query to inspect ranked semantic matches.</p>
                </div>
              )}

              {/* Status Banner */}
              {responseStatusMsg && (
                <div className="bg-emerald-950/70 border border-emerald-500/35 text-emerald-200 px-4 py-3 rounded-xl text-xs flex items-center gap-2 animate-bounce">
                  <CheckCircle className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                  <span>{responseStatusMsg}</span>
                </div>
              )}

              {/* Match list */}
              {selectedRequirement && (
                <div className="flex flex-col gap-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Ranked AI Match Recommendations ({matches.length})
                    </h3>
                    <span className="text-[9px] text-slate-500">Theme matching computes real cosine similarities in pgvector</span>
                  </div>

                  {matches.length === 0 ? (
                    <div className="p-8 bg-slate-900/35 border border-slate-905 rounded-xl text-center text-xs text-slate-550">
                      No matching vendors passed category, location coordinates, or budget floor hard filters.
                    </div>
                  ) : (
                    matches.map((match, idx) => (
                      <div 
                        key={match.id} 
                        className={`p-5 rounded-2xl transition-all duration-300 ${
                          match.overrideStatus === 'force_invite'
                            ? 'bg-indigo-950/20 border border-indigo-500/30'
                            : 'bg-slate-900/60 border border-slate-850/80 hover:border-slate-800'
                        }`}
                      >
                        {/* Card Header */}
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-bold text-slate-200 text-sm">{idx + 1}. {match.businessName}</span>
                              {match.overrideStatus === 'boosted' && (
                                <span className="text-[8px] bg-amber-950 text-amber-300 px-2 py-0.5 rounded border border-amber-800">
                                  +20 Boosted
                                </span>
                              )}
                              {match.overrideStatus === 'force_invite' && (
                                <span className="text-[8px] bg-indigo-900 text-indigo-200 px-2 py-0.5 rounded border border-indigo-750">
                                  Forced Invite
                                </span>
                              )}
                              {match.skipReason === 'invite_cap_reached' && (
                                <span className="text-[8px] bg-rose-950/80 text-rose-350 px-2 py-0.5 rounded border border-rose-850 flex items-center gap-1 animate-pulse">
                                  <AlertTriangle className="h-3 w-3 text-rose-400" /> Skipped: Invite Cap Reached
                                </span>
                              )}
                              {match.scoreBreakdown.coldStartBoost > 0 && (
                                <span className="text-[8px] bg-rose-950 text-rose-300 px-2 py-0.5 rounded border border-rose-800 animate-pulse">
                                  Cold Start Boost
                                </span>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-4 text-[11px] text-slate-400 mt-1">
                              <span className="flex items-center gap-0.5 text-amber-400 font-semibold">
                                <Star className="h-3.5 w-3.5 fill-amber-400 text-transparent" /> {match.rating > 0 ? match.rating.toFixed(1) : 'New'}
                              </span>
                              <span>Category: <span className="text-slate-300 capitalize">{match.category}</span></span>
                              <span>City: <span className="text-slate-300">{match.operatingCity}</span></span>
                            </div>
                          </div>

                          {/* Match percentage pill */}
                          <div className="text-right">
                            <div className={`inline-block px-3 py-1.5 rounded-xl font-bold text-xs ${
                              match.rawScore >= 85 
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60' 
                                : match.rawScore >= 70 
                                ? 'bg-amber-950 text-amber-400 border border-amber-800/60'
                                : 'bg-slate-800 text-slate-400'
                            }`}>
                              {match.rawScore}% Match
                            </div>
                          </div>
                        </div>

                        {/* Breakdown */}
                        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2 bg-slate-950/60 p-3 rounded-xl border border-slate-900 text-[10px]">
                          <div>
                            <span className="text-slate-550 block">Semantic Theme Fit:</span>
                            <span className="font-semibold text-slate-300">{match.scoreBreakdown.capabilityFit}%</span>
                          </div>
                          <div>
                            <span className="text-slate-550 block">Distance Decay:</span>
                            <span className="font-semibold text-slate-300">{match.scoreBreakdown.distanceDecay}%</span>
                          </div>
                          <div>
                            <span className="text-slate-550 block">Budget Deviation:</span>
                            <span className="font-semibold text-slate-300">{match.scoreBreakdown.budgetAlignment}%</span>
                          </div>
                          <div>
                            <span className="text-slate-550 block">Acceptance Rate:</span>
                            <span className="font-semibold text-slate-300">{match.scoreBreakdown.acceptanceRate}%</span>
                          </div>
                        </div>

                        {/* AI Match Explanation */}
                        {match.aiExplanationUser && (
                          <div className="mt-4 bg-brand-950/15 border border-brand-900/10 p-3.5 rounded-xl text-xs flex gap-2.5 text-brand-200">
                            <Sparkles className="h-4.5 w-4.5 text-brand-400 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="font-semibold text-[9px] text-brand-300 uppercase tracking-widest">
                                CLAUDE-GENERATED EXPLANATION (CACHED)
                              </p>
                              <p className="mt-0.5 text-slate-300 leading-relaxed italic">
                                "{match.aiExplanationUser}"
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Simulated actions */}
                        <div className="mt-4 border-t border-slate-850 pt-4 flex flex-col md:flex-row justify-between items-center gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400">Invitation State:</span>
                            {match.latestInvitation ? (
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                                match.latestInvitation.status === 'accepted'
                                  ? 'bg-emerald-950 text-emerald-300'
                                  : match.latestInvitation.status === 'declined'
                                  ? 'bg-rose-950 text-rose-300'
                                  : 'bg-indigo-950 text-indigo-300 animate-pulse'
                              }`}>
                                {match.latestInvitation.status.toUpperCase()}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-500 italic">Not Invited</span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Option 1: Trigger invite if not sent */}
                            {!match.latestInvitation && (
                              <button
                                onClick={() => sendManualInvitation(match.id)}
                                className="py-1 px-3 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 rounded-lg transition-all"
                              >
                                Send Match Invite
                              </button>
                            )}

                            {/* Option 2: Response simulator */}
                            {match.latestInvitation && match.latestInvitation.status === 'sent' && (
                              <div className="p-3 bg-slate-900 rounded-xl border border-slate-850 flex flex-col gap-2 w-full md:w-auto">
                                <div className="text-[10px] text-brand-300 font-semibold uppercase tracking-wider">
                                  Simulate Vendor Panel Action:
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {/* Accept Inputs */}
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-1">
                                      <span className="text-[9px] text-slate-500">Quote (₹):</span>
                                      <input 
                                        type="number"
                                        value={mockQuote}
                                        onChange={(e) => setMockQuote(Number(e.target.value))}
                                        className="w-20 bg-slate-950 border border-slate-800 p-1 text-[10px] rounded focus:outline-none focus:border-brand-500 text-slate-200"
                                      />
                                    </div>
                                    <input 
                                      type="text"
                                      value={vendorQuoteMsg}
                                      onChange={(e) => setVendorQuoteMsg(e.target.value)}
                                      placeholder="Quote note..."
                                      className="w-40 bg-slate-950 border border-slate-800 p-1 text-[9px] rounded focus:outline-none text-slate-200"
                                    />
                                    <button
                                      onClick={() => handleVendorResponse(match.latestInvitation!.id, 'accepted')}
                                      className="py-1 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-[10px] font-bold text-white rounded transition-all flex items-center gap-1 justify-center"
                                    >
                                      <CheckCircle className="h-3 w-3" /> Accept & Book
                                    </button>
                                  </div>

                                  <div className="border-l border-slate-800 mx-1"></div>

                                  {/* Decline Inputs */}
                                  <div className="flex flex-col gap-1 justify-end">
                                    <div className="flex items-center gap-1">
                                      <span className="text-[9px] text-slate-500">Reason:</span>
                                      <select
                                        value={declineReason}
                                        onChange={(e) => setDeclineReason(e.target.value)}
                                        className="bg-slate-950 border border-slate-800 p-0.5 text-[9px] rounded text-slate-350"
                                      >
                                        <option value="Fully Booked">Fully Booked</option>
                                        <option value="Budget Too Low">Budget Too Low</option>
                                        <option value="Distance Too Far">Distance Too Far</option>
                                      </select>
                                    </div>
                                    <button
                                      onClick={() => handleVendorResponse(match.latestInvitation!.id, 'declined')}
                                      className="py-1 px-2.5 bg-rose-600 hover:bg-rose-500 text-[10px] font-bold text-white rounded transition-all flex items-center gap-1 justify-center"
                                    >
                                      <ThumbsDown className="h-3 w-3" /> Decline
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Booked Ref */}
                            {match.latestInvitation && match.latestInvitation.status === 'accepted' && (
                              <span className="text-xs text-emerald-400 flex items-center gap-1 font-semibold">
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
        {/* TAB 2: PLATFORM ADMIN CONTROL PANEL & OVERRIDES */}
        {/* ============================================================= */}
        {activeTab === 'admin' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            
            {/* Left Column: Requirements list */}
            <div className="lg:col-span-1 glass p-6 rounded-2xl flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-bold font-serif text-slate-200 flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-rose-400" /> Admin Matching Log
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Manage active client queries and apply manual overrides.
                </p>
              </div>

              <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto pr-1">
                {requirementsList.map((req) => (
                  <button
                    key={req.id}
                    onClick={() => fetchMatches(req.id)}
                    className={`p-3.5 rounded-xl text-left text-xs transition-all border flex flex-col gap-1.5 ${
                      selectedRequirement?.id === req.id
                        ? 'bg-slate-900 border-rose-900/60 shadow-lg shadow-rose-950/20'
                        : 'bg-slate-900/30 border-slate-900 text-slate-350 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-200 capitalize flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span> {req.eventType}
                      </span>
                      <span className={`text-[9px] px-2 py-0.5 rounded-full font-semibold ${
                        req.status === 'booked' ? 'bg-emerald-950 text-emerald-300' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {req.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">Theme: {req.theme || 'N/A'}</div>
                    <div className="flex justify-between text-[10px] text-slate-500 border-t border-slate-850 pt-2 mt-1">
                      <span>Date: {new Date(req.eventDate).toLocaleDateString()}</span>
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
                <div className="glass p-6 rounded-2xl flex flex-col gap-6">
                  <div>
                    <span className="text-[9px] font-semibold tracking-wider text-slate-550 block uppercase">
                      Admin overrides panel for Requirement ID
                    </span>
                    <h3 className="text-sm font-bold font-mono text-rose-300">{selectedRequirement.id}</h3>
                  </div>

                  <div className="flex flex-col gap-4">
                    <span className="text-xs font-semibold text-slate-450 uppercase tracking-wider block">
                      Active Matches & Ranks (Manual Overrides)
                    </span>

                    <div className="flex flex-col gap-3">
                      {matches.map((match, idx) => (
                        <div 
                          key={match.id}
                          className="bg-slate-950/85 p-4 rounded-xl border border-slate-900 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-slate-800 transition-all"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-200 text-xs">{idx + 1}. {match.businessName}</span>
                              <span className="text-[10px] bg-slate-900 px-2 py-0.5 rounded text-slate-400">
                                Raw Score: {match.baseScore}%
                              </span>
                              {match.overrideStatus !== 'none' && (
                                <span className="text-[8px] bg-brand-900/35 text-brand-300 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">
                                  {match.overrideStatus}
                                </span>
                              )}
                            </div>
                            
                            <div className="text-[10px] text-slate-500 mt-1.5 flex gap-3">
                              <span>Stars: {match.rating}</span>
                              <span>City: {match.operatingCity}</span>
                              {match.overrideReason && (
                                <span className="text-slate-450 italic truncate max-w-xs">
                                  Reason: "{match.overrideReason}"
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            <button
                              onClick={() => applyAdminOverride(match.id, match.overrideStatus === 'boosted' ? 'none' : 'boosted')}
                              className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${
                                match.overrideStatus === 'boosted'
                                  ? 'bg-amber-600 text-white'
                                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300'
                              }`}
                            >
                              Boost (+20 pts)
                            </button>
                            <button
                              disabled={match.latestInvitation !== null}
                              onClick={() => applyAdminOverride(match.id, 'force_invite')}
                              className={`px-2 py-1 rounded text-[10px] font-bold transition-all disabled:opacity-50 ${
                                match.overrideStatus === 'force_invite'
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-slate-900 hover:bg-slate-800 text-indigo-300'
                              }`}
                            >
                              Force Invite
                            </button>
                            <button
                              onClick={() => applyAdminOverride(match.id, match.overrideStatus === 'excluded' ? 'none' : 'excluded')}
                              className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${
                                match.overrideStatus === 'excluded'
                                  ? 'bg-rose-600 text-white'
                                  : 'bg-slate-900 hover:bg-slate-800 text-rose-350'
                              }`}
                            >
                              Exclude (Hide)
                            </button>
                            {match.overrideStatus !== 'none' && (
                              <button
                                onClick={() => applyAdminOverride(match.id, 'none')}
                                className="px-2 py-1 rounded bg-slate-850 hover:bg-slate-800 text-[10px] text-slate-400 font-bold"
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
                <div className="glass p-12 text-center text-slate-450 rounded-2xl">
                  Select a requirement from the log list to modify matches.
                </div>
              )}

              {/* Override audit trail list */}
              <div className="glass p-5 rounded-2xl border border-slate-900 flex flex-col gap-3">
                <div className="flex items-center gap-1.5 border-b border-slate-850 pb-2">
                  <History className="h-4.5 w-4.5 text-brand-400" />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    Manual Match Adjustments History (Audit Trail)
                  </h3>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] text-left text-slate-400">
                    <thead className="text-[10px] text-slate-500 uppercase border-b border-slate-900">
                      <tr>
                        <th className="py-2">Timestamp</th>
                        <th>Vendor Name</th>
                        <th>Action Type</th>
                        <th>Delta Score</th>
                        <th>Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900">
                      {adminActions.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-4 text-center text-slate-500 italic">No manual overrides recorded yet.</td>
                        </tr>
                      ) : (
                        adminActions.map((log) => (
                          <tr key={log.id} className="hover:bg-slate-900/40">
                            <td className="py-2.5 text-[10px] text-slate-500">{new Date(log.timestamp).toLocaleTimeString()}</td>
                            <td className="font-semibold text-slate-350">{log.vendorName}</td>
                            <td>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold ${
                                log.actionType === 'boosted' ? 'bg-amber-950 text-amber-300' :
                                log.actionType === 'force_invite' ? 'bg-indigo-950 text-indigo-300' :
                                log.actionType === 'excluded' ? 'bg-rose-950 text-rose-350' : 'bg-slate-850 text-slate-400'
                              }`}>
                                {log.actionType}
                              </span>
                            </td>
                            <td>{log.oldScore}% → {log.newScore}%</td>
                            <td className="italic text-slate-450">{log.reason}</td>
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
        {/* TAB 3: ANALYTICS & METRICS DASHBOARD */}
        {/* ============================================================= */}
        {activeTab === 'metrics' && !metrics && (
          <div className="glass p-12 text-center text-slate-400 rounded-2xl flex flex-col items-center justify-center gap-3">
            <RefreshCw className="h-8 w-8 animate-spin text-brand-400" />
            <p className="text-sm font-semibold">Loading matching engine metrics dashboard...</p>
            <p className="text-xs text-slate-500">Calculating vendor response histories, contract conversion rates, and match score bounds.</p>
          </div>
        )}

        {activeTab === 'metrics' && metrics && (
          <div className="flex flex-col gap-6">
            
            {/* KPI Cards Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              
              <div className="glass p-5 rounded-2xl border border-brand-900/10 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Vendor Response Rate
                  </span>
                  <span className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-teal-200 bg-clip-text text-transparent block mt-1">
                    {metrics.summary.responseRate}%
                  </span>
                </div>
                <div className="bg-emerald-950/45 p-2 rounded-xl border border-emerald-800/30">
                  <UserCheck className="h-6 w-6 text-emerald-400" />
                </div>
              </div>

              <div className="glass p-5 rounded-2xl border border-brand-900/10 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Avg Response Speed
                  </span>
                  <span className="text-2xl font-bold bg-gradient-to-r from-amber-400 to-amber-200 bg-clip-text text-transparent block mt-1">
                    {metrics.summary.avgResponseTimeMins} mins
                  </span>
                </div>
                <div className="bg-amber-950/45 p-2 rounded-xl border border-amber-800/30">
                  <Clock className="h-6 w-6 text-amber-400" />
                </div>
              </div>

              <div className="glass p-5 rounded-2xl border border-brand-900/10 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Booking Conversion
                  </span>
                  <span className="text-2xl font-bold bg-gradient-to-r from-brand-400 to-rose-300 bg-clip-text text-transparent block mt-1">
                    {metrics.summary.bookingConversionRate}%
                  </span>
                </div>
                <div className="bg-brand-950/45 p-2 rounded-xl border border-brand-800/30">
                  <TrendingUp className="h-6 w-6 text-rose-400" />
                </div>
              </div>

              <div className="glass p-5 rounded-2xl border border-brand-900/10 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Requirements / Bookings
                  </span>
                  <span className="text-2xl font-bold text-slate-200 block mt-1">
                    {metrics.summary.totalRequirements} / {metrics.summary.totalBookings}
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                  <BookOpen className="h-6 w-6 text-slate-350" />
                </div>
              </div>

            </div>

            {/* Score Distribution Histogram */}
            <div className="glass p-6 rounded-2xl flex flex-col gap-6">
              <div>
                <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                  Score Distribution Histogram
                </h3>
                <p className="text-xs text-slate-450 mt-0.5">
                  Visualizes match quality bounds for the latest query: 
                  <span className="font-mono text-rose-350 ml-1">
                    {metrics.lastRequirement 
                      ? `${metrics.lastRequirement.eventType} - "${metrics.lastRequirement.theme ? metrics.lastRequirement.theme.slice(0, 50) : 'Default theme'}..."` 
                      : 'No query run yet'}
                  </span>
                </p>
              </div>

              <div className="flex flex-col gap-4 max-w-xl">
                
                {/* Excellent Row */}
                <div className="flex items-center gap-4 text-xs">
                  <span className="w-24 text-slate-450">Excellent (90-100)</span>
                  <div className="flex-1 bg-slate-900 h-3 rounded-full overflow-hidden border border-slate-850">
                    <div 
                      style={{ width: `${Math.min(100, (metrics.histogram.excellent || 0) * 10)}%` }} 
                      className="bg-emerald-500 h-full rounded-full transition-all duration-1000"
                    ></div>
                  </div>
                  <span className="w-8 text-right font-bold text-slate-300">{metrics.histogram.excellent || 0}</span>
                </div>

                {/* Good Row */}
                <div className="flex items-center gap-4 text-xs">
                  <span className="w-24 text-slate-450">Good (80-89)</span>
                  <div className="flex-1 bg-slate-900 h-3 rounded-full overflow-hidden border border-slate-850">
                    <div 
                      style={{ width: `${Math.min(100, (metrics.histogram.good || 0) * 10)}%` }} 
                      className="bg-teal-500 h-full rounded-full transition-all duration-1000"
                    ></div>
                  </div>
                  <span className="w-8 text-right font-bold text-slate-300">{metrics.histogram.good || 0}</span>
                </div>

                {/* Average Row */}
                <div className="flex items-center gap-4 text-xs">
                  <span className="w-24 text-slate-450">Average (70-79)</span>
                  <div className="flex-1 bg-slate-900 h-3 rounded-full overflow-hidden border border-slate-850">
                    <div 
                      style={{ width: `${Math.min(100, (metrics.histogram.average || 0) * 10)}%` }} 
                      className="bg-amber-500 h-full rounded-full transition-all duration-1000"
                    ></div>
                  </div>
                  <span className="w-8 text-right font-bold text-slate-300">{metrics.histogram.average || 0}</span>
                </div>

                {/* Poor Row */}
                <div className="flex items-center gap-4 text-xs">
                  <span className="w-24 text-slate-450">Poor (&lt;70)</span>
                  <div className="flex-1 bg-slate-900 h-3 rounded-full overflow-hidden border border-slate-850">
                    <div 
                      style={{ width: `${Math.min(100, (metrics.histogram.poor || 0) * 10)}%` }} 
                      className="bg-slate-700 h-full rounded-full transition-all duration-1000"
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
          <div className="glass p-6 rounded-2xl flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-bold font-serif text-slate-200">
                Seeded Platform Vendor Directory
              </h2>
              <p className="text-xs text-slate-400 mt-1">
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
                    className="bg-slate-900/60 p-4.5 rounded-xl border border-slate-800/80 hover:border-slate-700 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <h4 className="font-bold text-xs text-slate-250 leading-snug truncate">
                          {vendor.businessName}
                        </h4>
                        <span className="text-[9px] uppercase font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                          {vendor.category}
                        </span>
                      </div>

                      <div className="flex gap-2 text-[10px] text-slate-400 mb-2.5">
                        <span className="flex items-center gap-0.5 text-amber-500 font-medium">
                          <Star className="h-3 w-3 fill-amber-500 text-transparent" /> 
                          {profile?.ratingsAvg && profile.ratingsAvg > 0 ? profile.ratingsAvg.toFixed(1) : 'New'}
                        </span>
                        <span>•</span>
                        <span>{vendor.operatingCity}</span>
                        <span>•</span>
                        <span>{profile?.experienceYears} yrs exp</span>
                      </div>

                      {/* Specialties tags */}
                      <div className="flex flex-wrap gap-1 mb-4">
                        {specialties.map(spec => (
                          <span key={spec} className="text-[8px] px-1.5 py-0.5 rounded-md bg-slate-950 text-slate-400">
                            #{spec}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Stats Summary */}
                    <div className="bg-slate-950/40 p-2.5 rounded-lg border border-slate-850/80 text-[10px] text-slate-450 grid grid-cols-2 gap-y-1 gap-x-2">
                      <div>
                        <span>Invites:</span> <span className="font-semibold text-slate-300">{stats?.invitesReceived || 0}</span>
                      </div>
                      <div>
                        <span>Replies:</span> <span className="font-semibold text-slate-300">{stats?.responsesCount || 0}</span>
                      </div>
                      <div>
                        <span>Budget floor:</span> <span className="font-semibold text-slate-300">₹{profile?.budgetFloor.toLocaleString('en-IN')}</span>
                      </div>
                      <div>
                        <span>Bookings:</span> <span className="font-semibold text-emerald-400">{stats?.bookingsCount || 0}</span>
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
      <footer className="glass border-t border-slate-900 py-6 px-6 text-center text-xs text-slate-500">
        <p>© 2026 Caladium Systems. All rights reserved. Built for assessment purposes.</p>
      </footer>
    </div>
  );
}
