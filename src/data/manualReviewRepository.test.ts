import {afterEach,it,expect} from 'vitest'
import {ReportDatabase} from './database'
import {createTask} from './taskRepository'
import {initializeManualReview,changeManualReview} from './manualReviewRepository'
import {prepareExport,exportReport} from '../core/report/export'
import {readWorkbook} from '../core/workbook/read'
import {makeWorkbookFixture,basicSheet} from '../../tests/fixtures/workbookFactory'
const dbs:ReportDatabase[]=[]
afterEach(async()=>{for(const d of dbs.splice(0)){d.close();await d.delete()}})
async function setup(){const d=new ReportDatabase('manual-'+crypto.randomUUID());dbs.push(d);const task=await createTask({totalIssue:89,weeklyIssue:39,periodStart:'2026-09-27',periodEnd:'2026-10-02',issueDate:'2026-10-03'},[{name:'上期.xlsx',role:'baseline',unit:'',bytes:new Uint8Array(makeWorkbookFixture([{name:'源头质量问题',xml:basicSheet}]))},{name:'本期.xlsx',role:'source',unit:'',bytes:new Uint8Array(makeWorkbookFixture([{name:'源头质量问题',xml:basicSheet.replace('本周完成1台','')}]))}],[],d);await initializeManualReview(task.id,d);return {d,id:task.id,item:(await d.items.toArray()).find(i=>i.fields.current==='本周完成1台')!}}
it('明确采用源空白才能清空旧值，刷新后选择仍在，撤销恢复原值',async()=>{const {d,id,item}=await setup();const rev=(await d.tasks.get(id))!.revision;const mutation=await changeManualReview(id,rev,{kind:'cells',cells:[{itemId:item.id,field:'current',mode:'source'}]},d);expect((await prepareExport(id,d)).changes.find(c=>c.itemId===item.id&&c.field==='current')?.finalText).toBe('');const r=await exportReport(id,d);const bytes=await new Promise<ArrayBuffer>(resolve=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result as ArrayBuffer);fr.readAsArrayBuffer(r.workbook)});expect(readWorkbook(bytes,'out').sheets[0].cells.F5.text).toBe('');await changeManualReview(id,mutation.revision,{kind:'restore',state:mutation.before},d);expect((await prepareExport(id,d)).appliedCount).toBe(0)})
it('旧页面不能覆盖新选择，归档任务不可修改',async()=>{const {d,id,item}=await setup();const rev=(await d.tasks.get(id))!.revision;await changeManualReview(id,rev,{kind:'cells',cells:[{itemId:item.id,field:'current',mode:'edit',text:'人工新值'}]},d);await expect(changeManualReview(id,rev,{kind:'cells',cells:[{itemId:item.id,field:'current',mode:'edit',text:'旧页覆盖'}]},d)).rejects.toThrow(/变化/);expect((await prepareExport(id,d)).changes.find(c=>c.itemId===item.id&&c.field==='current')?.finalText).toBe('人工新值');await d.tasks.update(id,{status:'archived'});await expect(changeManualReview(id,rev+1,{kind:'complete',issueId:item.id},d)).rejects.toThrow(/归档/)})
it('缺失来源字段不能当作空白采用，人工编辑仍可明确填写空白',async()=>{const {d,id,item}=await setup();for(const s of await d.fragments.toArray()){delete s.fields.current;await d.fragments.put(s)}const rev=(await d.tasks.get(id))!.revision;await expect(changeManualReview(id,rev,{kind:'cells',cells:[{itemId:item.id,field:'current',mode:'source'}]},d)).rejects.toThrow(/字段/);await changeManualReview(id,rev,{kind:'cells',cells:[{itemId:item.id,field:'current',mode:'edit',text:''}]},d);expect((await prepareExport(id,d)).appliedCount).toBe(1)})

