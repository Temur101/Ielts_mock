import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Users, 
  GraduationCap, 
  ExternalLink, 
  Copy, 
  Check, 
  QrCode as QrIcon, 
  FileText, 
  Play, 
  Search, 
  Filter, 
  RefreshCw, 
  Clock, 
  Award, 
  BookOpen, 
  Headphones, 
  PenTool, 
  LogOut, 
  Radio, 
  ChevronRight,
  Sparkles,
  BarChart3,
  Calendar,
  Layers
} from 'lucide-react';
import { 
  fetchAllExamSessions, 
  calculateMasterAcademyStats, 
  signOutSuperAdmin 
} from '../../lib/superAdminService';
import { getSupabaseClient } from '../../lib/supabase';
import { QrCodeModal } from './QrCodeModal';
import { exportAcademyMasterPdfReport } from './MasterAcademyReportPdf';

export function SuperAdminHub({ 
  user, 
  onLogout, 
  onLaunchTeacherConsole, 
  onNavigateStudentView,
  onReturnToTeacher
}) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'lobby' | 'finished'
  const [qrModalSession, setQrModalSession] = useState(null);
  const [copiedPin, setCopiedPin] = useState(null);

  const loadSessions = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const data = await fetchAllExamSessions();
      setSessions(data);
    } catch (e) {
      console.warn("Failed to load sessions:", e);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions(true);

    const supabase = getSupabaseClient();
    let channel = null;

    if (supabase) {
      // Realtime subscription: Listen for any changes on 'exams' table
      channel = supabase
        .channel('superadmin_exams_realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'exams' },
          () => {
            loadSessions(false);
          }
        )
        .subscribe();
    }

    // 30s background fallback heartbeat
    const interval = setInterval(() => loadSessions(false), 30000);

    return () => {
      clearInterval(interval);
      if (supabase && channel) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  const stats = calculateMasterAcademyStats(sessions);

  // Filter sessions
  const filteredSessions = sessions.filter(session => {
    const matchesSearch = 
      (session.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (session.pin_code || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (session.teacher?.name || '').toLowerCase().includes(searchQuery.toLowerCase());

    if (statusFilter === 'all') return matchesSearch;
    if (statusFilter === 'active') return matchesSearch && session.status === 'active';
    if (statusFilter === 'lobby') return matchesSearch && session.status === 'lobby';
    if (statusFilter === 'finished') return matchesSearch && session.status === 'finished';
    return matchesSearch;
  });

  const handleCopyLink = (pinCode, e) => {
    if (e) e.stopPropagation();
    const url = `${window.location.origin}/join?pin=${pinCode}`;
    navigator.clipboard.writeText(url);
    setCopiedPin(pinCode);
    setTimeout(() => setCopiedPin(null), 2000);
  };

  const handleExportPdf = () => {
    exportAcademyMasterPdfReport(stats, sessions);
  };

  return (
    <div className="min-h-screen bg-slate-50/60 pb-16">
      {/* Top Super-Admin Header */}
      <header className="sticky top-0 z-40 bg-slate-900 text-white border-b border-slate-800 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            
            {/* Brand */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-orange-500 to-amber-500 flex items-center justify-center text-white shadow-lg shadow-orange-500/20">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-extrabold text-base sm:text-lg tracking-tight">
                    Super-Admin Command Center
                  </h1>
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30">
                    Master Hub
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-medium">
                  IELTS Academic Platform &bull; {user?.email || 'Superintendent'}
                </p>
              </div>
            </div>

            {/* Quick Actions & Logout */}
            <div className="flex items-center gap-2.5">
              <button
                onClick={onReturnToTeacher || onNavigateStudentView}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs flex items-center gap-1.5 transition shadow-xs"
                title="Вернуться в кабинет преподавателя"
              >
                <ShieldCheck className="w-4 h-4 text-orange-400" />
                <span className="hidden sm:inline">Кабинет учителя</span>
              </button>

              <button
                onClick={() => loadSessions(true)}
                disabled={loading}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition text-xs font-semibold flex items-center gap-1.5"
                title="Refresh Live Sessions"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden md:inline">Sync Live</span>
              </button>

              <button
                onClick={handleExportPdf}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-orange-500/20 transition"
              >
                <FileText className="w-4 h-4" />
                <span className="hidden sm:inline">Export Master PDF</span>
              </button>

              <div className="w-px h-6 bg-slate-700 mx-1" />

              <button
                onClick={onLogout}
                className="p-2 rounded-xl bg-slate-800 hover:bg-rose-900/40 hover:text-rose-400 text-slate-400 transition"
                title="Sign Out of Super-Admin"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        
        {/* Master Academy Statistics Bar */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-orange-500" />
              Master Academy Statistics
            </h2>
            <span className="text-xs text-slate-400">
              Aggregated across all testing rooms & mock sessions
            </span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4">
            {/* Total Candidates */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-bold uppercase tracking-wider">Total Candidates</span>
                <Users className="w-4 h-4 text-orange-500" />
              </div>
              <div className="mt-2">
                <div className="text-2xl sm:text-3xl font-black text-slate-900">
                  {stats.totalCandidates}
                </div>
                <div className="text-[11px] text-emerald-600 font-semibold mt-0.5">
                  &bull; Live synchronized
                </div>
              </div>
            </div>

            {/* Average Overall Band */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-bold uppercase tracking-wider">Overall Band</span>
                <Award className="w-4 h-4 text-amber-500" />
              </div>
              <div className="mt-2">
                <div className="text-2xl sm:text-3xl font-black text-orange-600">
                  {stats.avgOverall}
                </div>
                <div className="text-[11px] text-slate-500 font-semibold mt-0.5">
                  Cohort Average (Band 1-9)
                </div>
              </div>
            </div>

            {/* Reading Avg */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-bold uppercase tracking-wider">Reading Avg</span>
                <BookOpen className="w-4 h-4 text-blue-500" />
              </div>
              <div className="mt-2">
                <div className="text-2xl sm:text-3xl font-black text-blue-600">
                  {stats.avgReading}
                </div>
                <div className="text-[11px] text-slate-500 font-semibold mt-0.5">
                  Academic Passages
                </div>
              </div>
            </div>

            {/* Listening Avg */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-bold uppercase tracking-wider">Listening Avg</span>
                <Headphones className="w-4 h-4 text-purple-500" />
              </div>
              <div className="mt-2">
                <div className="text-2xl sm:text-3xl font-black text-purple-600">
                  {stats.avgListening}
                </div>
                <div className="text-[11px] text-slate-500 font-semibold mt-0.5">
                  4-Part Multi-Audio
                </div>
              </div>
            </div>

            {/* Writing Avg */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between col-span-2 lg:col-span-1">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-bold uppercase tracking-wider">Writing Avg</span>
                <PenTool className="w-4 h-4 text-rose-500" />
              </div>
              <div className="mt-2">
                <div className="text-2xl sm:text-3xl font-black text-rose-600">
                  {stats.avgWriting}
                </div>
                <div className="text-[11px] text-slate-500 font-semibold mt-0.5">
                  IDP AI Examiner
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sessions Section */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                <Layers className="w-5 h-5 text-orange-500" />
                Active Exam Sessions Registry
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Dispatch invites, display projector codes, and monitor proctor consoles
              </p>
            </div>

            {/* Search and Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search PIN, title, teacher..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 font-medium w-48 sm:w-60"
                />
              </div>

              {/* Status Filter Buttons */}
              <div className="flex bg-slate-200/70 p-1 rounded-xl text-xs font-bold text-slate-600">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-2.5 py-1 rounded-lg transition ${
                    statusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'
                  }`}
                >
                  All ({sessions.length})
                </button>
                <button
                  onClick={() => setStatusFilter('active')}
                  className={`px-2.5 py-1 rounded-lg transition ${
                    statusFilter === 'active' ? 'bg-white text-orange-600 shadow-xs' : 'hover:text-slate-900'
                  }`}
                >
                  Live
                </button>
                <button
                  onClick={() => setStatusFilter('lobby')}
                  className={`px-2.5 py-1 rounded-lg transition ${
                    statusFilter === 'lobby' ? 'bg-white text-emerald-600 shadow-xs' : 'hover:text-slate-900'
                  }`}
                >
                  Lobby
                </button>
                <button
                  onClick={() => setStatusFilter('finished')}
                  className={`px-2.5 py-1 rounded-lg transition ${
                    statusFilter === 'finished' ? 'bg-white text-slate-900 shadow-xs' : 'hover:text-slate-900'
                  }`}
                >
                  Concluded
                </button>
              </div>
            </div>
          </div>

          {/* Sessions List Table / Cards */}
          {loading && sessions.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-orange-500" />
              <p className="text-sm font-semibold">Synchronizing examination sessions from Supabase...</p>
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 text-slate-500">
              <p className="text-sm font-bold">No sessions found matching your filter.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredSessions.map((session) => {
                const isLive = session.status === 'active';
                const isLobby = session.status === 'lobby';
                const isCopied = copiedPin === session.pin_code;

                return (
                  <div
                    key={session.id || session.pin_code}
                    className="bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md transition-all p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-5"
                  >
                    {/* Left: PIN & Exam Info */}
                    <div className="flex items-start gap-4">
                      {/* Orange Session PIN Badge */}
                      <div className="flex flex-col items-center justify-center w-24 sm:w-28 h-20 rounded-2xl bg-gradient-to-b from-orange-50 to-amber-100/60 border border-orange-300 shrink-0 p-2 text-center">
                        <span className="text-[10px] font-black uppercase tracking-wider text-orange-700">
                          SESSION PIN
                        </span>
                        <span className="font-mono font-black text-lg sm:text-xl text-orange-600 tracking-tight">
                          {session.pin_code}
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium">
                          {session.duration_mins} mins
                        </span>
                      </div>

                      {/* Details */}
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-black text-base text-slate-900">
                            {session.title}
                          </h3>

                          {/* Status Badge */}
                          {isLive ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-extrabold text-[11px] animate-pulse">
                              <Radio className="w-3 h-3 text-orange-600" />
                              LIVE ACTIVE
                            </span>
                          ) : isLobby ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-extrabold text-[11px]">
                              LOBBY OPEN
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold text-[11px]">
                              CONCLUDED
                            </span>
                          )}

                          <span className="text-xs text-slate-400">
                            &bull; Stage: <strong className="text-slate-700 uppercase font-mono text-[11px]">{session.current_stage?.replace(/_/g, ' ')}</strong>
                          </span>
                        </div>

                        {/* Assigned Teacher & Room */}
                        <div className="flex items-center gap-3 text-xs text-slate-600 font-medium flex-wrap">
                          <div className="flex items-center gap-1">
                            <GraduationCap className="w-4 h-4 text-slate-400" />
                            <span>Assigned: <strong className="text-slate-800">{session.teacher?.name || 'Assigned Proctor'}</strong></span>
                          </div>
                          <span className="text-slate-300">|</span>
                          <div>
                            Room: <strong className="text-slate-800">{session.teacher?.room || 'Hall 1'}</strong>
                          </div>
                        </div>

                        {/* Live Candidate Counter */}
                        <div className="flex items-center gap-3 pt-1 text-xs">
                          <span className="flex items-center gap-1.5 font-bold text-slate-700">
                            <Users className="w-3.5 h-3.5 text-orange-500" />
                            {session.total_candidates} Candidates Registered
                          </span>
                          {session.active_candidates > 0 && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-bold text-[11px]">
                              {session.active_candidates} in Progress
                            </span>
                          )}
                          {session.submitted_candidates > 0 && (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold text-[11px]">
                              {session.submitted_candidates} Completed
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Quick-Access Action Buttons (3 required buttons) */}
                    <div className="flex items-center gap-2 flex-wrap lg:flex-nowrap border-t lg:border-t-0 pt-3 lg:pt-0">
                      
                      {/* 1. [Launch Teacher Console] */}
                      <button
                        onClick={() => onLaunchTeacherConsole(session)}
                        className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold flex items-center justify-center gap-2 shadow-sm transition active:scale-95"
                        title="Direct link opening the teacher's Live Stage Monitor and Test Creator"
                      >
                        <Play className="w-3.5 h-3.5 text-orange-400 fill-orange-400" />
                        Launch Teacher Console
                      </button>

                      {/* 2. [Copy Student Exam Link] */}
                      <button
                        onClick={(e) => handleCopyLink(session.pin_code, e)}
                        className={`flex-1 sm:flex-none px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition active:scale-95 ${
                          isCopied 
                            ? 'bg-emerald-500 text-white border-emerald-600' 
                            : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
                        }`}
                        title="One-click copy of direct student entry URL"
                      >
                        {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                        {isCopied ? 'Link Copied!' : 'Copy Student Link'}
                      </button>

                      {/* 3. [Show QR Code] */}
                      <button
                        onClick={() => setQrModalSession(session)}
                        className="flex-1 sm:flex-none px-3.5 py-2.5 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 text-xs font-extrabold flex items-center justify-center gap-1.5 transition active:scale-95"
                        title="Modal displaying large QR code for classroom projector"
                      >
                        <QrIcon className="w-4 h-4 text-orange-600" />
                        Show QR Code
                      </button>
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Classroom Projector QR Code Modal */}
      {qrModalSession && (
        <QrCodeModal
          session={qrModalSession}
          onClose={() => setQrModalSession(null)}
        />
      )}
    </div>
  );
}
