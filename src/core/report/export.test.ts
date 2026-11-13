import {afterEach,it,expect} from 'vitest'
import {ReportDatabase} from '../../data/database'
import {createTask,prepareNextTaskImport} from '../../data/taskRepository'
import {generateSourceSuggestions} from '../analysis/runner'
import {applyReview} from '../../data/reviewRepository'
import {prepareExport,exportReport,finalizeReport} from './export'
import {freezeCandidate} from '../comparison/compare'
import {readWorkbook} from '../workbook/read'
import {patchWorkbook} from '../workbook/patch'
import {makeWorkbookFixture,basicSheet} from '../../../tests/fixtures/workbookFactory'
import {categories} from '../model'
const databases:ReportDatabase[]=[]
afterEach(async()=>{for(const d of databases.splice(0)){d.close();await d.delete()}})
async function setup(){
 const d=new ReportDatabase('candidate-'+crypto.randomUUID());databases.push(d)
 const sheets=Object.values(categories).map(name=>({name,xml:basicSheet}))
 const task=await createTask({totalIssue:89,weeklyIssue:39,periodStart:'2026-09-27',periodEnd:'2026-10-02',issueDate:'2026-10-03'},[
  {name:'上期.xlsx',bytes:new Uint8Array(makeWorkbookFixture(sheets)),unit:'',role:'baseline'},
  {name:'报送.xlsx',bytes:new Uint8Array(makeWorkbookFixture(sheets.map(s=>({...s,xml:s.xml.replace('本周完成1台','本周完成3台')})))),unit:'',role:'source'},
 ],[],d)
 const items=await d.items.toArray(),sources=await d.fragments.toArray()
 for(const m of await d.matches.toArray()){
  const item=items.find(i=>i.id===m.itemId)!
  await d.matches.update(m.id,{sourceIds:m.sourceIds.filter(id=>sources.find(s=>s.id===id)?.refs[0]?.sheet===categories[item.category]),ambiguous:false,reason:'明确对应'})
 }
 await generateSourceSuggestions(task.id,d)
 return {d,task,items,sources}
}
async function blobBytes(b:Blob):Promise<ArrayBuffer>{return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result as ArrayBuffer);r.onerror=reject;r.readAsArrayBuffer(b)})}
it('无需逐项审核或额外勾选，即可生成完整候选并自动应用明确更新',async()=>{
 const {d,task}=await setup()
 const plan=await prepareExport(task.id,d)
 expect(plan.blockers).toEqual([])
 expect(plan.appliedCount).toBe(4)
 expect(await d.reviews.count()).toBe(0)
 const result=await exportReport(task.id,d),book=readWorkbook(await blobBytes(result.workbook),'out')
 for(const sheet of book.sheets)expect(sheet.cells.F5.text).toBe('本周完成3台')
 expect(result.appliedCount).toBe(4)
 expect(book.parts['xl/styles.xml']).toBeDefined()
})
it('冲突及未匹配来源保留旧值并进入异常清单，不再阻止下载',async()=>{
 const {d,task}=await setup(),item=(await d.items.toArray()).find(i=>i.category==='source'&&i.fields.current==='本周完成1台')!
 const match=await d.matches.where('itemId').equals(item.id).first();await d.matches.update(match!.id,{ambiguous:true})
 await d.fragments.add({id:'unmapped',reportId:task.id,unit:'新单位',project:'新增任务',taskPath:[],fields:{current:'新进展'},refs:[],rawText:'新进展'})
 const plan=await prepareExport(task.id,d)
 expect(plan.blockers).toEqual([])
 expect(plan.exceptions.some(e=>e.itemId===item.id)).toBe(true)
 expect(plan.exceptions.some(e=>e.sourceIds.includes('unmapped'))).toBe(true)
 const out=await exportReport(task.id,d),book=readWorkbook(await blobBytes(out.workbook),'out')
 expect(book.sheets.find(s=>s.name==='源头质量问题')?.cells.F5.text).toBe('本周完成1台')
 expect(out.exceptions.size).toBeGreaterThan(0)
 const frozen=await freezeCandidate(task.id,d)
 expect(frozen.items.find(i=>i.id===item.id)?.fields.current).toBe('本周完成1台')
})
it('已有人工保留决定优先于自动更新',async()=>{
 const {d,task}=await setup(),p=(await d.proposals.toArray()).find(p=>p.before==='本周完成1台')!
 await applyReview({reportId:task.id,proposalId:p.id,decision:'keep',note:'明确保留',expectedRevision:0},d)
 const plan=await prepareExport(task.id,d)
 expect(plan.appliedCount).toBe(3)
 expect(plan.changes.find(c=>c.proposalId===p.id)?.finalText).toBe('本周完成1台')
})
it('Excel中修改后的定稿可上传归档，并成为下一期底稿',async()=>{
 const {d,task}=await setup();await exportReport(task.id,d)
 const base=(await d.files.toArray()).find(f=>f.role==='baseline')!,book=readWorkbook(Uint8Array.from(base.bytes).buffer,base.id)
 const final=patchWorkbook(book,[{ref:{fileId:base.id,sheet:'源头质量问题',address:'F5'},before:'本周完成1台',text:'Excel人工定稿',textStyle:'base'}])
 await finalizeReport(task.id,final,'人工定稿.xlsx',d)
 expect((await d.tasks.get(task.id))?.status).toBe('archived')
 const next=await prepareNextTaskImport(task.id,d)
 expect(readWorkbook(Uint8Array.from(next.inputs[0].bytes).buffer,'next').sheets[0].cells.F5.text).toBe('Excel人工定稿')
})

