// Renders build/icon.png, the single source electron-builder converts into .icns
// and .ico. Shapes are signed distance fields so edges stay smooth without
// pulling in an image library. Run with: npm run icon
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const SIZE = 1024
const BODY_INSET = 92
const BODY_RADIUS = 200
const NODE_RADIUS = 74
const EDGE_RADIUS = 15
const CLUSTER_RADIUS = 230

const BG_TOP = [23, 26, 36]
const BG_BOTTOM = [11, 12, 17]
const ACCENT = [255, 46, 138]
const ACCENT_2 = [192, 132, 252]

const mix = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

// Coverage of a pixel whose centre sits `d` pixels from the shape's edge.
const coverage = (d) => clamp(0.5 - d, 0, 1)

function sdRoundedRect(px, py, cx, cy, halfW, halfH, r) {
  const qx = Math.abs(px - cx) - halfW + r
  const qy = Math.abs(py - cy) - halfH + r
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
  return outside + Math.min(Math.max(qx, qy), 0) - r
}

function sdCapsule(px, py, ax, ay, bx, by, r) {
  const pax = px - ax
  const pay = py - ay
  const bax = bx - ax
  const bay = by - ay
  const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1)
  return Math.hypot(pax - bax * h, pay - bay * h) - r
}

const nodes = [-90, 30, 150].map((deg) => {
  const rad = (deg * Math.PI) / 180
  return [SIZE / 2 + CLUSTER_RADIUS * Math.cos(rad), SIZE / 2 + CLUSTER_RADIUS * Math.sin(rad)]
})

const edges = [
  [nodes[0], nodes[1]],
  [nodes[1], nodes[2]],
  [nodes[2], nodes[0]],
]

function glyphDistance(x, y) {
  let d = Infinity
  for (const [a, b] of edges) d = Math.min(d, sdCapsule(x, y, a[0], a[1], b[0], b[1], EDGE_RADIUS))
  for (const [cx, cy] of nodes) d = Math.min(d, Math.hypot(x - cx, y - cy) - NODE_RADIUS)
  return d
}

// Diagonal ramp used to tint the cluster, normalised across the glyph's extent.
function glyphTint(x, y) {
  const span = CLUSTER_RADIUS * 2
  const t = ((x - SIZE / 2) - (y - SIZE / 2)) / (span * 1.4) + 0.5
  return mix(ACCENT, ACCENT_2, clamp(t, 0, 1))
}

function render() {
  const rgba = Buffer.alloc(SIZE * SIZE * 4)
  const half = SIZE / 2 - BODY_INSET

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const px = x + 0.5
      const py = y + 0.5

      // Premultiplied accumulator so each layer composites with a plain lerp.
      let r = 0
      let g = 0
      let b = 0
      let a = 0

      const put = (rgb, alpha) => {
        if (alpha <= 0) return
        const k = 1 - alpha
        r = rgb[0] * alpha + r * k
        g = rgb[1] * alpha + g * k
        b = rgb[2] * alpha + b * k
        a = alpha + a * k
      }

      const bodyCoverage = coverage(sdRoundedRect(px, py, SIZE / 2, SIZE / 2, half, half, BODY_RADIUS))
      if (bodyCoverage > 0) {
        const base = mix(BG_TOP, BG_BOTTOM, py / SIZE)
        // Same off-centre accent bloom the app window uses behind its header.
        const glow = clamp(1 - Math.hypot(px - SIZE * 0.28, py - SIZE * 0.16) / 640, 0, 1)
        put(mix(base, ACCENT, glow * glow * 0.22), bodyCoverage)

        const ringDistance = Math.abs(
          sdRoundedRect(px, py, SIZE / 2, SIZE / 2, half - 5, half - 5, BODY_RADIUS - 5),
        ) - 2.5
        put([255, 255, 255], coverage(ringDistance) * 0.09 * bodyCoverage)
      }

      put(glyphTint(px, py), coverage(glyphDistance(px, py)))

      const i = (y * SIZE + x) * 4
      if (a > 0) {
        rgba[i] = clamp(Math.round(r / a), 0, 255)
        rgba[i + 1] = clamp(Math.round(g / a), 0, 255)
        rgba[i + 2] = clamp(Math.round(b / a), 0, 255)
        rgba[i + 3] = Math.round(a * 255)
      }
    }
  }
  return rgba
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(zlib.crc32(body) >>> 0)
  return Buffer.concat([length, body, crc])
}

function encodePng(rgba) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(SIZE, 0)
  header.writeUInt32BE(SIZE, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // truecolour with alpha
  const stride = SIZE * 4
  const raw = Buffer.alloc((stride + 1) * SIZE)
  for (let y = 0; y < SIZE; y++) {
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const out = path.join(__dirname, '..', 'build', 'icon.png')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, encodePng(render()))
console.log(`wrote ${path.relative(process.cwd(), out)} (${SIZE}x${SIZE})`)
