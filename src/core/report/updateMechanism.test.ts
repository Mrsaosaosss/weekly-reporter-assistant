import {afterEach,it,expect} from 'vitest'
import {ReportDatabase} from '../../data/database'
import {createTask} from '../../data/taskRepository'
import {generateSourceSuggestions} from '../analysis/runner'
import {runCandidateReview} from '../analysis/candidateReview'
import {exportReport} from './export'
import {readWorkbook} from '../workbook/read'
import {categories} from '../model'
import {makeWorkbookFixture,basicSheet,inline} from '../../../tests/fixtures/workbookFactory'
const ds:ReportDatabase[]=[]
afterEach(async()=>{for(const d of ds.splice(0)){d.close();await d.delete()}})
const meta={totalIssue:89,weeklyIssue:39,periodStart:'2026-09-27',periodEnd:'2026-10-02',issueDate:'2026-10-03'}
const file=(name:string,unit:string,xml:string,role:'source'|'baseline'='source',sheet=categories.source)=>({name,unit,targetUnits:unit?[unit]:undefined,bytes:new Uint8Array(makeWorkbookFixture([{name:sheet,xml}])),role})
async function bytes(blob:Blob){return new Promise<ArrayBuffer>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result as ArrayBuffer);r.onerror=reject;r.readAsArrayBuffer(blob)})}
it('按上传绑定单位过滤材料，不把同模板中的其他单位旧内容混入',async()=>{
 const d=new ReportDatabase('scope-'+crypto.randomUUID());ds.push(d)
 const task=await createTask(meta,[file('底稿.xlsx','',basicSheet,'baseline'),file('甲单位本期.xlsx','甲单位',basicSheet.replace('本周完成1台','本周完成3台'))],[],d)
 const sources=await d.fragments.where('reportId').equals(task.id).toArray()
 expect(sources.length).toBe(2);expect(sources.every(s=>s.unit==='甲单位'&&s.reportingUnit==='甲单位')).toBe(true)
 expect(sources.every(s=>s.targetUnits?.includes('甲单位'))).toBe(true)
})
it('AI不能把合并任务第二个独立子行的进展复制给空白第一行',async()=>{
 const d=new ReportDatabase('subrow-'+crypto.randomUUID());ds.push(d)
 const body=basicSheet.replace(inline('D6','报告'),inline('E6','维修阶段')+inline('D6','')).replace(inline('D5','试验'),inline('D5','风险叶片消缺')).replace(inline('F5','本周完成1台'),inline('F5','—')).replace(inline('F6','计划评审'),inline('F6','本周完成1支')).replace('</mergeCells>','<mergeCell ref="D5:D6"/></mergeCells>')
 const task=await createTask(meta,[file('底稿.xlsx','',body,'baseline'),file('报送.xlsx','甲单位',body.replace('本周完成1支','本周完成2支').replace('风险叶片消缺','风险叶片消缺工作'))],[],d)
 await runCandidateReview(task.id,{review:async(input:any)=>({decisions:input.candidate.map((c:any)=>{const source=input.sources.find((s:any)=>s.fields.current==='本周完成2支');return {proposalId:c.proposalId,decision:c.field==='current'?'update':'keep',text:c.field==='current'?'本周完成2支':c.before,reason:'测试跨子行引用',evidence:source?[{sourceId:source.id,quote:source.rawText}]:[]}})})},new AbortController().signal,()=>{},d)
 const book=readWorkbook(await bytes((await exportReport(task.id,d)).workbook),'out')
 expect(book.sheets[0].cells.F5.text).toBe('—')
 expect(book.sheets[0].cells.F6.text).toBe('本周完成2支')
})
function todo(unit:boolean,rows:string[][]){const headers=unit?['序号','企业名称','周例会时间','待办事项','完成情况','异常说明','备注']:['序号','周例会时间','待办事项','完成情况','异常说明','备注'];return `<sheetData><row r="1">${inline('A1','周报标题')}</row><row r="5">${headers.map((v,i)=>inline(String.fromCharCode(65+i)+'5',v)).join('')}</row>${rows.map((values,i)=>`<row r="${i+6}">${values.map((v,j)=>inline(String.fromCharCode(65+j)+(i+6),v)).join('')}</row>`).join('')}</sheetData>`}
it('待办表删除所有旧内容，按单位最新原文重建全部列并从1连续编号',async()=>{
 const d=new ReportDatabase('todo-'+crypto.randomUUID());ds.push(d)
 const baseline=new Uint8Array(makeWorkbookFixture(Object.entries(categories).map(([cat,name])=>({name,xml:cat==='todo'?todo(true,[['9','旧单位','旧时间','上期过时待办','旧情况','','旧备注']]):basicSheet}))))
 const task=await createTask(meta,[{name:'底稿.xlsx',unit:'',role:'baseline',bytes:baseline},file('甲.xlsx','甲单位',todo(false,[['4','2026年9月26日','甲最新待办','甲完成原文','甲异常','甲备注'],['7','2026年9月26日','甲第二项','第二项原文','','']]),'source',categories.todo),file('乙.xlsx','乙单位',todo(true,[['6','乙单位','2026年9月26日','乙最新待办','乙完成原文','','乙备注']]),'source',categories.todo)],[],d)
 await generateSourceSuggestions(task.id,d)
 const out=readWorkbook(await bytes((await exportReport(task.id,d)).workbook),'out'),sheet=out.sheets.find(s=>s.name===categories.todo)!
 expect([sheet.cells.A6.text,sheet.cells.A7.text,sheet.cells.A8.text]).toEqual(['1','2','3'])
 expect([sheet.cells.B6.text,sheet.cells.C6.text,sheet.cells.D6.text,sheet.cells.E6.text,sheet.cells.F6.text,sheet.cells.G6.text]).toEqual(['甲单位','2026年9月26日','甲最新待办','甲完成原文','甲异常','甲备注'])
 expect(sheet.cells.D8.text).toBe('乙最新待办');expect(sheet.cells.G8.text).toBe('乙备注')
 expect(Object.values(sheet.cells).some(c=>c.text.includes('上期过时待办'))).toBe(false)
})
it('本期没有任何待办时清空旧待办，不沿用上周任务',async()=>{
 const d=new ReportDatabase('todo-empty-'+crypto.randomUUID());ds.push(d)
 const task=await createTask(meta,[file('底稿.xlsx','',todo(true,[['1','甲单位','旧时间','上期待办','旧进度','','']]),'baseline',categories.todo),file('空待办.xlsx','甲单位',todo(true,[]),'source',categories.todo)],[],d)
 const out=readWorkbook(await bytes((await exportReport(task.id,d)).workbook),'out')
 expect(Object.values(out.sheets[0].cells).filter(c=>c.row>5&&c.text.trim())).toHaveLength(0)
})
it('配套单位进展对应主机厂时，其本单位待办仍纳入重建',async()=>{
 const d=new ReportDatabase('supplier-todo-'+crypto.randomUUID());ds.push(d)
 const source=new Uint8Array(makeWorkbookFixture([{name:categories.source,xml:basicSheet.replaceAll('甲单位','山东风电')},{name:categories.todo,xml:todo(true,[['1','戚墅堰所','2026年9月26日','齿轮箱待办','本期完成情况','','']])}]))
 const task=await createTask(meta,[file('底稿.xlsx','',basicSheet,'baseline'),{name:'配套报送.xlsx',unit:'戚墅堰所',targetUnits:['山东风电'],role:'source',bytes:source}],[],d)
 const sources=await d.fragments.where('reportId').equals(task.id).toArray()
 expect(sources.some(s=>s.category==='todo'&&s.unit==='戚墅堰所'&&s.fields.content==='齿轮箱待办')).toBe(true)
 expect(sources.filter(s=>s.category!=='todo').every(s=>s.unit==='山东风电')).toBe(true)
})
it('旧任务升级保留人工指定的来源，并用它重建尚未确认的候选',async()=>{
 const d=new ReportDatabase('upgrade-manual-'+crypto.randomUUID());ds.push(d)
 const task=await createTask(meta,[file('底稿.xlsx','',basicSheet,'baseline'),file('报送.xlsx','甲单位',basicSheet.replaceAll('共同项目','别名').replace('本周完成1台','本周完成3台'))],[],d)
 const item=(await d.items.toArray()).find(i=>i.fields.current==='本周完成1台')!,source=(await d.fragments.toArray()).find(s=>s.fields.current==='本周完成3台')!,match=await d.matches.where('itemId').equals(item.id).first()
 expect(match!.sourceIds).toHaveLength(0)
 await d.matches.update(match!.id,{sourceIds:[source.id],ambiguous:false,reason:'人工关联'})
 await generateSourceSuggestions(task.id,d)
 await d.tasks.update(task.id,{structureVersion:1})
 const {prepareExport}=await import('./export');const plan=await prepareExport(task.id,d)
 expect(plan.changes.find(c=>c.itemId===item.id&&c.field==='current')?.finalText).toBe('本周完成3台')
 expect((await d.matches.where('itemId').equals(item.id).first())?.sourceIds).toEqual([source.id])
})
it('待办含公式仍能下载，并返回公式位置供人工处理',async()=>{
 const d=new ReportDatabase('todo-protected-'+crypto.randomUUID());ds.push(d)
 const baseline=todo(true,[['1','旧单位','旧时间','保留公式所在旧行','旧情况','','旧备注']]).replace('</row></sheetData>','<c r="H6"><f>1+2</f><v>3</v></c></row></sheetData>')
 const task=await createTask(meta,[file('底稿.xlsx','',baseline,'baseline',categories.todo),file('本期.xlsx','甲单位',todo(true,[['8','甲单位','2026年10月2日','本期待办','本期原文','','']]),'source',categories.todo)],[],d)
 const {initializeManualReview}=await import('../../data/manualReviewRepository');await initializeManualReview(task.id,d)
 const result=await exportReport(task.id,d),out=readWorkbook(await bytes(result.workbook),'out')
 expect(out.sheets[0].cells.H6.formula).toBe('1+2');expect(out.sheets[0].cells.D7.text).toBe('本期待办')
 expect((result as any).todoWarnings.some((n:any)=>n.location==='周例会待办事项!H6')).toBe(true)
 expect((await d.exports.get(result.revisionId) as any).todoWarnings).toBeDefined()
})
