import {packager} from '@electron/packager';
const paths=await packager({dir:'.',name:'SalaryPet',platform:'win32',arch:'x64',out:'../release',overwrite:true,asar:true,
  electronZipDir:'../../work/downloads',
  ignore:[/^\/(tests|src|scripts|test-results|\.git)(\/|$)/,/^\/(tsconfig\.json|README\.md|package-lock\.json)$/]});
console.log('Packaged:',paths.join('\n'));
