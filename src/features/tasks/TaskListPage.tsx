import {Link} from 'react-router-dom'
import {useLiveQuery} from 'dexie-react-hooks'
import {ArrowUpRight,ArrowRight,Plus,Files,CheckCheck,Clock3,FileSpreadsheet,GitCompareArrows} from 'lucide-react'
import {db} from '../../data/database'
import {Card} from '../../ui/Card'
const statusNames={draft:'待审阅',analyzing:'待审阅',review:'人工审阅中',ready:'已生成汇总',archived:'已归档'}
export function TaskListPage(){
 const tasks=useLiveQuery(()=>db.tasks.orderBy('updatedAt').reverse().toArray(),[])
 const list=tasks||[],review=list.filter(t=>t.status==='review').length,archived=list.filter(t=>t.status==='archived').length
 return <>
  <div className="page-heading"><div><div className="eyebrow">WEEKLY REPORT WORKSPACE</div><h1>周报汇总</h1><p>让每周的进展，承接有序、有据可查。</p></div><Link className="button primary" to="/tasks/new"><Plus size={17}/>新建本期周报</Link></div>
  <div className="welcome-banner"><div><span className="pill light"><span className="dot"/> 你的每周工作台</span><h2>从各单位报送，<br/>到一份清晰的工作进展。</h2><p>沿用上期底稿，按问题对照本期报送。<br/>每一处更新，都能回到它的来源。</p><Link to="/tasks/new">开始汇总 <ArrowUpRight size={18}/></Link></div><div className="paper-scene" aria-hidden="true"><div className="paper back"/><div className="paper"><div className="paper-head"><FileSpreadsheet size={22}/><span>WEEKLY PROGRESS</span></div><div className="paper-title">本周工作进展</div><div className="paper-line"/><div className="paper-line short"/><div className="paper-row"><CheckCheck size={16}/><span>保留历史 · 衔接本周</span></div><div className="paper-row"><CheckCheck size={16}/><span>变更标色 · 异常集中</span></div><div className="paper-stamp">每一步，有据可循</div></div><span className="floating-tag"><Files size={16}/> 多份材料，一次整理</span></div></div>
  <div className="metric-grid"><Card><span className="metric-label"><Files size={16}/> 全部周报</span><strong className="metric-number">{tasks?list.length:'—'}<small>期</small></strong><span className="muted">每一期的材料与修改都在这里</span></Card><Card><span className="metric-label"><Clock3 size={16}/> 待审阅周报</span><strong className="metric-number">{tasks?review:'—'}<small>期</small></strong><span className="muted">整块对照，选择采用本期内容</span></Card><Card><span className="metric-label"><CheckCheck size={16}/> 已归档</span><strong className="metric-number">{tasks?archived:'—'}<small>期</small></strong><span className="muted">作为下一期的可靠起点</span></Card></div>
  <Card title="我的周报" subtitle="从上次停下的地方继续。" action={<span className="pill">{list.length} 期记录</span>}>
   {!tasks?<p className="muted">正在读取本机记录…</p>:list.length?<div className="task-list">{list.map(t=><Link key={t.id} to={`/tasks/${t.id}/${t.status==='archived'?'export':'review'}`} className="task-row"><span className="file-tile"><FileSpreadsheet/></span><div><strong>总第{t.meta.totalIssue}期 · 第{t.meta.weeklyIssue}期工作进展</strong><p>{t.meta.periodStart} — {t.meta.periodEnd}</p></div><span className="pill">{statusNames[t.status]}</span><span className="muted small">{new Date(t.updatedAt).toLocaleDateString('zh-CN')}</span><ArrowUpRight size={18}/></Link>)}</div>:<div className="empty-state"><span className="empty-icon"><FileSpreadsheet size={30}/></span><h3>从第一期周报开始</h3><p>准备好上期汇总表和本期各单位 Excel，<br/>把查找、对照和整理交给这个工作台。</p><Link className="button secondary" to="/tasks/new">创建第一期周报 <ArrowRight size={15}/></Link></div>}
  </Card>
  <div className="workflow-strip"><div><span>01</span><strong>导入材料</strong><p>上期底稿 + 本期报送</p></div><ArrowRight/><div><span>02</span><strong>按问题审阅</strong><p>上下对照 + 人工选择采用</p></div><ArrowRight/><div><span>03</span><strong>生成汇总表</strong><p>下载核对，上传定稿</p></div></div>
  <div className="footnote"><GitCompareArrows size={15}/> 已有人工完成稿？生成候选后，可在任务中导入进行对照验证。</div>
 </>
}
