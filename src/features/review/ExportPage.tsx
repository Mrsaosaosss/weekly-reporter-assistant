import {sourceRoute} from '../../core/report/sourceMap'
import {useCallback,useEffect,useState} from 'react'
import {Link,useNavigate,useParams} from 'react-router-dom'
import {useLiveQuery} from 'dexie-react-hooks'
import {ArrowLeft,Download,ArrowRight,FileCheck2,Package} from 'lucide-react'
import {db} from '../../data/database'
import {initializeManualReview} from '../../data/manualReviewRepository'
import {prepareExport,exportReport,finalizeReport,type CandidatePlan} from '../../core/report/export'
import {groupIssues} from '../../core/report/issueReview'
import {exportTaskArchive} from '../../data/taskArchive'
import {now} from '../../core/model'
import {download,bytesBlob} from '../../ui/download'
import {Button} from '../../ui/Button'
import {Card} from '../../ui/Card'
export function ExportPage(){
 const {id=''}=useParams(),nav=useNavigate(),task=useLiveQuery(()=>db.tasks.get(id),[id]),items=useLiveQuery(()=>db.items.where('reportId').equals(id).toArray(),[id])||[],revisions=useLiveQuery(()=>db.exports.where('reportId').equals(id).sortBy('createdAt'),[id])||[]
 const [plan,setPlan]=useState<CandidatePlan>(),[error,setError]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[finalFile,setFinalFile]=useState<File>(),[confirmed,setConfirmed]=useState(false)
 const latest=revisions.filter(r=>r.kind==='candidate').at(-1),current=latest?.taskRevision===task?.revision
 const refresh=useCallback(async()=>{await initializeManualReview(id);setPlan(await prepareExport(id))},[id])
 useEffect(()=>{void refresh().catch(e=>setError(e.message))},[refresh,task?.revision])
 const groups=groupIssues(items.filter(i=>!!sourceRoute(i))),completed=groups.filter(g=>task?.manualReview?.completed.includes(g.id)).length
 async function action(fn:()=>Promise<void>){setBusy(true);setError('');try{await fn();await refresh()}catch(e){setError(e instanceof Error?e.message:'操作失败')}finally{setBusy(false)}}
 const name=`总第${task?.meta.totalIssue}期_第${task?.meta.weeklyIssue}期_${task?.meta.issueDate.replaceAll('-','')}`
 return <><Link className="back-link" to={`/tasks/${id}/review`}><ArrowLeft size={16}/>返回按问题审阅</Link>
 <div className="page-heading"><div><div className="eyebrow">WEEKLY REPORT · 人工选择结果</div><h1>本期汇总表</h1><p>总第{task?.meta.totalIssue}期 · {task?.meta.periodStart} — {task?.meta.periodEnd}</p></div><span className="pill">{task?.status==='archived'?'已归档':`已审阅 ${completed} / ${groups.length} 个问题`}</span></div>
 {error&&<p className="notice error" role="alert">{error}</p>}{message&&<p className="notice success" role="status">{message}</p>}
 <Card title="按你的选择生成本期汇总表" subtitle="只写入明确采用或编辑的内容，未选内容保留上期。更新文字标红；生成过程不调用AI。">
 <p>已选择写入 {plan?.appliedCount??'—'} 个变化单元格。本期新增或有更新的周例会待办共 {plan?.todoRows.length??'—'} 条，按选中材料的上传顺序及文件内行序整理，重新连续编号；特殊对象原位保留。</p>
 {completed<groups.length&&<p className="muted">还有 {groups.length-completed} 个问题未标记审阅完成。可以先下载检查，未选内容会保留上期。</p>}
 {plan?.todoWarnings?.length? <div className="notice"><strong>待办表有 {plan.todoWarnings.length} 处需手动处理，不影响下载</strong><p>对应原对象及所在行保留，新待办跳过这些行写入。保留区域可能仍有旧待办或旧编号，请下载后人工核对。</p><details><summary>查看具体位置</summary>{plan.todoWarnings.map((n,i)=><p key={i}><strong>{n.location} · {n.kind}</strong><br/>{n.message}</p>)}</details></div>:null}
 {plan?.blockers.map((b,i)=><p key={i} className="error">{b}</p>)}
 <div className="actions"><Link className="button secondary" to={`/tasks/${id}/review`}>继续整块对照 <ArrowRight size={15}/></Link><Button variant="primary" disabled={busy||!plan||!!plan.blockers.length||task?.status==='archived'} onClick={()=>void action(async()=>{const out=await exportReport(id);download(out.workbook,`${name}_人工选择更新稿.xlsx`);setMessage(`已生成：${out.appliedCount}处更新，${out.todoCount}条本期待办已按上传顺序整理。${out.todoWarnings.length?'特殊位置保留，详情见手动处理提示；也可下载本期待办排序表。':''}${out.exceptionCount?'另有未对应来源，可下载下方清单检查。':''}`)})}><Download size={16}/>下载本期汇总表</Button></div>
 </Card>
 <p><Link className="button secondary" to="/word-summary">用校核后的 Excel 生成 Word 总结</Link></p>
 <div className="export-grid"><Card title="实际更新与未对应材料"><p className="muted">变化明细记录原值、最终内容及来源；未对应来源不会自动插入原表。</p><div className="optional-actions">{latest&&<>{latest.todoOrder&&<Button disabled={!current} onClick={()=>download(bytesBlob(latest.todoOrder!),`${name}_本期待办排序表.xlsx`)}>下载本期待办排序表</Button>}{latest.todoWarnings?.length?<Button disabled={!current} onClick={()=>download(new Blob([latest.todoWarnings!.map(n=>`${n.location} · ${n.kind}\n${n.message}`).join('\n\n')],{type:'text/plain;charset=utf-8'}),`${name}_待办手动处理位置.txt`)}>下载待办手动处理位置</Button>:null}<Button disabled={!current} onClick={()=>download(bytesBlob(latest.changes),`${name}_人工更新明细.xlsx`)}>下载更新明细</Button>{latest.exceptions&&<Button disabled={!current} onClick={()=>download(bytesBlob(latest.exceptions!),`${name}_未对应材料清单.xlsx`)}>下载未对应材料清单（{latest.exceptionCount||0}）</Button>}</>}{!latest&&<p>生成汇总表后可下载明细。</p>}{latest&&!current&&task?.status!=='archived'&&<p>选择已变化，请重新生成汇总表后下载最新明细。</p>}<Link className="button secondary" to={`/tasks/${id}/validation`}>与人工完成版本对照</Link><Button disabled={busy} onClick={()=>void action(async()=>download(await exportTaskArchive(id),`${name}_完整任务包.json`))}><Package size={15}/>下载完整任务包</Button></div></Card>
 <Card title="上传Excel定稿并归档" subtitle="下载后可在Excel中检查排版或补充新增事项。上传的定稿会作为下一期底稿。">{task?.status==='archived'?<><p className="success">本期已归档。</p>{revisions.at(-1)&&<Button onClick={()=>download(bytesBlob(revisions.at(-1)!.bytes),revisions.at(-1)!.fileName||`${name}_定稿.xlsx`)}>下载归档文件</Button>}<p><Button variant="primary" onClick={()=>nav(`/tasks/new?from=${id}`)}>创建下一期</Button></p><Button disabled={busy} onClick={()=>void action(async()=>{await db.tasks.update(id,{status:'review',revision:task.revision+1,updatedAt:now()});await initializeManualReview(id);nav(`/tasks/${id}/review`)})}>开启本期修订</Button></>:<><label>选择定稿文件<input aria-label="Excel定稿文件" type="file" accept=".xlsx" disabled={busy} onChange={e=>{setFinalFile(e.target.files?.[0]);setConfirmed(false)}}/></label><label className="check-label"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>我已核对，确认作为本期定稿</label><Button variant="primary" disabled={busy||!finalFile||!confirmed||!latest||!current} onClick={()=>void action(async()=>{if(finalFile){await finalizeReport(id,new Uint8Array(await finalFile.arrayBuffer()),finalFile.name);setMessage('定稿已归档，下一期将使用你上传的文件。')}})}><FileCheck2 size={15}/>上传定稿并归档</Button></>}</Card></div>
 </>
}
