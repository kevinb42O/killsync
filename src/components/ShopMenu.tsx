import React from 'react';
import { motion } from 'framer-motion';
import { Shield, ShieldAlert, ShieldCheck, HeartPulse, Bomb, X, Coins } from 'lucide-react';
import { soundManager } from '../game/SoundManager';
import { Inventory } from '../types';

interface ShopMenuProps {
  playerCoins: number;
  inventory: Inventory;
  onBuy: (itemType: string, cost: number) => void;
  onLeave: () => void;
}

export const ShopMenu: React.FC<ShopMenuProps> = ({ playerCoins, inventory, onBuy, onLeave }) => {
  const items = [
    {
      id: 'armor_1',
      name: 'Tier 1 Armor',
      description: 'Absorbs 50 damage. Recharges automatically after 3s of avoiding damage.',
      cost: 500,
      icon: <Shield size={32} className="text-cyan-400" />,
      disabled: inventory.armorTier >= 1,
      type: 'armor_1'
    },
    {
      id: 'armor_2',
      name: 'Tier 2 Armor',
      description: 'Absorbs 100 damage. Upgrades your shielding capacity.',
      cost: 1500,
      icon: <ShieldAlert size={32} className="text-blue-400" />,
      disabled: inventory.armorTier < 1 || inventory.armorTier >= 2,
      type: 'armor_2'
    },
    {
      id: 'armor_3',
      name: 'Tier 3 Armor',
      description: 'Absorbs 200 damage. Maximum shielding payload.',
      cost: 3000,
      icon: <ShieldCheck size={32} className="text-purple-400" />,
      disabled: inventory.armorTier < 2 || inventory.armorTier >= 3,
      type: 'armor_3'
    },
    {
      id: 'revive',
      name: 'Self-Revive',
      description: 'Automatically restores 50% HP upon fatal damage and grants invulnerability.',
      cost: 2000,
      icon: <HeartPulse size={32} className="text-red-400" />,
      disabled: inventory.hasRevive,
      type: 'revive'
    },
    {
      id: 'nuke',
      name: 'Nuke (Hotkey: N)',
      description: 'Obliterates all enemies on screen instantly.',
      cost: 5000,
      icon: <Bomb size={32} className="text-orange-400" />,
      disabled: false,
      type: 'nuke'
    }
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md"
    >
      <div className="relative w-full max-w-4xl p-8 bg-[#0a0f1a]/90 border border-cyan-500/30 rounded-2xl shadow-[0_0_50px_rgba(6,182,212,0.15)] overflow-hidden">
        {/* Decorative Grid Background */}
        <div className="absolute inset-0 pointer-events-none opacity-20 bg-[linear-gradient(rgba(6,182,212,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(6,182,212,0.2)_1px,transparent_1px)] bg-[size:40px_40px]" />
        
        {/* Header */}
        <div className="relative z-10 flex items-center justify-between mb-8 border-b border-cyan-500/20 pb-4">
          <div className="flex flex-col">
            <h2 className="text-4xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-blue-500">
              BLACK MARKET
            </h2>
            <p className="text-cyan-200/50 text-sm tracking-widest uppercase mt-1">Acquire tactical advantages</p>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 px-4 py-2 bg-black/50 border border-yellow-500/30 rounded-lg">
              <Coins size={20} className="text-yellow-400" />
              <span className="text-xl font-mono font-bold text-yellow-400">{playerCoins.toLocaleString()}</span>
            </div>
            <button
              onClick={() => {
                soundManager.playUIClick();
                onLeave();
              }}
              className="p-2 border border-white/20 rounded-lg hover:bg-white/10 hover:border-white/40 transition-all"
            >
              <X size={24} className="text-white/70" />
            </button>
          </div>
        </div>

        {/* Items Grid */}
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item) => {
            const canAfford = playerCoins >= item.cost;
            const isPurchasable = canAfford && !item.disabled;

            let statusText = '';
            if (item.disabled) {
              if (item.id === 'revive') statusText = 'EQUIPPED';
              else if (item.id.startsWith('armor') && inventory.armorTier >= parseInt(item.id.replace('armor_', ''))) statusText = 'OWNED';
              else if (item.id.startsWith('armor')) statusText = 'REQUIRES PREVIOUS';
            }

            return (
              <div
                key={item.id}
                className={`relative flex flex-col p-6 rounded-xl border transition-all duration-300 ${
                  item.disabled 
                    ? 'bg-black/40 border-white/10 opacity-70 cursor-not-allowed' 
                    : isPurchasable
                      ? 'bg-gradient-to-br from-cyan-900/20 to-blue-900/20 border-cyan-500/40 hover:border-cyan-400 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]'
                      : 'bg-red-950/20 border-red-500/20 opacity-80 cursor-not-allowed'
                }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 rounded-lg bg-black/40 border border-white/5">
                    {item.icon}
                  </div>
                  {item.disabled && (
                    <span className="text-xs font-bold text-gray-400 bg-gray-900/80 px-2 py-1 rounded border border-gray-700">
                      {statusText}
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-bold text-white mb-2">{item.name}</h3>
                <p className="text-sm text-cyan-100/60 mb-6 flex-grow leading-relaxed">
                  {item.description}
                </p>
                <button
                  disabled={!isPurchasable}
                  onClick={() => {
                    if (isPurchasable) {
                      soundManager.playUIClick();
                      onBuy(item.type, item.cost);
                    } else {
                      soundManager.playDamage();
                    }
                  }}
                  className={`flex items-center justify-between w-full py-3 px-4 rounded-lg font-bold transition-all ${
                    isPurchasable
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 hover:bg-cyan-500/30 hover:shadow-[0_0_15px_rgba(6,182,212,0.4)]'
                      : 'bg-black/50 text-white/30 border border-white/10'
                  }`}
                >
                  <span>{item.disabled ? 'UNAVAILABLE' : 'PURCHASE'}</span>
                  <div className="flex items-center gap-1.5">
                    {!item.disabled && <Coins size={14} className={canAfford ? 'text-yellow-400' : 'text-red-400'} />}
                    <span className={!item.disabled && !canAfford ? 'text-red-400' : ''}>
                      {!item.disabled ? item.cost.toLocaleString() : ''}
                    </span>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
};
