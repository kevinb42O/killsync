export function BreachTransmission() {
  return <section className="breach-transmission" aria-label="Reality Breach expansion">
    <div className="breach-transmission__meta"><span>TRANSMISSION / 001</span><b>LIVE ANOMALY</b></div>
    <svg viewBox="0 0 480 440" className="breach-transmission__art" aria-hidden="true">
      <defs>
        <radialGradient id="breach-halo"><stop offset="0" stopColor="#ffb86b" stopOpacity=".22" /><stop offset="1" stopColor="#ffb86b" stopOpacity="0" /></radialGradient>
        <linearGradient id="breach-rim"><stop stopColor="#ffe9c5" /><stop offset=".5" stopColor="#ed864c" /><stop offset="1" stopColor="#92684e" /></linearGradient>
        <radialGradient id="breach-core"><stop offset=".7" stopColor="#02060a" /><stop offset="1" stopColor="#6b3822" /></radialGradient>
      </defs>
      <circle cx="240" cy="205" r="210" fill="url(#breach-halo)" />
      <g stroke="#6f8089" strokeOpacity=".2" fill="none"><path d="M0 344L480 344 M0 386L480 386 M240 276L20 440 M240 276L130 440 M240 276L350 440 M240 276L460 440" /></g>
      <g className="breach-transmission__orbit" transform="translate(240 185)">
        <circle r="108" fill="url(#breach-core)" stroke="url(#breach-rim)" strokeWidth="3" />
        <circle r="128" fill="none" stroke="#ffb86b" strokeOpacity=".25" strokeWidth="1" strokeDasharray="72 18 6 32" />
        <circle r="144" fill="none" stroke="#ffb86b" strokeOpacity=".6" strokeWidth="10" strokeDasharray="53 20" />
        <ellipse rx="165" ry="58" transform="rotate(-32)" fill="none" stroke="#afffc9" strokeOpacity=".3" />
        <path d="M-64 -82Q70 -72 48 40T-48 45Q-94 -16 25 -50" fill="none" stroke="#ffb86b" strokeOpacity=".15" strokeWidth="2" />
      </g>
      {[0, 1, 2].map(index => {
        const x = 100 + index * 140, y = index === 1 ? 395 : 350;
        return <g key={index}><path d={`M240 250L${x} ${y}`} stroke="#ffb86b" strokeOpacity=".35" strokeDasharray="4 7" /><ellipse cx={x} cy={y} rx="36" ry="10" fill="#afffc9" fillOpacity=".08" stroke="#afffc9" strokeOpacity=".7" /><path d={`M${x} ${y - 40}l7 12-7 12-7-12z`} fill="#afffc9" /><text x={x} y={y + 30} textAnchor="middle" fill="#889ea8" fontSize="9" letterSpacing="3">0{index + 1}</text></g>;
      })}
      <text x="240" y="191" textAnchor="middle" fill="#ffdfb8" fontSize="11" letterSpacing="8">THE BREACH</text>
    </svg>
    <div className="breach-transmission__copy"><span>THE SKY HAS A WOUND.</span><h2>Make it<br />your weapon.</h2><p>Split the squad. Link the anchors. Turn a tear in reality into a pulse that breaks the horde.</p></div>
    <div className="breach-transmission__footer"><b>01—05 OPERATORS</b><span>SHARED RISK. SHARED POWER.</span></div>
  </section>;
}
