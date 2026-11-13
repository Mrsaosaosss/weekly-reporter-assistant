import {useMemo,useState} from 'react'
import {Download,FileSpreadsheet,FileText} from 'lucide-react'
import {categories,type WorkbookDocument} from '../../core/model'
import {readWorkbook} from '../../core/workbook/read'
import {
 formatSummary,groupLocation,readSummaryGroups,resolveSummary,summaryCategory,summaryKey,workLabel,
 type SummaryGroup,type SummaryLink,type SummaryOutput,type SummaryProject,type SummaryRole,
} from '../../core/summary/summary'
import {readSummaryTemplate,writeSummaryDocument,type SummaryTemplate} from '../../core/summary/wordTemplate'
import {Button} from '../../ui/Button'
import {Card} from '../../ui/Card'
import {download} from '../../ui/download'
import {ExcelFieldReference} from './ExcelFieldReference'

const STORAGE='weekly-report-word-mappings-v1'
const WORD_MIME='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
type Mappings=Record<string,SummaryLink[]>
type Draft=Partial<Pick<SummaryOutput,'current'|'next'>>
type AddedProject={project:SummaryProject;group:SummaryGroup}
const roleOptions:SummaryRole[]=['','主机厂','部件厂']
const groupName=(group:SummaryGroup)=>[group.unit,group.project,groupLocation(group)].filter(Boolean).join(' · ')

function loadMappings():Mappings{
 try{
  const stored:unknown=JSON.parse(localStorage.getItem(STORAGE)||'{}')
  if(!stored||typeof stored!=='object'||Array.isArray(stored))return {}
  return Object.fromEntries(Object.entries(stored).filter(([,links])=>Array.isArray(links)&&links.length&&links.every(link=>
   link&&typeof link.key==='string'&&roleOptions.includes(link.role))))
 }catch{return {}}
}

function GroupPicker({groups,initial,onSave,onCancel}:{groups:SummaryGroup[];initial:SummaryGroup[];onSave:(links:SummaryLink[])=>void;onCancel:()=>void}){
 const [links,setLinks]=useState<SummaryLink[]>(()=>initial.map(group=>({key:group.key,role:group.role})))
 const [query,setQuery]=useState('')
 const candidates=groups.filter(group=>groupName(group).toLowerCase().includes(query.trim().toLowerCase())&&!links.some(link=>link.key===group.key))
 return <div className="summary-mapping">
  <label>搜索 Excel 记录<input placeholder="输入单位、项目或工作表" value={query} onChange={e=>setQuery(e.target.value)}/></label>
  <label>添加来源记录<select value="" onChange={e=>{
   const group=groups.find(entry=>entry.key===e.target.value)
   if(group)setLinks(old=>[...old,{key:group.key,role:group.role}])
  }}>
   <option value="">请选择项目记录</option>
   {candidates.map(group=><option value={group.key} key={group.key}>{groupName(group)}</option>)}
  </select></label>
  {links.map(link=>{
   const group=groups.find(entry=>entry.key===link.key)
   if(!group)return null
   return <div className="summary-linked" key={link.key}>
    <span>{groupName(group)}</span>
    <select aria-label={groupName(group)+'的单位角色'} value={link.role} onChange={e=>setLinks(old=>old.map(item=>item.key===link.key?{...item,role:e.target.value as SummaryRole}:item))}>
     <option value="">仅显示单位名称</option><option>主机厂</option><option>部件厂</option>
    </select>
    <Button className="small" onClick={()=>setLinks(old=>old.filter(item=>item.key!==link.key))}>移除此记录</Button>
   </div>
  })}
  <div className="actions">
   <Button disabled={!links.length} variant="primary" onClick={()=>onSave(links)}>保存项目映射</Button>
   <Button onClick={onCancel}>取消</Button>
  </div>
 </div>
}

function Sources({groups}:{groups:SummaryGroup[]}){
 return <details className="summary-sources"><summary>查看取数位置（{groups.length} 条项目记录）</summary>
  {groups.map(group=><div key={group.key}><strong>{groupName(group)}</strong>
   <ul>{group.rows.map(row=><li key={row.id}>第 {row.rowContext?.row} 行 · {workLabel(row)}
    {!row.fields.work?.trim()&&<span className="muted">（重点工作为空，使用工作内容或项目名）</span>}
    <span className="muted"> · 进展 {row.targets.current?.address||'无列'} · 计划 {row.targets.next?.address||'无列'}</span>
   </li>)}</ul>
  </div>)}
 </details>
}

