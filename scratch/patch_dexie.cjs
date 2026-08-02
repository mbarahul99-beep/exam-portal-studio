const fs = require('fs');
const path = require('path');

function patchFile(filepath, target, replacement) {
  if (!fs.existsSync(filepath)) {
    console.log(`File not found: ${filepath}`);
    return;
  }
  const content = fs.readFileSync(filepath, 'utf8');
  if (content.includes(replacement)) {
    console.log(`Already patched: ${filepath}`);
    return;
  }
  if (!content.includes(target)) {
    console.warn(`Target not found in: ${filepath}`);
    return;
  }
  const patched = content.replace(target, replacement);
  fs.writeFileSync(filepath, patched, 'utf8');
  console.log(`Successfully patched: ${filepath}`);
}

const dexieJsPath = path.join(__dirname, '..', 'node_modules', 'dexie', 'dist', 'dexie.js');
const targetJs = `                                  var adjustedReq = adjustOptimisticFromFailures(tblCache, reqWithResolvedKeys, res);
                                  tblCache.optimisticOps.push(adjustedReq);`;
const replacementJs = `                                  var adjustedReq = adjustOptimisticFromFailures(tblCache, reqWithResolvedKeys, res);
                                  if (adjustedReq) {
                                      tblCache.optimisticOps.push(adjustedReq);
                                  }`;

const dexieMjsPath = path.join(__dirname, '..', 'node_modules', 'dexie', 'dist', 'dexie.mjs');
const targetMjs = `                                var adjustedReq = adjustOptimisticFromFailures(tblCache, reqWithResolvedKeys, res);
                                tblCache.optimisticOps.push(adjustedReq);`;
const replacementMjs = `                                var adjustedReq = adjustOptimisticFromFailures(tblCache, reqWithResolvedKeys, res);
                                if (adjustedReq) {
                                    tblCache.optimisticOps.push(adjustedReq);
                                }`;

const wrapperProdPath = path.join(__dirname, '..', 'node_modules', 'dexie', 'import-wrapper-prod.mjs');
const targetWrapper = `import _Dexie from "./dist/dexie.min.js";`;
const replacementWrapper = `import _Dexie from "./dist/dexie.mjs";`;

const wrapperPath = path.join(__dirname, '..', 'node_modules', 'dexie', 'import-wrapper.mjs');
const targetWrapperDev = `import _Dexie from "./dist/dexie.mjs";`; // already points to mjs, but let's check it

patchFile(dexieJsPath, targetJs, replacementJs);
patchFile(dexieMjsPath, targetMjs, replacementMjs);
patchFile(wrapperProdPath, targetWrapper, replacementWrapper);
