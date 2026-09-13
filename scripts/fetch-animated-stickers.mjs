import fs from 'fs'
import path from 'path'

const ANIMATED_STICKERS = [
  // Reactions & Biểu Cảm
  { id: 'anim-laugh-tears', filename: 'anim-laugh-tears.webp', code: '1f602', name: 'Cười ra nước mắt' },
  { id: 'anim-rofl', filename: 'anim-rofl.webp', code: '1f923', name: 'Cười lăn lộn' },
  { id: 'anim-heart-eyes', filename: 'anim-heart-eyes.webp', code: '1f60d', name: 'Mắt trái tim' },
  { id: 'anim-smiling-hearts', filename: 'anim-smiling-hearts.webp', code: '1f970', name: 'Nụ cười hạnh phúc' },
  { id: 'anim-cool-sunglasses', filename: 'anim-cool-sunglasses.webp', code: '1f60e', name: 'Mặt ngầu kính râm' },
  { id: 'anim-partying-face', filename: 'anim-partying-face.webp', code: '1f973', name: 'Mặt tiệc tùng ăn mừng' },
  { id: 'anim-thinking', filename: 'anim-thinking.webp', code: '1f914', name: 'Đăm chiêu suy nghĩ' },
  { id: 'anim-exploding-head', filename: 'anim-exploding-head.webp', code: '1f92f', name: 'Nổ tung não (Mind blown)' },
  { id: 'anim-crying', filename: 'anim-crying.webp', code: '1f62d', name: 'Khóc nức nở' },
  { id: 'anim-screaming', filename: 'anim-screaming.webp', code: '1f631', name: 'Hét hoảng hốt' },
  { id: 'anim-eyes', filename: 'anim-eyes.webp', code: '1f440', name: 'Đôi mắt liếc' },

  // Cử Chỉ & Tương Tác
  { id: 'anim-thumbs-up', filename: 'anim-thumbs-up.webp', code: '1f44d', name: 'Thích (Like)' },
  { id: 'anim-thumbs-down', filename: 'anim-thumbs-down.webp', code: '1f44e', name: 'Không thích (Dislike)' },
  { id: 'anim-clapping', filename: 'anim-clapping.webp', code: '1f44f', name: 'Vỗ tay tán thưởng' },
  { id: 'anim-raised-hands', filename: 'anim-raised-hands.webp', code: '1f64c', name: 'Hoan hô hai tay' },
  { id: 'anim-folded-hands', filename: 'anim-folded-hands.webp', code: '1f64f', name: 'Cảm ơn / Chắp tay' },

  // Trái Tim & Tình Cảm
  { id: 'anim-red-heart', filename: 'anim-red-heart.webp', code: '2764_fe0f', name: 'Trái tim đỏ rung đập' },
  { id: 'anim-sparkling-heart', filename: 'anim-sparkling-heart.webp', code: '1f496', name: 'Trái tim lấp lánh' },
  { id: 'anim-broken-heart', filename: 'anim-broken-heart.webp', code: '1f494', name: 'Trái tim tan vỡ' },

  // Hiệu Ứng & VFX
  { id: 'anim-fire', filename: 'anim-fire.webp', code: '1f525', name: 'Ngọn lửa hot cháy' },
  { id: 'anim-sparkles', filename: 'anim-sparkles.webp', code: '2728', name: 'Ánh sáng lấp lánh' },
  { id: 'anim-glowing-star', filename: 'anim-glowing-star.webp', code: '1f31f', name: 'Ngôi sao tỏa sáng' },
  { id: 'anim-lightning', filename: 'anim-lightning.webp', code: '26a1', name: 'Tia sét năng lượng' },
  { id: 'anim-collision', filename: 'anim-collision.webp', code: '1f4a5', name: 'Vụ nổ va chạm (Boom)' },
  { id: 'anim-bomb', filename: 'anim-bomb.webp', code: '1f4a3', name: 'Bom đếm ngược nổ' },
  { id: 'anim-party-popper', filename: 'anim-party-popper.webp', code: '1f389', name: 'Pháo hoa giấy chúc mừng' },

  // Social & Kêu Gọi CTA
  { id: 'anim-bell', filename: 'anim-bell.webp', code: '1f514', name: 'Chuông thông báo' },
  { id: 'anim-megaphone', filename: 'anim-megaphone.webp', code: '1f4e3', name: 'Loa phóng thanh / CTA' },
  { id: 'anim-speech-balloon', filename: 'anim-speech-balloon.webp', code: '1f4ac', name: 'Bong bóng chat' },
  { id: 'anim-rocket', filename: 'anim-rocket.webp', code: '1f680', name: 'Tên lửa bay vút' },
  { id: 'anim-target', filename: 'anim-target.webp', code: '1f3af', name: 'Hồng tâm trúng đích' },

  // Thành Tích & Biểu Tượng
  { id: 'anim-hundred', filename: 'anim-hundred.webp', code: '1f4af', name: 'Điểm 100 tuyệt đối' },
  { id: 'anim-crown', filename: 'anim-crown.webp', code: '1f451', name: 'Vương miện hoàng gia' },
  { id: 'anim-trophy', filename: 'anim-trophy.webp', code: '1f3c6', name: 'Cúp vàng vô địch' },
  { id: 'anim-medal-1st', filename: 'anim-medal-1st.webp', code: '1f947', name: 'Huy chương vàng số 1' },
  { id: 'anim-diamond', filename: 'anim-diamond.webp', code: '1f48e', name: 'Kim cương quý giá' },
  { id: 'anim-money-wings', filename: 'anim-money-wings.webp', code: '1f4b8', name: 'Tiền bay' },
  { id: 'anim-check-mark', filename: 'anim-check-mark.webp', code: '2705', name: 'Tích xanh hoàn thành' },
  { id: 'anim-warning', filename: 'anim-warning.webp', code: '26a0_fe0f', name: 'Biển báo nguy hiểm' },
]

