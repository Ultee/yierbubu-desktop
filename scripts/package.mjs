import {packager} from '@electron/packager';
import {existsSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const version=JSON.parse(readFileSync('node_modules/electron/package.json','utf8')).version;
const cache=resolve('../../work/downloads');
const localZip=join(cache,`electron-v${version}-win32-x64.zip`);
const paths=await packager({dir:'.',name:'SalaryPet',platform:'win32',arch:'x64',out:process.env.SALARY_PET_PACKAGE_OUT||'../release',overwrite:true,asar:true,
  ...(existsSync(localZip)?{electronZipDir:cache}:{}),
  ignore:[/^\/(tests|src|scripts|docs|test-results|node_modules|\.git)(\/|$)/,/^\/(tsconfig\.json|README\.md|package-lock\.json)$/]});
console.log('Packaged:',paths.join('\n'));
