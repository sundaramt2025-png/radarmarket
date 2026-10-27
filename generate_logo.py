"""
Generate modern, premium vector and raster logo icons for Smart Budget & Saving Manager.
Incorporates PPT Slide 1 elements: ₹ Rupee, 💰 Wealth, 📊 Growth Chart, 🎯 Target Bullseye.
"""

import os
from PIL import Image, ImageDraw, ImageFont

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ICONS_DIR = os.path.join(BASE_DIR, "icons")
os.makedirs(ICONS_DIR, exist_ok=True)

SVG_CONTENT = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- Background Gradients -->
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#022c22"/>
      <stop offset="35%" stop-color="#064e3b"/>
      <stop offset="70%" stop-color="#047857"/>
      <stop offset="100%" stop-color="#065f46"/>
    </linearGradient>

    <!-- Gold Gradients for Coins & Accents -->
    <linearGradient id="goldCoin" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef08a"/>
      <stop offset="30%" stop-color="#facc15"/>
      <stop offset="70%" stop-color="#eab308"/>
      <stop offset="100%" stop-color="#ca8a04"/>
    </linearGradient>

    <linearGradient id="goldRim" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fde047"/>
      <stop offset="100%" stop-color="#b45309"/>
    </linearGradient>

    <!-- Emerald Chart Gradient -->
    <linearGradient id="chartBar1" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#6ee7b7"/>
      <stop offset="100%" stop-color="#10b981"/>
    </linearGradient>
    <linearGradient id="chartBar2" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#34d399"/>
      <stop offset="100%" stop-color="#059669"/>
    </linearGradient>
    <linearGradient id="chartBar3" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#fde047"/>
      <stop offset="100%" stop-color="#eab308"/>
    </linearGradient>

    <!-- Glow Filter -->
    <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="12" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>

  <!-- App Squircle Outer Background -->
  <rect width="512" height="512" rx="115" fill="url(#bgGradient)"/>
  
  <!-- Subtle Outer Accent Rings -->
  <rect x="14" y="14" width="484" height="484" rx="103" fill="none" stroke="url(#goldRim)" stroke-width="3" opacity="0.45"/>
  <circle cx="256" cy="240" r="195" fill="none" stroke="#34d399" stroke-width="2" stroke-dasharray="8 10" opacity="0.3"/>

  <!-- Target Bullseye (Slide 1 🎯 - Top Left) -->
  <g transform="translate(130, 130)">
    <circle cx="0" cy="0" r="38" fill="#ef4444" filter="url(#softGlow)"/>
    <circle cx="0" cy="0" r="26" fill="#ffffff"/>
    <circle cx="0" cy="0" r="14" fill="#dc2626"/>
    <circle cx="0" cy="0" r="5" fill="#fef2f2"/>
  </g>

  <!-- Financial Growth Bar Chart (Slide 1 📊 - Top Right) -->
  <g transform="translate(320, 100)">
    <rect x="0" y="55" width="22" height="35" rx="6" fill="url(#chartBar1)"/>
    <rect x="28" y="32" width="22" height="58" rx="6" fill="url(#chartBar2)"/>
    <rect x="56" y="8" width="22" height="82" rx="6" fill="url(#chartBar3)"/>
    <!-- Growth Trend Arrow -->
    <path d="M -5 62 L 20 40 L 48 30 L 76 6" fill="none" stroke="#fde047" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <polygon points="74,0 84,6 78,14" fill="#fde047"/>
  </g>

  <!-- Central Shield / Medallion -->
  <circle cx="256" cy="275" r="115" fill="#022c22" opacity="0.6"/>
  <circle cx="256" cy="270" r="105" fill="url(#goldCoin)" stroke="#fef08a" stroke-width="6" filter="url(#softGlow)"/>
  <circle cx="256" cy="270" r="92" fill="none" stroke="#ca8a04" stroke-width="3" stroke-dasharray="4 5"/>

  <!-- Inner Rupee Core (Slide 1 ₹) -->
  <text x="256" y="318" font-family="'Inter', 'Segoe UI', system-ui, sans-serif" font-size="125" font-weight="900" fill="#064e3b" text-anchor="middle">₹</text>

  <!-- Little Sparkles / Stars -->
  <path d="M 390 220 Q 390 235 405 235 Q 390 235 390 250 Q 390 235 375 235 Q 390 235 390 220 Z" fill="#fef08a"/>
  <path d="M 120 280 Q 120 292 132 292 Q 120 292 120 304 Q 120 292 108 292 Q 120 292 120 280 Z" fill="#6ee7b7"/>

  <!-- Bottom App Banner Ribbon -->
  <g transform="translate(256, 435)">
    <rect x="-185" y="-22" width="370" height="44" rx="22" fill="#022c22" opacity="0.85" stroke="#10b981" stroke-width="1.5"/>
    <text x="0" y="7" font-family="'Inter', 'Segoe UI', system-ui, sans-serif" font-size="18" font-weight="800" fill="#f8fafc" letter-spacing="2.5" text-anchor="middle">SMART BUDGET</text>
  </g>
