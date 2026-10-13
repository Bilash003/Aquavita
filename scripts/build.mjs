import {build} from 'esbuild';
await build({entryPoints:['client/firebase-client.js'],bundle:true,format:'esm',platform:'browser',target:['es2022'],minify:true,outfile:'dist/firebase-client.js',legalComments:'none'});
console.log('Bundled Firebase client.');
