import { useState } from 'react';
import { Globe, Play, Shield, X } from 'lucide-react';
import {
  getCoopOperatorImprint,
  purchaseCoopImprintRank,
  readCoopImprintProfile,
  selectedCoopOperatorId,
  writeCoopImprintProfile,
  type CoopImprintStatId,
} from '../game/multiplayer/CoopImprint';
import { readCoopLanguage, writeCoopLanguage, type CoopLanguage } from '../game/multiplayer/i18n';
import { readCoopSkinId, writeCoopSkinId, type CoopSkinId } from '../game/multiplayer/CoopSkins';
import {
  readCoopWorldProgress,
  type WorldId,
} from '../game/world/WorldDefinitions';
import { CoopImprintSummary } from './CoopImprintSummary';
import { CoopSkinSelector } from './CoopSkinSelector';
import { CoopWorldSelector } from './CoopWorldSelector';
import { createSoloMultiplayerLaunch, type MultiplayerLaunch } from './ManualMultiplayerSetup';

export function SoloRunSetup({
  onClose,
  onLaunch,
}: {
  onClose: () => void;
  onLaunch: (launch: MultiplayerLaunch) => void;
}) {
  const [language, setLanguage] = useState<CoopLanguage>(readCoopLanguage);
  const [callsign, setCallsign] = useState(readSavedCallsign);
  const [selectedSkinId, setSelectedSkinId] = useState<CoopSkinId>(readCoopSkinId);
  const [operatorId] = useState(selectedCoopOperatorId);
  const [imprintProfile, setImprintProfile] = useState(readCoopImprintProfile);
  const [worldProgress] = useState(readCoopWorldProgress);
  const [selectedWorldId, setSelectedWorldId] = useState<WorldId>(
    () => readCoopWorldProgress().unlockedWorldIds.at(-1) || 'neon_bastion',
  );
  const operatorImprint = getCoopOperatorImprint(imprintProfile, operatorId);

  const selectLanguage = (next: CoopLanguage) => {
    setLanguage(next);
    writeCoopLanguage(next);
  };

  const selectSkin = (skinId: CoopSkinId) => {
    setSelectedSkinId(writeCoopSkinId(skinId));
  };

  const allocateImprintRank = (statId: CoopImprintStatId) => {
    setImprintProfile(current => {
      const next = purchaseCoopImprintRank(current, operatorId, statId);
      if (next.revision === current.revision) return current;
      writeCoopImprintProfile(next);
      return next;
    });
  };

  const deploy = () => {
    writeSavedCallsign(callsign);
    onLaunch(createSoloMultiplayerLaunch({ language, worldId: selectedWorldId }));
  };

  return (
    <div className="absolute inset-0 z-[110] flex items-center justify-center bg-black/85 p-3 backdrop-blur-xl md:p-6">
      <section className="relative flex max-h-[94dvh] w-full max-w-4xl flex-col border border-cyan-400/40 bg-[#060a12]/95 shadow-[0_0_80px_rgba(0,240,255,0.22)]">
        <div className="h-1 w-full bg-gradient-to-r from-cyan-500 via-emerald-400 to-amber-400" />

        <header className="flex items-center justify-between border-b border-cyan-400/20 bg-cyan-950/20 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center border border-cyan-400/50 bg-cyan-500/10 text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.3)]">
              <Shield size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black tracking-[0.2em] text-white">KILLSYNC SOLO</h2>
                <span className="rounded border border-emerald-400/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-300">
                  Local deployment
                </span>
              </div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-300/60">
                Configure your operator and deploy alone · No lobby will be created
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close solo setup"
            className="rounded p-2 text-white/40 transition hover:bg-white/10 hover:text-white"
          >
            <X size={20} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 md:p-7">
          <div className="mb-4 flex justify-end">
            <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-white/55">
              <Globe size={13} className="text-cyan-300" /> Language
              <select
                value={language}
                onChange={event => selectLanguage(event.target.value as CoopLanguage)}
                className="border border-cyan-400/35 bg-[#07111b] px-2 py-1 text-[10px] font-black text-cyan-100 outline-none"
              >
                <option value="en">English</option>
                <option value="ru">Русский</option>
              </select>
            </label>
          </div>

          <label className="mb-6 flex items-center gap-3 border border-cyan-400/20 bg-cyan-500/[0.03] p-3.5">
            <span className="whitespace-nowrap text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">
              Callsign //
            </span>
            <input
              value={callsign}
              onChange={event => setCallsign(normalizeCallsign(event.target.value))}
              onBlur={() => setCallsign(current => current || 'OPERATOR')}
              maxLength={16}
              className="w-full border-b border-cyan-400/30 bg-transparent pb-1 font-mono text-sm font-black uppercase tracking-wider text-cyan-100 focus:border-cyan-300 focus:outline-none"
            />
          </label>

          <CoopSkinSelector value={selectedSkinId} language={language} onChange={selectSkin} />

          <CoopImprintSummary
            imprint={operatorImprint}
            language={language}
            onUpgrade={allocateImprintRank}
          />

          <div className="mt-6">
            <CoopWorldSelector
              unlockedWorldIds={worldProgress.unlockedWorldIds}
              selectedWorldId={selectedWorldId}
              onChange={setSelectedWorldId}
            />
          </div>

          <div className="mt-6 flex justify-end border-t border-white/10 pt-5">
            <button
              type="button"
              onClick={deploy}
              className="group flex items-center gap-3 border border-cyan-300 bg-cyan-400 px-7 py-3 text-xs font-black uppercase tracking-[0.16em] text-black shadow-[0_0_28px_rgba(34,211,238,.3)] transition hover:scale-[1.02] hover:bg-white"
            >
              <Play size={16} fill="currentColor" /> Deploy Solo
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function normalizeCallsign(value: string) {
  return value.replace(/[^\p{L}\p{N} _-]/gu, '').replace(/\s+/g, ' ').trimStart().slice(0, 16);
}

function readSavedCallsign() {
  try {
    return normalizeCallsign(localStorage.getItem('killsync.multiplayer.nickname') || '') || 'OPERATOR';
  } catch {
    return 'OPERATOR';
  }
}

function writeSavedCallsign(value: string) {
  const callsign = normalizeCallsign(value).trim() || 'OPERATOR';
  try { localStorage.setItem('killsync.multiplayer.nickname', callsign); } catch { /* Storage fallback */ }
  return callsign;
}
