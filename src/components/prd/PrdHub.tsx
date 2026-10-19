import React, { useState } from 'react';
import { PRD_STAGES } from '../../data/mockData';
import { ArrowLeft, Search, Printer, ArrowRight, BookOpen, Layers, CheckCircle } from 'lucide-react';

interface PrdHubProps {
  onBackToApp: () => void;
}

export const PrdHub: React.FC<PrdHubProps> = ({ onBackToApp }) => {
  const [selectedStageId, setSelectedStageId] = useState<string>(PRD_STAGES[0]?.id || 'stage-1');
  const [searchQuery, setSearchQuery] = useState('');

  const activeStage = PRD_STAGES.find((s) => s.id === selectedStageId) || PRD_STAGES[0];

  const filteredStages = PRD_STAGES.filter(
    (s) =>
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-4 flex flex-col gap-6 pb-24">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#18181b]/90 border border-white/5 rounded-2xl p-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToApp}
            className="w-9 h-9 rounded-xl bg-[#201f21] hover:bg-[#2a2a2c] flex items-center justify-center text-[#e5e1e4] hover:text-[#00f0ff] transition-colors border border-white/5 cursor-pointer shrink-0"
            title="Uygulamaya Dön"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex flex-col">
            <h1 className="font-headline font-bold text-base sm:text-lg text-white">
              X iPTV Play &amp; Download — PRD &amp; Sistem Dokümantasyonu
            </h1>
            <span className="text-xs text-[#849495]">
              Ürün gereksinimleri, mimari analiz ve teknik spesifikasyon raporu
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="px-3 py-2 rounded-xl bg-[#201f21] hover:bg-[#2a2a2c] text-xs font-semibold text-[#00f0ff] border border-[#00f0ff]/20 flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span className="hidden sm:inline">Yazdır / PDF</span>
          </button>
          <button
            onClick={onBackToApp}
            className="px-4 py-2 rounded-xl bg-[#00f0ff] hover:bg-[#00c8d6] text-[#00363a] font-headline text-xs font-bold shadow-[0_0_12px_rgba(0,240,255,0.4)] cursor-pointer transition-all"
          >
            Uygulamaya Dön
          </button>
        </div>
      </div>

      {/* Main Grid: Sidebar & Content */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Stages Sidebar */}
        <div className="md:col-span-4 flex flex-col gap-3">
          {/* Search box */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#849495]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Spesifikasyonlarda ara..."
              className="w-full bg-[#18181b] rounded-xl pl-9 pr-3 py-2 text-xs text-[#e5e1e4] placeholder:text-[#849495] border border-white/5 focus:outline-none focus:border-[#00f0ff]/40"
            />
          </div>

          <div className="flex flex-col gap-2">
            {filteredStages.map((stage) => {
              const isSelected = stage.id === selectedStageId;
              return (
                <button
                  key={stage.id}
                  onClick={() => setSelectedStageId(stage.id)}
                  className={`p-3.5 rounded-2xl text-left border transition-all cursor-pointer flex items-start gap-3 ${
                    isSelected
                      ? 'bg-[#201f21] border-[#00f0ff]/50 shadow-[0_0_15px_rgba(0,240,255,0.15)]'
                      : 'bg-[#18181b] border-white/5 hover:border-white/10 hover:bg-[#1c1b1d]'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center font-headline text-xs font-bold shrink-0 ${
                      isSelected
                        ? 'bg-[#00f0ff] text-[#00363a]'
                        : 'bg-[#2a2a2c] text-[#849495]'
                    }`}
                  >
                    {stage.number}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span
                      className={`font-headline text-xs font-bold truncate ${
                        isSelected ? 'text-[#00f0ff]' : 'text-[#e5e1e4]'
                      }`}
                    >
                      {stage.title}
                    </span>
                    <span className="text-[11px] text-[#849495] line-clamp-1 mt-0.5">
                      {stage.description}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content Viewer */}
        <div className="md:col-span-8 bg-[#18181b] border border-white/5 rounded-3xl p-6 flex flex-col gap-5">
          {activeStage ? (
            <>
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#00f0ff]/10 text-[#00f0ff] flex items-center justify-center font-headline font-bold text-sm">
                    {activeStage.number}
                  </div>
                  <div className="flex flex-col">
                    <h2 className="font-headline font-bold text-lg text-white">
                      {activeStage.title}
                    </h2>
                    <span className="text-xs text-[#849495]">{activeStage.description}</span>
                  </div>
                </div>
              </div>

              <div className="prose prose-invert max-w-none text-xs text-[#b9cacb] leading-relaxed whitespace-pre-wrap font-sans">
                {activeStage.content}
              </div>
            </>
          ) : (
            <div className="text-center py-16 text-[#849495] text-xs">
              Bir dokümantasyon aşaması seçin.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
