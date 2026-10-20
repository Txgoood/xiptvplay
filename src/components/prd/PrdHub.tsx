import React, { useState } from 'react';
import { PRD_STAGES } from '../../data/mockData';
import { ArrowLeft, Search, Printer, ArrowRight } from 'lucide-react';

interface PrdHubProps {
  onBackToApp: () => void;
}

export const PrdHub: React.FC<PrdHubProps> = ({ onBackToApp }) => {
  const [selectedStageId, setSelectedStageId] = useState(PRD_STAGES[0].id);
  const [searchQuery, setSearchQuery] = useState('');

  const currentStage = PRD_STAGES.find((s) => s.id === selectedStageId) || PRD_STAGES[0];

  const filteredStages = PRD_STAGES.filter((s) => {
    if (!searchQuery) return true;
    return (
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  return (
    <div className="flex flex-col w-full min-h-[calc(100vh-4rem)] bg-[#0e0e10] text-[#e5e1e4] pb-24">
      {/* Top Banner with Quick Actions */}
      <div className="sticky top-16 z-30 bg-[#131315]/95 backdrop-blur-md border-b border-white/5 px-4 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToApp}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#201f21] hover:bg-[#2a2a2c] text-[#00f0ff] font-headline text-xs font-bold transition-all border border-white/5 active:scale-95 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 text-[#00f0ff]" />
              <span>Uygulama Ekranına Dön</span>
            </button>
            <div className="flex items-center gap-2">
              <span className="font-headline text-sm font-bold text-white">
                xiptvplay Analiz &amp; Gereksinim Dokümantasyonu
              </span>
              <span className="px-2 py-0.5 rounded-full bg-[#0566d9]/20 text-[#adc6ff] font-headline text-[10px] font-bold">
                11 Aşama Tamamlandı
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Search Input */}
            <div className="relative flex items-center">
              <Search className="w-4 h-4 absolute left-2.5 text-[#849495]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rapor içinde ara..."
                className="bg-[#201f21] border border-white/5 rounded-full pl-8 pr-3 py-1.5 text-xs text-[#e5e1e4] placeholder:text-[#849495] focus:outline-none focus:border-[#00f0ff]/40 w-44 sm:w-60"
              />
            </div>

            {/* Print / Export button */}
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded-full bg-[#201f21] hover:bg-[#2a2a2c] text-[#b9cacb] hover:text-white text-xs font-semibold flex items-center gap-1.5 border border-white/5 cursor-pointer"
              title="Raporu Yazdır / PDF Kaydet"
            >
              <Printer className="w-3.5 h-3.5 text-[#b9cacb]" />
              <span className="hidden sm:inline">Yazdır</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="max-w-7xl mx-auto w-full px-4 py-6 grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Left Navigation Sidebar */}
        <div className="md:col-span-4 lg:col-span-3 flex flex-col gap-1.5 sticky top-36 h-fit max-h-[80vh] overflow-y-auto no-scrollbar">
          <span className="text-[11px] font-headline text-[#849495] uppercase tracking-wider font-bold px-2 mb-1">
            Çalışma Aşamaları (1-11)
          </span>
          {filteredStages.map((stage) => {
            const isSelected = stage.id === selectedStageId;
            return (
              <button
                key={stage.id}
                onClick={() => setSelectedStageId(stage.id)}
                className={`flex items-start gap-2.5 p-2.5 rounded-xl text-left transition-all cursor-pointer border ${
                  isSelected
                    ? 'bg-[#201f21] border-[#00f0ff]/30 text-[#00f0ff] shadow-md shadow-[#00f0ff]/5'
                    : 'bg-transparent border-transparent text-[#b9cacb] hover:bg-[#1c1b1d] hover:text-[#e5e1e4]'
                }`}
              >
                <span
                  className={`w-6 h-6 rounded-lg flex items-center justify-center font-headline text-xs font-bold shrink-0 ${
                    isSelected ? 'bg-[#00f0ff] text-[#00363a]' : 'bg-[#2a2a2c] text-[#b9cacb]'
                  }`}
                >
                  {stage.number}
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="font-headline text-xs font-bold truncate leading-tight">
                    {stage.title}
                  </span>
                  <span className="text-[10px] text-[#849495] truncate mt-0.5">
                    {stage.description}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right Content Reader View */}
        <div className="md:col-span-8 lg:col-span-9 bg-[#131315] border border-white/5 rounded-3xl p-6 shadow-xl flex flex-col gap-5">
          <div className="flex flex-col gap-1 border-b border-white/5 pb-4">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full bg-[#00f0ff]/15 text-[#00f0ff] font-headline text-xs font-bold">
                Aşama {currentStage.number}
              </span>
              <span className="text-xs text-[#849495]">xiptvplay Araştırma ve Çözümleme</span>
            </div>
            <h1 className="font-headline text-2xl font-bold text-[#e5e1e4] mt-1">
              {currentStage.title}
            </h1>
            <p className="text-sm text-[#b9cacb]">{currentStage.description}</p>
          </div>

          {/* Formatted Markdown Content */}
          <div className="prose prose-invert max-w-none text-sm text-[#e5e1e4] leading-relaxed space-y-4">
            <div
              className="space-y-4"
              dangerouslySetInnerHTML={{
                __html: currentStage.content
                  .replace(/### (.*)/g, '<h3 class="font-headline text-lg font-bold text-[#00f0ff] mt-4 mb-2">$1</h3>')
                  .replace(/#### (.*)/g, '<h4 class="font-headline text-base font-semibold text-[#7df4ff] mt-3 mb-1.5">$1</h4>')
                  .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-bold">$1</strong>')
                  .replace(/`([^`]+)`/g, '<code class="bg-[#201f21] text-[#6ffbbe] px-1.5 py-0.5 rounded text-xs font-mono">$1</code>')
                  .replace(/\| (.*) \|/g, (match) => {
                    if (match.includes(':---')) {
                      return '';
                    }
                    const cells = match.split('|').filter((c) => c.trim().length > 0);
                    return `<tr class="border-b border-white/5 hover:bg-white/5 transition-colors">${cells
                      .map((c) => `<td class="p-2.5 text-xs text-[#b9cacb]">${c.trim()}</td>`)
                      .join('')}</tr>`;
                  }),
              }}
            />
          </div>

          {/* Next / Previous Stage Nav */}
          <div className="flex items-center justify-between pt-6 border-t border-white/5 mt-4">
            {PRD_STAGES.findIndex((s) => s.id === currentStage.id) > 0 ? (
              <button
                onClick={() => {
                  const idx = PRD_STAGES.findIndex((s) => s.id === currentStage.id);
                  setSelectedStageId(PRD_STAGES[idx - 1].id);
                }}
                className="px-4 py-2 rounded-full bg-[#201f21] hover:bg-[#2a2a2c] text-xs font-semibold text-[#e5e1e4] flex items-center gap-1.5 border border-white/5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-[#e5e1e4]" />
                <span>Önceki Aşama</span>
              </button>
            ) : (
              <div></div>
            )}

            {PRD_STAGES.findIndex((s) => s.id === currentStage.id) < PRD_STAGES.length - 1 && (
              <button
                onClick={() => {
                  const idx = PRD_STAGES.findIndex((s) => s.id === currentStage.id);
                  setSelectedStageId(PRD_STAGES[idx + 1].id);
                }}
                className="px-4 py-2 rounded-full bg-[#00f0ff] text-[#00363a] text-xs font-headline font-bold flex items-center gap-1.5 shadow-[0_0_12px_rgba(0,240,255,0.4)] active:scale-95 cursor-pointer"
              >
                <span>Sonraki Aşama</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#00363a]" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
