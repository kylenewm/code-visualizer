"""Animation effects for ASCII art."""

import math
from renderer import Screen
from shapes import draw_box, draw_circle, draw_text


def bounce_position(frame: int, amplitude: int, speed: float = 0.2) -> int:
    """Calculate bouncing position using sine wave."""
    return int(abs(math.sin(frame * speed)) * amplitude)


def slide_position(frame: int, start: int, end: int, duration: int) -> int:
    """Calculate linear slide position between start and end."""
    progress = min(frame / duration, 1.0)
    return int(start + (end - start) * progress)


def blink_visible(frame: int, on_frames: int = 5, off_frames: int = 5) -> bool:
    """Determine if element should be visible in blink cycle."""
    cycle = on_frames + off_frames
    return (frame % cycle) < on_frames


def wave_offset(x: int, frame: int, amplitude: int = 2, frequency: float = 0.3) -> int:
    """Calculate wave offset for creating wave effects."""
    return int(math.sin(x * frequency + frame * 0.2) * amplitude)


def render_bouncing_box(screen: Screen, frame: int):
    """Render a box that bounces up and down."""
    y_offset = bounce_position(frame, amplitude=8)
    draw_box(screen, x=5, y=2 + y_offset, width=10, height=5)


def render_sliding_text(screen: Screen, frame: int, text: str = "HELLO"):
    """Render text that slides across the screen."""
    x_pos = slide_position(frame, start=-len(text), end=screen.width, duration=60)
    draw_text(screen, x=x_pos, y=7, text=text)


def render_blinking_circle(screen: Screen, frame: int):
    """Render a circle that blinks on and off."""
    if blink_visible(frame, on_frames=8, off_frames=4):
        draw_circle(screen, cx=30, cy=7, radius=4, char='*')


def render_wave_line(screen: Screen, frame: int):
    """Render a horizontal line with wave effect."""
    for x in range(screen.width):
        y_offset = wave_offset(x, frame)
        screen.set_pixel(x, 12 + y_offset, '~')
