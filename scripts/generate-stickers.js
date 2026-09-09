import fs from 'fs'
import path from 'path'
import { Resvg } from '@resvg/resvg-js'

const SVG_TEMPLATES = {
  'star': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <defs>
        <linearGradient id="starGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FFF275" />
          <stop offset="40%" stop-color="#FFD124" />
          <stop offset="100%" stop-color="#FF9800" />
        </linearGradient>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#FF9800" flood-opacity="0.5" />
        </filter>
      </defs>
      <polygon filter="url(#glow)" points="256,32 324,172 478,194 366,303 393,456 256,384 119,456 146,303 34,194 188,172" fill="url(#starGrad)" stroke="#FFA000" stroke-width="8" stroke-linejoin="round" />
      <polygon points="256,60 312,175 440,193 347,284 370,410 256,350" fill="#FFE082" opacity="0.6" />
    </svg>
  `,

  'heart': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <defs>
        <linearGradient id="heartGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FF5252" />
          <stop offset="50%" stop-color="#E91E63" />
          <stop offset="100%" stop-color="#C2185B" />
        </linearGradient>
        <filter id="heartShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#880E4F" flood-opacity="0.4" />
        </filter>
      </defs>
      <path filter="url(#heartShadow)" d="M256,448 C240,432 64,300 64,176 C64,104 120,48 192,48 C232,48 248,72 256,88 C264,72 280,48 320,48 C392,48 448,104 448,176 C448,300 272,432 256,448 Z" fill="url(#heartGrad)" stroke="#FF1744" stroke-width="6" />
      <ellipse cx="160" cy="140" rx="40" ry="24" transform="rotate(-35 160 140)" fill="#FFFFFF" opacity="0.5" />
    </svg>
  `,

  'fire': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <defs>
        <linearGradient id="fireOuter" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stop-color="#D50000" />
          <stop offset="60%" stop-color="#FF6D00" />
          <stop offset="100%" stop-color="#FFD600" />
        </linearGradient>
        <linearGradient id="fireInner" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stop-color="#FFAB00" />
          <stop offset="70%" stop-color="#FFFF00" />
          <stop offset="100%" stop-color="#FFFFFF" />
        </linearGradient>
      </defs>
      <path d="M256,32 C260,110 320,150 320,220 C320,240 310,260 295,275 C350,220 380,310 380,360 C380,430 324,480 256,480 C188,480 132,430 132,360 C132,270 190,210 210,130 C220,170 240,190 256,190 C250,150 240,90 256,32 Z" fill="url(#fireOuter)" />
      <path d="M256,260 C270,300 290,320 290,360 C290,395 275,420 256,420 C237,420 222,395 222,360 C222,330 240,300 256,260 Z" fill="url(#fireInner)" />
    </svg>
  `,

  'sparkles': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <defs>
        <linearGradient id="spkGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FFFFFF" />
          <stop offset="30%" stop-color="#FFE082" />
          <stop offset="100%" stop-color="#FFB300" />
        </linearGradient>
        <linearGradient id="spkCyan" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FFFFFF" />
          <stop offset="40%" stop-color="#80D8FF" />
          <stop offset="100%" stop-color="#0091EA" />
        </linearGradient>
      </defs>
      <!-- Big central sparkle -->
      <path d="M256,40 Q256,190 106,190 Q256,190 256,340 Q256,190 406,190 Q256,190 256,40 Z" fill="url(#spkGold)" />
      <!-- Top right small sparkle -->
      <path d="M380,260 Q380,330 310,330 Q380,330 380,400 Q380,330 450,330 Q380,330 380,260 Z" fill="url(#spkCyan)" />
      <!-- Bottom left tiny sparkle -->
      <path d="M130,320 Q130,365 85,365 Q130,365 130,410 Q130,365 175,365 Q130,365 130,320 Z" fill="url(#spkGold)" />
    </svg>
  `,

  'thumbs-up': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <defs>
        <linearGradient id="thumbGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#42A5F5" />
          <stop offset="100%" stop-color="#1565C0" />
        </linearGradient>
      </defs>
      <g fill="url(#thumbGrad)" stroke="#0D47A1" stroke-width="8" stroke-linejoin="round">
        <rect x="64" y="220" width="80" height="210" rx="16" />
        <path d="M164,230 L164,410 C164,420 176,430 190,430 L340,430 C365,430 385,410 388,385 L405,275 C408,255 392,238 372,238 L285,238 C295,210 310,140 310,105 C310,65 285,60 265,60 C240,60 220,100 200,165 L164,230 Z" />
      </g>
      <circle cx="104" cy="325" r="14" fill="#FFFFFF" opacity="0.6" />
    </svg>
  `,

  'check-badge': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <defs>
        <linearGradient id="badgeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#29B6F6" />
          <stop offset="100%" stop-color="#0288D1" />
        </linearGradient>
      </defs>
      <path d="M256,40 L292,82 L347,75 L369,125 L422,138 L424,193 L467,227 L448,278 L467,329 L424,363 L422,418 L369,431 L347,481 L292,474 L256,516 L220,474 L165,481 L143,431 L90,418 L88,363 L45,329 L64,278 L45,227 L88,193 L90,138 L143,125 L165,75 L220,82 Z" fill="url(#badgeGrad)" stroke="#01579B" stroke-width="8" />
      <polyline points="160,265 225,330 355,195" fill="none" stroke="#FFFFFF" stroke-width="36" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `,

  'party-popper': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <defs>
        <linearGradient id="coneGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FFD54F" />
          <stop offset="100%" stop-color="#FF8F00" />
        </linearGradient>
      </defs>
      <!-- Cone -->
      <polygon points="120,380 40,470 230,390" fill="url(#coneGrad)" stroke="#E65100" stroke-width="8" stroke-linejoin="round" />
      <path d="M120,380 Q175,385 230,390" stroke="#FF3D00" stroke-width="12" fill="none" />
      <!-- Ribbons & Confetti -->
      <path d="M175,340 Q160,240 260,210 T310,100" fill="none" stroke="#E91E63" stroke-width="14" stroke-linecap="round" />
      <path d="M210,360 Q270,300 290,200 T410,160" fill="none" stroke="#00E676" stroke-width="14" stroke-linecap="round" />
      <path d="M150,330 Q110,260 160,180 T240,70" fill="none" stroke="#2979FF" stroke-width="14" stroke-linecap="round" />
      <!-- Dots -->
      <circle cx="340" cy="110" r="16" fill="#FFD600" />
      <circle cx="210" cy="120" r="14" fill="#FF1744" />
      <circle cx="390" cy="240" r="15" fill="#00E5FF" />
      <circle cx="280" cy="270" r="12" fill="#76FF03" />
      <circle cx="160" cy="220" r="14" fill="#D500F9" />
    </svg>
  `,

  'warning': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <defs>
        <linearGradient id="warnGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#FFEE58" />
          <stop offset="100%" stop-color="#FDD835" />
        </linearGradient>
      </defs>
      <path d="M256,50 L460,420 C475,445 455,475 425,475 L87,475 C57,475 37,445 52,420 L256,50 Z" fill="url(#warnGrad)" stroke="#F57F17" stroke-width="16" stroke-linejoin="round" />
      <line x1="256" y1="190" x2="256" y2="330" stroke="#212121" stroke-width="32" stroke-linecap="round" />
      <circle cx="256" cy="400" r="20" fill="#212121" />
    </svg>
  `,

  'smile': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <defs>
        <linearGradient id="faceGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FFEE55" />
          <stop offset="60%" stop-color="#FFCA28" />
          <stop offset="100%" stop-color="#FF9800" />
        </linearGradient>
      </defs>
      <circle cx="256" cy="256" r="216" fill="url(#faceGrad)" stroke="#F57C00" stroke-width="12" />
      <!-- Eyes -->
      <ellipse cx="180" cy="200" rx="24" ry="34" fill="#37474F" />
      <ellipse cx="332" cy="200" rx="24" ry="34" fill="#37474F" />
      <circle cx="172" cy="190" r="8" fill="#FFFFFF" />
      <circle cx="324" cy="190" r="8" fill="#FFFFFF" />
      <!-- Smile -->
      <path d="M160,290 Q256,410 352,290" fill="#D32F2F" stroke="#37474F" stroke-width="12" stroke-linecap="round" />
      <path d="M160,290 Q256,340 352,290 Z" fill="#FFFFFF" />
      <!-- Cheeks -->
      <circle cx="130" cy="270" r="24" fill="#FF5252" opacity="0.4" />
      <circle cx="382" cy="270" r="24" fill="#FF5252" opacity="0.4" />
    </svg>
  `,

  'cool-sunglasses': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <defs>
        <linearGradient id="coolFace" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FFEE55" />
          <stop offset="100%" stop-color="#FF9800" />
        </linearGradient>
      </defs>
      <circle cx="256" cy="256" r="216" fill="url(#coolFace)" stroke="#F57C00" stroke-width="12" />
      <!-- Sunglasses frame -->
      <path d="M96,180 L416,180 L416,210 Q416,280 340,280 Q270,280 260,220 Q250,280 180,280 Q104,280 96,210 Z" fill="#212121" stroke="#000000" stroke-width="8" />
      <!-- Lens glare -->
      <polygon points="120,200 170,200 140,260 110,260" fill="#FFFFFF" opacity="0.3" />
      <polygon points="280,200 330,200 300,260 270,260" fill="#FFFFFF" opacity="0.3" />
      <!-- Confident smirk -->
      <path d="M200,340 Q270,390 340,330" fill="none" stroke="#37474F" stroke-width="14" stroke-linecap="round" />
    </svg>
  `,

  'laugh-tears': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <defs>
        <linearGradient id="laughFace" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FFEE55" />
          <stop offset="100%" stop-color="#FF9800" />
        </linearGradient>
        <linearGradient id="tearGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#40C4FF" />
          <stop offset="100%" stop-color="#0091EA" />
        </linearGradient>
      </defs>
      <circle cx="256" cy="256" r="216" fill="url(#laughFace)" stroke="#F57C00" stroke-width="12" />
      <!-- Squint eyes -->
      <path d="M140,200 L195,230 L140,260" fill="none" stroke="#37474F" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M372,200 L317,230 L372,260" fill="none" stroke="#37474F" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" />
      <!-- Big open mouth -->
      <path d="M150,290 Q256,430 362,290 Z" fill="#212121" />
      <path d="M190,360 Q256,430 322,360 Q256,340 190,360 Z" fill="#FF5252" />
      <path d="M155,290 Q256,325 357,290" stroke="#FFFFFF" stroke-width="14" fill="none" stroke-linecap="round" />
      <!-- Tears -->
      <path d="M120,230 Q70,260 70,300 C70,335 95,360 120,360 C145,360 160,335 160,300 Q160,260 120,230 Z" fill="url(#tearGrad)" opacity="0.9" />
      <path d="M392,230 Q442,260 442,300 C442,335 417,360 392,360 C367,360 352,335 352,300 Q352,260 392,230 Z" fill="url(#tearGrad)" opacity="0.9" />
    </svg>
  `,

  'arrow-neon': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <defs>
        <linearGradient id="neonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#00E5FF" />
          <stop offset="50%" stop-color="#1DE9B6" />
          <stop offset="100%" stop-color="#76FF03" />
        </linearGradient>
        <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#00E5FF" flood-opacity="0.6" />
        </filter>
      </defs>
      <path filter="url(#neonGlow)" d="M80,216 L280,216 L280,120 L440,256 L280,392 L280,296 L80,296 Z" fill="url(#neonGrad)" stroke="#FFFFFF" stroke-width="12" stroke-linejoin="round" />
    </svg>
  `,

  'badge-sale': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <defs>
        <linearGradient id="saleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FF1744" />
          <stop offset="100%" stop-color="#D50000" />
        </linearGradient>
      </defs>
      <rect x="40" y="156" width="432" height="200" rx="36" transform="rotate(-10 256 256)" fill="url(#saleGrad)" stroke="#FFFFFF" stroke-width="12" />
      <text x="256" y="295" transform="rotate(-10 256 256)" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="110" fill="#FFFFFF" text-anchor="middle" letter-spacing="4">SALE!</text>
    </svg>
  `,

  'badge-new': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <defs>
        <linearGradient id="newGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#00E5FF" />
          <stop offset="100%" stop-color="#0091EA" />
        </linearGradient>
      </defs>
      <rect x="60" y="156" width="392" height="200" rx="100" fill="url(#newGrad)" stroke="#FFFFFF" stroke-width="12" />
      <text x="256" y="295" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="105" fill="#FFFFFF" text-anchor="middle" letter-spacing="6">NEW</text>
    </svg>
  `,

  'trophy': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <defs>
        <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FFF59D" />
          <stop offset="40%" stop-color="#FBC02D" />
          <stop offset="100%" stop-color="#F57F17" />
        </linearGradient>
      </defs>
      <!-- Handles -->
      <path d="M120,130 C60,130 60,240 140,260" fill="none" stroke="url(#goldGrad)" stroke-width="24" stroke-linecap="round" />
      <path d="M392,130 C452,130 452,240 372,260" fill="none" stroke="url(#goldGrad)" stroke-width="24" stroke-linecap="round" />
      <!-- Main Cup -->
      <path d="M120,90 L392,90 L370,270 C360,330 300,360 256,360 C212,360 152,330 142,270 Z" fill="url(#goldGrad)" stroke="#E65100" stroke-width="8" />
      <!-- Star on cup -->
      <polygon points="256,160 268,198 308,198 276,222 288,260 256,236 224,260 236,222 204,198 244,198" fill="#FFF9C4" />
      <!-- Stem & Base -->
      <path d="M236,360 L276,360 L280,410 L232,410 Z" fill="url(#goldGrad)" />
      <rect x="160" y="410" width="192" height="50" rx="8" fill="#4E342E" stroke="#3E2723" stroke-width="6" />
    </svg>
  `,

  'lightning': `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
      <defs>
        <linearGradient id="boltGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FFFF00" />
          <stop offset="50%" stop-color="#FFD600" />
          <stop offset="100%" stop-color="#FF6D00" />
        </linearGradient>
        <filter id="boltGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="12" flood-color="#FFAB00" flood-opacity="0.6" />
        </filter>
      </defs>
      <polygon filter="url(#boltGlow)" points="290,20 120,270 240,270 190,490 390,210 270,210" fill="url(#boltGrad)" stroke="#FFA000" stroke-width="8" stroke-linejoin="round" />
    </svg>
  `,
}

async function main() {
  const resourcesDir = path.resolve(process.cwd(), 'resources', 'stickers')
  const publicDir = path.resolve(process.cwd(), 'public', 'stickers')

  fs.mkdirSync(resourcesDir, { recursive: true })
  fs.mkdirSync(publicDir, { recursive: true })

  console.log(`Generating ${Object.keys(SVG_TEMPLATES).length} stickers...`)

  for (const [id, svg] of Object.entries(SVG_TEMPLATES)) {
    const resvg = new Resvg(svg.trim(), {
      fitTo: { mode: 'width', value: 512 },
    })
    const pngData = resvg.render()
    const pngBuffer = pngData.asPng()

    const filename = `${id}.png`
    const resPath = path.join(resourcesDir, filename)
    const pubPath = path.join(publicDir, filename)

    fs.writeFileSync(resPath, pngBuffer)
    fs.writeFileSync(pubPath, pngBuffer)
    console.log(`Generated sticker: ${filename} (${pngBuffer.length} bytes)`)
  }

  console.log('All stickers generated successfully!')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
