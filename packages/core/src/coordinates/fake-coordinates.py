import random

def random_coord(x_range=(0, 500), y_range=(0, 500)):
    """Generate a random (x, y) coordinate within given ranges."""
    x = random.uniform(*x_range)
    y = random.uniform(*y_range)
    return round(x, 2), round(y, 2)


def random_svg_path(num_segments=1, seed=None, allow_close=True):
    """
    Generate a random SVG path string.
    Includes M (move), L (line), Q (quadratic), and C (cubic) segments.
    Each segment starts from the previous segment's end point.
    """
    if seed is not None:
        random.seed(seed)

    # Start point
    current = random_coord()
    d = [f"M{current[0]},{current[1]}"]

    for _ in range(num_segments):
        segment_type = random.choice(["L", "Q", "C"])
        segment_count = random.randint(1, 3)  # 1–3 consecutive of the same type

        for _ in range(segment_count):
            if segment_type == "L":
                # Line to
                x, y = random_coord()
                d.append(f"L{x},{y}")
                current = (x, y)

            elif segment_type == "Q":
                # Quadratic Bézier
                cx, cy = random_coord()
                x, y = random_coord()
                d.append(f"Q{cx},{cy} {x},{y}")
                current = (x, y)

            elif segment_type == "C":
                # Cubic Bézier
                c1x, c1y = random_coord()
                c2x, c2y = random_coord()
                x, y = random_coord()
                d.append(f"C{c1x},{c1y} {c2x},{c2y} {x},{y}")
                current = (x, y)

    if allow_close and random.random() < 0.3:
        d.append("Z")

    return " ".join(d)


def write_svg(paths, filename="random_paths.svg", size=(500, 500)):
    """Write a list of SVG path strings into an SVG file."""
    with open(filename, "w") as f:
        f.write(f'<svg xmlns="http://www.w3.org/2000/svg" width="{size[0]}" height="{size[1]}">\n')
        for d in paths:
            stroke = random.choice(["black", "red", "blue", "green"])
            f.write(f'  <path d="{d}" stroke="{stroke}" fill="none" stroke-width="2"/>\n')
        f.write("</svg>\n")


if __name__ == "__main__":
    # Generate multiple random paths
    paths = [random_svg_path(num_segments=random.randint(2, 5), seed=i) for i in range(200)]
    with open("fake-paths.txt", "w") as f:
        for path in paths:
            f.write(f"{path}\n")
