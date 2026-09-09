# Phát hành & Tự động cập nhật

KomfyEdit phát hành bản cài đặt qua **GitHub Releases**, và app tự kiểm tra phiên bản mới bằng [`electron-updater`](https://www.electron.build/auto-update). Trang này mô tả cách cắt một bản phát hành, CI sinh ra những gì, và cơ chế cập nhật trong app hoạt động ra sao.

---

## 🚀 Cắt một bản phát hành

Nguồn sự thật duy nhất của số phiên bản là trường `version` trong `package.json`. Tag bắt buộc phải khớp — nếu lệch, CI dừng ngay, vì bản cài đặt sinh ra sẽ mang metadata cập nhật trỏ tới một phiên bản không tồn tại.

```bash
# 1. Nâng "version" trong package.json (ví dụ 1.0.0 -> 1.0.1)
# 2. Commit
git commit -am "Release v1.0.1"

# 3. Tạo tag và đẩy lên
git tag v1.0.1
git push origin main --tags
```

Đẩy tag `v*` sẽ kích hoạt [`.github/workflows/release.yml`](../../../.github/workflows/release.yml):

| Giai đoạn | Làm gì |
|---|---|
| **verify** | Đối chiếu tag với `package.json`, rồi chạy `pnpm typecheck` và `pnpm test:run` |
| **build** | Đóng gói song song trên bốn runner (xem bảng bên dưới) |
| **publish** | Đẩy toàn bộ installer cùng các file manifest `latest*.yml` lên một GitHub Release ở dạng **draft** |

### Chạy thử (dry run)

Kích hoạt workflow bằng tay (**Actions → Release → Run workflow**) sẽ dựng đủ mọi nền tảng nhưng **không phát hành gì cả**. Installer được đính kèm vào chính lần chạy đó, nên bạn tải về kiểm tra được mà không cần tạo phiên bản mới hay đụng tới trang Releases. Dùng cách này để kiểm chứng một thay đổi về đóng gói trước khi gắn tag.

Bước đối chiếu tag với version được bỏ qua khi chạy tay — ngoài lần đẩy tag, `GITHUB_REF_NAME` là tên branch, không bao giờ giống một số phiên bản.

---

Draft **không** tự công bố. Vào tab Releases, kiểm tra đủ artifact rồi bấm **Publish release** — client chỉ thấy bản mới sau bước này. Một bản lỗi đã public thì không rút lại được khỏi những máy đã bắt đầu tải.

---

## 🏗️ Ma trận build

| Job | Runner | Artifact |
|---|---|---|
| `windows-x64` | `windows-latest` | `KomfyEdit-Setup.exe` |
| `macos-arm64-and-x64` | `macos-latest` | `KomfyEdit-arm64.dmg` / `.zip`, `KomfyEdit-x64.dmg` / `.zip` |
| `linux-x64` | `ubuntu-latest` | `KomfyEdit-x64.AppImage`, `KomfyEdit-amd64.deb` |
| `linux-arm64` | `ubuntu-24.04-arm` | `KomfyEdit-arm64.AppImage`, `KomfyEdit-arm64.deb` |

Tên file **cố ý không chứa số phiên bản**, để link cố định `releases/latest/download/KomfyEdit-Setup.exe` luôn trỏ đúng bản mới nhất.

File `.zip` của macOS không thừa: `electron-updater` cài bản cập nhật macOS từ zip chứ không phải từ dmg. Bỏ nó đi là hỏng đường cập nhật trên macOS.

---

## 🧩 Vì sao macOS dựng cả hai kiến trúc trong một job

macOS chỉ có **một** file `latest-mac.yml` dùng chung cho cả hai kiến trúc. `MacUpdater` chọn giữa bản arm64 và x64 bằng cách tìm chuỗi `arm64` trong tên file thuộc danh sách bên trong đó, và file này chỉ liệt kê đủ cả hai khi **một** lần chạy `electron-builder` dựng cả hai. Nếu tách macOS thành hai job, job sau sẽ ghi đè `latest-mac.yml` của job trước và âm thầm xoá mất kênh cập nhật của một kiến trúc.

Linux thì ngược lại: `electron-builder` sinh riêng `latest-linux-arm64.yml`, nên mỗi kiến trúc có manifest của mình, và dựng trên runner arm64 bản địa vừa rẻ vừa an toàn hơn cross-compile.

### Hệ quả với FFmpeg

Vì bản macOS Intel được cross-pack trên runner Apple Silicon, nó thừa hưởng một vấn đề: `ffmpeg-static` chỉ tải đúng **một** binary lúc cài đặt, chọn theo kiến trúc của *máy build*. Nếu để nguyên, bản Intel sẽ mang FFmpeg arm64 và chết ở mọi thao tác xuất video trên máy Intel thật — mà CI không hề bắt được.

[`scripts/ffmpeg-per-arch.cjs`](../../../scripts/ffmpeg-per-arch.cjs) chạy ở hook `afterPack`. Nó tải binary FFmpeg khớp kiến trúc đang được đóng gói rồi thay vào app bundle, và không làm gì khi kiến trúc đó đã trùng với máy build. Script dừng hẳn build nếu tải hụt hoặc lỗi, thay vì để lọt một installer có exporter chết.

`@resvg/resvg-js` cũng chia gói theo platform và kiến trúc, nhưng giải cách khác: `pnpm.supportedArchitectures.cpu` trong `package.json` khai cả `x64` lẫn `arm64` để pnpm cài đủ hai gói native.

---

## 🔄 Cơ chế cập nhật trong app

Toàn bộ nằm ở [`electron/updater.ts`](../../../electron/updater.ts).

- **Chỉ chạy ở bản đóng gói.** `electron-builder` ghi đích phát hành vào `app-update.yml` bên trong app đã đóng gói, và đó là nơi duy nhất `electron-updater` đọc. Bản dev không có file này nên mọi lối vào đều thoát sớm. Đây là chủ ý, không phải thiếu sót.
- **Kiểm tra ngầm 8 giây sau khi khởi động.** Không có bản mới thì không hiện gì cả.
- **Tải phải xin phép** (`autoDownload = false`). Có bản mới thì app hỏi trước: **Download / Release notes / Later**. Tải ngầm không hỏi là chuyện tệ với người dùng mạng tính dung lượng, và tệ hơn nữa khi họ đang xuất video.
- **Cài cũng phải xin phép.** Tải xong, app cho chọn **Restart now** hoặc **Install on quit** (`autoInstallOnAppQuit`).
- **Kiểm tra thủ công** qua **Help → Check for Updates...**. Khác bản ngầm ở chỗ nó báo cả khi đã là bản mới nhất, và hiện lỗi nếu có.
- Tiến trình tải hiển thị trên taskbar / dock qua `setProgressBar`.

Mọi hộp thoại đều do main process dựng bằng `dialog` gốc, renderer không phải vẽ gì.

---

## 🔏 Tình trạng ký số

KomfyEdit hiện **chưa được ký số**. CI đặt `CSC_IDENTITY_AUTO_DISCOVERY: false` để build không gãy vì thiếu chứng chỉ. Hệ quả theo từng nền tảng:

| Nền tảng | Lúc cài đặt | Tự động cập nhật |
|---|---|---|
| **Windows** | SmartScreen cảnh báo; người dùng bấm *More info → Run anyway* | ✅ Chạy được |
| **Linux** | Không ảnh hưởng | ✅ Chạy được (AppImage) |
| **macOS** | Gatekeeper chặn; lần đầu phải chuột phải → Open | ❌ **Không chạy** — `electron-updater` từ chối cài bản không ký |

Vì vậy người dùng macOS phải tải thủ công từng bản `.dmg` cho tới khi có chứng chỉ Developer ID. Muốn bật ký số thì cần chứng chỉ code signing cho Windows (hoặc Azure Trusted Signing), cùng tài khoản Apple Developer và bước notarize cho macOS, rồi khai secrets vào `release.yml`.

---

## 🛠️ Build tại máy

```bash
pnpm build:dir     # App chưa đóng gói trong release/, nhanh nhất để thử nhanh
pnpm build         # Installer đầy đủ cho nền tảng hiện tại, không phát hành
pnpm release       # Installer đầy đủ VÀ phát hành — đây là đường CI dùng
```

`pnpm release` cần `GH_TOKEN` và sẽ đẩy artifact lên GitHub Release, nên đừng chạy ở máy trừ khi bạn thực sự muốn điều đó.
