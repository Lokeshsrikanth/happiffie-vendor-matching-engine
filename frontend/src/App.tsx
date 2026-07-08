import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles, MapPin, Calendar, Send, ShieldAlert, UserCheck,
  CheckCircle, Star, Clock, TrendingUp, Database, RefreshCw, History,
  AlertTriangle, BarChart3, BookOpen, Search, Filter, ChevronDown, ChevronUp,
  ArrowUpRight, Zap, Eye, EyeOff
} from 'lucide-react';

const API = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

// ── Types ────────────────────────────────────────────────────────────────────

interface ScoreBreakdown {
  capabilityFit: number; distanceDecay: number; budgetAlignment: number;
  vendorRating: number; responseTime: number; acceptanceRate: number;
  conversionRate: number; coldStartBoost: number;
}
interface Invitation { id: string; status: string; sentAt: string; expiresAt: string; }
interface Match {
  id: string; vendorId: string; businessName: string; category: string;
  operatingCity: string; rating: number; rawScore: number; baseScore: number;
  scoreBreakdown: ScoreBreakdown; overrideStatus: string;
  overrideReason: string | null; skipReason: string | null;
  aiExplanationUser: string; latestInvitation: Invitation | null;
}
interface Requirement { id: string; eventType: string; city: string; eventDate: string; budget: number; theme: string; status: string; }
interface VendorProfile { ratingsAvg: number; budgetFloor: number; budgetCeiling: number; experienceYears: number; responseTimeAvgMins: number; isColdStart: boolean; specialties: string[]; }
interface VendorStats { invitesReceived: number; responsesCount: number; acceptancesCount: number; bookingsCount: number; }
interface Vendor { id: string; businessName: string; category: string; operatingCity: string; profile: VendorProfile | null; performanceStats: VendorStats | null; }
interface AdminAction { id: string; actionType: string; performedBy: string; oldScore: number; newScore: number; reason: string; timestamp: string; requirementId: string; eventType: string; vendorName: string; }
interface Metrics { summary: { totalRequirements: number; totalBookings: number; responseRate: number; bookingConversionRate: number; avgResponseTimeMins: number; }; lastRequirement: { id: string; eventType: string; theme: string; } | null; histogram: { excellent: number; good: number; average: number; poor: number; }; }

// ── Prism SVG ────────────────────────────────────────────────────────────────