async function main() {
  const publicDir = path.resolve(process.cwd(), 'public', 'stickers')
  const resourcesDir = path.resolve(process.cwd(), 'resources', 'stickers')

  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true })
  if (!fs.existsSync(resourcesDir)) fs.mkdirSync(resourcesDir, { recursive: true })

  console.log(`Downloading ${ANIMATED_STICKERS.length} animated WebP stickers from Google Noto Emoji (Apache 2.0)...`)

  let successCount = 0
  let totalBytes = 0

  for (const item of ANIMATED_STICKERS) {
    const gifFilename = item.filename.replace('.webp', '.gif')
    const url = `https://fonts.gstatic.com/s/e/notoemoji/latest/${item.code}/512.gif`
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'KomfyEdit-StickerFetcher/1.0' } })
      if (!res.ok) {
        console.error(`Failed to fetch ${item.id} (${url}): HTTP ${res.status}`)
        continue
      }
      const buffer = Buffer.from(await res.arrayBuffer())

      const publicPath = path.join(publicDir, gifFilename)
      const resourcesPath = path.join(resourcesDir, gifFilename)

      fs.writeFileSync(publicPath, buffer)
      fs.writeFileSync(resourcesPath, buffer)

      totalBytes += buffer.length
      successCount++
      console.log(`✓ [${successCount}/${ANIMATED_STICKERS.length}] ${gifFilename} (${(buffer.length / 1024).toFixed(1)} KB) - ${item.name}`)
    } catch (err) {
      console.error(`Error downloading ${item.id}:`, err)
    }
  }

  console.log(`\nFinished! Successfully downloaded ${successCount}/${ANIMATED_STICKERS.length} stickers.`)
  console.log(`Total size: ${(totalBytes / (1024 * 1024)).toFixed(2)} MB`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
