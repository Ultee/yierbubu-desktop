import {build} from 'esbuild';
import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('dist',{recursive:true});
await build({entryPoints:['src/main.ts'],bundle:true,platform:'node',format:'cjs',outfile:'dist/main.cjs',external:['electron'],target:'node22'});
await build({entryPoints:['src/preload.ts'],bundle:true,platform:'node',format:'cjs',outfile:'dist/preload.cjs',external:['electron'],target:'node22'});
await build({entryPoints:['src/pet.ts','src/settings.ts','src/chat.ts'],bundle:true,platform:'browser',format:'iife',outdir:'dist',target:'chrome132'});
for(const file of ['pet.html','pet.css','settings.html','settings.css','chat.html','chat.css']) await copyFile('src/'+file,'dist/'+file);
console.log('Built local desktop application.');
