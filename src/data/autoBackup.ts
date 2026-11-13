import Dexie from 'dexie'
import {db} from './database'
import {taskArchiveObject,writeSnapshot} from './taskArchive'
export const backupState={lastSuccess:'',error:'',saving:false}
export async function backupNow(){backupState.saving=true;try{const data=await taskArchiveObject(undefined);if(!data.data.tasks.length)return;await writeSnapshot(data);backupState.lastSuccess=new Date().toISOString();backupState.error=''}catch(e){backupState.error=e instanceof Error?e.message:'快照失败'}finally{backupState.saving=false;window.dispatchEvent(new Event('backup-state'))}}
export function startAutoBackup(){let timer:ReturnType<typeof setTimeout>;let stopped=false;const changes=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(!stopped)void backupNow()},5000)};Dexie.on('storagemutated',changes);return()=>{stopped=true;clearTimeout(timer);Dexie.on('storagemutated').unsubscribe(changes)}}
