import React from 'react';

/**
 * ぽっぽさん（アプリのキャラクター）: 屋根の帽子をかぶった、まるいハト。
 * mood: happy = 安心・標準、normal、worry = 注意・危険・赤字
 */
export function Mascot({ size = 72, mood = 'normal', className }: { size?: number; mood?: 'happy' | 'normal' | 'worry'; className?: string }) {
  return (
    <svg className={`mascot ${className ?? ''}`} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="ぽっぽさん">
      {/* しっぽ */}
      <path d="M22 66 6 74l18 4Z" fill="#a9b4c4" />
      {/* からだ */}
      <ellipse cx="50" cy="66" rx="33" ry="26" fill="#d9dfe8" />
      <ellipse cx="57" cy="73" rx="19" ry="15" fill="#f4f6f9" />
      {/* 首の色（ハトのしるし） */}
      <path d="M33 54c9 6 23 6 32-1" stroke="#7cc0a0" strokeWidth="6" fill="none" strokeLinecap="round" />
      {/* あたま */}
      <circle cx="54" cy="38" r="19" fill="#d9dfe8" />
      {/* 屋根の帽子 */}
      <path d="M33 27 54 9l21 18Z" fill="#2f6b51" stroke="#2f6b51" strokeWidth="3" strokeLinejoin="round" />
      <rect x="64" y="11" width="5" height="9" rx="1" fill="#2f6b51" />
      <rect x="51" y="19" width="6" height="6" rx="1" fill="#f6e4d3" />
      {/* 目 */}
      {mood === 'happy' ? (
        <path d="M57 37q3-4 6 0" stroke="#2a2d2a" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      ) : (
        <>
          <circle cx="60" cy="37" r="3.3" fill="#2a2d2a" />
          <circle cx="61.2" cy="35.8" r="1.1" fill="#fff" />
        </>
      )}
      {mood === 'worry' && <path d="M55 30l8 2" stroke="#2a2d2a" strokeWidth="2" strokeLinecap="round" />}
      {/* ほっぺ */}
      <ellipse cx="62" cy="45" rx="4.6" ry="2.8" fill="#f2b3a3" opacity="0.9" />
      {/* くちばし */}
      <path d="M71 38 81 41 71 44Z" fill="#e39a45" strokeLinejoin="round" />
      {/* つばさ */}
      <path d="M27 63c12-10 26-6 31 4-11 10-24 8-31-4Z" fill="#bfc8d6" />
      {/* あし */}
      <path d="M45 90v5M59 90v5" stroke="#e39a45" strokeWidth="3" strokeLinecap="round" />
      {/* 汗（心配なとき） */}
      {mood === 'worry' && <path d="M40 26c-2 3-3 5-1 6.5s4-.5 3.5-3L40 26Z" fill="#8fc3e6" />}
    </svg>
  );
}

/** ぽっぽさんのひとこと */
export function MascotSays({ text, mood = 'normal', size = 56 }: { text: string; mood?: 'happy' | 'normal' | 'worry'; size?: number }) {
  return (
    <div className="mascot-says">
      <Mascot size={size} mood={mood} />
      <div className="bubble">{text}</div>
    </div>
  );
}
