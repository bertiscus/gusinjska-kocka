// ===== Gusinjska kocka — tiny WebGL renderer (no libraries, works offline) =====

// ---------- math ----------
export const q = {
  ident: () => [0, 0, 0, 1],
  axis(ax, a) { const s = Math.sin(a / 2); return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(a / 2)]; },
  mul(a, b) {
    return [
      a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
      a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
      a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
      a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
    ];
  },
  conj: (a) => [-a[0], -a[1], -a[2], a[3]],
  norm(a) { const l = Math.hypot(a[0], a[1], a[2], a[3]) || 1; return [a[0] / l, a[1] / l, a[2] / l, a[3] / l]; },
  rot(a, v) {
    const [x, y, z, w] = a;
    const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
    return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
  },
  fromTo(a, b) {
    const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    if (d < -0.999999) {
      let ax = [0, -a[2], a[1]]; if (Math.hypot(...ax) < 1e-6) ax = [-a[2], 0, a[0]];
      const l = Math.hypot(...ax); return q.axis([ax[0] / l, ax[1] / l, ax[2] / l], Math.PI);
    }
    const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    return q.norm([c[0], c[1], c[2], 1 + d]);
  },
  slerp(a, b, t) {
    let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    let bb = b; if (d < 0) { d = -d; bb = [-b[0], -b[1], -b[2], -b[3]]; }
    if (d > 0.9995) return q.norm(a.map((x, i) => x + (bb[i] - x) * t));
    const th = Math.acos(d), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
    return a.map((x, i) => x * wa + bb[i] * wb);
  },
};

export const m4 = {
  ident: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  },
  perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  },
  lookAt(eye, t, up) {
    let z = [eye[0] - t[0], eye[1] - t[1], eye[2] - t[2]]; let l = Math.hypot(...z); z = z.map((x) => x / l);
    let x = [up[1] * z[2] - up[2] * z[1], up[2] * z[0] - up[0] * z[2], up[0] * z[1] - up[1] * z[0]]; l = Math.hypot(...x); x = x.map((v) => v / l);
    const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    const d = (a) => a[0] * eye[0] + a[1] * eye[1] + a[2] * eye[2];
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -d(x), -d(y), -d(z), 1]);
  },
  // Rotation from quaternion, then uniform scale, then translation.
  fromQ(qq, p = [0, 0, 0], s = 1) {
    const [x, y, z, w] = qq;
    const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
    return new Float32Array([
      (1 - 2 * (yy + zz)) * s, 2 * (xy + wz) * s, 2 * (xz - wy) * s, 0,
      2 * (xy - wz) * s, (1 - 2 * (xx + zz)) * s, 2 * (yz + wx) * s, 0,
      2 * (xz + wy) * s, 2 * (yz - wx) * s, (1 - 2 * (xx + yy)) * s, 0,
      p[0], p[1], p[2], 1,
    ]);
  },
  // Columns X, Y, Z as basis, origin p.
  basis(X, Y, Z, p = [0, 0, 0], s = 1) {
    return new Float32Array([X[0] * s, X[1] * s, X[2] * s, 0, Y[0] * s, Y[1] * s, Y[2] * s, 0, Z[0] * s, Z[1] * s, Z[2] * s, 0, p[0], p[1], p[2], 1]);
  },
  apply(m, v) {
    const w = m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15];
    return [(m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12]) / w, (m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13]) / w, (m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]) / w];
  },
};
function normalMat(m) {
  // Upper-left 3×3 (rotation × uniform scale); the shader renormalises.
  return new Float32Array([m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]);
}

