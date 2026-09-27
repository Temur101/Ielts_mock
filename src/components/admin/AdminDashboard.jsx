import React, { useState } from 'react';
import { 
  Users, 
  Activity, 
  Sliders, 
  FileText, 
  BarChart3, 
  RotateCcw,
  Sparkles,
  Headphones,
  PenTool,
  Award,
  Printer,
  FolderArchive
} from 'lucide-react';
import { LiveLobby } from './LiveLobby';
import { LiveMonitorTable } from './LiveMonitorTable';
import { TestCreator } from './TestCreator';
import { MasterResultsTable } from './MasterResultsTable';
import { StageControlBar } from './StageControlBar';
import { AnalyticsModal } from './AnalyticsModal';
import { ExamHistoryModal } from './ExamHistoryModal';
import { Button } from '../common/Button';

export function AdminDashboard({
  exam,
  students,
  activeTab: propActiveTab,
  onTabChange: propOnTabChange,
  onUpdateExam,
  onSetStage,
  onStartExam,
  onOpenLobby,
  onForceEndExam,
  onResetSession,
  onKickStudent,
  onUnbanStudent,
  onWarnStudent,
  onSaveGrades,
}) {
  const [localActiveTab, setLocalActiveTab] = useState(
    exam.current_stage === 'exam_completed' || exam.status === 'finished'
      ? 'master'
      : exam.status === 'lobby' && (exam.current_stage === 'listening_lobby' || exam.current_stage === 'reading_lobby')
      ? 'lobby'
      : 'monitor'
  );

  const activeTab = propActiveTab !== undefined ? propActiveTab : localActiveTab;
  const setTab = (tab) => {
    setLocalActiveTab(tab);
    if (propOnTabChange) propOnTabChange(tab);
  };

  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const showStageControlBar = (activeTab === 'lobby' && exam.is_lobby_open) || activeTab === 'monitor';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

      {/* Top Admin Navigation Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm print:hidden">
        
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setTab('lobby')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${
              activeTab === 'lobby'
                ? 'bg-brand-500 text-white shadow-sm shadow-brand-500/20'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Users className="w-4 h-4" />
            Classroom Lobby
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              activeTab === 'lobby' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
            }`}>
              {students.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setTab('monitor')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${
              activeTab === 'monitor'
                ? 'bg-brand-500 text-white shadow-sm shadow-brand-500/20'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Activity className="w-4 h-4" />
            Live Stage Monitor
            {exam.status === 'active' && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setTab('master')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${
              activeTab === 'master'
                ? 'bg-brand-500 text-white shadow-sm shadow-brand-500/20'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Award className="w-4 h-4" />
            Master Results & PDF Report
          </button>

          <button
            type="button"
            onClick={() => setTab('creator')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all ${
              activeTab === 'creator'
                ? 'bg-brand-500 text-white shadow-sm shadow-brand-500/20'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Sliders className="w-4 h-4" />
            Test Creator (3 Sections)
          </button>
        </div>

        {/* Global Action Tools */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={FolderArchive}
            onClick={() => setIsHistoryOpen(true)}
            className="text-xs font-bold border-brand-300 text-brand-700 hover:bg-brand-50 shadow-sm"
          >
            Exam History
          </Button>

          <Button
            variant="outline"
            size="sm"
            icon={BarChart3}
            onClick={() => setIsAnalyticsOpen(true)}
          >
            Cohort Analytics
          </Button>

          <Button
            variant="ghost"
            size="sm"
            icon={RotateCcw}
            onClick={onResetSession}
            title="Reset exam to fresh lobby and archive current session"
          >
            Reset Session
          </Button>
        </div>

      </div>

      {/* Sequential Stage Control Bar - Only visible when Lobby is Open or on Live Stage Monitor */}
      {showStageControlBar && (
        <StageControlBar
          exam={exam}
          students={students}
          onSetStage={onSetStage}
          onOpenMasterResults={() => setTab('master')}
          onOpenHistory={() => setIsHistoryOpen(true)}
          onResetSession={onResetSession}
        />
      )}

      {/* Main Tab Content */}
      <div>
        {activeTab === 'lobby' && (
          <LiveLobby
            exam={exam}
            students={students}
            onStartExam={onStartExam}
            onOpenLobby={onOpenLobby}
            onSetStage={onSetStage}
            onResetSession={onResetSession}
            onOpenMasterResults={() => setTab('master')}
            onKickStudent={onKickStudent}
          />
        )}

        {activeTab === 'monitor' && (
          <LiveMonitorTable
            exam={exam}
            students={students}
            onForceEndExam={onForceEndExam}
            onSetStage={onSetStage}
            onKickStudent={onKickStudent}
            onUnbanStudent={onUnbanStudent}
            onWarnStudent={onWarnStudent}
            onOpenAnalytics={() => setIsAnalyticsOpen(true)}
            onSaveGrades={onSaveGrades}
          />
        )}

        {activeTab === 'master' && (
          <MasterResultsTable
            exam={exam}
            students={students}
            onSaveGrades={onSaveGrades}
          />
        )}

        {activeTab === 'creator' && (
          <TestCreator
            exam={exam}
            onUpdateExam={onUpdateExam}
          />
        )}
      </div>

      {/* Analytics Modal */}
      <AnalyticsModal
        isOpen={isAnalyticsOpen}
        onClose={() => setIsAnalyticsOpen(false)}
        exam={exam}
        students={students}
      />

      {/* Exam History Archive Modal */}
      <ExamHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
      />

    </div>
  );
}
