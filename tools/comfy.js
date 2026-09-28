// ---------------------------------------------------------------
// tools/comfy.js : このパソコンの ComfyUI に画像を1枚（または数枚）作らせて、保存する
//
//   使い方（node は "C:\Program Files\nodejs\node.exe"）：
//     node tools/comfy.js --prompt "..." --out scratch/room_day.png [--w 688 --h 1504 --seed 1 --n 1 --steps 4]
//     --n 2 以上なら、種を1ずつずらして out の名前に _1, _2 … を付けて保存する
//     --check だけ付けると、ComfyUI が応答するか・モデルが見えるかを確かめて終わる
//
//   しくみ：ComfyUI の API（既定 http://127.0.0.1:8000）に「生成の手順（ワークフロー）」を送り、
//           /history で終わるのを待って、/view から画像を受け取る。すべてこのパソコンの中で済む
//   モデル：FLUX.1 [schnell] の fp8・1ファイル版（C:\models\checkpoints\flux1-schnell-fp8.safetensors）。
//           利用条件は Apache 2.0（商用可）。schnell は 4段階・cfg 1・否定の言葉なしで描く
//
//   **作った画像をゲームに入れるときは、必ずユーザーに見せて選んでもらう**（CLAUDE.md「画像を足すときは必ずユーザーに聞く」）
// ---------------------------------------------------------------
'use strict';
const fs = require('fs');
const path = require('path');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes('--' + k);
const HOST = arg('host', 'http://127.0.0.1:8000');
const CKPT = arg('ckpt', 'flux1-schnell-fp8.safetensors');

async function j(url, opt) {
  const r = await fetch(HOST + url, opt);
  if (!r.ok) throw new Error(url + ' → ' + r.status + ' ' + (await r.text()).slice(0, 300));
  return r.json();
}

// 元の画像から描き直す（img2img）：元の構図を保ったまま、光や時間帯だけを変えたいとき。denoise が小さいほど元に近い
function workflowFrom(prompt, imgName, seed, steps, denoise, prefix) {
  return {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: CKPT } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['1', 1] } },
    '3': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['2', 0] } },
    '8': { class_type: 'LoadImage', inputs: { image: imgName } },
    '9': { class_type: 'VAEEncode', inputs: { pixels: ['8', 0], vae: ['1', 2] } },
    '5': { class_type: 'KSampler', inputs: { model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['9', 0],
      seed, steps, cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise } },
    '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
    '7': { class_type: 'SaveImage', inputs: { images: ['6', 0], filename_prefix: prefix } },
  };
}

// ComfyUI の input へ画像を送る（img2img の元）
async function upload(file) {
  const fd = new FormData();
  fd.append('image', new Blob([fs.readFileSync(file)]), path.basename(file));
  fd.append('overwrite', 'true');
  const r = await fetch(HOST + '/upload/image', { method: 'POST', body: fd });
  if (!r.ok) throw new Error('upload → ' + r.status);
  return (await r.json()).name;
}

function workflow(prompt, w, h, seed, steps, prefix) {
  return {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: CKPT } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['1', 1] } },
    '3': { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['2', 0] } },   // schnell は否定の言葉を使わない
    '4': { class_type: 'EmptySD3LatentImage', inputs: { width: w, height: h, batch_size: 1 } },
    '5': { class_type: 'KSampler', inputs: { model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0],
      seed, steps, cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1 } },
    '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
    '7': { class_type: 'SaveImage', inputs: { images: ['6', 0], filename_prefix: prefix } },
  };
}

async function generate(prompt, w, h, seed, steps, out, from) {
  const t0 = Date.now();
  const wf = from ? workflowFrom(prompt, from.name, seed, steps, from.denoise, 'inkuriment/gen') : workflow(prompt, w, h, seed, steps, 'inkuriment/gen');
  const { prompt_id } = await j('/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: wf, client_id: 'inkuriment-tools' }) });
  for (;;) {
    await new Promise(r => setTimeout(r, 1500));
    const hist = await j('/history/' + prompt_id);
    const h1 = hist[prompt_id];
    if (!h1) continue;
    if (h1.status && h1.status.status_str === 'error') throw new Error('生成に失敗: ' + JSON.stringify(h1.status.messages).slice(0, 500));
    const imgs = Object.values(h1.outputs || {}).flatMap(o => o.images || []);
    if (!imgs.length) continue;
    const im = imgs[0];
    const r = await fetch(HOST + '/view?' + new URLSearchParams({ filename: im.filename, subfolder: im.subfolder || '', type: im.type || 'output' }));
    const buf = Buffer.from(await r.arrayBuffer());
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, buf);
    return { out, bytes: buf.length, sec: ((Date.now() - t0) / 1000).toFixed(1) };
  }
}

(async () => {
  if (has('check')) {
    const s = await j('/system_stats');
    const info = await j('/object_info/CheckpointLoaderSimple');
    const list = info.CheckpointLoaderSimple.input.required.ckpt_name[0];
    console.log(JSON.stringify({ comfyui: s.system.comfyui_version, gpu: (s.devices || []).map(d => d.name + ' ' + Math.round(d.vram_total / 1073741824) + 'GB'), checkpoints: list }, null, 1));
    return;
  }
  const prompt = arg('prompt');
  if (!prompt) { console.error('--prompt が要る'); process.exit(1); }
  const w = +arg('w', 1024), h = +arg('h', 1024), seed = +arg('seed', 1), n = +arg('n', 1), steps = +arg('steps', 4);
  const out = arg('out', 'gen.png');
  // --from 元の画像 --denoise 0.6：元の構図を保って描き直す（img2img）
  const from = arg('from') ? { name: await upload(arg('from')), denoise: +arg('denoise', 0.6) } : null;
  for (let i = 0; i < n; i++) {
    const o = n > 1 ? out.replace(/(\.\w+)$/, '_' + (i + 1) + '$1') : out;
    const r = await generate(prompt, w, h, seed + i, steps, o, from);
    console.log('保存: ' + r.out + '（' + Math.round(r.bytes / 1024) + 'KB・' + r.sec + '秒）');
  }
})().catch(e => { console.error('失敗: ' + e.message); process.exit(1); });
