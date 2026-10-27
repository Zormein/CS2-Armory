import React, { useState } from 'react';

interface ItemArtworkProps {
  src?: string;
  alt: string;
  category?: string;
  rarityColor?: string;
  className?: string;
}

/**
 * Resilient CS2 item/container artwork component following Zero-Broken-Image Policy:
 * - Always renders `referrerPolicy="no-referrer"`
 * - Falls back to a high-contrast tactical SVG silhouette matched to the weapon/container type if an image fails to load.
 */
export const ItemArtwork: React.FC<ItemArtworkProps> = ({
  src,
  alt,
  category = 'Rifles',
  rarityColor = '#4b69ff',
  className = 'w-full h-full object-contain',
}) => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center p-2 select-none ${className}`}
        role="img"
        aria-label={alt}
      >
        <svg
          viewBox="0 0 160 90"
          className="w-4/5 h-4/5 drop-shadow"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id={`grad-${alt.length}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={rarityColor} stopOpacity="0.85" />
              <stop offset="100%" stopColor="#64748b" stopOpacity="0.55" />
            </linearGradient>
          </defs>
          {category.includes('Knife') || category.includes('Knives') || alt.includes('★') ? (
            <path
              d="M25 65 L65 45 L135 20 C138 32 124 46 95 54 L68 58 L35 74 Z"
              fill={`url(#grad-${alt.length})`}
              stroke={rarityColor}
              strokeWidth="2"
            />
          ) : category.includes('Crate') || category.includes('Case') || alt.includes('Case') || alt.includes('Package') ? (
            <g stroke={rarityColor} strokeWidth="2" fill={`url(#grad-${alt.length})`}>
              <rect x="28" y="24" width="104" height="48" rx="4" />
              <path d="M28 38 H132 M62 24 V72 M98 24 V72" strokeOpacity="0.6" />
            </g>
          ) : (
            <path
              d="M16 52 L44 42 L118 42 L144 38 L144 46 L116 49 L96 54 L88 68 L76 68 L80 54 L52 54 L34 68 L20 66 Z"
              fill={`url(#grad-${alt.length})`}
              stroke={rarityColor}
              strokeWidth="2"
            />
          )}
        </svg>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};

/**
 * Official CS2 `★ SPECIAL ITEM ★` Mystery Gold Emblem used exclusively on the spinning reel
 * so knife and glove identities, finishes, and models are never spoiled before the reveal!
 */
export const SpecialMysteryTileArtwork: React.FC = () => {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-amber-500/25 via-yellow-500/15 to-amber-950/60 select-none p-2">
      <div className="w-14 h-14 rounded-full border-2 border-amber-400/80 bg-amber-500/20 flex items-center justify-center shadow-[0_0_24px_rgba(251,191,36,0.45)]">
        <svg viewBox="0 0 24 24" className="w-8 h-8 text-amber-300" fill="currentColor">
          <path d="M12 2L14.85 8.65L22 9.27L16.55 13.97L18.18 21L12 17.27L5.82 21L7.45 13.97L2 9.27L9.15 8.65L12 2Z" />
        </svg>
      </div>
      <span className="mt-2 font-display text-xs font-bold tracking-widest text-amber-300 uppercase">
        ★ SPECIAL ITEM ★
      </span>
    </div>
  );
};