export function WordSummaryPage(){
 const [excel,setExcel]=useState<{name:string;groups:SummaryGroup[];book:WorkbookDocument}>()
 const [word,setWord]=useState<{name:string;template:SummaryTemplate}>()
 const [mappings,setMappings]=useState(loadMappings)
 const [absent,setAbsent]=useState<Set<string>>(new Set())
 const [edits,setEdits]=useState<Record<string,Draft>>({})
 const [added,setAdded]=useState<AddedProject[]>([])
 const [pendingGroup,setPendingGroup]=useState('')
 const [pendingSection,setPendingSection]=useState('')
 const [editingMap,setEditingMap]=useState('')
 const [filter,setFilter]=useState('all')
 const [search,setSearch]=useState('')
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const template=word?.template

 const rows=useMemo(()=>!template||!excel?[]:[
  ...template.projects.map(project=>{
   const resolution=resolveSummary(project,excel.groups,mappings[summaryKey(project)])
   return absent.has(project.id)?{project,groups:[] as SummaryGroup[],pending:false,reason:'已确认本期未报送'}
    :{project,groups:resolution.groups,pending:resolution.status==='unresolved',reason:resolution.reason}
  }),
  ...added.map(({project,group})=>({project,groups:[group],pending:false,reason:'本期手动纳入'})),
 ],[template,excel,mappings,absent,added])
 const pending=rows.filter(row=>row.pending).length
 const usedGroups=new Set(rows.flatMap(row=>row.groups.map(group=>group.key)))
 const available=excel?.groups.filter(group=>!usedGroups.has(group.key))||[]
 const selected=available.find(group=>group.key===pendingGroup)
 const sections=template?.sections||[]
 const displayed=rows.filter(row=>row.project.id===editingMap||((filter==='all'||row.pending)
  &&(!search||[row.project.name,row.project.section].join(' ').toLowerCase().includes(search.trim().toLowerCase()))))

 function resetPreview(){
  setAbsent(new Set());setEdits({});setAdded([]);setPendingGroup('');setPendingSection('');setEditingMap('');setFilter('all');setSearch('')
 }
 async function importFile(kind:'excel'|'word',file:File|undefined){
  if(!file)return
  setBusy(true);setError('');setNotice('');resetPreview()
  if(kind==='excel')setExcel(undefined)
  else setWord(undefined)
  try{
   const suffix=kind==='excel'?'.xlsx':'.docx'
   if(!file.name.toLowerCase().endsWith(suffix))throw new Error('请选择 '+suffix+' 文件')
   if(file.size>30*1024*1024)throw new Error('文件超过 30 MB，请使用较小的文件')
   const bytes=await file.arrayBuffer()
   if(kind==='excel'){
    const book=readWorkbook(bytes,'word-summary')
    setExcel({name:file.name,groups:readSummaryGroups(book),book})
   }else setWord({name:file.name,template:readSummaryTemplate(new Uint8Array(bytes))})
  }catch(e){setError(e instanceof Error?e.message:'读取文件失败')}
  finally{setBusy(false)}
 }
 function changeMapping(project:SummaryProject,links?:SummaryLink[]){
  const key=summaryKey(project),next={...mappings}
  if(links?.length)next[key]=links
  else delete next[key]
  setMappings(next)
  setAbsent(old=>{const copy=new Set(old);copy.delete(project.id);return copy})
  setEdits(old=>({...old,[project.id]:{}}))
  setEditingMap('')
  try{
   localStorage.setItem(STORAGE,JSON.stringify(next))
   setNotice(links?.length?'项目映射已保存，下期自动复用。':'已恢复自动匹配。')
  }catch{setNotice('浏览器无法保存映射，本次预览仍可使用。')}
 }
 function confirmAbsent(project:SummaryProject){
  setAbsent(old=>new Set([...old,project.id]))
  setEdits(old=>({...old,[project.id]:{}}))
  setEditingMap('')
 }
 function addProject(){
  const section=pendingSection==='__none'?'':pendingSection
  if(!selected||!pendingSection||!sections.includes(section))return
  const name=[selected.unit,selected.project].filter(Boolean).join(' ')
  const project:SummaryProject={
   id:'new:'+selected.key,name,section,
   info:selected.rows.find(row=>row.fields.description?.trim())?.fields.description?.trim()||'',
  }
  setAdded(old=>[...old,{project,group:selected}])
  setPendingGroup('')
 }
 function outputValue(id:string,groups:SummaryGroup[],field:'current'|'next'){
  return edits[id]?.[field]??formatSummary(groups,field)
 }
 function exportWord(){
  if(!excel||!template||pending||editingMap)return
  setError('')
  try{
   const output:SummaryOutput[]=rows.map(({project,groups})=>({...project,
    current:outputValue(project.id,groups,'current'),
    next:outputValue(project.id,groups,'next'),
   }))
   const bytes=writeSummaryDocument(template,output)
   download(new Blob([Uint8Array.from(bytes).buffer],{type:WORD_MIME}),excel.name.replace(/\.xlsx$/i,'')+'_Word总结.docx')
   setNotice('Word 总结已生成。')
  }catch(e){setError(e instanceof Error?e.message:'生成 Word 失败')}
 }

 return <>
  <div className="page-heading"><div><div className="eyebrow">WEEKLY REPORT · WORD SUMMARY</div><h1>生成 Word 总结</h1><p>以上期 Word 延续项目与版式，从本期校核后的 Excel 生成进展和计划。</p></div></div>
  <div className="summary-upload-grid">
   <label className="upload-zone"><span className="upload-icon"><FileSpreadsheet/></span><strong>本期校核后 Excel</strong><span>{excel?.name||'选择校核后的 .xlsx 文件'}</span>
    <input aria-label="本期校核后 Excel" type="file" accept=".xlsx" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';void importFile('excel',file)}}/>
    <span className="upload-link">选择本期 Excel</span></label>
   <label className="upload-zone"><span className="upload-icon"><FileText/></span><strong>上期 Word 总结表</strong><span>{word?.name||'选择上期四列 .docx，首次可用样例'}</span>
    <input aria-label="上期 Word 总结表" type="file" accept=".docx" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';void importFile('word',file)}}/>
    <span className="upload-link">选择上期 Word</span></label>
  </div>
  {error&&<p className="notice error" role="alert">{error}</p>}
  {notice&&<p className="notice success" role="status">{notice}</p>}
  {excel&&template&&<>
   <Card title="预览本期总结" subtitle={`常设项目 ${template.projects.length} 条 · 本期纳入 ${added.length} 条 · 待确认 ${pending} 条`} action={
    <Button variant="primary" disabled={!!pending||busy||!!editingMap} onClick={exportWord}><Download size={16}/>下载 Word 总结</Button>
   }>
    <p className="muted">本周进展和下周计划按“重点工作：对应内容”生成。预览文字可直接编辑。已匹配且无有效内容时填“/”。</p>
    {pending>0&&<p className="notice">先确认待匹配项目的来源，或确认它本期未报送，再下载 Word。</p>}
    <div className="toolbar">
     <input aria-label="搜索 Word 项目" placeholder="搜索项目或分组" value={search} onChange={e=>setSearch(e.target.value)}/>
     <select aria-label="项目确认状态" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">全部项目</option><option value="pending">待确认项目</option></select>
    </div>
    {displayed.map(({project,groups,pending:isPending,reason})=>{
     const isAdded=project.id.startsWith('new:'),isAbsent=absent.has(project.id)
     return <article className="summary-project" key={project.id}>
      <header><div><small>{project.section||'未分组'}</small><h3>{project.name}</h3><span className={isPending?'error':'muted'}>{reason}</span></div>
       <div className="summary-project-actions">
        {isAdded?<Button onClick={()=>setAdded(old=>old.filter(entry=>entry.project.id!==project.id))}>撤回纳入</Button>:
         <Button onClick={()=>setEditingMap(old=>old===project.id?'':project.id)}>调整项目映射</Button>}
        {isPending&&!isAdded&&<Button onClick={()=>confirmAbsent(project)}>确认本期未报送</Button>}
        {isAbsent&&<Button onClick={()=>{setAbsent(old=>{const copy=new Set(old);copy.delete(project.id);return copy});setEdits(old=>({...old,[project.id]:{}}))}}>撤销未报送确认</Button>}
       </div>
      </header>
      {editingMap===project.id&&<GroupPicker key={project.id} groups={excel.groups} initial={groups} onSave={links=>changeMapping(project,links)} onCancel={()=>setEditingMap('')}/>}
      {!isAdded&&mappings[summaryKey(project)]&&editingMap===project.id&&<Button variant="ghost" onClick={()=>changeMapping(project)}>清除已保存映射</Button>}
      {project.info&&<details><summary>项目基本信息</summary><p className="preserve">{project.info}</p></details>}
      {!!groups.length&&<Sources groups={groups}/>}
      {!isPending&&<div className="summary-fields">
       {(['current','next'] as const).map(field=>{
        const label=field==='current'?'本周进展':'下周计划'
        return <div className="summary-field" key={field}><label>{label}<textarea aria-label={project.name+label} rows={4}
         value={outputValue(project.id,groups,field)}
         onChange={e=>setEdits(old=>({...old,[project.id]:{...old[project.id],[field]:e.target.value}}))}/></label>
         <ExcelFieldReference groups={groups} field={field} book={excel.book} fileName={excel.name}/>
        </div>
       })}
      </div>}
     </article>
    })}
    {!displayed.length&&<p className="muted">没有符合筛选条件的项目。</p>}
   </Card>
   {!!available.length&&<Card title="本期 Excel 中尚未纳入的项目" subtitle="核对属于新增项目的记录，选择分组后纳入本期 Word。">
    <div className="summary-new">
     <label>候选项目<select value={selected?.key||''} onChange={e=>{
      setPendingGroup(e.target.value)
      const group=available.find(entry=>entry.key===e.target.value)
      const matches=sections.filter(section=>summaryCategory(section)===group?.category)
      setPendingSection(matches.length===1?matches[0]:(sections.length===1&&!sections[0]?'__none':''))
     }}><option value="">请选择项目</option>{available.map(group=><option key={group.key} value={group.key}>{categories[group.category]} · {groupName(group)}</option>)}</select></label>
     <label>加入分组<select value={pendingSection} onChange={e=>setPendingSection(e.target.value)}>
      <option value="" disabled>请选择分组</option>{sections.filter(Boolean).map(section=><option key={section}>{section}</option>)}
      {sections.includes('')&&<option value="__none">未分组</option>}
     </select></label>
     <Button disabled={!selected||!sections.includes(pendingSection==='__none'?'':pendingSection)||!pendingSection} onClick={addProject}>纳入本期</Button>
    </div>
   </Card>}
  </>}
 </>
}
