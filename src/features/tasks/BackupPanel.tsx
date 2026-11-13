import {useEffect,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {backupNow,backupState} from '../../data/autoBackup'
import {previewRestore,restoreTaskArchive} from '../../data/taskArchive'
import {Button} from '../../ui/Button'
import {Card} from '../../ui/Card'
import type {RestorePreview} from '../../core/model'
export function BackupPanel(){
 const nav=useNavigate(),[,refresh]=useState(0),[file,setFile]=useState<File>(),[preview,setPreview]=useState<RestorePreview>(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[confirmed,setConfirmed]=useState(false)
 useEffect(()=>{const update=()=>refresh(n=>n+1);window.addEventListener('backup-state',update);return()=>window.removeEventListener('backup-state',update)},[])
 return <><div className="page-heading"><div><div className="eyebrow">LOCAL DATA</div><h1>本地数据</h1><p>每一次审核，值得妥善保留。</p></div></div><Card title="本机快照" subtitle="运行期间，数据变更停顿5秒后自动写入项目 backups/data 目录。"><p>最近成功：{backupState.lastSuccess?new Date(backupState.lastSuccess).toLocaleString('zh-CN'):'当前会话尚无成功记录'}</p>{backupState.error&&<p className="error" role="alert">{backupState.error}</p>}<Button disabled={backupState.saving} onClick={()=>void backupNow()}>立即备份到本机</Button><p className="muted">请始终使用同一浏览器访问 http://localhost:5188。不同浏览器的数据分别保存。</p></Card><Card title="恢复任务包或本机快照" subtitle="选择完整任务包或本机自动快照，恢复其中全部任务为新副本；现有任务不会被替换。"><label>选择任务包<input type="file" accept=".json" onChange={async e=>{const f=e.target.files?.[0];if(f){setFile(f);setPreview(await previewRestore(f));setConfirmed(false)}}}/></label>{preview&&<><p>{preview.taskCount} 个任务 · {preview.fileCount} 份附件</p>{preview.errors.map(x=><p key={x} className="error">{x}</p>)}<label className="check-label"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>确认先保存当前数据快照，再恢复为新副本</label></>}{error&&<p className="error" role="alert">{error}</p>}<Button disabled={!file||!confirmed||!!preview?.errors.length||busy} onClick={async()=>{if(!file)return;setBusy(true);try{const id=await restoreTaskArchive(file,'new-copy');nav(`/tasks/${id}/review`)}catch(e){setError(e instanceof Error?e.message:'恢复失败')}finally{setBusy(false)}}}>恢复为新任务</Button></Card></>
}
