import {afterEach,it,expect} from 'vitest'
import {ReportDatabase} from '../../data/database'
import {createTask} from '../../data/taskRepository'
import {generateSourceSuggestions} from './runner'
import {prepareExport} from '../report/export'
import {makeWorkbookFixture,basicSheet} from '../../../tests/fixtures/workbookFactory'
import {categories} from '../model'
import {runCandidateReview} from './candidateReview'
const databases:ReportDatabase[]=[]
afterEach(async()=>{for(const d of databases.splice(0)){d.close();await d.delete()}})
async function setup(){
 const d=new ReportDatabase('ai-review-'+crypto.randomUUID());databases.push(d)
 const task=await createTask({totalIssue:89,weeklyIssue:39,periodStart:'2026-09-27',periodEnd:'2026-10-02',issueDate:'2026-10-03'},[
 {name:'底稿.xlsx',bytes:new Uint8Array(makeWorkbookFixture(Object.values(categories).map(name=>({name,xml:basicSheet})))),unit:'',role:'baseline'},
 {name:'报送.xlsx',bytes:new Uint8Array(makeWorkbookFixture([{name:categories.source,xml:basicSheet.replace('本周完成1台','本周完成3台')}])),unit:'',role:'source'}],[],d)
 await generateSourceSuggestions(task.id,d)
 const target=(await d.items.toArray()).find(i=>i.category==='source'&&i.fields.current==='本周完成1台')!
 const match=await d.matches.where('itemId').equals(target.id).first();await d.matches.update(match!.id,{ambiguous:true})
 return {d,task,target}
}
function reply(input:any){return {decisions:input.candidate.map((c:any)=>{
 const source=input.sources.find((s:any)=>s.fields[c.field])
 return {proposalId:c.proposalId,decision:source?'update':'unresolved',text:source?.fields[c.field]||c.before,reason:source?'根据同类本期报送，歧义仅为代码匹配提示':'本期无该字段依据',evidence:source?[{sourceId:source.id,quote:source.rawText}]:[]}
 })}}
