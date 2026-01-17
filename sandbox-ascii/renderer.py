"""Screen renderer for ASCII art animations."""

import os
import sys


class Screen:
    """Manages a character buffer for rendering ASCII art."""

    def __init__(self, width: int = 40, height: int = 15):
        self.width = width
        self.height = height
        self.buffer = self._create_buffer()

    def _create_buffer(self) -> list[list[str]]:
        """Create empty screen buffer filled with spaces."""
        return [[' ' for _ in range(self.width)] for _ in range(self.height)]

    def clear(self):
        """Reset buffer to empty state."""
        self.buffer = self._create_buffer()

    def set_pixel(self, x: int, y: int, char: str):
        """Set a single character at position (x, y)."""
        if 0 <= x < self.width and 0 <= y < self.height:
            self.buffer[y][x] = char

    def get_pixel(self, x: int, y: int) -> str:
        """Get character at position (x, y)."""
        if 0 <= x < self.width and 0 <= y < self.height:
            return self.buffer[y][x]
        return ' '

    def render(self) -> str:
        """Convert buffer to displayable string."""
        lines = [''.join(row) for row in self.buffer]
        border = '+' + '-' * self.width + '+'
        framed = [border] + ['|' + line + '|' for line in lines] + [border]
        return '\n'.join(framed)

    def display(self):
        """Clear terminal and print current frame."""
        os.system('clear' if os.name != 'nt' else 'cls')
        print(self.render())
        sys.stdout.flush()
