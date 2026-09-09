export type StickerCategory = 'emoji' | 'badge' | 'arrow' | 'icon'

export interface StickerDefinition {
  id: string
  name: string
  category: StickerCategory
  filename: string
  keywords: string[]
  width?: number
  height?: number
}

export const STICKER_DEFINITIONS: StickerDefinition[] = [
  {
    id: 'star',
    name: 'Ngôi sao vàng',
    category: 'badge',
    filename: 'star.png',
    keywords: ['star', 'sao', 'rating', 'favorite', 'gold'],
    width: 512,
    height: 512,
  },
  {
    id: 'heart',
    name: 'Trái tim yêu',
    category: 'emoji',
    filename: 'heart.png',
    keywords: ['heart', 'love', 'tim', 'thích', 'red'],
    width: 512,
    height: 512,
  },
  {
    id: 'fire',
    name: 'Ngọn lửa hot',
    category: 'emoji',
    filename: 'fire.png',
    keywords: ['fire', 'hot', 'lửa', 'cháy', 'trending', 'flame'],
    width: 512,
    height: 512,
  },
  {
    id: 'sparkles',
    name: 'Lấp lánh thần kỳ',
    category: 'badge',
    filename: 'sparkles.png',
    keywords: ['sparkles', 'magic', 'shine', 'lấp lánh', 'glow'],
    width: 512,
    height: 512,
  },
  {
    id: 'thumbs-up',
    name: 'Thích (Like)',
    category: 'emoji',
    filename: 'thumbs-up.png',
    keywords: ['like', 'thumbs up', 'thích', 'tuyệt', 'agree'],
    width: 512,
    height: 512,
  },
  {
    id: 'check-badge',
    name: 'Tích xanh xác minh',
    category: 'badge',
    filename: 'check-badge.png',
    keywords: ['check', 'verified', 'xác minh', 'tick', 'blue'],
    width: 512,
    height: 512,
  },
  {
    id: 'party-popper',
    name: 'Pháo hoa chúc mừng',
    category: 'badge',
    filename: 'party-popper.png',
    keywords: ['party', 'celebrate', 'pháo', 'chúc mừng', 'confetti'],
    width: 512,
    height: 512,
  },
  {
    id: 'warning',
    name: 'Biển báo cảnh báo',
    category: 'icon',
    filename: 'warning.png',
    keywords: ['warning', 'alert', 'cảnh báo', 'chú ý', 'danger'],
    width: 512,
    height: 512,
  },
  {
    id: 'smile',
    name: 'Mặt cười tươi',
    category: 'emoji',
    filename: 'smile.png',
    keywords: ['smile', 'happy', 'cười', 'vui', 'cute'],
    width: 512,
    height: 512,
  },
  {
    id: 'cool-sunglasses',
    name: 'Mặt ngầu đeo kính',
    category: 'emoji',
    filename: 'cool-sunglasses.png',
    keywords: ['cool', 'sunglasses', 'ngầu', 'kính râm'],
    width: 512,
    height: 512,
  },
  {
    id: 'laugh-tears',
    name: 'Cười ra nước mắt',
    category: 'emoji',
    filename: 'laugh-tears.png',
    keywords: ['laugh', 'lol', 'hài hước', 'cười vỡ bụng', 'tears'],
    width: 512,
    height: 512,
  },
  {
    id: 'arrow-neon',
    name: 'Mũi tên Neon',
    category: 'arrow',
    filename: 'arrow-neon.png',
    keywords: ['arrow', 'pointer', 'mũi tên', 'chỉ hướng', 'neon'],
    width: 512,
    height: 512,
  },
  {
    id: 'badge-sale',
    name: 'Huy hiệu Giảm giá (SALE)',
    category: 'badge',
    filename: 'badge-sale.png',
    keywords: ['sale', 'discount', 'giảm giá', 'khuyến mãi', 'red'],
    width: 512,
    height: 512,
  },
  {
    id: 'badge-new',
    name: 'Huy hiệu Mới (NEW)',
    category: 'badge',
    filename: 'badge-new.png',
    keywords: ['new', 'mới', 'badge', 'hot', 'blue'],
    width: 512,
    height: 512,
  },
  {
    id: 'trophy',
    name: 'Cúp vàng vinh quang',
    category: 'icon',
    filename: 'trophy.png',
    keywords: ['trophy', 'winner', 'cúp', 'vô địch', 'champion'],
    width: 512,
    height: 512,
  },
  {
    id: 'lightning',
    name: 'Tia sét năng lượng',
    category: 'icon',
    filename: 'lightning.png',
    keywords: ['lightning', 'bolt', 'sét', 'nhanh', 'power'],
    width: 512,
    height: 512,
  },
]

export const STICKER_CATEGORIES: { id: StickerCategory | 'all' | 'custom'; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'emoji', label: 'Emoji' },
  { id: 'badge', label: 'Huy hiệu' },
  { id: 'arrow', label: 'Mũi tên' },
  { id: 'icon', label: 'Biểu tượng' },
  { id: 'custom', label: 'Đã nhập' },
]

export const DEFAULT_STICKER_DURATION = 3.0
export const DEFAULT_STICKER_SCALE = 40

export function getStickerDefinition(id: string): StickerDefinition | undefined {
  return STICKER_DEFINITIONS.find(s => s.id === id)
}

export function isValidStickerId(id: string): boolean {
  return STICKER_DEFINITIONS.some(s => s.id === id)
}

export function resolveStickerRelativePath(filenameOrId: string): string {
  const def = getStickerDefinition(filenameOrId)
  const filename = def ? def.filename : (filenameOrId.endsWith('.png') || filenameOrId.endsWith('.webp') ? filenameOrId : `${filenameOrId}.png`)
  return `stickers/${filename}`
}
