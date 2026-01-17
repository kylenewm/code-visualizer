"""Shape drawing functions for ASCII art."""

from renderer import Screen


def draw_box(screen: Screen, x: int, y: int, width: int, height: int, char: str = '#'):
    """Draw a rectangular box outline."""
    # Top and bottom edges
    for i in range(width):
        screen.set_pixel(x + i, y, char)
        screen.set_pixel(x + i, y + height - 1, char)

    # Left and right edges
    for j in range(height):
        screen.set_pixel(x, y + j, char)
        screen.set_pixel(x + width - 1, y + j, char)


def draw_filled_box(screen: Screen, x: int, y: int, width: int, height: int, char: str = '#'):
    """Draw a filled rectangle."""
    for j in range(height):
        for i in range(width):
            screen.set_pixel(x + i, y + j, char)


def draw_line(screen: Screen, x1: int, y1: int, x2: int, y2: int, char: str = '*'):
    """Draw a line between two points using Bresenham's algorithm."""
    dx = abs(x2 - x1)
    dy = abs(y2 - y1)
    sx = 1 if x1 < x2 else -1
    sy = 1 if y1 < y2 else -1
    err = dx - dy

    while True:
        screen.set_pixel(x1, y1, char)
        if x1 == x2 and y1 == y2:
            break
        e2 = 2 * err
        if e2 > -dy:
            err -= dy
            x1 += sx
        if e2 < dx:
            err += dx
            y1 += sy


def draw_circle(screen: Screen, cx: int, cy: int, radius: int, char: str = 'o'):
    """Draw a circle using midpoint algorithm."""
    x = radius
    y = 0
    err = 0

    while x >= y:
        screen.set_pixel(cx + x, cy + y, char)
        screen.set_pixel(cx + y, cy + x, char)
        screen.set_pixel(cx - y, cy + x, char)
        screen.set_pixel(cx - x, cy + y, char)
        screen.set_pixel(cx - x, cy - y, char)
        screen.set_pixel(cx - y, cy - x, char)
        screen.set_pixel(cx + y, cy - x, char)
        screen.set_pixel(cx + x, cy - y, char)

        y += 1
        err += 1 + 2 * y
        if 2 * (err - x) + 1 > 0:
            x -= 1
            err += 1 - 2 * x


def draw_text(screen: Screen, x: int, y: int, text: str):
    """Draw text string at position."""
    for i, char in enumerate(text):
        screen.set_pixel(x + i, y, char)
