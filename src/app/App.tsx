import {useEffect,useState} from 'react'
import {BrowserRouter,Routes,Route,NavLink,Link,Navigate} from 'react-router-dom'
import {Layers3,LayoutDashboard,Plus,FileText,Database,Sun,Moon,ShieldCheck} from 'lucide-react'
import {TaskListPage} from '../features/tasks/TaskListPage'
import {ImportPage} from '../features/tasks/ImportPage'
import {IssueReviewPage} from '../features/review/IssueReviewPage'
import {BackupPanel} from '../features/tasks/BackupPanel'
import {ExportPage} from '../features/review/ExportPage'
import {WordSummaryPage} from '../features/summary/WordSummaryPage'
import {ValidationPage} from '../features/validation/ValidationPage'
import {startAutoBackup} from '../data/autoBackup'
export function App(){
 const [dark,setDark]=useState(()=>localStorage.getItem('report-theme')==='dark')
 useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light';localStorage.setItem('report-theme',dark?'dark':'light')},[dark])
 useEffect(()=>startAutoBackup(),[])
 return <BrowserRouter><div className="app-shell"><aside className="sidebar"><Link className="brand" to="/"><span className="brand-icon"><Layers3 size={23}/></span><div><strong>周报汇总</strong><small>WEEKLY WORKSPACE</small></div></Link><span className="nav-section">工作空间</span><nav><NavLink to="/" end><LayoutDashboard size={18}/>我的周报</NavLink><NavLink to="/tasks/new"><Plus size={18}/>新建周报</NavLink><NavLink to="/word-summary"><FileText size={18}/>生成 Word 总结</NavLink></nav><div className="sidebar-note"><span className="pill">本地优先</span><p>延续上期积累，<br/>看清本周变化。</p><span>材料有序 · 更新有据</span></div><div className="sidebar-bottom"><nav><NavLink to="/data"><Database size={18}/>本地数据</NavLink></nav><div className="sidebar-foot"><span><span className="dot"/>个人工作空间</span><button className="icon-button" aria-label="切换深浅主题" onClick={()=>setDark(x=>!x)}>{dark?<Sun size={17}/>:<Moon size={17}/>}</button></div></div></aside><div className="main-shell"><header className="topbar"><span>工作空间 <span className="slash">/</span> 周报汇总</span><span className="local-indicator"><ShieldCheck size={15}/> 本机保存</span></header><main><Routes><Route path="/" element={<TaskListPage/>}/><Route path="/tasks/new" element={<ImportPage/>}/><Route path="/tasks/:id/review" element={<IssueReviewPage/>}/><Route path="/tasks/:id/export" element={<ExportPage/>}/><Route path="/tasks/:id/validation" element={<ValidationPage/>}/><Route path="/word-summary" element={<WordSummaryPage/>}/><Route path="/settings" element={<Navigate to="/" replace/>}/><Route path="/data" element={<BackupPanel/>}/><Route path="*" element={<p>页面尚在准备，请返回<Link to="/">工作台</Link>。</p>}/></Routes></main><footer className="app-footer">周报汇总工作台 <span>每一步，有据可循。</span></footer></div></div></BrowserRouter>
}