// ---------- colours ----------
export function hex(h, a = 1) { const n = parseInt(h.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255, a]; }
export function jitter(c, amt, rnd) {
  const k = 1 + (rnd() * 2 - 1) * amt, hue = (rnd() * 2 - 1) * amt * 0.35;
  return [Math.min(1, c[0] * k * (1 + hue)), Math.min(1, c[1] * k), Math.min(1, c[2] * k * (1 - hue)), c[3]];
}
export function shade(c, k) { return [c[0] * k, c[1] * k, c[2] * k, c[3]]; }
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// ---------- mesh builder ----------
// Geometry is written in a local frame (x right, y up, z forward) that maps into
// target space through setFrame(origin, X, Y, Z).
export class MeshBuilder {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.kind = []; this.idx = []; this.setFrame([0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]); }
  setFrame(o, X, Y, Z) { this.o = o; this.X = X; this.Y = Y; this.Z = Z; return this; }
  P(p) { const { o, X, Y, Z } = this; return [o[0] + p[0] * X[0] + p[1] * Y[0] + p[2] * Z[0], o[1] + p[0] * X[1] + p[1] * Y[1] + p[2] * Z[1], o[2] + p[0] * X[2] + p[1] * Y[2] + p[2] * Z[2]]; }
  Nv(n) { const { X, Y, Z } = this; const r = [n[0] * X[0] + n[1] * Y[0] + n[2] * Z[0], n[0] * X[1] + n[1] * Y[1] + n[2] * Z[1], n[0] * X[2] + n[1] * Y[2] + n[2] * Z[2]]; const l = Math.hypot(...r) || 1; return r.map((x) => x / l); }
  vert(p, n, c, k) { this.pos.push(...this.P(p)); this.nor.push(...this.Nv(n)); this.col.push(c[0], c[1], c[2], c[3] ?? 1); this.kind.push(k); return this.pos.length / 3 - 1; }
  get count() { return this.pos.length / 3; }
  // Flat polygon; normal from the points, flipped to point away from `inside` when given.
  poly(pts, c, k = 0, inside = null, cols = null) {
    let n = [0, 0, 0];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]);
    }
    const l = Math.hypot(...n) || 1; n = n.map((x) => x / l);
    if (inside) {
      const cen = pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length, s[2] + p[2] / pts.length], [0, 0, 0]);
      if ((cen[0] - inside[0]) * n[0] + (cen[1] - inside[1]) * n[1] + (cen[2] - inside[2]) * n[2] < 0) n = n.map((x) => -x);
    }
    const base = this.count;
    pts.forEach((p, i) => this.vert(p, n, cols ? cols[i] : c, k));
    for (let i = 1; i < pts.length - 1; i++) this.idx.push(base, base + i, base + i + 1);
    return this;
  }
  box(cx, cy, cz, hx, hy, hz, c, k = 0, bottom = false) {
    const x0 = cx - hx, x1 = cx + hx, y0 = cy - hy, y1 = cy + hy, z0 = cz - hz, z1 = cz + hz, ins = [cx, cy, cz];
    this.poly([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], c, k, ins);
    const side = shade(c, 1);
    this.poly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], side, k, ins);
    this.poly([[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]], side, k, ins);
    this.poly([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], side, k, ins);
    this.poly([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], side, k, ins);
    if (bottom) this.poly([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], c, k, ins);
    return this;
  }
  // Frustum / cone / prism around the y axis. r1 = 0 makes a cone.
  frustum(cx, cz, y0, y1, r0, r1, segs, c, k = 0, rot = 0, cap = true, capCol = null) {
    const ring = (r, y) => Array.from({ length: segs }, (_, i) => { const a = rot + i / segs * Math.PI * 2; return [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]; });
    const A = ring(r0, y0), B = ring(r1, y1), ins = [cx, (y0 + y1) / 2, cz];
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % segs;
      if (r1 > 1e-6) this.poly([A[i], A[j], B[j], B[i]], c, k, [cx, (y0 + y1) / 2, cz]);
      else this.poly([A[i], A[j], [cx, y1, cz]], c, k, [cx, y0, cz]);
    }
    if (cap && r1 > 1e-6) this.poly(B, capCol || c, k, ins);
    return this;
  }
  sphere(r, ws, hs, colorAt, k = 4) {
    const base = this.count;
    for (let y = 0; y <= hs; y++) {
      const th = y / hs * Math.PI;
      for (let x = 0; x <= ws; x++) {
        const ph = x / ws * Math.PI * 2;
        const n = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
        this.vert([n[0] * r, n[1] * r, n[2] * r], n, colorAt(n), k);
      }
    }
    for (let y = 0; y < hs; y++) for (let x = 0; x < ws; x++) {
      const a = base + y * (ws + 1) + x, b = a + ws + 1;
      this.idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    return this;
  }
  // Soft round blob (centre alpha a, rim 0) lying in the local xz plane.
  blob(r, a, segs = 20) {
    const base = this.vert([0, 0, 0], [0, 1, 0], [0, 0, 0, a], 3);
    for (let i = 0; i < segs; i++) { const t = i / segs * Math.PI * 2; this.vert([Math.cos(t) * r, 0, Math.sin(t) * r], [0, 1, 0], [0, 0, 0, 0], 3); }
    for (let i = 0; i < segs; i++) this.idx.push(base, base + 1 + i, base + 1 + (i + 1) % segs);
    return this;
  }
}