it('原人工确认的来源丢失时保留上期并提示，不沿用旧确认写入',async()=>{
 const {d,task}=await setup(),p=(await d.proposals.toArray()).find(p=>p.before==='本周完成1台')!
 await applyReview({reportId:task.id,proposalId:p.id,decision:'accept',note:'按原报送确认',expectedRevision:0},d)
 await d.fragments.bulkDelete(p.sourceIds)
 const plan=await prepareExport(task.id,d)
 expect(plan.changes.find(c=>c.proposalId===p.id)?.finalText).toBe(p.before)
 expect(plan.exceptions.some(e=>e.itemId===p.itemId&&e.reason.includes('来源已缺失'))).toBe(true)
})

it('同名但跨类别的报送不会自动写入其他工作表',async()=>{
 const d=new ReportDatabase('category-'+crypto.randomUUID());databases.push(d)
 const task=await createTask({totalIssue:89,weeklyIssue:39,periodStart:'2026-09-27',periodEnd:'2026-10-02',issueDate:'2026-10-03'},[
  {name:'上期.xlsx',bytes:new Uint8Array(makeWorkbookFixture(Object.values(categories).map(name=>({name,xml:basicSheet})))),unit:'',role:'baseline'},
  {name:'专项.xlsx',bytes:new Uint8Array(makeWorkbookFixture([{name:categories.special,xml:basicSheet.replace('本周完成1台','本周完成3台')}])),unit:'',role:'source'},
 ],[],d)
 await generateSourceSuggestions(task.id,d)
 const plan=await prepareExport(task.id,d)
 expect(plan.appliedCount).toBe(1)
 expect(plan.changes.filter(c=>c.before!==c.finalText).every(c=>c.ref?.sheet===categories.special)).toBe(true)
 expect(plan.heldCount).toBeGreaterThan(0)
 expect(plan.changes.filter(c=>c.ref?.sheet!==categories.special).every(c=>c.finalText===c.before)).toBe(true)
})

it('人工整块模式只导出明确选择的格子，不采用规则或历史AI建议',async()=>{
 const {d,task}=await setup()
 await d.tasks.update(task.id,{reviewMode:'manual',manualReview:{decisions:{},sources:{},completed:[]}} as any)
 const plan=await prepareExport(task.id,d)
 expect(plan.appliedCount).toBe(0)
 const out=await exportReport(task.id,d),book=readWorkbook(await blobBytes(out.workbook),'out')
 expect(book.sheets[0].cells.F5.text).toBe('本周完成1台')
 expect(out.aiReviewedCount).toBe(0)
})
