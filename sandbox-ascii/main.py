"""ASCII Art Animation - Main entry point."""

import time
from renderer import Screen
from effects import (
    render_bouncing_box,
    render_sliding_text,
    render_blinking_circle,
    render_wave_line,
)


def run_animation(frames: int = 100, fps: int = 10):
    """Run the animation loop for specified number of frames."""
    screen = Screen(width=40, height=15)
    frame_delay = 1.0 / fps

    print("Starting ASCII Animation...")
    print("Press Ctrl+C to stop\n")
    time.sleep(1)

    try:
        for frame in range(frames):
            # Clear screen for new frame
            screen.clear()

            # Render all animated elements
            render_bouncing_box(screen, frame)
            render_sliding_text(screen, frame, text="CODEFLOW")
            render_blinking_circle(screen, frame)
            render_wave_line(screen, frame)

            # Display the frame
            screen.display()

            # Show frame counter
            print(f"Frame: {frame + 1}/{frames}")

            # Wait for next frame
            time.sleep(frame_delay)

    except KeyboardInterrupt:
        print("\nAnimation stopped by user.")

    print("\nAnimation complete!")


def main():
    """Entry point for the animation."""
    run_animation(frames=60, fps=8)


if __name__ == "__main__":
    main()