it('AI依据初稿及原文解除机械歧义，结果实际写入候选且中断后不重复调用',async()=>{
 const {d,task,target}=await setup();let calls=0,sawCandidate=false
 const provider={review:async(input:any)=>{calls++;sawCandidate ||= input.candidate.some((c:any)=>c.itemId===target.id&&c.text==='本周完成1台'&&c.reasons.length>0);return reply(input)}}
 const result=await runCandidateReview(task.id,provider,new AbortController().signal,()=>{},d)
 const plan=await prepareExport(task.id,d)
 expect(sawCandidate).toBe(true)
 expect(plan.changes.find(c=>c.itemId===target.id&&c.field==='current')?.finalText).toBe('本周完成3台')
 expect(plan.exceptions.some(e=>e.itemId===target.id&&e.field==='本周具体工作进展')).toBe(false)
 expect(result.reviewedFields).toBeGreaterThan(0)
 const before=calls;await runCandidateReview(task.id,provider,new AbortController().signal,()=>{},d);expect(calls).toBe(before)
})
it('引用伪造原文的字段降为待核实，不采纳错误更新或阻断其他字段',async()=>{
 const {d,task,target}=await setup()
 await runCandidateReview(task.id,{review:async(input:any)=>{const r=reply(input);for(const c of r.decisions)if(c.evidence.length)c.evidence[0].quote='伪造已完成999台';return r}},new AbortController().signal,()=>{},d)
 expect((await d.proposals.toArray()).find(p=>p.itemId===target.id&&p.field==='current')?.aiReview?.decision).toBe('unresolved')
 expect((await prepareExport(task.id,d)).changes.find(c=>c.itemId===target.id&&c.field==='current')?.finalText).toBe('本周完成1台')
})
it('AI确认有据的保留不再作为异常，但缺报仍待核实',async()=>{
 const {d,task,target}=await setup()
 await runCandidateReview(task.id,{review:async(input:any)=>{const r=reply(input);for(const c of r.decisions)if(c.evidence.length){c.decision='keep';c.text=input.candidate.find((f:any)=>f.proposalId===c.proposalId).before;c.reason='本期原文仅说明同口径阶段进展，确认保留'}return r}},new AbortController().signal,()=>{},d)
 const plan=await prepareExport(task.id,d)
 expect(plan.changes.find(c=>c.itemId===target.id&&c.field==='current')?.finalText).toBe('本周完成1台')
 expect(plan.exceptions.some(e=>e.itemId===target.id&&e.field==='本周具体工作进展')).toBe(false)
 expect(plan.heldCount).toBeGreaterThan(0)
})
it('中断后保留已完成结果，可继续剩余事项',async()=>{
 const {d,task}=await setup(),controller=new AbortController();let once=true
 await expect(runCandidateReview(task.id,{review:async(input:any)=>{if(once){once=false;controller.abort()}return reply(input)}},controller.signal,()=>{},d)).rejects.toThrow(/取消|中断/)
 expect((await d.tasks.get(task.id))?.status).toBe('review')
})
it('单位材料过多时提供完整事项索引，AI可调取额外原文而非截断材料',async()=>{
 const {d,task,target}=await setup(),source=(await d.fragments.toArray())[0]
 for(let n=0;n<20;n++)await d.fragments.add({...source,id:'extra-'+n,project:'新增名称'+n,taskPath:['新分支'],fields:{current:'本周完成4台'},rawText:'本周完成4台。'+('检验过程记录。'.repeat(1600))})
 let requested=false,loaded=false
 await runCandidateReview(task.id,{review:async(input:any)=>{
  if(input.items.some((i:any)=>i.id===target.id)&&!requested){requested=true;expect(input.sourceIndex.some((s:any)=>s.sourceId==='extra-19')).toBe(true);return {requestedSourceIds:['extra-19']}}
  if(input.items.some((i:any)=>i.id===target.id)){loaded=input.sources.some((s:any)=>s.id==='extra-19'&&s.rawText.endsWith('检验过程记录。'))}
  return reply(input)
 }},new AbortController().signal,()=>{},d)
 expect(requested&&loaded).toBe(true)
})
it('即使AI引用有效原文也不会写入无依据的数字',async()=>{
 const {d,task,target}=await setup()
 await runCandidateReview(task.id,{review:async(input:any)=>{const r=reply(input);for(const c of r.decisions)if(input.candidate.find((f:any)=>f.proposalId===c.proposalId)?.field==='current'&&c.evidence.length)c.text='本周完成999台';return r}},new AbortController().signal,()=>{},d)
 const plan=await prepareExport(task.id,d)
 expect(plan.changes.find(c=>c.itemId===target.id&&c.field==='current')?.finalText).toBe('本周完成1台')
 expect(plan.exceptions.some(e=>e.itemId===target.id&&e.reason.includes('数字'))).toBe(true)
})
it('全期复核超过30个请求仍会自动继续直至完成',async()=>{
 const {d,task,target}=await setup(),proposal=(await d.proposals.toArray()).find(p=>p.itemId===target.id&&p.field==='current')!
 await d.items.bulkAdd(Array.from({length:96},(_,n)=>({...target,id:'item-'+n})))
 await d.proposals.bulkAdd(Array.from({length:96},(_,n)=>({...proposal,id:'proposal-'+n,itemId:'item-'+n})))
 let calls=0
 const result=await runCandidateReview(task.id,{review:async(input:any)=>{calls++;return reply(input)}},new AbortController().signal,()=>{},d)
 expect(calls).toBeGreaterThan(30)
 expect(result.completed).toBe(result.total)
 expect((await d.proposals.get('proposal-95'))?.aiReview?.decision).toBe('update')
})
it('缺少字段结论时本批不写入，不能假装整批复核完成',async()=>{
 const {d,task}=await setup()
 await expect(runCandidateReview(task.id,{review:async()=>({decisions:[]})},new AbortController().signal,()=>{},d)).rejects.toThrow(/全部候选字段/)
 expect((await d.proposals.toArray()).filter(p=>p.aiReview?.by==='ai')).toHaveLength(0)
})
it('规则未生成的可更新字段也会交给AI补更',async()=>{
 const {d,task,target}=await setup(),source=(await d.fragments.toArray()).find(s=>s.fields.current==='本周完成3台')!
 await d.items.update(target.id,{targets:{...target.targets,deadline:{fileId:target.targets.current!.fileId,sheet:categories.source,address:'H5'}},fields:{...target.fields,deadline:''}})
 await d.fragments.update(source.id,{fields:{...source.fields,deadline:'2026-10-20'},rawText:source.rawText+'\n计划完成时间：2026-10-20'})
 let offered=false
 await runCandidateReview(task.id,{review:async(input:any)=>{offered ||= input.candidate.some((c:any)=>c.itemId===target.id&&c.field==='deadline');return reply(input)}},new AbortController().signal,()=>{},d)
 expect(offered).toBe(true)
 expect((await prepareExport(task.id,d)).changes.find(c=>c.itemId===target.id&&c.field==='deadline')?.finalText).toBe('2026-10-20')
})
it('规则初稿导出不会混入已保存的AI修订',async()=>{
 const {d,task,target}=await setup()
 await runCandidateReview(task.id,{review:async(input:any)=>reply(input)},new AbortController().signal,()=>{},d)
 const {exportReport}=await import('../report/export'),{readWorkbook}=await import('../workbook/read')
 const result=await exportReport(task.id,d,{ignoreAIReview:true})
 const bytes=await new Promise<ArrayBuffer>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result as ArrayBuffer);r.onerror=reject;r.readAsArrayBuffer(result.workbook)})
 expect(readWorkbook(bytes,'out').sheets.find(s=>s.name===categories.source)?.cells.F5.text).toBe('本周完成1台')
 expect(result.aiReviewedCount).toBe(0)
})
it('人工确认AI修订时固定所见文字，不因修订号变化退回规则提取文字',async()=>{
 const {d,task,target}=await setup(),p=(await d.proposals.toArray()).find(p=>p.itemId===target.id&&p.field==='current')!
 await runCandidateReview(task.id,{review:async(input:any)=>{const r=reply(input);for(const c of r.decisions)if(c.proposalId===p.id)c.text='本周完成3台（按报送核对）';return r}},new AbortController().signal,()=>{},d)
 const {applyReview}=await import('../../data/reviewRepository')
 await applyReview({reportId:task.id,proposalId:p.id,decision:'accept',finalText:'本周完成3台（按报送核对）',note:'按原文确认复核结果',expectedRevision:0},d)
 expect((await prepareExport(task.id,d)).changes.find(c=>c.proposalId===p.id)?.finalText).toBe('本周完成3台（按报送核对）')
})
it('历史和责任人等档案可有理由沿用，但本周进展无引用不能冒充已确认',async()=>{
 const {d,task,target}=await setup()
 await runCandidateReview(task.id,{review:async(input:any)=>({decisions:input.candidate.map((c:any)=>({proposalId:c.proposalId,decision:'keep',text:c.before,reason:'本期未报告档案字段变更，继续沿用上期；本周进展无法找到直接依据',evidence:[]}))})},new AbortController().signal,()=>{},d)
 const ps=await d.proposals.where('itemId').equals(target.id).toArray()
 expect(ps.find(p=>p.field==='history')?.aiReview?.decision).toBe('keep')
 expect(ps.find(p=>p.field==='current')?.aiReview?.decision).toBe('unresolved')
})
it('只有完整复核当前任务版本才能下载标为AI完成的修订稿',async()=>{
 const {d,task}=await setup(),{exportReport}=await import('../report/export')
 await expect(exportReport(task.id,d,{requireAIReview:true})).rejects.toThrow(/尚未全部完成/)
 await runCandidateReview(task.id,{review:async(input:any)=>reply(input)},new AbortController().signal,()=>{},d)
 expect((await exportReport(task.id,d,{requireAIReview:true})).aiReviewedCount).toBeGreaterThan(0)
 await d.tasks.update(task.id,{revision:1})
 await expect(exportReport(task.id,d,{requireAIReview:true})).rejects.toThrow(/任务已变化/)
})
it('联合责任单位的事项可读取其中一家报送的同类原文，由AI判断任务归属',async()=>{
 const {d,task,target}=await setup();await d.items.update(target.id,{unit:'甲单位\n乙单位'})
 let provided=false
 await runCandidateReview(task.id,{review:async(input:any)=>{if(input.items.some((i:any)=>i.id===target.id))provided=input.sources.some((s:any)=>s.unit==='甲单位');return reply(input)}},new AbortController().signal,()=>{},d)
 expect(provided).toBe(true)
 expect((await prepareExport(task.id,d)).changes.find(c=>c.itemId===target.id&&c.field==='current')?.finalText).toBe('本周完成3台')
})
it('多事项批次超时后自动拆为单事项复核，并能完成整期',async()=>{
 const {d,task}=await setup();let splitCalls=0
 const result=await runCandidateReview(task.id,{review:async(input:any)=>{
  if(input.items.length>1)throw Object.assign(new Error('The operation was aborted due to timeout'),{code:'AI_TIMEOUT',retryable:true})
  splitCalls++;return reply(input)
 }},new AbortController().signal,()=>{},d)
 expect(splitCalls).toBeGreaterThan(0)
 expect(result.completed).toBe(result.total)
 expect((await d.tasks.get(task.id))?.aiReviewCompletedRevision).toBe(0)
})
it('个别事项持续超时不挡住其他批次，续跑只处理尚未完成部分',async()=>{
 const {d,task,target}=await setup();let completedElsewhere=false
 await expect(runCandidateReview(task.id,{review:async(input:any)=>{
  if(input.candidate.some((c:any)=>c.itemId===target.id))throw Object.assign(new Error('超时'),{code:'AI_TIMEOUT',retryable:true})
  completedElsewhere=true;return reply(input)
 }},new AbortController().signal,()=>{},d)).rejects.toThrow(/未完成|失败/)
 expect(completedElsewhere).toBe(true)
 expect((await d.tasks.get(task.id))?.aiReviewCompletedRevision).toBeUndefined()
 const completed=new Set((await d.proposals.toArray()).filter(p=>p.aiReview).map(p=>p.id));expect(completed.size).toBeGreaterThan(0)
 await runCandidateReview(task.id,{review:async(input:any)=>{expect(input.candidate.some((c:any)=>completed.has(c.proposalId))).toBe(false);return reply(input)}},new AbortController().signal,()=>{},d)
 expect((await d.tasks.get(task.id))?.aiReviewCompletedRevision).toBe(0)
})
