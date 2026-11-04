import * as THREE from "three";

export const SUN_DIR = new THREE.Vector3(0.52, 0.62, 0.34).normalize();
export const HORIZON = new THREE.Color().setRGB(0.5, 0.7, 0.95);

const vert = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const frag = /* glsl */ `
precision highp float;
uniform vec3 uSun;
varying vec3 vDir;
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for(int i=0;i<6;i++){ s += a*noise(p); p = p*2.03 + vec2(17.1, 9.2); a *= 0.5; }
  return s;
}
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 zen = vec3(0.02, 0.11, 0.50);
  vec3 mid = vec3(0.10, 0.36, 0.90);
  vec3 hor = vec3(0.50, 0.70, 0.95);
  vec3 col = mix(hor, mid, smoothstep(0.0, 0.28, h));
  col = mix(col, zen, smoothstep(0.22, 0.95, h));
  col = mix(col, hor * 0.95, smoothstep(0.0, -0.12, h));

  float sd = max(dot(d, uSun), 0.0);
  col += vec3(1.0, 0.85, 0.6) * pow(sd, 6.0) * 0.10;
  col += vec3(1.0, 0.88, 0.7) * pow(sd, 48.0) * 0.45;
  col += vec3(1.0, 0.94, 0.85) * smoothstep(0.99935, 0.9998, sd) * 14.0;

  if(h > 0.0){
    vec2 uv = d.xz / (h + 0.18);
    float c1 = fbm(uv * 0.55 + vec2(3.0, 1.0));
    float c2 = fbm(uv * 1.9 + vec2(8.0, 2.0));
    float dens = c1 * 0.78 + c2 * 0.32;
    float cov = smoothstep(0.66, 0.95, dens);
    float c1s = fbm(uv * 0.55 + vec2(3.0, 1.0) + uSun.xz * 0.12);
    float shade = clamp(0.5 + (c1 - c1s) * 5.0, 0.0, 1.0);
    vec3 cloudCol = mix(vec3(0.62, 0.74, 0.95), vec3(1.05, 1.03, 1.0), shade);
    cloudCol = mix(cloudCol, vec3(1.3, 1.2, 1.05), pow(sd, 4.0) * 0.5);
    cov *= smoothstep(0.0, 0.10, h);
    col = mix(col, cloudCol, cov * 0.85);
  }

  // far snow mountains
  vec2 q = normalize(d.xz + 1e-5) * 3.0;
  float rh = 0.03 + 0.07 * fbm(q + 4.0) + 0.025 * noise(q * 6.0 + 1.0);
  float m = smoothstep(rh, rh - 0.003, h) * step(-0.03, h);
  float t = smoothstep(rh * 0.2, rh * 0.95, h);
  float rock = noise(vec2(atan(d.z, d.x) * 40.0, h * 90.0));
  vec3 mc = mix(vec3(0.42, 0.52, 0.72), vec3(1.0, 1.02, 1.06), clamp(t * 1.2 + (rock - 0.5) * 0.25, 0.0, 1.0));
  mc = mix(mc, hor, 0.30 + (1.0 - t) * 0.15);
  col = mix(col, mc, m);
  col = mix(col, hor * 0.95, smoothstep(0.0, -0.03, h) * step(h, 0.0));

  gl_FragColor = vec4(col, 1.0);
}`;

export function createSkyEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene): THREE.Texture {
  const skyScene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: { uSun: { value: SUN_DIR.clone() } },
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
  mat.toneMapped = false;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(100, 48, 32), mat);
  skyScene.add(dome);

  const rt = new THREE.WebGLCubeRenderTarget(1536, {
    type: THREE.HalfFloatType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  const cam = new THREE.CubeCamera(0.1, 1000, rt);
  cam.update(renderer, skyScene);

  scene.background = rt.texture;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromCubemap(rt.texture);
  scene.environment = env.texture;
  scene.environmentIntensity = 1.0;
  pmrem.dispose();

  dome.geometry.dispose();
  mat.dispose();
  return env.texture;
}

const caveFrag = /* glsl */ `
precision highp float;
varying vec3 vDir;
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
}
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  // deep violet-teal cavern gradient
  vec3 top = vec3(0.10, 0.30, 0.46);
  vec3 mid = vec3(0.07, 0.10, 0.24);
  vec3 low = vec3(0.34, 0.08, 0.30);
  vec3 col = mix(mid, top, smoothstep(0.0, 0.9, h));
  col = mix(col, low, smoothstep(0.0, -0.9, h));
  // inner sun high above
  float sd = max(dot(d, normalize(vec3(0.15, 1.0, 0.1))), 0.0);
  col += vec3(1.0, 0.82, 0.55) * pow(sd, 18.0) * 2.2;
  col += vec3(1.0, 0.9, 0.7) * pow(sd, 90.0) * 5.0;
  // aurora curtains
  float a = noise(vec2(atan(d.z, d.x) * 3.0, h * 6.0));
  col += vec3(0.1, 0.9, 0.8) * smoothstep(0.55, 0.9, a) * smoothstep(0.1, 0.6, h) * 0.35;
  float b = noise(vec2(atan(d.z, d.x) * 2.0 + 9.0, h * 5.0));
  col += vec3(0.9, 0.2, 0.9) * smoothstep(0.6, 0.95, b) * smoothstep(0.0, -0.5, h) * 0.35;
  gl_FragColor = vec4(col * 1.1, 1.0);
}`;

export function createCaveEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const skyScene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: caveFrag,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
  mat.toneMapped = false;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 24), mat);
  skyScene.add(dome);
  const rt = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
  const cam = new THREE.CubeCamera(0.1, 1000, rt);
  cam.update(renderer, skyScene);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromCubemap(rt.texture);
  pmrem.dispose();
  rt.dispose();
  dome.geometry.dispose();
  mat.dispose();
  return env.texture;
}
