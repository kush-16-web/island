import React from 'react';
import { PET_STYLE_SPEC } from '../../config/styleSpec';

/**
 * CatVisual: High-quality, soft illustrated feline 2D rig.
 * Features convincing cat anatomy: pointed ears with pink tufts,
 * delicate paws, sleek spine, and a long expressive tail.
 */
export default function CatVisual({
  state = 'sit',
  mood = 'normal',
  musicAccent = '#ff869a',
  eyePos = { lx: 0, ly: 0 },
}) {
  const p = PET_STYLE_SPEC.palette.cat;
  const shared = PET_STYLE_SPEC.palette;

  const isWalking = state === 'walk';
  const isSitting = state === 'sit';
  const isSleeping = state === 'sleep';
  const isDancing = state === 'dance' || mood === 'music';
  const isHappy = state === 'happy' || mood === 'petted';
  const isAlert = mood === 'alert';

  return (
    <svg
      viewBox="0 0 110 92"
      className={`pet-rig pet-rig--cat state--${state} ${isDancing ? 'is-dancing' : ''} ${isWalking ? 'is-walking' : ''} ${isSitting ? 'is-sitting' : ''} ${isSleeping ? 'is-sleeping' : ''} ${isHappy ? 'is-happy' : ''}`}
      aria-hidden="true"
    >
      <defs>
        {/* Soft feline body fur gradient */}
        <linearGradient id="catFur" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.furBaseTop} />
          <stop offset="100%" stopColor={p.furBaseBottom} />
        </linearGradient>

        {/* Warm shadow & depth */}
        <linearGradient id="catShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.shadingTop} />
          <stop offset="100%" stopColor={p.shadingBottom} />
        </linearGradient>
      </defs>

      {/* ----------------- TAIL: Long, expressive feline tail ----------------- */}
      <g className="cat__tail-rig">
        {isSitting ? (
          // Wrapped tail resting beside body in sit pose
          <path
            d="M68 76 C86 78 96 82 92 88 C88 92 74 91 60 90"
            fill="none"
            stroke={p.shadingBottom}
            strokeWidth="7"
            strokeLinecap="round"
          />
        ) : (
          // Free swishing tail
          <path
            d="M66 64 C84 62 94 48 88 34 C84 26 76 28 74 34"
            fill="none"
            stroke={p.shadingBottom}
            strokeWidth="6.5"
            strokeLinecap="round"
          />
        )}
      </g>

      {/* ----------------- HIND LEGS (Back paws) ----------------- */}
      {!isSitting && !isSleeping && (
        <g className="cat__hind-legs">
          {/* Back Left Leg */}
          <g className="cat__leg cat__leg--bl">
            <path d="M62 62 C66 68 70 76 68 86 C68 88 64 88 62 88" fill="url(#catShade)" />
            <ellipse cx="64" cy="87" rx="5" ry="3" fill={p.furBaseBottom} />
          </g>
          {/* Back Right Leg */}
          <g className="cat__leg cat__leg--br">
            <path d="M52 60 C56 66 60 76 58 86 C58 88 54 88 52 88" fill="url(#catShade)" />
            <ellipse cx="54" cy="87" rx="5.5" ry="3" fill={p.furBaseTop} />
          </g>
        </g>
      )}

      {/* ----------------- BODY / TORSO ----------------- */}
      <g className="cat__body-rig">
        {isSitting ? (
          // Elegant upright sitting torso
          <path
            d="M30 84 C26 66 36 50 50 50 C64 50 74 66 70 84 C62 86 38 86 30 84 Z"
            fill="url(#catFur)"
            stroke={shared.outline}
            strokeWidth={shared.outlineWidth}
            strokeLinejoin="round"
          />
        ) : isSleeping ? (
          // Curled up sleeping pose
          <ellipse
            cx="50"
            cy="70"
            rx="32"
            ry="18"
            fill="url(#catFur)"
            stroke={shared.outline}
            strokeWidth={shared.outlineWidth}
          />
        ) : (
          // 4-legged standing/walking/dancing body
          <path
            d="M30 58 C28 48 38 46 52 48 C68 50 74 56 70 70 C64 74 54 75 42 74 C34 72 30 66 30 58 Z"
            fill="url(#catFur)"
            stroke={shared.outline}
            strokeWidth={shared.outlineWidth}
            strokeLinejoin="round"
          />
        )}

        {/* Soft creamy chest/belly patch */}
        <ellipse
          cx={isSitting ? 50 : 48}
          cy={isSitting ? 68 : 62}
          rx={isSitting ? 12 : 14}
          ry={isSitting ? 12 : 7}
          fill="#ffffff"
          opacity="0.85"
        />
      </g>

      {/* ----------------- FRONT LEGS (Front paws) ----------------- */}
      {!isSleeping && (
        <g className="cat__front-legs">
          {isSitting ? (
            // Front paws neatly side-by-side in sit pose
            <>
              <ellipse cx="42" cy="86" rx="5" ry="3.2" fill="#ffffff" stroke={shared.outline} strokeWidth="1.2" />
              <ellipse cx="56" cy="86" rx="5" ry="3.2" fill="#ffffff" stroke={shared.outline} strokeWidth="1.2" />
            </>
          ) : (
            // Stepping front legs
            <>
              <g className="cat__leg cat__leg--fl">
                <path d="M32 58 C30 68 30 78 28 86 C28 88 34 88 36 88" fill="url(#catShade)" />
                <ellipse cx="32" cy="87" rx="4.8" ry="3" fill="#ffffff" />
              </g>
              <g className="cat__leg cat__leg--fr">
                <path d="M40 58 C40 68 42 78 42 86 C42 88 48 88 50 88" fill="url(#catShade)" />
                <ellipse cx="46" cy="87" rx="5.2" ry="3" fill="#ffffff" />
              </g>
            </>
          )}
        </g>
      )}

      {/* ----------------- HEAD & EXPRESSIONS ----------------- */}
      <g className={`cat__head-rig ${isSleeping ? 'is-tucked' : ''}`}>
        {/* Pointed feline ears with inner pink tufts */}
        <g className="cat__ears">
          {/* Left Ear */}
          <path
            className="cat__ear cat__ear--l"
            d="M26 34 L22 10 L44 20 Z"
            fill={p.furBaseTop}
            stroke={shared.outline}
            strokeWidth={shared.outlineWidth}
            strokeLinejoin="round"
          />
          <path d="M28 28 L26 15 L38 22 Z" fill={p.innerEar} />

          {/* Right Ear */}
          <path
            className="cat__ear cat__ear--r"
            d="M74 34 L78 10 L56 20 Z"
            fill={p.furBaseTop}
            stroke={shared.outline}
            strokeWidth={shared.outlineWidth}
            strokeLinejoin="round"
          />
          <path d="M72 28 L74 15 L62 22 Z" fill={p.innerEar} />
        </g>

        {/* Head Base */}
        <ellipse
          cx="50"
          cy="38"
          rx="27"
          ry="22"
          fill="url(#catFur)"
          stroke={shared.outline}
          strokeWidth={shared.outlineWidth}
        />

        {/* Delicate feline forehead stripes */}
        <path
          d="M50 18 v6 M43 20 l2 5 M57 20 l-2 5"
          stroke={p.accent}
          strokeWidth="2.2"
          strokeLinecap="round"
        />

        {/* Rosy blush cheeks */}
        <circle cx="32" cy="46" r="4.5" fill={shared.blush} />
        <circle cx="68" cy="46" r="4.5" fill={shared.blush} />

        {/* EYES */}
        {isSleeping ? (
          // Sleeping crescent eyes
          <path
            d="M34 38 Q40 43 46 38 M54 38 Q60 43 66 38"
            fill="none"
            stroke={shared.eyePupil}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        ) : isHappy ? (
          // Cheerful squint eyes `^ ^`
          <path
            d="M34 40 Q40 33 46 40 M54 40 Q60 33 66 40"
            fill="none"
            stroke={shared.eyePupil}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        ) : (
          // Expressive eyes with tracking pupils
          <g className="cat__eyes">
            {/* Left Eye */}
            <ellipse cx="40" cy="38" rx="4.5" ry="5.5" fill={shared.eyePupil} />
            <circle cx={40 + eyePos.lx * 0.4} cy={37 + eyePos.ly * 0.4} r="1.6" fill={shared.eyeHighlight} />
            <circle cx={42} cy={40} r="0.8" fill={shared.eyeHighlight} />

            {/* Right Eye */}
            <ellipse cx="60" cy="38" rx="4.5" ry="5.5" fill={shared.eyePupil} />
            <circle cx={60 + eyePos.lx * 0.4} cy={37 + eyePos.ly * 0.4} r="1.6" fill={shared.eyeHighlight} />
            <circle cx={62} cy={40} r="0.8" fill={shared.eyeHighlight} />
          </g>
        )}

        {/* Tiny triangular nose & sweet feline mouth */}
        <polygon points="48,44 52,44 50,47" fill={p.nose} />
        <path
          d="M50 47 v2 M50 49 Q47 52 44 49 M50 49 Q53 52 56 49"
          fill="none"
          stroke={shared.outline}
          strokeWidth="1.4"
          strokeLinecap="round"
        />

        {/* Subtle feline whiskers */}
        <path
          d="M26 44 L14 42 M26 48 L13 49 M74 44 L86 42 M74 48 L87 49"
          stroke={shared.outline}
          strokeWidth="1.1"
          strokeLinecap="round"
          opacity="0.32"
        />

        {/* Dance/Music Headphones */}
        {isDancing && (
          <g className="pet__headphones">
            <path d="M22 38 C22 12 78 12 78 38" fill="none" stroke={musicAccent} strokeWidth="4.5" strokeLinecap="round" />
            <rect x="16" y="32" width="10" height="16" rx="5" fill={musicAccent} stroke={shared.outline} strokeWidth="1.2" />
            <rect x="74" y="32" width="10" height="16" rx="5" fill={musicAccent} stroke={shared.outline} strokeWidth="1.2" />
          </g>
        )}
      </g>

      {/* Floating sleep ZZZs */}
      {isSleeping && (
        <g className="pet__zzz-fx" fill="#b0c0ff" fontWeight="700">
          <text x="76" y="24" fontSize="11">z</text>
          <text x="84" y="16" fontSize="9">z</text>
          <text x="91" y="9" fontSize="7">z</text>
        </g>
      )}

      {/* Alert exclamation bubble */}
      {isAlert && (
        <g className="pet__alert-fx">
          <circle cx="82" cy="16" r="9" fill="#ff5a6e" stroke="#fff" strokeWidth="1.5" />
          <text x="82" y="21" textAnchor="middle" fontSize="13" fontWeight="900" fill="#fff">!</text>
        </g>
      )}
    </svg>
  );
}
