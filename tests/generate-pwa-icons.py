"""Render the existing navbar eye mark with Pillow; no downloaded assets."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]

def make_icon(size, scale=0.8):
    factor = 4
    image = Image.new("RGB", (size * factor, size * factor), "#009BCB")
    draw = ImageDraw.Draw(image)
    unit = size * factor * scale / 32
    offset = size * factor * (1 - scale) / 2
    def point(x, y):
        return (offset + x * unit, offset + y * unit)
    # The same four cubic curves used by index.html's .brand__mark.
    # SVG 's' reflected controls: first and third begin at their start point.
    curves = [((3.5,16),(3.5,16),(8.2,8.5),(16,8.5)),
              ((16,8.5),(23.8,8.5),(28.5,16),(28.5,16)),
              ((28.5,16),(28.5,16),(23.8,23.5),(16,23.5)),
              ((16,23.5),(8.2,23.5),(3.5,16),(3.5,16))]
    points = []
    for p0,p1,p2,p3 in curves:
        for i in range(41):
            t=i/40
            points.append(point(*[(1-t)**3*p0[j]+3*(1-t)**2*t*p1[j]+3*(1-t)*t*t*p2[j]+t**3*p3[j] for j in (0,1)]))
    width = max(1, round(unit * 1.5))
    draw.line(points, fill="white", width=width, joint="curve")
    for x, y in points:
        draw.ellipse((x-width/2,y-width/2,x+width/2,y+width/2),fill="white")
    draw.ellipse((*point(11.75,11.75), *point(20.25,20.25)), outline="white", width=width)
    draw.line([point(16,11.75),point(16,20.25)], fill="white", width=width)
    draw.line([point(11.75,16),point(20.25,16)], fill="white", width=width)
    return image.resize((size,size), Image.Resampling.LANCZOS)

if __name__ == "__main__":
    destination = ROOT / "assets/icons"
    destination.mkdir(parents=True, exist_ok=True)
    for name, size, scale in [("icon-192.png",192,.8),("icon-512.png",512,.8),
                              ("icon-maskable-512.png",512,.72),("apple-touch-icon.png",180,.8)]:
        make_icon(size, scale).save(destination / name)
