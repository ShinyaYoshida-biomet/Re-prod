#!/usr/bin/env python3
"""
Generate Re-prod app icons with proper sizing
Icon should have 70% content with 15% margins on each side
"""

from PIL import Image, ImageDraw
import os

def create_icon(size):
    """Create a single icon with gradient background and centered circle"""
    # Create image with transparency
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Create rounded square background with gradient effect
    # Blue to teal gradient
    for y in range(size):
        # Calculate gradient color (blue to teal)
        ratio = y / size
        r = int(33 + (64 - 33) * ratio)    # 33 -> 64
        g = int(114 + (172 - 114) * ratio)  # 114 -> 172
        b = int(184 + (167 - 184) * ratio)  # 184 -> 167

        # Draw horizontal line for gradient
        draw.line([(0, y), (size, y)], fill=(r, g, b, 255))

    # Apply rounded corners
    corner_radius = int(size * 0.225)  # macOS standard: ~22.5%
    mask = Image.new('L', (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([(0, 0), (size, size)], corner_radius, fill=255)

    # Apply mask
    img.putalpha(mask)

    # Draw white circle at center with proper sizing (70% of canvas)
    circle_size = int(size * 0.70)  # 70% of total size
    circle_pos = (size - circle_size) // 2

    draw = ImageDraw.Draw(img)
    draw.ellipse(
        [(circle_pos, circle_pos), (circle_pos + circle_size, circle_pos + circle_size)],
        fill=(255, 255, 255, 255)
    )

    return img

def main():
    """Generate all required icon sizes"""
    sizes = [1024, 512, 256, 128, 64, 32, 16]

    script_dir = os.path.dirname(os.path.abspath(__file__))

    for size in sizes:
        icon = create_icon(size)

        if size == 1024:
            output_path = os.path.join(script_dir, 'icon.png')
        else:
            output_path = os.path.join(script_dir, f'icon-{size}x{size}.png')

        icon.save(output_path, 'PNG')
        print(f'Generated: {output_path}')

if __name__ == '__main__':
    main()
