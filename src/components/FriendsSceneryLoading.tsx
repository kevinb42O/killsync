import type { CoopLanguage } from '../game/multiplayer/i18n';
import { friendsMenuText } from './FriendsMenuText';
import './friends-menu.css';

/** Shared sketch keeps the mode handoff and island loading visually continuous. */
export function FriendsSceneryLoading({ language = 'en', error = false }: { language?: CoopLanguage; error?: boolean }) {
  return <div className={`friends-menu__loading${error ? ' friends-menu__loading--error' : ''}`} role="status" aria-live="polite" aria-label={friendsMenuText(language, !error ? 'sceneryLoading' : 'sceneryError')}>
      {!error ? <svg className="friends-menu__loading-sketch" viewBox="0 0 160 128" fill="none" aria-hidden="true">
        <g className="friends-menu__loading-sun">
          <path className="friends-menu__loading-sun-outline" d="M58 45C57 32 64 23 77 23C91 22 100 32 100 44C101 56 92 65 80 65C67 66 57 58 58 45Z"/>
          <g className="friends-menu__loading-rays"><path d="M79 12L80 3M104 21L110 14M113 44L123 43M104 66L111 74M78 77L77 87M53 65L46 73M45 44L35 45M53 21L46 14"/></g>
          <path d="M70 43L72 42M86 42L88 43M74 51Q80 56 85 51"/>
        </g>
        <path className="friends-menu__loading-land" d="M8 105C25 108 33 82 49 84C65 84 65 99 80 98C93 98 101 79 115 82C132 83 132 102 151 102M14 114C31 111 49 118 66 114C85 110 106 117 143 111"/>
        <path className="friends-menu__loading-grass" d="M36 104L35 96M36 102L30 98M36 100L41 94M122 102L124 94M123 100L117 96M123 98L129 93"/>
      </svg> : <span className="friends-menu__loading-error">{friendsMenuText(language, 'sceneryErrorHelp')}</span>}
    </div>;
}
