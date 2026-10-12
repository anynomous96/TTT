const ICON_PATHS = {
  X: '/assets/game/icon-x.svg',
  O: '/assets/game/icon-o.svg',
};

const OUTLINE_PATHS = {
  X: '/assets/game/icon-x-default.svg',
  O: '/assets/game/icon-o-default.svg',
};

export function MarkIcon({ mark, className = '', outline = false }) {
  const source = (outline ? OUTLINE_PATHS : ICON_PATHS)[mark];
  if (!source) return null;
  return <img className={`mark-icon ${className}`} src={source} alt="" aria-hidden="true" draggable="false" />;
}
