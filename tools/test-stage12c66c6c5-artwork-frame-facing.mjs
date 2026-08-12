import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'src', 'Gallery_V0_11.js'), 'utf8');
function expect(label, condition) {
  if (!condition) throw new Error(`Artwork frame facing invariant failed: ${label}`);
  console.log(`✓ ${label}`);
}
expect('C6C5 facing stage is recorded', source.includes('Stage 12C66C6C5: Artwork Frame Facing Fix'));
expect('Facing root exists between scale and normalized frame geometry',
  source.includes('var facingRoot = new BABYLON.TransformNode(artwork.name + "_FrameFacing_" + generation, scene);') &&
  source.includes('facingRoot.parent = scaleRoot;') &&
  source.includes('orientationRoot.parent = facingRoot;'));
expect('Frame front/back is flipped on local Y by 180 degrees', source.includes('facingRoot.rotation.y = Math.PI;'));
expect('Existing requested in-plane Z rotation remains', source.includes('runtime.root.rotation.z += runtime.zRotationRadians || 0;'));
console.log('Artwork frame facing invariants passed.');
