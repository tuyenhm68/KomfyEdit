/**
 * 3D LUT Filter definitions and catalogue.
 * Pure TypeScript: zero dependencies on DOM, React, or Electron.
 */

export type FilterCategory = 'all' | 'cinematic' | 'film' | 'vintage' | 'bw' | 'creative' | 'retro'

export interface FilterDefinition {
  id: string
  name: string
  category: Exclude<FilterCategory, 'all'>
  lutFile: string
  description: string
  defaultIntensity: number
  author?: string
}

export interface FilterCategoryInfo {
  id: FilterCategory
  nameEn: string
  nameVi: string
}

export const FILTER_CATEGORIES: readonly FilterCategoryInfo[] = [
  { id: 'all', nameEn: 'All', nameVi: 'Tất cả' },
  { id: 'cinematic', nameEn: 'Cinematic', nameVi: 'Điện ảnh' },
  { id: 'film', nameEn: 'Film', nameVi: 'Màu phim' },
  { id: 'vintage', nameEn: 'Vintage', nameVi: 'Cổ điển' },
  { id: 'bw', nameEn: 'Black & White', nameVi: 'Trắng đen' },
  { id: 'creative', nameEn: 'Creative', nameVi: 'Sáng tạo' },
  { id: 'retro', nameEn: 'Retro', nameVi: 'Hoài niệm' },
] as const

export const FILTER_REGISTRY: readonly FilterDefinition[] = [
  {
    id: 'cine-teal-orange',
    name: 'Cine Teal & Orange',
    category: 'cinematic',
    lutFile: 'cine-teal-orange.cube',
    description: 'Gam màu Hollywood kinh điển với da cam nổi bật trên nền bóng xanh mòng két',
    defaultIntensity: 100,
    author: 'KomfyEdit',
  },
  {
    id: 'film-classic',
    name: 'Film Classic',
    category: 'film',
    lutFile: 'film-classic.cube',
    description: 'Chất phim Kodak kinh điển với vùng sáng ấm và bóng đổ hơi ngả xanh lục nhẹ',
    defaultIntensity: 100,
    author: 'KomfyEdit',
  },
  {
    id: 'vintage-kodachrome',
    name: 'Vintage Kodachrome',
    category: 'vintage',
    lutFile: 'vintage-kodachrome.cube',
    description: 'Sắc thái hoài niệm thập niên 70 rực rỡ với độ tương phản cao và đỏ nồng nàn',
    defaultIntensity: 100,
    author: 'KomfyEdit',
  },
  {
    id: 'noir-bw',
    name: 'Noir B&W',
    category: 'bw',
    lutFile: 'noir-bw.cube',
    description: 'Đen trắng tương phản cao với vùng tối đậm nét theo phong cách phim Noir',
    defaultIntensity: 100,
    author: 'KomfyEdit',
  },
  {
    id: 'cyber-neon',
    name: 'Cyber Neon',
    category: 'creative',
    lutFile: 'cyber-neon.cube',
    description: 'Tone màu neon tương lai mang hơi hướng cyberpunk với ánh tím, hồng và xanh cyan',
    defaultIntensity: 100,
    author: 'KomfyEdit',
  },
  {
    id: 'golden-hour',
    name: 'Golden Hour',
    category: 'film',
    lutFile: 'golden-hour.cube',
    description: 'Ánh nắng hoàng hôn mềm mại, rực rỡ sắc vàng hổ phách và vùng sáng ấm',
    defaultIntensity: 100,
    author: 'KomfyEdit',
  },
  {
    id: 'moody-forest',
    name: 'Moody Forest',
    category: 'creative',
    lutFile: 'moody-forest.cube',
    description: 'Sắc xanh rêu sâu thẳm, bão hòa dịu và vùng tối huyền bí cho phong cảnh thiên nhiên',
    defaultIntensity: 100,
    author: 'KomfyEdit',
  },
  {
    id: 'retro-90s',
    name: 'Retro 90s',
    category: 'retro',
    lutFile: 'retro-90s.cube',
    description: 'Màu sắc băng từ VHS và TV thập niên 90 với vùng sáng dịu và sắc độ hoài cổ',
    defaultIntensity: 100,
    author: 'KomfyEdit',
  },
  {
    id: 'bleach-bypass',
    name: 'Bleach Bypass',
    category: 'cinematic',
    lutFile: 'bleach-bypass.cube',
    description: 'Hiệu ứng rửa phim bỏ bước tẩy bạc: độ tương phản rất mạnh và màu sắc bạc bạc ấn tượng',
    defaultIntensity: 100,
    author: 'KomfyEdit',
  },
  {
    id: 'warm-sunset',
    name: 'Warm Sunset',
    category: 'film',
    lutFile: 'warm-sunset.cube',
    description: 'Ấm áp lãng mạn với ánh hồng cam lan tỏa trong vùng sáng và vùng tối',
    defaultIntensity: 100,
    author: 'KomfyEdit',
  },
  {
    id: 'cold-winter',
    name: 'Cold Winter',
    category: 'creative',
    lutFile: 'cold-winter.cube',
    description: 'Không khí băng giá mùa đông với tone xanh tuyết thanh khiết và tinh tế',
    defaultIntensity: 100,
    author: 'KomfyEdit',
  },
  {
    id: 'pastel-dream',
    name: 'Pastel Dream',
    category: 'vintage',
    lutFile: 'pastel-dream.cube',
    description: 'Tone màu phấn mơ màng, vùng sáng mềm mại phong cách anime và thẩm mỹ aesthetic',
    defaultIntensity: 100,
    author: 'KomfyEdit',
  },
]

export const FILTER_DEFINITIONS = FILTER_REGISTRY

export function getFilterDefinition(id: string): FilterDefinition | undefined {
  return FILTER_REGISTRY.find(f => f.id === id)
}

export function getAllFilters(): readonly FilterDefinition[] {
  return FILTER_REGISTRY
}

export function getFiltersByCategory(category: FilterCategory): readonly FilterDefinition[] {
  if (category === 'all') return FILTER_REGISTRY
  return FILTER_REGISTRY.filter(f => f.category === category)
}
