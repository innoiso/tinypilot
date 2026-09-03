#!/usr/bin/env python3
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
CARDS = ROOT / 'cards'
CARDS.mkdir(exist_ok=True)
WIDTH, HEIGHT = 1920, 1080
BACKGROUND, WHITE = '#07152f', '#ffffff'
PALE, ACCENT, MUTED = '#d9e6ff', '#66d9ef', '#9fb0ca'
FONT_PATH = '/System/Library/Fonts/SFCompact.ttf'


def font(size):
    return ImageFont.truetype(FONT_PATH, size)


def centered(draw, text, y, size, fill):
    box = draw.textbbox((0, 0), text, font=font(size))
    draw.text(((WIDTH - (box[2] - box[0])) / 2, y), text, font=font(size), fill=fill)


def save_title():
    image = Image.new('RGB', (WIDTH, HEIGHT), BACKGROUND)
    draw = ImageDraw.Draw(image)
    draw.rectangle((118, 170, 130, 680), fill=ACCENT)
    draw.text((180, 205), 'TinyPilot WebMCP', font=font(90), fill=WHITE)
    draw.text((184, 340), 'A person and an AI agent share one physical computer console', font=font(42), fill=PALE)
    draw.text((184, 445), '75 browser-native tools  •  TinyPilot Pro 3.0.2', font=font(34), fill=ACCENT)
    draw.text((184, 610), 'Physical hardware demonstration', font=font(24), fill=MUTED)
    image.save(CARDS / 'title.png')


def save_end():
    image = Image.new('RGB', (WIDTH, HEIGHT), BACKGROUND)
    draw = ImageDraw.Draw(image)
    centered(draw, 'TinyPilot WebMCP', 330, 84, WHITE)
    centered(draw, 'Source  •  tests  •  capability map  •  deployment instructions', 485, 38, PALE)
    centered(draw, 'Links in the challenge submission', 580, 30, ACCENT)
    image.save(CARDS / 'end.png')


def save_bottom(name, text):
    image = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 930, WIDTH, HEIGHT), fill=(7, 21, 47, 220))
    draw.text((70, 973), text, font=font(38), fill=WHITE)
    image.save(CARDS / f'{name}.png')


def save_label(name, text, y=46, size=30, color=(7, 21, 47, 220)):
    image = Image.new('RGBA', (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    text_font = font(size)
    box = draw.textbbox((0, 0), text, font=text_font)
    left, top = 44, y - 14
    right = left + (box[2] - box[0]) + 28
    bottom = y + (box[3] - box[1]) + 18
    draw.rounded_rectangle((left, top, right, bottom), radius=10, fill=color)
    draw.text((58, y), text, font=text_font, fill=WHITE)
    image.save(CARDS / f'{name}.png')


save_title()
save_end()
save_bottom('phone-wide', 'Physical hardware proof  •  TinyPilot appliance and connected target')
save_bottom('phone-close', 'The target display changes through TinyPilot')
save_bottom('dashboard', 'Normal TinyPilot dashboard  •  tools register when the page loads')
save_label('run-live', 'LIVE WebMCP RUN  •  1.35x playback', size=28)
save_label('run-common-sunflower', 'COMMON SUNFLOWER', y=126, size=34, color=(23, 107, 135, 230))
save_label('run-sunflower-album', 'SUNFLOWER — THE BEACH BOYS ALBUM', y=126, size=34, color=(23, 107, 135, 230))
save_label('run-beach-boys', 'THE BEACH BOYS', y=126, size=34, color=(23, 107, 135, 230))
save_label('run-full-house', 'FULL HOUSE', y=126, size=34, color=(23, 107, 135, 230))
save_label('run-family-matters', 'FAMILY MATTERS', y=126, size=34, color=(23, 107, 135, 230))
save_label('result', 'GOAL REACHED  •  FAMILY MATTERS', size=36, color=(23, 107, 135, 230))