</svg>'''

def generate_png(size):
    """Draws a crisp high-res raster version using PIL."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    scale = size / 512.0

    # Background rounded rect
    rx = int(115 * scale)
    draw.rounded_rectangle([0, 0, size, size], radius=rx, fill=(4, 120, 87, 255))
    
    # Inner border
    pad = int(14 * scale)
    draw.rounded_rectangle([pad, pad, size - pad, size - pad], radius=int(103 * scale), outline=(250, 204, 21, 140), width=max(1, int(4 * scale)))

    # Central Gold Circle
    cx, cy = int(256 * scale), int(270 * scale)
    r = int(105 * scale)
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(234, 179, 8, 255), outline=(254, 240, 138, 255), width=max(2, int(6 * scale)))

    # Target Bullseye (Top-left)
    tx, ty = int(130 * scale), int(130 * scale)
    draw.ellipse([tx - int(38*scale), ty - int(38*scale), tx + int(38*scale), ty + int(38*scale)], fill=(239, 68, 68, 255))
    draw.ellipse([tx - int(26*scale), ty - int(26*scale), tx + int(26*scale), ty + int(26*scale)], fill=(255, 255, 255, 255))
    draw.ellipse([tx - int(14*scale), ty - int(14*scale), tx + int(14*scale), ty + int(14*scale)], fill=(220, 38, 38, 255))
    draw.ellipse([tx - int(5*scale), ty - int(5*scale), tx + int(5*scale), ty + int(5*scale)], fill=(254, 242, 242, 255))

    # Growth Bars (Top-right)
    bx = int(320 * scale)
    by = int(100 * scale)
    w = int(22 * scale)
    draw.rounded_rectangle([bx, by + int(55*scale), bx + w, by + int(90*scale)], radius=int(6*scale), fill=(110, 231, 183, 255))
    draw.rounded_rectangle([bx + int(28*scale), by + int(32*scale), bx + int(28*scale) + w, by + int(90*scale)], radius=int(6*scale), fill=(16, 185, 129, 255))
    draw.rounded_rectangle([bx + int(56*scale), by + int(8*scale), bx + int(56*scale) + w, by + int(90*scale)], radius=int(6*scale), fill=(250, 204, 21, 255))

    # Rupee Symbol in Center
    font_size = int(140 * scale)
    try:
        font = ImageFont.truetype("arial.ttf", font_size)
    except Exception:
        try:
            font = ImageFont.truetype("segoeui.ttf", font_size)
        except Exception:
            font = ImageFont.load_default()

    draw.text((cx, cy + int(5*scale)), "₹", fill=(6, 78, 59, 255), anchor="mm", font=font)

    # Bottom Banner
    banner_w = int(360 * scale)
    banner_h = int(44 * scale)
    b_left = cx - (banner_w // 2)
    b_top = int(420 * scale)
    draw.rounded_rectangle([b_left, b_top, b_left + banner_w, b_top + banner_h], radius=int(22*scale), fill=(2, 44, 34, 230), outline=(16, 185, 129, 255), width=max(1, int(2*scale)))

    text_size = max(10, int(20 * scale))
    try:
        b_font = ImageFont.truetype("arialbd.ttf", text_size)
    except Exception:
        try:
            b_font = ImageFont.truetype("arial.ttf", text_size)
        except Exception:
            b_font = ImageFont.load_default()

    draw.text((cx, b_top + (banner_h // 2)), "SMART BUDGET", fill=(248, 250, 252, 255), anchor="mm", font=b_font)

    return img

def main():
    # 1. Write SVG
    svg_path = os.path.join(ICONS_DIR, "icon.svg")
    with open(svg_path, "w", encoding="utf-8") as f:
        f.write(SVG_CONTENT)
    print(f"Created: {svg_path}")

    # 2. Generate PNGs (512x512, 192x192, maskable)
    img512 = generate_png(512)
    img512.save(os.path.join(ICONS_DIR, "icon-512.png"), "PNG")
    img512.save(os.path.join(ICONS_DIR, "icon-maskable.png"), "PNG")
    print("Created: icon-512.png and icon-maskable.png")

    img192 = generate_png(192)
    img192.save(os.path.join(ICONS_DIR, "icon-192.png"), "PNG")
    print("Created: icon-192.png")

    # Copy to APK build directory
    apk_res_icon = os.path.join(BASE_DIR, "apk_build", "res", "drawable", "icon.png")
    img192.save(apk_res_icon, "PNG")
    print(f"Updated APK icon: {apk_res_icon}")

if __name__ == "__main__":
    main()
