import {spawn} from 'node:child_process';
const children=[spawn(process.execPath,['server/security.mjs'],{env:{...process.env,PORT:'4000'},stdio:'inherit'}),spawn(process.execPath,['node_modules/vite/bin/vite.js','--port','5173'],{stdio:'inherit'})];
let stopping=false;function stop(code=0){if(stopping)return;stopping=true;children.forEach(child=>child.kill());process.exitCode=code}
for(const child of children){child.on('error',()=>stop(1));child.on('exit',code=>stop(code||0))}process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
