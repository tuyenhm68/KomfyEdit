export type SfxCategory =
  | 'accent'
  | 'transition'
  | 'notification'
  | 'impact'
  | 'comedy'
  | 'foley'

export interface SfxDefinition {
  id: string
  name: string
  category: SfxCategory
  filename: string
  duration: number
  description: string
  keywords: string[]
}

export const SFX_DEFINITIONS: SfxDefinition[] = [
  // Transition
  {
    id: 'whoosh',
    name: 'Whoosh / Swoosh',
    category: 'transition',
    filename: 'whoosh.wav',
    duration: 0.45,
    description: 'Âm thanh lướt nhanh cho punch-in zoom, chuyển cảnh nhanh, trượt chữ',
    keywords: ['whoosh', 'swoosh', 'zoom', 'punch-in', 'chuyển cảnh', 'transition'],
  },
  {
    id: 'whoosh-fast',
    name: 'Fast Whip Whoosh',
    category: 'transition',
    filename: 'whoosh-fast.wav',
    duration: 0.25,
    description: 'Âm lướt vút siêu nhanh cho whip pan, lướt nhanh thẻ bài, chuyển slide',
    keywords: ['whoosh', 'fast', 'whip', 'swipe', 'slide', 'nhanh'],
  },
  {
    id: 'whoosh-deep',
    name: 'Cinematic Deep Whoosh',
    category: 'transition',
    filename: 'whoosh-deep.wav',
    duration: 0.65,
    description: 'Âm chuyển cảnh trầm hùng tráng phong cách điện ảnh',
    keywords: ['cinematic', 'deep', 'whoosh', 'bass', 'điện ảnh', 'trầm'],
  },
  {
    id: 'glitch',
    name: 'Digital Glitch',
    category: 'transition',
    filename: 'glitch.wav',
    duration: 0.35,
    description: 'Hiệu ứng nhiễu sóng kỹ thuật số, giật màn hình, chuyển cảnh cyberpunk',
    keywords: ['glitch', 'digital', 'cyber', 'nhiễu', 'static', 'tech'],
  },
  {
    id: 'rewind',
    name: 'Tape Rewind',
    category: 'transition',
    filename: 'rewind.wav',
    duration: 0.50,
    description: 'Tiếng tua băng cassette ngược nhanh khi quay lại đoạn trước',
    keywords: ['rewind', 'tape', 'cassette', 'tua', 'ngược', 'flashback'],
  },

  // Accent & UI
  {
    id: 'pop',
    name: 'Pop / Bubble',
    category: 'accent',
    filename: 'pop.wav',
    duration: 0.15,
    description: 'Âm thanh vui nhộn khi sticker, badge, icon xuất hiện',
    keywords: ['pop', 'bubble', 'badge', 'sticker', 'appear', 'nhẹ'],
  },
  {
    id: 'mouse-click',
    name: 'UI Mouse Click',
    category: 'accent',
    filename: 'mouse-click.wav',
    duration: 0.08,
    description: 'Tiếng click chuột máy tính dứt khoát khi chọn nút bấm hoặc link',
    keywords: ['click', 'mouse', 'ui', 'button', 'nút', 'chuột'],
  },
  {
    id: 'keyboard-type',
    name: 'Mechanical Key Click',
    category: 'accent',
    filename: 'keyboard-type.wav',
    duration: 0.12,
    description: 'Tiếng gõ phím cơ giòn tan khi gõ chữ hoặc hiện title text',
    keywords: ['keyboard', 'type', 'key', 'bàn phím', 'gõ', 'chữ', 'text'],
  },
  {
    id: 'camera-shutter',
    name: 'Camera Shutter',
    category: 'accent',
    filename: 'camera-shutter.wav',
    duration: 0.30,
    description: 'Tiếng màn trập máy ảnh chụp hình khi chụp ảnh màn hình, freeze frame',
    keywords: ['camera', 'shutter', 'photo', 'máy ảnh', 'chụp hình', 'freeze'],
  },
  {
    id: 'cork-pop',
    name: 'Cork Bottle Pop',
    category: 'accent',
    filename: 'cork-pop.wav',
    duration: 0.20,
    description: 'Tiếng mở nắp chai sâm-panh nổ bôm bốp vui tai',
    keywords: ['cork', 'pop', 'bottle', 'chai', 'mở', 'ăn mừng'],
  },
  {
    id: 'snap',
    name: 'Finger Snap',
    category: 'accent',
    filename: 'snap.wav',
    duration: 0.12,
    description: 'Tiếng búng tay dứt khoát khi thay đổi ý tưởng hoặc xuất hiện bất ngờ',
    keywords: ['snap', 'finger', 'búng tay', 'thay đổi', 'magic'],
  },

  // Notification & Game
  {
    id: 'ding',
    name: 'Ding / Chime',
    category: 'notification',
    filename: 'ding.wav',
    duration: 0.85,
    description: 'Tiếng chuông ngân vang khi hiển thị con số ấn tượng, điểm quan trọng, kết quả',
    keywords: ['ding', 'chime', 'bell', 'number', 'số', 'highlight', 'tiền', 'free'],
  },
  {
    id: 'bell-chime',
    name: 'Service Bell',
    category: 'notification',
    filename: 'bell-chime.wav',
    duration: 0.90,
    description: 'Tiếng chuông quầy lễ tân đanh và ngân nga gây chú ý',
    keywords: ['bell', 'hotel', 'desk', 'chuông', 'gọi', 'chú ý'],
  },
  {
    id: 'success',
    name: 'Success Chime',
    category: 'notification',
    filename: 'success.wav',
    duration: 0.60,
    description: 'Hợp âm chuông ngân thành công, đúng đáp án, hoàn thành nhiệm vụ',
    keywords: ['success', 'complete', 'win', 'thành công', 'đúng', 'chúc mừng'],
  },
  {
    id: 'coin',
    name: '8-Bit Retro Coin',
    category: 'notification',
    filename: 'coin.wav',
    duration: 0.35,
    description: 'Tiếng nhặt xu vàng game Mario phong cách retro vui nhộn',
    keywords: ['coin', 'retro', '8bit', 'mario', 'xu', 'tiền', 'game'],
  },
  {
    id: 'cash-register',
    name: 'Cash Register Cha-Ching',
    category: 'notification',
    filename: 'cash-register.wav',
    duration: 0.75,
    description: 'Tiếng máy đếm tiền / mở két tính tiền kinh điển khi chốt đơn, doanh thu',
    keywords: ['cash', 'money', 'register', 'cha-ching', 'tiền', 'bán hàng', 'két'],
  },
  {
    id: 'alert',
    name: 'Warning / Alert',
    category: 'notification',
    filename: 'alert.wav',
    duration: 0.40,
    description: 'Âm báo 2 tone cảnh báo chú ý, lưu ý, disclaimer, lỗi cần tránh',
    keywords: ['alert', 'warning', 'cảnh báo', 'chú ý', 'lưu ý', 'disclaimer'],
  },
  {
    id: 'error-buzz',
    name: 'Error Buzz / Wrong',
    category: 'notification',
    filename: 'error-buzz.wav',
    duration: 0.30,
    description: 'Tiếng buzz báo sai, lỗi, cấm đoán hoặc câu trả lời không đúng',
    keywords: ['error', 'buzz', 'wrong', 'sai', 'thất bại', 'cấm', 'fail'],
  },
  {
    id: 'level-up',
    name: 'Major Fanfare / Level Up',
    category: 'notification',
    filename: 'level-up.wav',
    duration: 0.65,
    description: 'Hợp âm thăng tiến chúc mừng lên cấp độ mới, nâng cấp tính năng',
    keywords: ['level up', 'fanfare', 'upgrade', 'lên cấp', 'thăng hạng', 'game'],
  },

  // Impact & Dramatic
  {
    id: 'sub-boom',
    name: 'Cinematic Sub Bass Boom',
    category: 'impact',
    filename: 'sub-boom.wav',
    duration: 1.20,
    description: 'Cú đập sub-bass rung chuyển tạo điểm nhấn cực mạnh, kịch tính',
    keywords: ['sub', 'boom', 'bass', 'impact', 'cinematic', 'trầm', 'rung', 'đột ngột'],
  },
  {
    id: 'thud-impact',
    name: 'Deep Thud Impact',
    category: 'impact',
    filename: 'thud-impact.wav',
    duration: 0.40,
    description: 'Tiếng va đập chắc nịch khi rơi đồ, đặt vật nặng, đóng cửa mạnh',
    keywords: ['thud', 'hit', 'drop', 'đập', 'rơi', 'nặng'],
  },
  {
    id: 'metal-hit',
    name: 'Metallic Clang Impact',
    category: 'impact',
    filename: 'metal-hit.wav',
    duration: 0.50,
    description: 'Tiếng va chạm kim loại đanh thép phong cách hành động',
    keywords: ['metal', 'clang', 'hit', 'kim loại', 'va chạm', 'kiếm'],
  },
  {
    id: 'dramatic-riser',
    name: 'Tension Riser',
    category: 'impact',
    filename: 'dramatic-riser.wav',
    duration: 1.50,
    description: 'Âm thanh tăng dần cao độ dồn dập xây dựng cao trào, hồi hộp',
    keywords: ['riser', 'tension', 'suspense', 'hồi hộp', 'cao trào', 'dồn dập'],
  },

  // Comedy & Meme
  {
    id: 'funny-boing',
    name: 'Cartoon Spring Boing',
    category: 'comedy',
    filename: 'funny-boing.wav',
    duration: 0.45,
    description: 'Tiếng lò xo nảy tưng tưng hoạt hình hài hước kinh điển',
    keywords: ['boing', 'spring', 'cartoon', 'lò xo', 'hài hước', 'funny', 'nhảy'],
  },
  {
    id: 'record-scratch',
    name: 'Vinyl Record Scratch',
    category: 'comedy',
    filename: 'record-scratch.wav',
    duration: 0.40,
    description: 'Tiếng xước đĩa dừng phanh đột ngột khi xảy ra sự cố ngớ ngẩn bất ngờ',
    keywords: ['scratch', 'vinyl', 'record', 'dừng', 'ngạc nhiên', 'bất ngờ', 'meme'],
  },
  {
    id: 'fail-trombone',
    name: 'Sad Trombone Wah-Wah',
    category: 'comedy',
    filename: 'fail-trombone.wav',
    duration: 1.20,
    description: 'Tiếng kèn buồn thê thảm tụt dốc khi thất bại hài hước, quê độ',
    keywords: ['trombone', 'sad', 'wah-wah', 'fail', 'thất bại', 'quê', 'buồn'],
  },

  // Foley & Atmosphere
  {
    id: 'applause',
    name: 'Studio Crowd Applause',
    category: 'foley',
    filename: 'applause.wav',
    duration: 1.50,
    description: 'Tiếng vỗ tay hoan hô nhiệt liệt của khán giả trường quay',
    keywords: ['applause', 'cheer', 'clap', 'vỗ tay', 'khán giả', 'tán thưởng'],
  },
  {
    id: 'heartbeat',
    name: 'Tense Heartbeat',
    category: 'foley',
    filename: 'heartbeat.wav',
    duration: 0.80,
    description: 'Tiếng tim đập thình thịch hồi hộp lo lắng hoặc gay cấn',
    keywords: ['heartbeat', 'heart', 'pulse', 'tim đập', 'hồi hộp', 'lo lắng'],
  },
  {
    id: 'clock-tick',
    name: 'Clock Ticking',
    category: 'foley',
    filename: 'clock-tick.wav',
    duration: 0.15,
    description: 'Tiếng kim đồng hồ tích tắc đếm ngược thời gian gấp gáp',
    keywords: ['clock', 'tick', 'time', 'đồng hồ', 'tích tắc', 'đếm ngược'],
  },
]

