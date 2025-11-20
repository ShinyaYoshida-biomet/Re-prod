#!/usr/bin/env python3
"""
Generate Re-prod app icons with proper sizing
Icon should have 70% content with 15% margins on each side
"""

from PIL import Image, ImageDraw
import os

def create_icon(size):
    """Create a single icon with gradient background and centered circle

    Following macOS Big Sur guidelines:
    - For 1024x1024: 824x824 artwork with 100px transparent padding
    - Maintains 80.47% ratio for all sizes
    """
    # Create image with transparency
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))

    # Calculate artwork size with padding (macOS Big Sur guidelines)
    # 1024 → 824 (80.47% of canvas, 100px padding on each side)
    artwork_ratio = 824 / 1024  # ~0.8047
    artwork_size = int(size * artwork_ratio)
    padding = (size - artwork_size) // 2

    # Create rounded square background with gradient effect
    # Blue to teal gradient
    gradient = Image.new('RGBA', (artwork_size, artwork_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(gradient)

    for y in range(artwork_size):
        # Calculate gradient color (blue to teal)
        ratio = y / artwork_size
        r = int(33 + (64 - 33) * ratio)    # 33 -> 64
        g = int(114 + (172 - 114) * ratio)  # 114 -> 172
        b = int(184 + (167 - 184) * ratio)  # 184 -> 167

        # Draw horizontal line for gradient
        draw.line([(0, y), (artwork_size, y)], fill=(r, g, b, 255))

    # Apply rounded corners to the artwork
    corner_radius = int(artwork_size * 0.225)  # macOS standard: ~22.5%
    mask = Image.new('L', (artwork_size, artwork_size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([(0, 0), (artwork_size, artwork_size)], corner_radius, fill=255)

    # Apply mask to gradient
    gradient.putalpha(mask)

    # Draw white circle at center with proper sizing (70% of artwork)
    circle_size = int(artwork_size * 0.70)  # 70% of artwork size
    circle_pos = (artwork_size - circle_size) // 2

    draw = ImageDraw.Draw(gradient)
    draw.ellipse(
        [(circle_pos, circle_pos), (circle_pos + circle_size, circle_pos + circle_size)],
        fill=(255, 255, 255, 255)
    )

    # Paste artwork onto transparent canvas with padding
    img.paste(gradient, (padding, padding), gradient)

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
