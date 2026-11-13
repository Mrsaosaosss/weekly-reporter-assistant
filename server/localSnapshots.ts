import {mkdir,writeFile,rename} from 'node:fs/promises'
import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import type {Plugin} from 'vite'
import {requestAllowed,readJson} from './requestBoundary'
export async function saveSnapshot(data:unknown,directory:string){
 if(!data||typeof data!=='object'||(data as {app?:string}).app!=='weekly-report-tool'||(data as {version?:number}).version!==1)throw new Error('快照格式无效')
 await mkdir(directory,{recursive:true,mode:0o700})
 const name=new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomUUID()+'.json',temp=join(directory,name+'.tmp')
 await writeFile(temp,JSON.stringify(data),{mode:0o600,flag:'wx'});await rename(temp,join(directory,name));return name
}
export function snapshotPlugin():Plugin{
 const install=(server:{middlewares:{use:(handler:(req:any,res:any,next:()=>void)=>void)=>void}})=>{server.middlewares.use(async(req,res,next)=>{
  if(req.url!=='/api/snapshot')return next()
  if(req.method!=='POST'||!requestAllowed(req.headers)){res.statusCode=403;res.end('拒绝跨站请求');return}
  res.setHeader('Content-Type','application/json')
  try{const data=await readJson(req,60*1024*1024),name=await saveSnapshot(data,join(process.cwd(),'backups','data'));res.end(JSON.stringify({ok:true,name,savedAt:new Date().toISOString()}))}catch{res.statusCode=400;res.end(JSON.stringify({error:'本机快照写入失败，请检查磁盘空间或服务状态'}))}
 })}
 return {name:'local-report-snapshots',configureServer:install,configurePreviewServer:install}
}