export interface SfxCategoryInfo {
  id: SfxCategory | 'all'
  nameVi: string
  nameEn: string
  label: string
}

export const SFX_CATEGORIES: SfxCategoryInfo[] = [
  { id: 'all', nameVi: 'Tất cả', nameEn: 'All', label: 'Tất cả' },
  { id: 'transition', nameVi: 'Chuyển cảnh', nameEn: 'Transitions', label: 'Chuyển cảnh' },
  { id: 'accent', nameVi: 'Điểm nhấn', nameEn: 'Accents & UI', label: 'Điểm nhấn' },
  { id: 'notification', nameVi: 'Thông báo / Game', nameEn: 'Notifications & Game', label: 'Thông báo / Game' },
  { id: 'impact', nameVi: 'Va đập / Kịch tính', nameEn: 'Impacts & Hits', label: 'Va đập / Kịch tính' },
  { id: 'comedy', nameVi: 'Hài hước / Meme', nameEn: 'Comedy & Meme', label: 'Hài hước / Meme' },
  { id: 'foley', nameVi: 'Hiệu ứng Foley', nameEn: 'Foley & Ambience', label: 'Hiệu ứng Foley' },
]

export function getSfxDefinition(id: string): SfxDefinition | undefined {
  return SFX_DEFINITIONS.find(s => s.id === id || s.filename === id)
}

export function isValidSfxId(id: string): boolean {
  return SFX_DEFINITIONS.some(s => s.id === id || s.filename === id)
}

export function resolveSfxRelativePath(filenameOrId: string): string {
  const def = getSfxDefinition(filenameOrId)
  const filename = def ? def.filename : (filenameOrId.endsWith('.wav') || filenameOrId.endsWith('.mp3') ? filenameOrId : `${filenameOrId}.wav`)
  return `sfx/${filename}`
}
