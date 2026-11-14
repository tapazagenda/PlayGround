/* DEADZONE — renderizador, pós-processamento e ambiente */
import * as THREE from '../assets/vendor/three.module.js';
import { EffectComposer } from '../assets/vendor/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../assets/vendor/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../assets/vendor/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from '../assets/vendor/addons/postprocessing/ShaderPass.js';
import { OutputPass } from '../assets/vendor/addons/postprocessing/OutputPass.js';
import { setAniso } from './textures.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    vignette: { value: 0.55 },
    desat: { value: 0.28 },
    grain: { value: 0.016 },
    damage: { value: 0 },
    lowhp: { value: 0 },
    resolution: { value: new THREE.Vector2(1, 1) }
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, vignette, desat, grain, damage, lowhp;
    uniform vec2 resolution; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      // aberração cromática sutil nas bordas
      float d = distance(uv, vec2(0.5));
      vec2 dir = normalize(uv - vec2(0.5) + 1e-5);
      float ca = d * d * 0.004 + damage * 0.004;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + dir * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - dir * ca).b;
      // dessaturação fria
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      vec3 cold = mix(vec3(lum), col, 1.0 - desat) * vec3(0.94, 1.0, 1.06);
      cold = pow(max(cold, 0.0), vec3(1.0, 1.02, 1.04));
      col = mix(col, cold, 0.85);
      // contraste e tint
      col = (col - 0.5) * 1.1 + 0.5;
      col += vec3(0.008, 0.014, 0.02);
      // vinheta
      float vig = smoothstep(1.25, 0.35, d * 1.35);
      col *= mix(1.0, vig, vignette);
      // dano / vida baixa
      col = mix(col, vec3(0.42, 0.03, 0.02), damage * 0.5 * (1.0 - vig * 0.45));
      float pulse = 0.5 + 0.5 * sin(time * 6.0);
      col = mix(col, vec3(0.35, 0.0, 0.0), lowhp * (0.12 + pulse * 0.16) * (1.0 - vig * 0.4));
      // grão de filme
      float g = hash(uv * resolution + time * 60.0);
      col += (g - 0.5) * grain;
      // leve scanline
      col *= 1.0 - 0.025 * step(0.5, fract(uv.y * resolution.y * 0.5));
      gl_FragColor = vec4(col, 1.0);
    }`
};

export class Renderer {
  constructor(canvas, game) {
    this.game = game;
    this.canvas = canvas;
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    const lowSpec = game.settings.lowSpec;
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, powerPreference: 'high-performance',
      alpha: false, stencil: false, depth: true
    });
    const dpr = Math.min(window.devicePixelRatio || 1, lowSpec ? 1 : isMobile ? 1.35 : 1.75);
    this.renderer.setPixelRatio(dpr);
    this.renderer.shadowMap.enabled = !lowSpec;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.30;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    setAniso(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(game.settings.fov, 16 / 9, 0.06, 340);
    this.camera.rotation.order = 'YXZ';

    this.composer = null;
    this.bloom = null;
    this.grade = null;
    this.useComposer = !lowSpec;
    this._initComposer();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    if (window.visualViewport) window.visualViewport.addEventListener('resize', () => this.resize());
    document.addEventListener('fullscreenchange', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
  }

  _initComposer() {
    try {
      const size = this.renderer.getSize(new THREE.Vector2());
      const pr = this.renderer.getPixelRatio();
      const rt = new THREE.WebGLRenderTarget(Math.max(2, size.x * pr), Math.max(2, size.y * pr), {
        type: THREE.HalfFloatType, samples: 2
      });
      this.composer = new EffectComposer(this.renderer, rt);
      this.composer.setPixelRatio(pr);
      this.composer.setSize(size.x, size.y);
      this.renderPass = new RenderPass(this.scene, this.camera);
      this.composer.addPass(this.renderPass);
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.3, 0.7, 0.92);
      this.composer.addPass(this.bloom);
      this.grade = new ShaderPass(GradeShader);
      this.composer.addPass(this.grade);
      this.composer.addPass(new OutputPass());
    } catch (e) {
      console.warn('Pós-processamento indisponível, usando renderização direta.', e);
      this.composer = null;
      this.useComposer = false;
    }
  }

  setQuality(low) {
    this.renderer.shadowMap.enabled = !low;
    this.useComposer = !low;
    this.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setSize(w, h);
      if (this.bloom) this.bloom.setSize(w, h);
      if (this.grade) this.grade.uniforms.resolution.value.set(w, h);
    }
  }

  setDamage(v) { if (this.grade) this.grade.uniforms.damage.value = v; }
  setLowHP(v) { if (this.grade) this.grade.uniforms.lowhp.value = v; }

  render(dt, time) {
    if (this.grade) {
      this.grade.uniforms.time.value = time;
      this.grade.uniforms.damage.value = this.game.fx ? this.game.fx.damageVignette : 0;
      const p = this.game.player;
      this.grade.uniforms.lowhp.value = p ? (p.dead ? 1 : Math.max(0, 1 - p.health / 45)) : 0;
    }
    if (this.useComposer && this.composer) {
      this.composer.render(dt);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
