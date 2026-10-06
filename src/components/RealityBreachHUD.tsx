import { BREACH_LINK_MS, type CoopRealityBreachSnapshot } from '../game/multiplayer/CoopRealityBreach';
import type { CoopPlayerSnapshot } from '../game/multiplayer/CoopSimulation';
import type { CoopLanguage } from '../game/multiplayer/i18n';

export function RealityBreachHUD({ breach, player, language }: {
  breach?: CoopRealityBreachSnapshot; player?: CoopPlayerSnapshot; language: CoopLanguage;
}) {
  if (!breach) return null;
  const ru = language === 'ru';
  if (breach.phase === 'dormant') return <div className="breach-forecast">
    <i />{ru ? 'РАЗРЫВ РЕАЛЬНОСТИ' : 'REALITY BREACH'}<b>{Math.ceil(breach.remainingMs / 1000)}s</b>
  </div>;
  const linking = breach.phase === 'linking';
  const overdrive = breach.phase === 'overdrive';
  const connected = breach.linkedAnchors >= breach.requiredAnchors;
  const percent = Math.round(breach.progressMs / BREACH_LINK_MS * 100);
  return <aside className={`breach-hud breach-hud--${breach.phase}`} aria-label={ru ? 'Разрыв реальности' : 'Reality Breach'}>
    <div className="breach-hud__eyebrow"><span>◇ {ru ? 'АНОМАЛИЯ' : 'WORLD ANOMALY'} / {String(breach.cycle).padStart(2, '0')}</span><b>{Math.ceil(breach.remainingMs / 1000)}s</b></div>
    <div className="breach-hud__title">{linking ? (ru ? 'СОЕДИНИТЕ ЯКОРЯ' : 'LINK THE ANCHORS') : overdrive ? (ru ? 'РЕАЛЬНОСТЬ ПОДЧИНЕНА' : 'REALITY REWRITTEN') : (ru ? 'ВРАЖДЕБНЫЙ ИМПУЛЬС' : 'HOSTILE SURGE')}</div>
    <p>{linking ? (ru ? `${breach.requiredAnchors} разных бойца на разных кольцах. Удерживайте 8с. Связи поражают врагов.` : `${breach.requiredAnchors} ${breach.requiredAnchors === 1 ? 'operator' : 'operators'} on separate rings. Hold 8s. Linked anchors burn crossing enemies.`)
      : overdrive ? (ru ? `+¤ ${breach.reward} каждому · +25 HP · враги замедлены` : `+¤ ${breach.reward} each · +25 HP · enemies slowed`)
        : (ru ? 'Враги рядом ускорены на 12 секунд. Двигайтесь!' : 'Nearby enemies move faster for 12 seconds. Keep moving.')}</p>
    {linking && <>
      <div className="breach-hud__anchors">{breach.anchors.map(anchor => {
        const own = anchor.occupantId === player?.id;
        const distance = player ? Math.round(Math.hypot(player.x - anchor.x, player.y - anchor.y) / 12) : undefined;
        const angle = player ? (Math.atan2(anchor.y - player.y, anchor.x - player.x) - player.angle) * 180 / Math.PI : 0;
        return <div key={anchor.id} data-linked={Boolean(anchor.occupantId)}>
          <span style={{ transform: `rotate(${angle}deg)` }} aria-hidden="true">↑</span>
          <b>{String(anchor.id).padStart(2, '0')}</b>
          <small>{own ? (ru ? 'ВЫ' : 'YOU') : anchor.occupantId ? (ru ? 'СВЯЗЬ' : 'LINKED') : `${distance ?? '—'}m`}</small>
        </div>;
      })}</div>
      <div className="breach-hud__progress" role="progressbar" aria-label={ru ? 'Синхронизация якорей' : 'Anchor synchronization'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><i style={{ width: `${percent}%` }} /></div>
      <footer><span>{connected ? (ru ? 'СИНХРОНИЗАЦИЯ' : 'SYNCHRONIZING') : `${breach.linkedAnchors}/${breach.requiredAnchors} ${ru ? 'ЯКОРЕЙ' : 'ANCHORS LINKED'}`}</span><b>{percent}%</b></footer>
    </>}
  </aside>;
}