function ScorePrism({ score, theme, budget, distance }: { score: number; theme: number; budget: number; distance: number }) {
  const r1 = 42, r2 = 31, r3 = 20;
  const arc = (r: number, pct: number) => {
    const c = 2 * Math.PI * r;
    return { strokeDasharray: `${c}`, strokeDashoffset: `${c * (1 - Math.max(0, pct) / 100)}` };
  };
  return (
    <div className="relative flex-shrink-0 w-[88px] h-[88px]" title={`Theme ${theme}% · Budget ${budget}% · Proximity ${distance}%`}>
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={r1} fill="none" stroke="currentColor" className="text-fig/[0.04]" strokeWidth="5" />
        <circle cx="50" cy="50" r={r2} fill="none" stroke="currentColor" className="text-fig/[0.04]" strokeWidth="5" />
        <circle cx="50" cy="50" r={r3} fill="none" stroke="currentColor" className="text-fig/[0.04]" strokeWidth="5" />
        <circle cx="50" cy="50" r={r1} fill="none" stroke="#5B7C62" strokeWidth="5.5" strokeLinecap="round" {...arc(r1, theme)} />
        <circle cx="50" cy="50" r={r2} fill="none" stroke="#C96C52" strokeWidth="5.5" strokeLinecap="round" {...arc(r2, budget)} />
        <circle cx="50" cy="50" r={r3} fill="none" stroke="#2E1220" strokeWidth="5.5" strokeLinecap="round" {...arc(r3, distance)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-base font-bold font-serif text-fig leading-none">{score}</span>
        <span className="text-[8px] text-fig/40 font-medium">score</span>
      </div>
    </div>
  );
}

// ── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState<'feed' | 'admin' | 'metrics' | 'vendors'>('feed');

  // Form state
  const [eventType, setEventType] = useState('decorator');
  const [city, setCity] = useState('Chennai');
  const [eventDate, setEventDate] = useState('2026-10-12');
  const [guestCount, setGuestCount] = useState(250);
  const [budget, setBudget] = useState(200000);
  const [theme, setTheme] = useState('Rustic garden wedding with fairy lights and pastel roses');
  const [lat, setLat] = useState(13.0063);
  const [lng, setLng] = useState(80.2574);
  const [freeText, setFreeText] = useState('Need a traditional south-indian wedding caterer in Bangalore for 300 guests on 12th Oct 2026, budget around 1.5 lakhs');
  const [parsingAI, setParsingAI] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // Data state
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [selectedReq, setSelectedReq] = useState<Requirement | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [actions, setActions] = useState<AdminAction[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  // Vendor response sim
  const [mockQuote, setMockQuote] = useState(180000);
  const [declineReason, setDeclineReason] = useState('Fully Booked');
  const [declineMsg] = useState('Sorry, fully committed on this date.');
  const [quoteMsg, setQuoteMsg] = useState('We would love to do this!');
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);

  // Vendor directory filters
  const [vCatFilter, setVCatFilter] = useState('all');
  const [vCityFilter, setVCityFilter] = useState('all');
  const [vSearch, setVSearch] = useState('');

  const presets: Record<string, { name: string; lat: number; lng: number }[]> = {
    Chennai: [
      { name: 'Adyar', lat: 13.0063, lng: 80.2574 },
      { name: 'Nungambakkam', lat: 13.0626, lng: 80.2376 },
      { name: 'OMR Sholinganallur', lat: 12.9010, lng: 80.2279 },
      { name: 'Anna Nagar', lat: 13.0850, lng: 80.2101 },
    ],
    Bangalore: [
      { name: 'Koramangala', lat: 12.9279, lng: 77.6271 },
      { name: 'Indiranagar', lat: 12.9719, lng: 77.6412 },
      { name: 'Whitefield', lat: 12.9698, lng: 77.7499 },
      { name: 'Jayanagar', lat: 12.9308, lng: 77.5838 },
    ],
  };

  // ── API helpers ──

  const load = async () => {
    try {
      const [rq, vd, ac, mt] = await Promise.all([
        fetch(`${API}/api/admin/requirements`).then(r => r.json()),
        fetch(`${API}/api/vendors`).then(r => r.json()),
        fetch(`${API}/api/admin/actions`).then(r => r.json()),
        fetch(`${API}/api/metrics`).then(r => r.json()),
      ]);
      if (rq.success) setRequirements(rq.requirements);
      if (vd.success) setVendors(vd.vendors);
      if (ac.success) setActions(ac.actions);
      if (mt.success) setMetrics(mt);
    } catch (e) { console.error('Load failed:', e); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const p = presets[city];
    if (p?.[0]) { setLat(p[0].lat); setLng(p[0].lng); }
  }, [city]);

  const flash = (msg: string) => { setStatusMsg(msg); setTimeout(() => setStatusMsg(''), 4000); };

  const parseAI = async () => {
    if (!freeText.trim()) return;
    setParsingAI(true);
    try {
      const r = await fetch(`${API}/api/requirements/parse`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: freeText }) });
      const j = await r.json();
      if (j.success && j.data) {
        const d = j.data;
        if (d.eventType) setEventType(d.eventType);
        if (d.city) setCity(d.city);
        if (d.eventDate) setEventDate(d.eventDate.split('T')[0]);
        if (d.guestCount) setGuestCount(d.guestCount);
        if (d.budget) setBudget(d.budget);
        if (d.theme) setTheme(d.theme);
        flash('AI parsed your requirement — review below.');
      }
    } catch { alert('Parser service unavailable.'); }
    finally { setParsingAI(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try {
      const r = await fetch(`${API}/api/requirements`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventType, city, eventDate, guestCount, budget, theme, latitude: lat, longitude: lng }) });
      const d = await r.json();
      if (d.success) { fetchMatches(d.requirementId); load(); }
      else alert('Matching failed: ' + d.error);
    } catch { alert('Server error.'); }
    finally { setLoading(false); }
  };

  const fetchMatches = async (id: string) => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/requirements/${id}/matches`);
      const d = await r.json();
      if (d.success) { setSelectedReq(d.requirement); setMatches(d.matches); setMockQuote(d.requirement.budget * 0.95); }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const respond = async (invId: string, status: 'accepted' | 'declined') => {
    try {
      const r = await fetch(`${API}/api/responses`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invitationId: invId, status, quoteAmount: status === 'accepted' ? mockQuote : null, declineReason: status === 'declined' ? declineReason : null, message: status === 'accepted' ? quoteMsg : declineMsg }) });
      const d = await r.json();
      if (d.success) { flash(status === 'accepted' ? `Booked at ₹${mockQuote.toLocaleString('en-IN')}` : `Declined (${declineReason})`); if (selectedReq) fetchMatches(selectedReq.id); load(); }
    } catch (e) { console.error(e); }
  };

  const invite = async (matchId: string) => {
    try {
      const r = await fetch(`${API}/api/invitations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matchId, tier: 1 }) });
      const d = await r.json();
      if (d.success) { if (selectedReq) fetchMatches(selectedReq.id); load(); }
      else alert(d.error || 'Failed.');
    } catch (e) { console.error(e); }
  };

  const override = async (matchId: string, action: string) => {
    try {
      const r = await fetch(`${API}/api/admin/matches/${matchId}/override`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, reason: `Admin: ${action.toUpperCase()}` }) });
      const d = await r.json();
      if (d.success) { if (selectedReq) fetchMatches(selectedReq.id); load(); }
    } catch (e) { console.error(e); }
  };

  // Vendor directory filtered list
  const filteredVendors = useMemo(() => {
    return vendors.filter(v => {
      if (vCatFilter !== 'all' && v.category !== vCatFilter) return false;
      if (vCityFilter !== 'all' && v.operatingCity !== vCityFilter) return false;
      if (vSearch && !v.businessName.toLowerCase().includes(vSearch.toLowerCase())) return false;
      return true;
    });
  }, [vendors, vCatFilter, vCityFilter, vSearch]);

  const vendorCategories = useMemo(() => [...new Set(vendors.map(v => v.category))], [vendors]);
  const vendorCities = useMemo(() => [...new Set(vendors.map(v => v.operatingCity))], [vendors]);

  const dark = tab === 'admin' || tab === 'metrics';

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-500 selection:bg-terracotta selection:text-white ${dark ? 'bg-[#111318] text-slate-200' : 'bg-cream-50 text-fig'}`}>

      {/* ━━ Header ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <header className={`sticky top-0 z-50 px-4 sm:px-6 py-3 flex flex-col sm:flex-row justify-between items-center gap-3 border-b transition-colors duration-500 ${dark ? 'bg-[#16181E]/95 backdrop-blur-lg border-white/[0.06]' : 'bg-cream-50/95 backdrop-blur-lg border-fig/[0.06]'}`}>
        <div className="flex items-center gap-2.5">
          <div className="bg-gradient-to-tr from-terracotta to-terracotta-300 p-2 rounded-xl">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div className="leading-tight">
            <h1 className={`text-xl font-serif font-bold ${dark ? 'text-white' : 'text-fig'}`}>Happiffie</h1>
            <p className={`text-[9px] font-semibold tracking-[0.15em] uppercase ${dark ? 'text-slate-500' : 'text-fig/40'}`}>Vendor Matching Engine</p>
          </div>
        </div>

        <nav className={`flex p-1 rounded-xl ${dark ? 'bg-white/[0.04] border border-white/[0.06]' : 'bg-fig/[0.03] border border-fig/[0.06]'}`}>
          {([['feed', 'Recommendations', UserCheck], ['admin', 'Admin Console', ShieldAlert], ['metrics', 'Metrics', BarChart3], ['vendors', 'Vendors', Database]] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => { setTab(key); load(); }}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${
                tab === key ? 'bg-terracotta text-white shadow-sm' : dark ? 'text-slate-400 hover:text-slate-200' : 'text-fig/50 hover:text-fig'
              }`}>
              <Icon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </nav>
      </header>

      {/* ━━ Main ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6">

        {/* ── TAB 1: RECOMMENDATION FEED ──────────────────────────────────── */}
        {tab === 'feed' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

            {/* Intake Panel */}
            <aside className="lg:col-span-4 xl:col-span-4 card p-5 flex flex-col gap-5 lg:sticky lg:top-20">
              <div>
                <h2 className="text-sm font-serif font-bold text-fig">Describe your celebration</h2>
                <p className="text-[11px] text-fig/50 mt-0.5">Write naturally or fill in the fields below.</p>
              </div>

              {/* Free text */}
              <div className="flex flex-col gap-2">
                <textarea rows={3} value={freeText} onChange={e => setFreeText(e.target.value)} placeholder="e.g. decorator in Chennai for a 250-guest wedding…" className="input !text-xs !rounded-xl resize-none" />
                <button type="button" onClick={parseAI} disabled={parsingAI} className="btn-ghost flex items-center justify-center gap-1.5 text-terracotta border-terracotta/20 hover:border-terracotta/40 hover:bg-terracotta-50 disabled:opacity-50">
                  {parsingAI ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {parsingAI ? 'Parsing…' : 'AI Auto-Fill'}
                </button>
              </div>

              <hr className="border-fig/[0.06]" />

              {/* Structured form */}
              <form onSubmit={submit} className="flex flex-col gap-4">
                <div>
                  <span className="label mb-1.5 block">Category</span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {['decorator', 'caterer', 'photographer', 'venue'].map(c => (
                      <button key={c} type="button" onClick={() => setEventType(c)}
                        className={`py-1.5 rounded-lg border text-[11px] capitalize text-center transition-all ${eventType === c ? 'border-terracotta bg-terracotta-50 text-terracotta font-semibold' : 'border-fig/8 text-fig/50 hover:border-fig/20'}`}>
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="label mb-1 block">City</span>
                    <select value={city} onChange={e => setCity(e.target.value)} className="input !text-xs !py-1.5">
                      <option>Chennai</option><option>Bangalore</option>
                    </select>
                  </div>
                  <div>
                    <span className="label mb-1 block">Date</span>
                    <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} className="input !text-xs !py-1.5" />
                  </div>
                </div>

                <div>
                  <span className="label mb-1 block">Location Zone</span>
                  <div className="flex flex-col gap-1">
                    {presets[city]?.map(p => (
                      <button key={p.name} type="button" onClick={() => { setLat(p.lat); setLng(p.lng); }}
                        className={`text-[10px] px-2.5 py-1.5 text-left rounded-lg border flex justify-between items-center transition-all ${lat === p.lat && lng === p.lng ? 'border-terracotta bg-terracotta-50/50 text-terracotta font-semibold' : 'border-fig/6 text-fig/45 hover:bg-cream-100'}`}>
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{p.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="label mb-1 block">Guests</span>
                    <input type="number" value={guestCount} onChange={e => setGuestCount(+e.target.value)} className="input !text-xs !py-1.5" />
                  </div>
                  <div>
                    <span className="label mb-1 block">Budget (₹)</span>
                    <input type="number" value={budget} onChange={e => setBudget(+e.target.value)} className="input !text-xs !py-1.5" />
                  </div>
                </div>

                <div>
                  <span className="label mb-1 block">Theme Keywords</span>
                  <textarea rows={2} value={theme} onChange={e => setTheme(e.target.value)} className="input !text-xs !rounded-xl resize-none" />
                </div>

                <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-1.5">
                  {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4" /> Find Matching Vendors</>}
                </button>
              </form>

              {/* Past Requirements */}
              {requirements.length > 0 && (
                <div className="border-t border-fig/[0.06] pt-3 flex flex-col gap-1">
                  <span className="label">Past Searches ({requirements.length})</span>
                  <div className="flex flex-col gap-0.5 max-h-28 overflow-y-auto">
                    {requirements.map(r => (
                      <button key={r.id} onClick={() => fetchMatches(r.id)}
                        className={`p-2 rounded-lg text-left text-[11px] flex justify-between items-center transition-all ${selectedReq?.id === r.id ? 'bg-terracotta-50/50 text-terracotta' : 'text-fig/50 hover:bg-cream-100'}`}>
                        <span className="capitalize font-medium truncate">{r.eventType} · {r.city}</span>
                        <span className={`badge ${r.status === 'booked' ? 'bg-sage-50 text-sage' : 'bg-fig/5 text-fig/40'}`}>{r.status}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </aside>

            {/* Results Feed */}
            <section className="lg:col-span-8 xl:col-span-8 flex flex-col gap-5">

              {/* Status */}
              {statusMsg && (
                <div className="card border-sage/20 bg-sage-50/30 px-4 py-3 text-xs text-sage-600 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 flex-shrink-0" /> {statusMsg}
                </div>
              )}

              {/* Selected requirement context */}
              {selectedReq ? (
                <div className="card p-5 flex flex-col sm:flex-row justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="badge bg-fig/5 text-fig capitalize">{selectedReq.eventType}</span>
                      <span className="text-xs text-fig/50 flex items-center gap-0.5"><MapPin className="h-3 w-3" />{selectedReq.city}</span>
                      <span className="text-xs text-fig/50 flex items-center gap-0.5"><Calendar className="h-3 w-3" />{new Date(selectedReq.eventDate).toLocaleDateString()}</span>
                    </div>
                    <h3 className="text-sm font-serif font-bold text-fig">{selectedReq.theme || 'Custom event'}</h3>
                    <p className="text-xs text-fig/50 mt-1">Budget: <span className="font-semibold text-terracotta">₹{selectedReq.budget.toLocaleString('en-IN')}</span></p>
                  </div>
                  <div className="text-right self-start">
                    <span className={`badge text-[9px] ${selectedReq.status === 'booked' ? 'bg-sage-50 text-sage border border-sage/20' : 'bg-fig/5 text-fig/60'}`}>
                      {selectedReq.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="card border-dashed border-2 border-fig/8 p-12 text-center">
                  <Sparkles className="h-8 w-8 text-terracotta/25 mx-auto mb-2" />
                  <h3 className="font-serif font-bold text-fig">No matches yet</h3>
                  <p className="text-xs text-fig/40 mt-1 max-w-sm mx-auto">Describe your celebration on the left and hit "Find Matching Vendors" to see ranked results.</p>
                </div>
              )}

              {/* Match Cards */}
              {selectedReq && matches.length === 0 && (
                <div className="card p-8 text-center text-xs text-fig/50">No vendors passed the hard filters for this combination.</div>
              )}

              {matches.map((m, i) => {
                const expanded = expandedMatch === m.id;
                return (
                  <div key={m.id} className={`card p-5 transition-all duration-200 hover:shadow-md ${m.overrideStatus === 'excluded' ? 'opacity-40' : ''}`}>
                    {/* Top row */}
                    <div className="flex gap-4 items-start">
                      <ScorePrism score={m.rawScore} theme={m.scoreBreakdown.capabilityFit} budget={m.scoreBreakdown.budgetAlignment} distance={m.scoreBreakdown.distanceDecay} />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h4 className="font-serif font-bold text-fig text-sm">{i + 1}. {m.businessName}</h4>
                          {m.scoreBreakdown.coldStartBoost > 0 && <span className="badge bg-terracotta-50 text-terracotta border border-terracotta/20">New Vendor</span>}
                          {m.skipReason === 'invite_cap_reached' && <span className="badge bg-amber-50 text-amber-600 border border-amber-200"><AlertTriangle className="h-3 w-3" />Cap Reached</span>}
                          {m.overrideStatus === 'boosted' && <span className="badge bg-amber-50 text-amber-600 border border-amber-200"><ArrowUpRight className="h-3 w-3" />Boosted</span>}
                          {m.overrideStatus === 'force_invite' && <span className="badge bg-indigo-50 text-indigo-600 border border-indigo-200"><Zap className="h-3 w-3" />Forced</span>}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-fig/45">
                          <span className="flex items-center gap-0.5 text-amber-500 font-semibold"><Star className="h-3 w-3 fill-amber-500 text-transparent" />{m.rating > 0 ? m.rating.toFixed(1) : 'New'}</span>
                          <span className="capitalize">{m.category}</span>
                          <span>{m.operatingCity}</span>
                        </div>

                        {/* Score legend */}
                        <div className="flex gap-4 mt-2 text-[9px] text-fig/35">
                          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-sage" />Theme {m.scoreBreakdown.capabilityFit}%</span>
                          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-terracotta" />Budget {m.scoreBreakdown.budgetAlignment}%</span>
                          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-fig" />Proximity {m.scoreBreakdown.distanceDecay}%</span>
                        </div>
                      </div>

                      {/* Toggle */}
                      <button onClick={() => setExpandedMatch(expanded ? null : m.id)} className="btn-ghost !px-2 !py-1">
                        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>

                    {/* Expandable Detail */}
                    {expanded && (
                      <div className="mt-4 flex flex-col gap-3 border-t border-fig/[0.06] pt-4">
                        {/* AI Rationale */}
                        {m.aiExplanationUser && (
                          <div className="bg-cream-100 p-4 rounded-xl flex gap-2.5 items-start">
                            <Sparkles className="h-4 w-4 text-terracotta flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-[10px] font-bold text-fig/60 uppercase tracking-wider">Why this match</p>
                              <p className="text-xs text-fig/70 mt-1 italic leading-relaxed">"{m.aiExplanationUser}"</p>
                            </div>
                          </div>
                        )}

                        {/* Score detail grid */}
                        <div className="grid grid-cols-4 gap-2 text-center">
                          {[
                            ['Rating', m.scoreBreakdown.vendorRating],
                            ['Response', m.scoreBreakdown.responseTime],
                            ['Accept Rate', m.scoreBreakdown.acceptanceRate],
                            ['Conversion', m.scoreBreakdown.conversionRate],
                          ].map(([label, val]) => (
                            <div key={label as string} className="bg-cream-100 p-2 rounded-lg">
                              <span className="text-[9px] text-fig/35 block">{label as string}</span>
                              <span className="text-xs font-bold text-fig">{val as number}%</span>
                            </div>
                          ))}
                        </div>

                        {/* Invitation status & vendor response sim */}
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2 text-xs text-fig/50">
                            <span>Invitation:</span>
                            {m.latestInvitation ? (
                              <span className={`badge ${m.latestInvitation.status === 'accepted' ? 'bg-sage-50 text-sage' : m.latestInvitation.status === 'declined' ? 'bg-red-50 text-red-500' : 'bg-indigo-50 text-indigo-500'}`}>
                                {m.latestInvitation.status.toUpperCase()}
                              </span>
                            ) : <span className="text-fig/30 italic">Not sent</span>}
                          </div>

                          {!m.latestInvitation && (
                            <button onClick={() => invite(m.id)} className="btn-ghost text-terracotta border-terracotta/20 hover:border-terracotta/40 hover:bg-terracotta-50 self-start">
                              <Send className="h-3 w-3 inline mr-1" />Send Invite
                            </button>
                          )}

                          {m.latestInvitation?.status === 'sent' && (
                            <div className="bg-cream-100 p-3 rounded-xl flex flex-col gap-2 text-[11px]">
                              <span className="label">Simulate Vendor Response</span>
                              <div className="flex flex-wrap gap-2 items-center">
                                <input type="number" value={mockQuote} onChange={e => setMockQuote(+e.target.value)} className="input !w-24 !text-[11px] !py-1" placeholder="Quote ₹" />
                                <input type="text" value={quoteMsg} onChange={e => setQuoteMsg(e.target.value)} className="input !w-40 !text-[11px] !py-1" placeholder="Message" />
                                <button onClick={() => respond(m.latestInvitation!.id, 'accepted')} className="px-2.5 py-1 bg-sage hover:bg-sage-600 text-white rounded-lg text-[10px] font-bold transition-all">Accept</button>
                              </div>
                              <div className="flex gap-2 items-center">
                                <select value={declineReason} onChange={e => setDeclineReason(e.target.value)} className="input !w-36 !text-[10px] !py-1">
                                  <option>Fully Booked</option><option>Budget Too Low</option><option>Distance Too Far</option>
                                </select>
                                <button onClick={() => respond(m.latestInvitation!.id, 'declined')} className="px-2.5 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg text-[10px] font-bold transition-all">Decline</button>
                              </div>
                            </div>
                          )}

                          {m.latestInvitation?.status === 'accepted' && (
                            <span className="text-xs text-sage font-semibold flex items-center gap-1"><CheckCircle className="h-4 w-4" />Booked</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          </div>
        )}

        {/* ── TAB 2: ADMIN CONSOLE ────────────────────────────────────────── */}
        {tab === 'admin' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Sidebar */}
            <aside className="lg:col-span-4 card-dark p-4 flex flex-col gap-3">
              <h2 className="text-xs font-mono font-bold text-white flex items-center gap-1.5">
                <ShieldAlert className="h-4 w-4 text-terracotta" /> Requirements Log
              </h2>
              <div className="flex flex-col gap-1 max-h-[400px] overflow-y-auto">
                {requirements.map(r => (
                  <button key={r.id} onClick={() => fetchMatches(r.id)}
                    className={`p-2.5 rounded-lg text-left text-[11px] font-mono border transition-all ${selectedReq?.id === r.id ? 'bg-white/[0.04] border-terracotta/30 text-terracotta-200' : 'border-transparent text-slate-400 hover:bg-white/[0.03]'}`}>
                    <div className="flex justify-between items-center">
                      <span className="font-semibold capitalize">{r.eventType} · {r.city}</span>
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${r.status === 'booked' ? 'bg-sage/10 text-emerald-400' : 'bg-white/5 text-slate-500'}`}>{r.status}</span>
                    </div>
                    <div className="text-[9px] text-slate-500 mt-1 truncate">{r.theme || 'N/A'}</div>
                  </button>
                ))}
              </div>
            </aside>

            {/* Main panel */}
            <section className="lg:col-span-8 flex flex-col gap-5">
              {selectedReq ? (
                <div className="card-dark p-4 flex flex-col gap-3 font-mono">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-[9px] text-slate-500">REQ_ID</span>
                      <h3 className="text-[11px] font-bold text-slate-300 truncate">{selectedReq.id.slice(0, 12)}…</h3>
                    </div>
                    <span className="text-[9px] text-slate-500">{matches.length} candidates</span>
                  </div>

                  <div className="flex flex-col gap-2">
                    {matches.map((m, i) => (
                      <div key={m.id} className="bg-white/[0.02] p-3 rounded-lg border border-white/[0.04] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 text-[11px]">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-200 font-semibold">{i + 1}. {m.businessName}</span>
                            <span className="text-[9px] bg-white/5 px-1.5 py-0.5 rounded text-slate-400">{m.baseScore}%</span>
                            {m.overrideStatus !== 'none' && (
                              <span className="text-[8px] bg-terracotta/15 text-terracotta px-1.5 py-0.5 rounded uppercase font-bold">{m.overrideStatus}</span>
                            )}
                          </div>
                          <div className="text-[9px] text-slate-500 mt-0.5 flex gap-3">
                            <span>★ {m.rating}</span><span>{m.operatingCity}</span>
                            {m.overrideReason && <span className="italic truncate max-w-[200px]">"{m.overrideReason}"</span>}
                          </div>
                        </div>
                        <div className="flex gap-1.5 flex-shrink-0">
                          <button onClick={() => override(m.id, m.overrideStatus === 'boosted' ? 'none' : 'boosted')}
                            className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${m.overrideStatus === 'boosted' ? 'bg-amber-500 text-white' : 'bg-white/5 text-amber-400 hover:bg-white/10'}`}>
                            Boost
                          </button>
                          <button disabled={m.latestInvitation !== null} onClick={() => override(m.id, 'force_invite')}
                            className={`px-2 py-1 rounded text-[10px] font-bold transition-all disabled:opacity-30 ${m.overrideStatus === 'force_invite' ? 'bg-indigo-500 text-white' : 'bg-white/5 text-indigo-400 hover:bg-white/10'}`}>
                            Force
                          </button>
                          <button onClick={() => override(m.id, m.overrideStatus === 'excluded' ? 'none' : 'excluded')}
                            className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${m.overrideStatus === 'excluded' ? 'bg-red-500 text-white' : 'bg-white/5 text-red-400 hover:bg-white/10'}`}>
                            {m.overrideStatus === 'excluded' ? <Eye className="h-3 w-3 inline" /> : <EyeOff className="h-3 w-3 inline" />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="card-dark p-10 text-center text-slate-500 font-mono text-xs">Select a requirement from the log.</div>
              )}

              {/* Audit Trail */}
              <div className="card-dark p-4 flex flex-col gap-3 font-mono">
                <h3 className="text-[11px] font-bold text-white flex items-center gap-1.5 uppercase tracking-wider">
                  <History className="h-3.5 w-3.5 text-terracotta" /> Audit Trail
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px] text-left text-slate-400">
                    <thead className="text-[9px] text-slate-500 uppercase border-b border-white/[0.06]">
                      <tr><th className="py-2 pr-3">Time</th><th className="pr-3">Vendor</th><th className="pr-3">Action</th><th className="pr-3">Delta</th><th>Reason</th></tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {actions.length === 0 ? (
                        <tr><td colSpan={5} className="py-4 text-center text-slate-600 italic">No overrides recorded.</td></tr>
                      ) : actions.map(a => (
                        <tr key={a.id} className="hover:bg-white/[0.02]">
                          <td className="py-2 pr-3 text-slate-500">{new Date(a.timestamp).toLocaleTimeString()}</td>
                          <td className="pr-3 text-slate-300">{a.vendorName}</td>
                          <td className="pr-3">
                            <span className={`px-1.5 py-0.5 rounded text-[8px] uppercase font-bold ${a.actionType === 'boosted' ? 'bg-amber-500/15 text-amber-400' : a.actionType === 'force_invite' ? 'bg-indigo-500/15 text-indigo-400' : a.actionType === 'excluded' ? 'bg-red-500/15 text-red-400' : 'bg-white/5 text-slate-400'}`}>
                              {a.actionType}
                            </span>
                          </td>
                          <td className="pr-3">{a.oldScore}% → {a.newScore}%</td>
                          <td className="text-slate-500 italic truncate max-w-[200px]">{a.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ── TAB 3: METRICS DASHBOARD ────────────────────────────────────── */}
        {tab === 'metrics' && (
          <div className="flex flex-col gap-6">
            {!metrics ? (
              <div className="card-dark p-12 text-center flex flex-col items-center gap-3">
                <RefreshCw className="h-6 w-6 animate-spin text-terracotta" />
                <p className="text-sm text-slate-400 font-mono">Loading metrics…</p>
              </div>
            ) : (
              <>
                {/* KPI row */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: 'Response Rate', value: `${metrics.summary.responseRate}%`, icon: UserCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/10' },
                    { label: 'Avg Response Speed', value: `${metrics.summary.avgResponseTimeMins} min`, icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/10' },
                    { label: 'Booking Conversion', value: `${metrics.summary.bookingConversionRate}%`, icon: TrendingUp, color: 'text-terracotta', bg: 'bg-terracotta/10 border-terracotta/10' },
                    { label: 'Requests / Booked', value: `${metrics.summary.totalRequirements} / ${metrics.summary.totalBookings}`, icon: BookOpen, color: 'text-slate-400', bg: 'bg-white/5 border-white/5' },
                  ].map(({ label, value, icon: Icon, color, bg }) => (
                    <div key={label} className="card-dark p-5 flex items-center justify-between">
                      <div>
                        <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block">{label}</span>
                        <span className={`text-xl font-bold block mt-1 ${color}`}>{value}</span>
                      </div>
                      <div className={`p-2 rounded-xl border ${bg}`}><Icon className={`h-5 w-5 ${color}`} /></div>
                    </div>
                  ))}
                </div>

                {/* Histogram */}
                <div className="card-dark p-5 flex flex-col gap-5">
                  <div>
                    <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider">Score Distribution</h3>
                    <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                      Latest: <span className="text-terracotta">{metrics.lastRequirement ? `${metrics.lastRequirement.eventType} — "${(metrics.lastRequirement.theme || '').slice(0, 40)}…"` : 'N/A'}</span>
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 max-w-lg">
                    {[
                      { label: 'Excellent 90–100', value: metrics.histogram.excellent, color: 'bg-emerald-500' },
                      { label: 'Good 80–89', value: metrics.histogram.good, color: 'bg-teal-500' },
                      { label: 'Average 70–79', value: metrics.histogram.average, color: 'bg-amber-500' },
                      { label: 'Poor <70', value: metrics.histogram.poor, color: 'bg-slate-600' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="flex items-center gap-3 text-[10px] font-mono">
                        <span className="w-28 text-slate-400">{label}</span>
                        <div className="flex-1 bg-white/[0.04] h-2.5 rounded overflow-hidden">
                          <div style={{ width: `${Math.min(100, (value || 0) * 10)}%` }} className={`${color} h-full rounded transition-all duration-700`} />
                        </div>
                        <span className="w-6 text-right font-bold text-slate-300">{value || 0}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── TAB 4: VENDOR DIRECTORY ─────────────────────────────────────── */}
        {tab === 'vendors' && (
          <div className="flex flex-col gap-5">
            {/* Header & Filters */}
            <div className="card p-5 flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h2 className="text-sm font-serif font-bold text-fig">Platform Vendor Directory</h2>
                  <p className="text-[11px] text-fig/45 mt-0.5">Browse all registered vendors with semantic embeddings. <span className="font-semibold text-fig/60">{filteredVendors.length}</span> of {vendors.length} shown.</p>
                </div>
                <button onClick={load} className="btn-ghost flex items-center gap-1.5 text-[10px]"><RefreshCw className="h-3 w-3" />Refresh</button>
              </div>

              {/* Filter bar */}
              <div className="flex flex-wrap gap-3 items-center">
                <div className="flex items-center gap-1.5 bg-cream-100 border border-fig/6 rounded-xl px-3 py-1.5">
                  <Search className="h-3.5 w-3.5 text-fig/30" />
                  <input type="text" placeholder="Search vendors…" value={vSearch} onChange={e => setVSearch(e.target.value)} className="bg-transparent text-xs text-fig placeholder:text-fig/30 focus:outline-none w-36" />
                </div>
                <div className="flex items-center gap-1.5">
                  <Filter className="h-3.5 w-3.5 text-fig/30" />
                  <select value={vCatFilter} onChange={e => setVCatFilter(e.target.value)} className="input !w-auto !text-[11px] !py-1 !px-2 !rounded-lg">
                    <option value="all">All Categories</option>
                    {vendorCategories.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
                  </select>
                  <select value={vCityFilter} onChange={e => setVCityFilter(e.target.value)} className="input !w-auto !text-[11px] !py-1 !px-2 !rounded-lg">
                    <option value="all">All Cities</option>
                    {vendorCities.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Vendor grid */}
            {filteredVendors.length === 0 ? (
              <div className="card p-8 text-center text-xs text-fig/40">No vendors match the current filters.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredVendors.map(v => {
                  const p = v.profile;
                  const s = v.performanceStats;
                  return (
                    <div key={v.id} className="card p-4 flex flex-col justify-between hover:shadow-md transition-shadow">
                      <div>
                        <div className="flex justify-between items-start gap-2 mb-2">
                          <h4 className="font-serif font-bold text-xs text-fig leading-snug truncate">{v.businessName}</h4>
                          <span className="badge bg-fig/5 text-fig/60 capitalize flex-shrink-0">{v.category}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-fig/45 mb-3">
                          <span className="flex items-center gap-0.5 text-amber-500 font-medium"><Star className="h-3 w-3 fill-amber-500 text-transparent" />{p?.ratingsAvg ? p.ratingsAvg.toFixed(1) : 'New'}</span>
                          <span>·</span><span>{v.operatingCity}</span>
                          <span>·</span><span>{p?.experienceYears} yrs</span>
                          {p?.isColdStart && <span className="badge bg-terracotta-50 text-terracotta text-[8px]">Cold Start</span>}
                        </div>
                        <div className="flex flex-wrap gap-1 mb-3">
                          {(p?.specialties || []).map(sp => (
                            <span key={sp} className="text-[8px] px-1.5 py-0.5 rounded bg-cream-100 text-fig/50 font-mono">#{sp}</span>
                          ))}
                        </div>
                      </div>
                      <div className="bg-cream-100 p-2.5 rounded-xl grid grid-cols-2 gap-y-1 gap-x-3 text-[9px] text-fig/50">
                        <div>Invites: <span className="font-semibold text-fig">{s?.invitesReceived || 0}</span></div>
                        <div>Replies: <span className="font-semibold text-fig">{s?.responsesCount || 0}</span></div>
                        <div>Floor: <span className="font-semibold text-fig">₹{p?.budgetFloor?.toLocaleString('en-IN') || '—'}</span></div>
                        <div>Booked: <span className="font-semibold text-sage">{s?.bookingsCount || 0}</span></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </main>

      {/* ━━ Footer ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <footer className={`border-t py-5 text-center text-[10px] transition-colors duration-500 ${dark ? 'bg-[#16181E] border-white/[0.04] text-slate-500' : 'bg-cream-50 border-fig/[0.06] text-fig/35'}`}>
        © 2026 Caladium Systems · Happiffie AI Vendor Matching Engine
      </footer>
    </div>
  );
}
