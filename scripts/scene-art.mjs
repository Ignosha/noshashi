/*
 * The homepage hero scene: an original painted landscape (sky, soft
 * clouds, four layers of rolling green hills, haze and a fine film grain),
 * drawn here as inline SVG so it is ours, costs no image request and
 * scales to any width. Nothing in it is a photo or someone else's art.
 */
export const SCENE = `<svg class="sc-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice" role="presentation">
  <defs>
    <linearGradient id="scSky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3F6FB3"/><stop offset=".4" stop-color="#6F9AD3"/>
      <stop offset=".68" stop-color="#B4CDEA"/><stop offset=".84" stop-color="#E4ECF1"/>
    </linearGradient>
    <linearGradient id="scFar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#A9C2A3"/><stop offset="1" stop-color="#8FB08A"/></linearGradient>
    <linearGradient id="scMid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8DBE62"/><stop offset="1" stop-color="#5E9741"/></linearGradient>
    <linearGradient id="scNear" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7FB850"/><stop offset=".5" stop-color="#4F8C33"/><stop offset="1" stop-color="#346B25"/></linearGradient>
    <linearGradient id="scFront" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6FAA43"/><stop offset=".45" stop-color="#43812C"/><stop offset="1" stop-color="#25561C"/></linearGradient>
    <radialGradient id="scSun" cx=".72" cy=".18" r=".55"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".55"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>
    <linearGradient id="scHaze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#EEF3F2" stop-opacity="0"/><stop offset="1" stop-color="#EEF3F2" stop-opacity=".7"/></linearGradient>
    <filter id="scBlur" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="28"/></filter>
    <filter id="scSoft"><feGaussianBlur stdDeviation="2.2"/></filter>
    <filter id="scGrain"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .55 0"/></filter>
  </defs>
  <rect width="1600" height="900" fill="url(#scSky)"/>
  <rect width="1600" height="900" fill="url(#scSun)"/>
  <g filter="url(#scBlur)" fill="#FFFFFF" opacity=".55">
    <ellipse cx="260" cy="170" rx="210" ry="38"/><ellipse cx="430" cy="150" rx="140" ry="30"/>
    <ellipse cx="1180" cy="120" rx="240" ry="40"/><ellipse cx="1390" cy="210" rx="170" ry="30"/>
    <ellipse cx="820" cy="250" rx="180" ry="26"/>
  </g>
  <path d="M0 560 C 180 520 320 540 470 528 C 640 512 760 548 920 536 C 1100 522 1230 500 1380 520 C 1480 532 1550 540 1600 536 L1600 900 L0 900 Z" fill="url(#scFar)" filter="url(#scSoft)"/>
  <rect y="480" width="1600" height="120" fill="url(#scHaze)"/>
  <path d="M0 640 C 140 590 300 580 430 612 C 560 644 680 600 820 586 C 980 570 1080 622 1230 610 C 1380 598 1500 560 1600 572 L1600 900 L0 900 Z" fill="url(#scMid)"/>
  <path d="M0 712 C 160 664 330 670 500 700 C 640 724 760 690 900 668 C 1060 644 1200 690 1340 700 C 1460 708 1540 690 1600 682 L1600 900 L0 900 Z" fill="url(#scNear)"/>
  <path d="M0 790 C 220 742 420 760 640 788 C 820 810 980 770 1160 752 C 1340 736 1480 770 1600 760 L1600 900 L0 900 Z" fill="url(#scFront)"/>
  <path d="M0 712 C 160 664 330 670 500 700 C 640 724 760 690 900 668" fill="none" stroke="#B9DC8C" stroke-opacity=".45" stroke-width="3" filter="url(#scSoft)"/>
  <path d="M640 788 C 820 810 980 770 1160 752 C 1340 736 1480 770 1600 760" fill="none" stroke="#A6D37A" stroke-opacity=".4" stroke-width="3" filter="url(#scSoft)"/>
  <rect width="1600" height="900" filter="url(#scGrain)" opacity=".12"/>
</svg>`;