it('不依赖旧建议即可冻结人工选择并核对人工版',async()=>{const {d,id,item}=await setup();const {freezeCandidate}=await import('../core/comparison/compare');await changeManualReview(id,(await d.tasks.get(id))!.revision,{kind:'cells',cells:[{itemId:item.id,field:'current',mode:'edit',text:'人工选择最终值'}]},d);expect((await freezeCandidate(id,d)).items.find(i=>i.id===item.id)?.fields.current).toBe('人工选择最终值')})
it('一个问题完成后修改其他问题，不会抹掉已完成标记',async()=>{const {d,id,item}=await setup();let revision=(await d.tasks.get(id))!.revision;const {groupIssues}=await import('../core/report/issueReview');const groups=groupIssues(await d.items.toArray());const other=groups.find(g=>!g.items.some(i=>i.id===item.id))!;revision=(await changeManualReview(id,revision,{kind:'complete',issueId:item.id},d)).revision;await changeManualReview(id,revision,{kind:'cells',cells:[{itemId:other.items[0].id,field:'current',mode:'edit',text:'另一问题新值'}]},d);expect((await d.tasks.get(id))!.manualReview!.completed).toContain(item.id)})
it.each(['keep','edit'])('切换旧版共享格遇到%s与另一更新冲突时不擅自采用',async(other)=>{
 const {d,id,item}=await setup(),peer=(await d.items.toArray()).find(i=>i.id!==item.id&&i.unit===item.unit)!
 await d.items.update(peer.id,{targets:{...peer.targets,current:item.targets.current}})
 await d.tasks.update(id,{reviewMode:undefined,manualReview:undefined})
 const p=(key:string,itemId:string)=>({id:key,reportId:id,itemId,field:'current' as const,before:'本周完成1台',suggested:'新值',sourceIds:[],warnings:[],batchId:'old',baseRevision:0})
 await d.proposals.bulkPut([p('a',item.id),p('b',peer.id)])
 await d.reviews.bulkPut([{proposalId:'a',decision:other as 'keep'|'edit',finalText:'另一新值',note:'旧决定',revision:1,updatedAt:''},{proposalId:'b',decision:'edit',finalText:'新值',note:'旧决定',revision:1,updatedAt:''}])
 await initializeManualReview(id,d)
 expect((await prepareExport(id,d)).appliedCount).toBe(0)
})
it('完整任务包恢复为副本后，合并格决定与已完成问题均保持且仍可导出',async()=>{
 const {d,id,item}=await setup(),peer=(await d.items.toArray()).find(i=>i.id!==item.id&&i.unit===item.unit)!
 await d.items.update(peer.id,{targets:{...peer.targets,current:item.targets.current}})
 let revision=(await d.tasks.get(id))!.revision
 revision=(await changeManualReview(id,revision,{kind:'cells',cells:[{itemId:item.id,field:'current',mode:'edit',text:'共享格恢复值'}]},d)).revision
 await changeManualReview(id,revision,{kind:'complete',issueId:item.id},d)
 const {exportTaskArchive,restoreTaskArchive}=await import('./taskArchive')
 const restored=await restoreTaskArchive(await exportTaskArchive(id,d),'new-copy',d,async()=>{})
 await initializeManualReview(restored,d)
 const {groupIssues,cellDecision}=await import('../core/report/issueReview'),restoredItems=await d.items.where('reportId').equals(restored).toArray(),state=(await d.tasks.get(restored))!.manualReview!,group=groupIssues(restoredItems).find(g=>g.unit==='甲单位')!
 expect(state.completed).toContain(group.id)
 expect(group.items.map(i=>cellDecision(restoredItems,i,'current',state)?.text)).toEqual(['共享格恢复值','共享格恢复值'])
 expect((await prepareExport(restored,d)).changes.find(c=>c.ref?.address==='F5')?.finalText).toBe('共享格恢复值')
})
it('全期一键采用跨问题的明确差异，保留人工编辑，整次撤销恢复',async()=>{const {d,id,item}=await setup();let rev=(await d.tasks.get(id))!.revision;rev=(await changeManualReview(id,rev,{kind:'cells',cells:[{itemId:item.id,field:'current',mode:'edit',text:'人工保留文字'}]},d)).revision;const other=(await d.fragments.toArray()).find(s=>s.unit==='乙单位')!;await d.fragments.update(other.id,{fields:{...other.fields,current:'乙本期变化'}});const result=await changeManualReview(id,rev,{kind:'adopt-changes'} as any,d);const plan=await prepareExport(id,d);expect(plan.changes.find(c=>c.itemId===item.id&&c.field==='current')?.finalText).toBe('人工保留文字');expect(plan.changes.some(c=>c.unit==='乙单位'&&c.finalText==='乙本期变化')).toBe(true);await changeManualReview(id,result.revision,{kind:'restore',state:result.before},d);expect((await prepareExport(id,d)).changes.some(c=>c.finalText==='乙本期变化')).toBe(false)})

it('新增候选确认归属后进入导出主表，重复添加拒绝，撤销恢复',async()=>{
 const {d,id,item}=await setup();const original=(await d.fragments.toArray())[0];const source={...original,id:'new-source',taskPath:['新增工作'],fields:{...original.fields,work:'新增工作',content:'新增工作',current:'新增进展'},rawText:'新增工作：新增进展'};await d.fragments.put(source);
 const result=await changeManualReview(id,(await d.tasks.get(id))!.revision,{kind:'add-source',sourceId:source.id,parentId:item.id} as any,d);
 const out=await exportReport(id,d);const bytes=await new Promise<ArrayBuffer>(resolve=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result as ArrayBuffer);fr.readAsArrayBuffer(out.workbook)});
 expect(Object.values(readWorkbook(bytes,'out').sheets[0].cells).some(c=>c.text==='新增进展')).toBe(true);
 await expect(changeManualReview(id,result.revision,{kind:'add-source',sourceId:source.id,parentId:item.id} as any,d)).rejects.toThrow(/已添加/);
 await changeManualReview(id,result.revision,{kind:'restore',state:result.before},d);expect((await prepareExport(id,d)).additions||[]).toHaveLength(0)
})

it('占位符导出统一为短横线且不算内容更新，正文符号不改',async()=>{
 const {d,id,item}=await setup();await d.items.update(item.id,{fields:{...item.fields,current:'／'}});
 const files=await d.files.toArray();const base=files.find(f=>f.role==='baseline')!;
 await d.files.update(base.id,{bytes:new Uint8Array(makeWorkbookFixture([{name:'源头质量问题',xml:basicSheet.replace('本周完成1台','／')}]))});
 const plan=await prepareExport(id,d);expect(plan.patches.find(p=>p.ref.address==='F5')?.text).toBe('-');expect(plan.patches.find(p=>p.ref.address==='F5')?.highlight).toBeUndefined();expect(plan.appliedCount).toBe(0)
})