// ---------- GPU ----------
const VS = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec4 aCol; attribute float aKind; attribute vec2 aUV;
uniform mat4 uModel; uniform mat4 uVP; uniform mat3 uNM;
varying vec3 vN; varying vec4 vC; varying float vK; varying vec3 vW; varying vec2 vUV;
void main(){ vec4 w = uModel*vec4(aPos,1.0); vW = w.xyz; vN = uNM*aNor; vC = aCol; vK = aKind; vUV = aUV; gl_Position = uVP*w; }`;
const FS = `
precision mediump float;
varying vec3 vN; varying vec4 vC; varying float vK; varying vec3 vW; varying vec2 vUV;
uniform vec3 uSun; uniform vec3 uCam; uniform float uTime; uniform vec4 uTint; uniform float uAlpha; uniform float uGlow;
uniform sampler2D uTex; uniform float uUseTex;
void main(){
  if (uUseTex > 0.5) {
    // Photo-scanned buildings: the texture already holds real light, so shade gently.
    vec3 n = normalize(vN);
    vec3 base = texture2D(uTex, vUV).rgb;
    base = mix(base, uTint.rgb, uTint.a);
    float diff = max(dot(n, uSun), 0.0);
    vec3 col = base * (0.74 + 0.10*(0.5 + 0.5*n.y) + 0.26*diff);
    gl_FragColor = vec4(col, 1.0) * uAlpha;
    return;
  }
  float k = vK;
  if (k > 2.5 && k < 3.5) { gl_FragColor = vec4(0.04, 0.06, 0.03, 1.0) * (vC.a * uAlpha); return; }
  vec3 n = normalize(vN);
  vec3 base = vC.rgb;
  if (k > 0.5 && k < 1.5) {
    float s = sin(vW.x*2.3 + uTime*1.7) * sin(vW.z*2.1 - uTime*1.3 + vW.y*1.9);
    base = mix(base, vec3(0.80,0.96,1.0), 0.14 + 0.12*s);
  }
  base = mix(base, uTint.rgb, uTint.a);
  float hemi = 0.5 + 0.5*n.y;
  vec3 amb = mix(vec3(0.40,0.39,0.33), vec3(0.80,0.87,0.95), hemi) * 0.66;
  float diff = max(dot(n, uSun), 0.0);
  vec3 col = base * (amb + vec3(1.0,0.95,0.86)*diff*0.74);
  vec3 vd = normalize(uCam - vW);
  if ((k > 0.5 && k < 1.5) || k > 3.5) {
    vec3 h = normalize(uSun + vd);
    float sp = k > 3.5 ? pow(max(dot(n,h),0.0), 36.0)*0.45 : pow(max(dot(n,h),0.0), 70.0)*0.7;
    col += vec3(1.0,0.98,0.92)*sp;
  }
  if (k > 1.5 && k < 2.5) col += uTint.rgb * uGlow;
  float rim = pow(1.0 - max(dot(n, vd), 0.0), 3.0);
  col += vec3(0.75,0.85,0.95) * rim * 0.08;
  gl_FragColor = vec4(col, 1.0) * uAlpha;
}`;

export class Renderer {
  constructor(canvas) {
    const opts = { antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: false };
    let gl = canvas.getContext('webgl2', opts);
    this.gl2 = !!gl;
    if (!gl) gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
    if (!gl) throw new Error('WebGL not available');
    this.gl = gl;
    this.uint32 = this.gl2 || !!gl.getExtension('OES_element_index_uint');
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    this.prog = p;
    this.a = {}; for (const n of ['aPos', 'aNor', 'aCol', 'aKind', 'aUV']) this.a[n] = gl.getAttribLocation(p, n);
    this.u = {}; for (const n of ['uModel', 'uVP', 'uNM', 'uSun', 'uCam', 'uTime', 'uTint', 'uAlpha', 'uGlow', 'uTex', 'uUseTex']) this.u[n] = gl.getUniformLocation(p, n);
    gl.useProgram(p);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
  }
  upload(mb) {
    const gl = this.gl;
    if (mb.count > 65535 && !this.uint32) throw new Error('mesh too large');
    const mk = (data, target = gl.ARRAY_BUFFER) => { const b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, data, gl.STATIC_DRAW); return b; };
    const big = mb.count > 65535;
    return {
      pos: mk(new Float32Array(mb.pos)), nor: mk(new Float32Array(mb.nor)), col: mk(new Float32Array(mb.col)), kind: mk(new Float32Array(mb.kind)),
      idx: mk(big ? new Uint32Array(mb.idx) : new Uint16Array(mb.idx), gl.ELEMENT_ARRAY_BUFFER),
      n: mb.idx.length, type: big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
    };
  }
  // Scanned model: typed arrays straight from a model file.
  uploadModel(m) {
    const gl = this.gl;
    if (m.idx32 && !this.uint32) throw new Error('mesh too large');
    const mk = (data, target = gl.ARRAY_BUFFER) => { const b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, data, gl.STATIC_DRAW); return b; };
    return { pos: mk(m.pos), nor: mk(m.nor), uv: mk(m.uv), idx: mk(m.idx, gl.ELEMENT_ARRAY_BUFFER), n: m.idx.length, type: m.idx32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT };
  }
  texture(img) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const an = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
    if (an) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(4, gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    return t;
  }
  free(mesh) { if (!mesh) return; const gl = this.gl; for (const k of ['pos', 'nor', 'col', 'kind', 'uv', 'idx']) if (mesh[k]) gl.deleteBuffer(mesh[k]); }
  // Camera image behind the scene (AR). sx, sy: size of the image quad in clip space (1 = full screen).
  _initBg() {
    const gl = this.gl;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, 'attribute vec2 aP; uniform vec2 uS; varying vec2 vT; void main(){ vT = vec2(aP.x*0.5+0.5, 0.5-aP.y*0.5); gl_Position = vec4(aP*uS, 0.0, 1.0); }'));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, 'precision mediump float; varying vec2 vT; uniform sampler2D uTex; void main(){ gl_FragColor = vec4(texture2D(uTex, vT).rgb, 1.0); }'));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    this.bg = { prog: p, aP: gl.getAttribLocation(p, 'aP'), uS: gl.getUniformLocation(p, 'uS'), uTex: gl.getUniformLocation(p, 'uTex'),
      buf: gl.createBuffer(), tex: gl.createTexture(), version: -1 };
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bg.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.bindTexture(gl.TEXTURE_2D, this.bg.tex);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  }
  _drawBg(bg) {
    const gl = this.gl;
    if (!this.bg) this._initBg();
    const B = this.bg;
    gl.useProgram(B.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, B.tex);
    if (bg.version !== B.version) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, bg.source);
      B.version = bg.version;
    }
    for (let i = 0; i < 8; i++) gl.disableVertexAttribArray(i);
    gl.bindBuffer(gl.ARRAY_BUFFER, B.buf);
    gl.enableVertexAttribArray(B.aP);
    gl.vertexAttribPointer(B.aP, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(B.uS, bg.sx, bg.sy);
    gl.uniform1i(B.uTex, 0);
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(B.aP);
    gl.enable(gl.BLEND); gl.depthMask(true); gl.enable(gl.DEPTH_TEST);
    gl.useProgram(this.prog);
  }
  begin(w, h, vp, cam, sun, time, bg = null) {
    const gl = this.gl;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, bg ? 1 : 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (bg && bg.source && bg.source.width) this._drawBg(bg);
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.u.uVP, false, vp);
    gl.uniform3fv(this.u.uCam, cam);
    gl.uniform3fv(this.u.uSun, sun);
    gl.uniform1f(this.u.uTime, time % 1000);
  }
  draw(mesh, model, { tint = [0, 0, 0, 0], alpha = 1, glow = 0, depthTest = true, depthWrite = true, tex = null } = {}) {
    const gl = this.gl;
    gl.uniformMatrix4fv(this.u.uModel, false, model);
    gl.uniformMatrix3fv(this.u.uNM, false, normalMat(model));
    gl.uniform4fv(this.u.uTint, tint);
    gl.uniform1f(this.u.uAlpha, alpha);
    gl.uniform1f(this.u.uGlow, glow);
    if (depthTest) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST);
    gl.depthMask(depthWrite);
    const bind = (b, loc, size, constant) => {
      if (loc < 0) return;
      if (b) { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); }
      else { gl.disableVertexAttribArray(loc); gl['vertexAttrib' + constant.length + 'fv'](loc, constant); }
    };
    bind(mesh.pos, this.a.aPos, 3); bind(mesh.nor, this.a.aNor, 3);
    bind(mesh.col, this.a.aCol, 4, [1, 1, 1, 1]); bind(mesh.kind, this.a.aKind, 1, [5]); bind(mesh.uv, this.a.aUV, 2, [0, 0]);
    gl.uniform1f(this.u.uUseTex, tex ? 1 : 0);
    if (tex) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(this.u.uTex, 0); }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.idx);
    gl.drawElements(gl.TRIANGLES, mesh.n, mesh.type, 0);
    gl.depthMask(true);
  }
}
