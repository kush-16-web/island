import React from 'react';
import { PET_STYLE_SPEC } from '../../config/styleSpec';

/**
 * DogVisual: High-quality, soft illustrated canine 2D rig.
 * Features true canine anatomy: floppy folded ears, rounded muzzle/snout,
 * soft dark nose, cheerful open smile with tongue, sturdy paws, and a wagging fluffy tail with white tip.
 * Matches CatVisual's exact illustration language and outline weight.
 */
export default function DogVisual({
  state = 'sit',
  mood = 'normal',
  musicAccent = '#ff869a',
  eyePos = { lx: 0, ly: 0 },
}) {
  const p = PET_STYLE_SPEC.palette.dog;
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
      className={`pet-rig pet-rig--dog state--${state} ${isDancing ? 'is-dancing' : ''} ${isWalking ? 'is-walking' : ''} ${isSitting ? 'is-sitting' : ''} ${isSleeping ? 'is-sleeping' : ''} ${isHappy ? 'is-happy' : ''}`}
      aria-hidden="true"
    >
      <defs>
        {/* Soft canine golden coat gradient */}
        <linearGradient id="dogFur" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.furBaseTop} />
          <stop offset="100%" stopColor={p.furBaseBottom} />
        </linearGradient>

        {/* Canine depth shading */}
        <linearGradient id="dogShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={p.shadingTop} />
          <stop offset="100%" stopColor={p.shadingBottom} />
        </linearGradient>
      </defs>

      {/* ----------------- TAIL: Upward wagging canine tail with white tip ----------------- */}
      <g className="dog__tail-rig">
        <path
          d={isSitting ? "M68 74 C82 72 94 62 90 48 C88 42 82 44 80 50" : "M66 62 C82 58 92 42 88 28 C86 22 80 24 78 30"}
          fill="none"
          stroke={p.shadingBottom}
          strokeWidth="8"
          strokeLinecap="round"
        />
        {/* Fluffy white tail tip */}
        <circle cx={isSitting ? 89 : 87} cy={isSitting ? 47 : 27} r="4.2" fill={p.tailTip} />
      </g>

      {/* ----------------- HIND LEGS (Sturdy back paws) ----------------- */}
      {!isSitting && !isSleeping && (
        <g className="dog__hind-legs">
          {/* Back Left Leg */}
          <g className="dog__leg dog__leg--bl">
            <path d="M64 62 C68 68 72 76 70 86 C70 88 64 88 62 88" fill="url(#dogShade)" />
            <ellipse cx="65" cy="87" rx="5.8" ry="3.4" fill={p.furBaseBottom} />
          </g>
          {/* Back Right Leg */}
          <g className="dog__leg dog__leg--br">
            <path d="M54 60 C58 66 62 76 60 86 C60 88 54 88 52 88" fill="url(#dogShade)" />
            <ellipse cx="55" cy="87" rx="6" ry="3.4" fill={p.furBaseTop} />
          </g>
        </g>
      )}

      {/* ----------------- BODY / TORSO ----------------- */}
      <g className="dog__body-rig">
        {isSitting ? (
          // Sturdy sitting posture
          <path
            d="M28 84 C24 64 34 50 50 50 C66 50 76 64 72 84 C64 86 36 86 28 84 Z"
            fill="url(#dogFur)"
            stroke={shared.outline}
            strokeWidth={shared.outlineWidth}
            strokeLinejoin="round"
          />
        ) : isSleeping ? (
          // Curled up sleeping canine
          <ellipse
            cx="50"
            cy="70"
            rx="33"
            ry="19"
            fill="url(#dogFur)"
            stroke={shared.outline}
            strokeWidth={shared.outlineWidth}
          />
        ) : (
          // Sturdy 4-legged walking/standing body
          <path
            d="M28 58 C26 47 38 45 54 47 C70 49 76 56 72 71 C65 75 52 76 40 74 C32 72 28 66 28 58 Z"
            fill="url(#dogFur)"
            stroke={shared.outline}
            strokeWidth={shared.outlineWidth}
            strokeLinejoin="round"
          />
        )}

        {/* Creamy white chest patch */}
        <ellipse
          cx={isSitting ? 50 : 46}
          cy={isSitting ? 68 : 62}
          rx={isSitting ? 13 : 15}
          ry={isSitting ? 13 : 8}
          fill={p.muzzle}
          opacity="0.9"
        />
      </g>

      {/* ----------------- FRONT LEGS (Sturdy paws) ----------------- */}
      {!isSleeping && (
        <g className="dog__front-legs">
          {isSitting ? (
            // Front paws planted firmly side-by-side
            <>
              <ellipse cx="40" cy="86" rx="5.8" ry="3.5" fill={p.muzzle} stroke={shared.outline} strokeWidth="1.2" />
              <ellipse cx="58" cy="86" rx="5.8" ry="3.5" fill={p.muzzle} stroke={shared.outline} strokeWidth="1.2" />
            </>
          ) : (
            // Stepping front legs
            <>
              <g className="dog__leg dog__leg--fl">
                <path d="M30 58 C28 68 28 78 26 86 C26 88 34 88 36 88" fill="url(#dogShade)" />
                <ellipse cx="31" cy="87" rx="5.5" ry="3.4" fill={p.muzzle} />
              </g>
              <g className="dog__leg dog__leg--fr">
                <path d="M40 58 C40 68 42 78 42 86 C42 88 50 88 52 88" fill="url(#dogShade)" />
                <ellipse cx="47" cy="87" rx="5.8" ry="3.4" fill={p.muzzle} />
              </g>
            </>
          )}
        </g>
      )}

      {/* ----------------- HEAD, MUZZLE & FLOPPY EARS ----------------- */}
      <g className={`dog__head-rig ${isSleeping ? 'is-tucked' : ''}`}>
        {/* Head Base */}
        <ellipse
          cx="50"
          cy="37"
          rx="26"
          ry="22"
          fill="url(#dogFur)"
          stroke={shared.outline}
          strokeWidth={shared.outlineWidth}
        />

        {/* CANINE MUZZLE / SNOUT (Crucial anatomical distinction from cat!) */}
        <ellipse
          cx="50"
          cy="46"
          rx="15"
          ry="11"
          fill={p.muzzle}
          stroke={shared.outline}
          strokeWidth="1.3"
        />

        {/* Canine Soft Button Nose */}
        <ellipse cx="50" cy="41" rx="4.8" ry="3.4" fill={p.nose} />
        <circle cx="48.5" cy="40" r="1.1" fill="#ffffff" opacity="0.6" />

        {/* Happy Canine Mouth with Pink Tongue */}
        {isHappy || isDancing ? (
          <g className="dog__happy-mouth">
            <path d="M46 45 Q50 48 54 45" fill="none" stroke={shared.outline} strokeWidth="1.4" strokeLinecap="round" />
            {/* Playful tongue out */}
            <path d="M47 46 Q50 53 53 46 Z" fill={p.tongue} stroke={shared.outline} strokeWidth="1" />
          </g>
        ) : (
          <path
            d="M50 44 v2 M50 46 Q46 49 43 46 M50 46 Q54 49 57 46"
            fill="none"
            stroke={shared.outline}
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        )}

        {/* Rosy blush cheeks */}
        <circle cx="31" cy="44" r="4.5" fill={shared.blush} />
        <circle cx="69" cy="44" r="4.5" fill={shared.blush} />

        {/* EYES */}
        {isSleeping ? (
          // Sleeping crescent eyes
          <path
            d="M34 35 Q40 40 46 35 M54 35 Q60 40 66 35"
            fill="none"
            stroke={shared.eyePupil}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        ) : isHappy ? (
          // Happy canine squint `^ ^`
          <path
            d="M34 37 Q40 30 46 37 M54 37 Q60 30 66 37"
            fill="none"
            stroke={shared.eyePupil}
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        ) : (
          // Big loyal puppy eyes with cursor tracking
          <g className="dog__eyes">
            {/* Left Eye */}
            <ellipse cx="40" cy="35" rx="4.8" ry="5.8" fill={shared.eyePupil} />
            <circle cx={40 + eyePos.lx * 0.4} cy={34 + eyePos.ly * 0.4} r="1.8" fill={shared.eyeHighlight} />
            <circle cx={42} cy={37} r="0.9" fill={shared.eyeHighlight} />

            {/* Right Eye */}
            <ellipse cx="60" cy="35" rx="4.8" ry="5.8" fill={shared.eyePupil} />
            <circle cx={60 + eyePos.lx * 0.4} cy={34 + eyePos.ly * 0.4} r="1.8" fill={shared.eyeHighlight} />
            <circle cx={62} cy={37} r="0.9" fill={shared.eyeHighlight} />
          </g>
        )}

        {/* FLOPPY CANINE EARS (Drapes on sides of head, bouncing on movement) */}
        <g className="dog__ears">
          {/* Left Floppy Ear */}
          <path
            className="dog__ear dog__ear--l"
            d="M26 24 C14 26 12 44 18 52 C22 56 28 50 28 42 Z"
            fill="url(#dogShade)"
            stroke={shared.outline}
            strokeWidth={shared.outlineWidth}
            strokeLinejoin="round"
          />
          {/* Right Floppy Ear */}
          <path
            className="dog__ear dog__ear--r"
            d="M74 24 C86 26 88 44 82 52 C78 56 72 50 72 42 Z"
            fill="url(#dogShade)"
            stroke={shared.outline}
            strokeWidth={shared.outlineWidth}
            strokeLinejoin="round"
          />
        </g>

        {/* Dance/Music Headphones */}
        {isDancing && (
          <g className="pet__headphones">
            <path d="M22 36 C22 10 78 10 78 36" fill="none" stroke={musicAccent} strokeWidth="4.5" strokeLinecap="round" />
            <rect x="15" y="30" width="11" height="17" rx="5.5" fill={musicAccent} stroke={shared.outline} strokeWidth="1.2" />
            <rect x="74" y="30" width="11" height="17" rx="5.5" fill={musicAccent} stroke={shared.outline} strokeWidth="1.2" />
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
